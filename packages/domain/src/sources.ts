import { ClipppyError, type ViralProfileConfig } from "@clipppy/contracts";
import { viralProfileConfigSchema } from "@clipppy/contracts";
import { assertCapability, requireRole } from "./access";
import { audit, defaultCaps, type Actor, type DiscoveryHit, type MemoryStore, type PermissionBasis, type ViralProfile } from "./store";

export function recordDiscovery(
  store: MemoryStore,
  actor: Actor,
  hit: Omit<DiscoveryHit, "id" | "authorized" | "createdAt" | "tenantId">,
  now: Date,
): DiscoveryHit {
  const row: DiscoveryHit = {
    ...hit,
    id: crypto.randomUUID(),
    tenantId: actor.tenantId,
    authorized: false,
    createdAt: now.toISOString(),
  };
  store.data.discoveries.push(row);
  return row;
}

export function attestPermission(
  store: MemoryStore,
  actor: Actor,
  input: { basis: PermissionBasis; reference: string; now: Date },
): void {
  requireRole(store, actor, ["owner"]);
  if (!input.reference.trim()) throw new ClipppyError("PERMISSION_REQUIRED", "Permission needs a reference you can show later.", 400);
  const onboarding = ensureOnboarding(store, actor.tenantId);
  onboarding.attestation = {
    basis: input.basis,
    reference: input.reference.trim(),
    acceptedAt: input.now.toISOString(),
    acceptedBy: actor.userId,
  };
}

export function stageChannel(
  store: MemoryStore,
  actor: Actor,
  channel: { platform: "twitch" | "kick"; platformChannelId: string; login: string },
): void {
  requireRole(store, actor, ["owner", "editor"]);
  ensureOnboarding(store, actor.tenantId).channel = channel;
}

export function markIngestConnected(store: MemoryStore, actor: Actor, scopes: string[], required: string[]): void {
  const missing = required.filter((scope) => !scopes.includes(scope));
  if (missing.length) throw new ClipppyError("SCOPES_MISSING", `Missing scopes: ${missing.join(", ")}`, 403);
  const onboarding = ensureOnboarding(store, actor.tenantId);
  onboarding.ingestConnected = true;
  onboarding.grantedScopes = scopes;
}

export function saveProfileVersion(
  store: MemoryStore,
  actor: Actor,
  input: { name: string; sourceId: string | null; config: ViralProfileConfig; now: Date },
): ViralProfile {
  requireRole(store, actor, ["owner", "editor"]);
  const config = viralProfileConfigSchema.parse(structuredClone(input.config));
  const entitlement = store.data.entitlements.find((item) => item.tenantId === actor.tenantId);
  const cap = entitlement?.caps.maxClipSeconds ?? defaultCaps().maxClipSeconds;
  if (config.window.max_duration_seconds > cap) {
    throw new ClipppyError("PLAN_CAP", "Clip duration exceeds the plan cap.", 400);
  }
  const family = store.data.profiles.filter(
    (item) => item.tenantId === actor.tenantId && item.name === input.name && item.sourceId === input.sourceId,
  );
  const version = family.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  for (const profile of family) profile.isActive = false;
  const created: ViralProfile = {
    id: crypto.randomUUID(),
    tenantId: actor.tenantId,
    sourceId: input.sourceId,
    name: input.name,
    version,
    isActive: true,
    config,
    createdBy: actor.userId,
    createdAt: input.now.toISOString(),
  };
  store.data.profiles.push(created);
  const onboarding = ensureOnboarding(store, actor.tenantId);
  onboarding.profileId = created.id;
  return created;
}

export function activateSource(store: MemoryStore, actor: Actor, now: Date) {
  requireRole(store, actor, ["owner"]);
  const onboarding = ensureOnboarding(store, actor.tenantId);
  if (!onboarding.attestation) throw new ClipppyError("PERMISSION_REQUIRED", "Attest permission before activation.", 400);
  if (!onboarding.channel) throw new ClipppyError("CHANNEL_REQUIRED", "Choose a channel before activation.", 400);
  if (!onboarding.ingestConnected) throw new ClipppyError("INGEST_REQUIRED", "Ingest OAuth must succeed before activation.", 400);
  if (!onboarding.profileId) throw new ClipppyError("PROFILE_REQUIRED", "Save a viral profile before activation.", 400);
  const channel = onboarding.channel;
  const conflict = store.data.sources.find(
    (item) => item.platform === channel.platform && item.platformChannelId === channel.platformChannelId && !item.revokedAt,
  );
  if (conflict && conflict.tenantId !== actor.tenantId) {
    throw new ClipppyError("SOURCE_OWNED_ELSEWHERE", "Another tenant already has this channel.", 409);
  }
  const source = conflict ?? {
    id: crypto.randomUUID(),
    tenantId: actor.tenantId,
    platform: channel.platform,
    platformChannelId: channel.platformChannelId,
    channelLogin: channel.login,
    permissionBasis: onboarding.attestation.basis,
    permissionReference: onboarding.attestation.reference,
    permissionGrantedAt: now.toISOString(),
    revokedAt: null,
    senderPolicy: { mode: "broadcaster_and_mods" as const, allowlist: [] },
    createdAt: now.toISOString(),
  };
  if (!conflict) store.data.sources.push(source);
  onboarding.activatedSourceId = source.id;
  audit(store, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "user",
    action: "source.activate",
    entityType: "authorized_source",
    entityId: source.id,
    metadata: { platform: source.platform, channel: source.channelLogin },
    createdAt: now.toISOString(),
  });
  return source;
}

export function startSession(
  store: MemoryStore,
  actor: Actor,
  input: { sourceId: string; title: string; gameId?: string; gameName?: string; now: Date },
) {
  requireRole(store, actor, ["owner", "editor"]);
  const source = store.data.sources.find((item) => item.id === input.sourceId && item.tenantId === actor.tenantId && !item.revokedAt);
  if (!source) throw new ClipppyError("NOT_AUTHORIZED", "That channel is not an authorized source.", 403);
  const discoveredOnly = store.data.discoveries.some(
    (item) => item.platformChannelId === source.platformChannelId && item.authorized === false,
  );
  void discoveredOnly;
  assertCapability(store, actor.tenantId, "capture", input.now);
  const entitlement = store.data.entitlements.find((item) => item.tenantId === actor.tenantId)!;
  const live = store.data.sessions.filter((item) => item.tenantId === actor.tenantId && item.status === "live").length;
  if (live >= entitlement.seats * entitlement.caps.concurrentStreams) {
    throw new ClipppyError("QUOTA_EXCEEDED", "Concurrent stream cap is reached.", 429);
  }
  const profile = store.data.profiles.find((item) => item.tenantId === actor.tenantId && item.isActive);
  if (!profile) throw new ClipppyError("PROFILE_REQUIRED", "An active profile is required.", 400);
  const session = {
    id: crypto.randomUUID(),
    tenantId: actor.tenantId,
    sourceId: source.id,
    providerSessionId: null,
    title: input.title,
    gameId: input.gameId ?? null,
    gameName: input.gameName ?? null,
    language: profile.config.language,
    startedAt: input.now.toISOString(),
    endedAt: null,
    status: "live" as const,
    profileId: profile.id,
    profileVersion: profile.version,
    recorderWorker: null,
    recorderLeaseUntil: null,
    recorderEpoch: 0,
  };
  store.data.sessions.push(session);
  return session;
}

export function revokeSource(store: MemoryStore, actor: Actor, sourceId: string, now: Date): void {
  requireRole(store, actor, ["owner"]);
  const source = store.data.sources.find((item) => item.id === sourceId && item.tenantId === actor.tenantId);
  if (!source) throw new ClipppyError("NOT_FOUND", "Source was not found.", 404);
  source.revokedAt = now.toISOString();
  for (const session of store.data.sessions) {
    if (session.sourceId === source.id && session.status === "live") {
      session.status = "ended";
      session.endedAt = now.toISOString();
    }
  }
  audit(store, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "user",
    action: "source.revoke",
    entityType: "authorized_source",
    entityId: source.id,
    metadata: {},
    createdAt: now.toISOString(),
  });
}

export function claimRecorder(store: MemoryStore, sessionId: string, tenantId: string, workerId: string, now: Date, leaseMs: number) {
  const session = store.data.sessions.find((item) => item.id === sessionId && item.tenantId === tenantId);
  if (!session) throw new ClipppyError("SESSION_NOT_FOUND", "Session was not found.", 404);
  const held = session.recorderLeaseUntil && Date.parse(session.recorderLeaseUntil) > now.getTime();
  if (held && session.recorderWorker && session.recorderWorker !== workerId) {
    throw new ClipppyError("RECORDER_LEASE_HELD", "Another recorder owns this session.", 409);
  }
  if (!held && session.recorderWorker && session.recorderWorker !== workerId) session.recorderEpoch += 1;
  if (session.recorderEpoch === 0) session.recorderEpoch = 1;
  session.recorderWorker = workerId;
  session.recorderLeaseUntil = new Date(now.getTime() + leaseMs).toISOString();
  return { epoch: session.recorderEpoch };
}

function ensureOnboarding(store: MemoryStore, tenantId: string) {
  let onboarding = store.data.onboardings.find((item) => item.tenantId === tenantId);
  if (!onboarding) {
    onboarding = {
      tenantId,
      attestation: null,
      channel: null,
      ingestConnected: false,
      grantedScopes: [],
      profileId: null,
      activatedSourceId: null,
    };
    store.data.onboardings.push(onboarding);
  }
  return onboarding;
}
