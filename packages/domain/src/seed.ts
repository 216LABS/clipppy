import { encryptSecret, loadKeys } from "./crypto";
import { detectMoments, distributedBurst, steadyChat } from "./scoring";
import { clonePreset } from "./profiles";
import {
  audit,
  defaultCaps,
  emptyStore,
  ENGINE_VERSION,
  type Candidate,
  type MemoryStore,
  type RenderArtifact,
} from "./store";
import { sampleMediaChecksum } from "./paths";

export const IDS = {
  tenantFlip: "11111111-1111-4111-8111-111111111111",
  tenantHarbor: "22222222-2222-4222-8222-222222222222",
  userFlip: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  userEditor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  userViewer: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  userHarbor: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  sourceFlip: "33333333-3333-4333-8333-333333333331",
  sourceHarbor: "33333333-3333-4333-8333-333333333332",
  profileFlip: "44444444-4444-4444-8444-444444444441",
  profileHarbor: "44444444-4444-4444-8444-444444444442",
  sessionFlip: "55555555-5555-4555-8555-555555555551",
  sessionHarbor: "55555555-5555-4555-8555-555555555552",
  destYoutube: "88888888-8888-4888-8888-888888888881",
  destTiktok: "88888888-8888-4888-8888-888888888882",
};

const g = globalThis as unknown as { __clipppyStore?: MemoryStore };

export function getSharedStore(): MemoryStore {
  if (!g.__clipppyStore) g.__clipppyStore = createSeededStore();
  return g.__clipppyStore;
}

export function resetSharedStore(): MemoryStore {
  g.__clipppyStore = createSeededStore();
  return g.__clipppyStore;
}

export function createSeededStore(now = new Date()): MemoryStore {
  const store = emptyStore();
  const checksum = sampleMediaChecksum();
  const keys = loadKeys("local", {});
  const at = now.toISOString();
  store.data.users.push(
    { id: IDS.userFlip, email: "flip@216labs.test", displayName: "Flip" },
    { id: IDS.userEditor, email: "editor@216labs.test", displayName: "Editor" },
    { id: IDS.userViewer, email: "viewer@216labs.test", displayName: "Viewer" },
    { id: IDS.userHarbor, email: "harbor@example.test", displayName: "Harbor" },
  );
  store.data.tenants.push(
    {
      id: IDS.tenantFlip,
      slug: "gta6-flip-test",
      displayName: "GTA 6 launch test",
      status: "active",
      isInternal: true,
      legalHold: false,
      createdAt: at,
    },
    {
      id: IDS.tenantHarbor,
      slug: "harbor-synthetic",
      displayName: "Harbor synthetic",
      status: "trial",
      isInternal: false,
      legalHold: false,
      createdAt: at,
    },
  );
  store.data.memberships.push(
    { tenantId: IDS.tenantFlip, userId: IDS.userFlip, role: "owner" },
    { tenantId: IDS.tenantFlip, userId: IDS.userEditor, role: "editor" },
    { tenantId: IDS.tenantFlip, userId: IDS.userViewer, role: "viewer" },
    { tenantId: IDS.tenantHarbor, userId: IDS.userHarbor, role: "owner" },
  );
  for (const tenantId of [IDS.tenantFlip, IDS.tenantHarbor]) {
    store.data.entitlements.push({
      tenantId,
      stripeCustomerId: tenantId === IDS.tenantFlip ? "cus_flip_test" : null,
      stripeSubscriptionId: tenantId === IDS.tenantFlip ? "sub_flip_test" : null,
      priceId: "price_seat_monthly_test",
      status: tenantId === IDS.tenantFlip ? "active" : "trial",
      currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      seats: 1,
      caps: defaultCaps(),
      graceDays: 7,
      updatedAt: at,
    });
  }
  store.data.sources.push(
    {
      id: IDS.sourceFlip,
      tenantId: IDS.tenantFlip,
      platform: "twitch",
      platformChannelId: "flip-gta6-test",
      channelLogin: "flip_gta6_test",
      permissionBasis: "owned",
      permissionReference: "Flip owns this test channel. Synthetic fixture, not a scraped login.",
      permissionGrantedAt: at,
      revokedAt: null,
      senderPolicy: { mode: "broadcaster_and_mods", allowlist: [] },
      createdAt: at,
    },
    {
      id: IDS.sourceHarbor,
      tenantId: IDS.tenantHarbor,
      platform: "kick",
      platformChannelId: "harbor-synthetic",
      channelLogin: "harbor_synthetic",
      permissionBasis: "written_permission",
      permissionReference: "Synthetic tenant permission letter HBR-1",
      permissionGrantedAt: at,
      revokedAt: null,
      senderPolicy: { mode: "broadcaster_and_mods", allowlist: [] },
      createdAt: at,
    },
  );
  store.data.profiles.push(
    {
      id: IDS.profileFlip,
      tenantId: IDS.tenantFlip,
      sourceId: IDS.sourceFlip,
      name: "GTA busy gameplay",
      version: 1,
      isActive: true,
      config: clonePreset("busy_gameplay"),
      createdBy: IDS.userFlip,
      createdAt: at,
    },
    {
      id: IDS.profileHarbor,
      tenantId: IDS.tenantHarbor,
      sourceId: IDS.sourceHarbor,
      name: "Harbor small community",
      version: 1,
      isActive: true,
      config: clonePreset("small_community"),
      createdBy: IDS.userHarbor,
      createdAt: at,
    },
  );
  store.data.sessions.push(
    {
      id: IDS.sessionFlip,
      tenantId: IDS.tenantFlip,
      sourceId: IDS.sourceFlip,
      providerSessionId: "fixture-live-1",
      title: "GTA 6 launch-night rehearsal",
      gameId: "gta6",
      gameName: "Grand Theft Auto VI",
      language: "en",
      startedAt: new Date(now.getTime() - 20 * 60_000).toISOString(),
      endedAt: null,
      status: "live",
      profileId: IDS.profileFlip,
      profileVersion: 1,
      recorderWorker: "cpu-ingest-1",
      recorderLeaseUntil: new Date(now.getTime() + 30_000).toISOString(),
      recorderEpoch: 1,
    },
    {
      id: IDS.sessionHarbor,
      tenantId: IDS.tenantHarbor,
      sourceId: IDS.sourceHarbor,
      providerSessionId: "harbor-live-1",
      title: "Harbor night shift",
      gameId: "synth",
      gameName: "Synthetic chat room",
      language: "en",
      startedAt: new Date(now.getTime() - 15 * 60_000).toISOString(),
      endedAt: null,
      status: "live",
      profileId: IDS.profileHarbor,
      profileVersion: 1,
      recorderWorker: null,
      recorderLeaseUntil: null,
      recorderEpoch: 0,
    },
  );
  addSegments(store, IDS.tenantFlip, IDS.sessionFlip, now);
  addSegments(store, IDS.tenantHarbor, IDS.sessionHarbor, now);
  const burstAt = now.getTime() - 90_000;
  const events = [
    ...steadyChat(burstAt - 300_000, 300, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]),
    ...distributedBurst(burstAt),
  ];
  for (const event of events) {
    store.data.chat.push({
      id: crypto.randomUUID(),
      tenantId: IDS.tenantFlip,
      sessionId: IDS.sessionFlip,
      providerEventId: `evt-${event.occurredAtMs}`,
      occurredAt: new Date(event.occurredAtMs).toISOString(),
      chatterKey: event.chatterKey,
      messageRedacted: event.text,
      rawRef: null,
    });
  }
  const detected = detectMoments({ events, profile: clonePreset("busy_gameplay"), sessionId: IDS.sessionFlip });
  const proposal = detected.proposals[0];
  if (proposal) {
    const candidate = candidateFromProposal(IDS.tenantFlip, IDS.sessionFlip, IDS.profileFlip, proposal, now);
    store.data.candidates.push(candidate);
    store.data.renders.push(readyRender(IDS.tenantFlip, candidate.id, checksum, now));
    candidate.state = "review";
  }
  const manual: Candidate = {
    id: crypto.randomUUID(),
    tenantId: IDS.tenantFlip,
    sessionId: IDS.sessionFlip,
    origin: "dashboard",
    anchorAt: new Date(now.getTime() - 70_000).toISOString(),
    segmentCursor: { sequences: [1, 2, 3], pendingPostRoll: false, discontinuities: 0 },
    startOffsetMs: -15_000,
    endOffsetMs: 30_000,
    state: "review",
    score: null,
    reason: { summary: "Manual mark. No score is required." },
    signalSnapshot: {},
    requestId: crypto.randomUUID(),
    requestedBy: IDS.userEditor,
    note: "The getaway camera whip",
    actorLabel: "editor",
    profileId: IDS.profileFlip,
    profileVersion: 1,
    idempotencyKey: `dash:${IDS.sessionFlip}:seed-manual`,
    createdAt: new Date(now.getTime() - 60_000).toISOString(),
  };
  store.data.candidates.push(manual);
  store.data.renders.push(readyRender(IDS.tenantFlip, manual.id, checksum, now));
  const rejected: Candidate = {
    ...manual,
    id: crypto.randomUUID(),
    origin: "automatic",
    state: "rejected",
    note: null,
    score: 0.81,
    reason: { summary: "4.2× normal chat, 11 unique chatters, emote density 0.22", rejectReason: "wrong_window" },
    idempotencyKey: `auto:${IDS.sessionFlip}:seed-rejected`,
    anchorAt: new Date(now.getTime() - 140_000).toISOString(),
    createdAt: new Date(now.getTime() - 130_000).toISOString(),
  };
  store.data.candidates.push(rejected);
  store.data.renders.push(readyRender(IDS.tenantFlip, rejected.id, checksum, now));
  store.data.destinations.push(
    {
      id: IDS.destYoutube,
      tenantId: IDS.tenantFlip,
      platform: "youtube",
      label: "Flip test Shorts",
      tokenCiphertext: encryptSecret("refresh-token-not-real", IDS.tenantFlip, keys.tokenKey),
      scopes: ["youtube.upload"],
      status: "connected",
      appVisibility: "unaudited",
      allowedVisibility: ["private", "unlisted"],
      createdAt: at,
    },
    {
      id: IDS.destTiktok,
      tenantId: IDS.tenantFlip,
      platform: "tiktok",
      label: "Flip test TikTok",
      tokenCiphertext: encryptSecret("creator-token-not-real", IDS.tenantFlip, keys.tokenKey),
      scopes: ["video.upload", "video.publish"],
      status: "connected",
      appVisibility: "unaudited",
      allowedVisibility: ["private"],
      createdAt: at,
    },
  );
  store.data.onboardings.push({
    tenantId: IDS.tenantFlip,
    attestation: {
      basis: "owned",
      reference: "Flip owns this test channel.",
      acceptedAt: at,
      acceptedBy: IDS.userFlip,
    },
    channel: { platform: "twitch", platformChannelId: "flip-gta6-test", login: "flip_gta6_test" },
    ingestConnected: true,
    grantedScopes: ["user:read:chat"],
    profileId: IDS.profileFlip,
    activatedSourceId: IDS.sourceFlip,
  });
  audit(store, {
    tenantId: IDS.tenantFlip,
    actorUserId: null,
    actorType: "system",
    action: "seed.loaded",
    entityType: "tenant",
    entityId: IDS.tenantFlip,
    metadata: { proposals: detected.proposals.length },
    createdAt: at,
  });
  return store;
}

/** Keep the local fixture recorder current. A live seeded session only has segments through the moment the process first loaded the desk, so a later manual mark would miss the buffer. This appends contiguous synthetic segments up to now. It does not repair a session that has ended, and it does not invent media for a gap the caller already stored. */
export function advanceFixtureBuffer(store: MemoryStore, sessionId: string, now: Date): void {
  const session = store.data.sessions.find((item) => item.id === sessionId && item.endedAt === null);
  if (!session) return;
  const existing = store.data.segments
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => a.sequence - b.sequence);
  const last = existing[existing.length - 1];
  if (!last || !last.objectKey.includes("/segments/")) return;
  let cursor = last.startedAtMs + last.durationMs;
  let sequence = last.sequence;
  const target = now.getTime();
  while (cursor < target) {
    sequence += 1;
    store.data.segments.push({
      id: crypto.randomUUID(),
      tenantId: session.tenantId,
      sessionId,
      sequence,
      objectKey: `tenants/${session.tenantId}/segments/${sessionId}/${sequence}.ts`,
      startedAtMs: cursor,
      durationMs: 10_000,
      sha256: "ab".repeat(32),
      expiresAt: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    });
    cursor += 10_000;
  }
}

function addSegments(store: MemoryStore, tenantId: string, sessionId: string, now: Date): void {
  const start = now.getTime() - 180_000;
  for (let index = 0; index < 20; index += 1) {
    const startedAtMs = start + index * 10_000;
    store.data.segments.push({
      id: crypto.randomUUID(),
      tenantId,
      sessionId,
      sequence: index + 1,
      objectKey: `tenants/${tenantId}/segments/${sessionId}/${index + 1}.ts`,
      startedAtMs,
      durationMs: 10_000,
      sha256: "ab".repeat(32),
      expiresAt: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    });
  }
}

function candidateFromProposal(
  tenantId: string,
  sessionId: string,
  profileId: string,
  proposal: { anchorMs: number; startOffsetMs: number; endOffsetMs: number; score: number; summary: string; snapshot: Record<string, unknown> },
  now: Date,
): Candidate {
  return {
    id: crypto.randomUUID(),
    tenantId,
    sessionId,
    origin: "automatic",
    anchorAt: new Date(proposal.anchorMs).toISOString(),
    segmentCursor: { sequences: [12, 13, 14], pendingPostRoll: false, discontinuities: 0 },
    startOffsetMs: proposal.startOffsetMs,
    endOffsetMs: proposal.endOffsetMs,
    state: "queued",
    score: proposal.score,
    reason: { summary: proposal.summary },
    signalSnapshot: proposal.snapshot,
    requestId: null,
    requestedBy: null,
    note: null,
    actorLabel: null,
    profileId,
    profileVersion: 1,
    idempotencyKey: `auto:${sessionId}:${proposal.anchorMs}`,
    createdAt: now.toISOString(),
  };
}

function readyRender(tenantId: string, candidateId: string, checksum: string, now: Date): RenderArtifact {
  return {
    id: crypto.randomUUID(),
    tenantId,
    candidateId,
    version: 1,
    profileVersion: 1,
    timeline: { engine: ENGINE_VERSION, captions: "none" },
    objectKey: `tenants/${tenantId}/renders/${candidateId}.mp4`,
    checksumSha256: checksum,
    durationMs: 2000,
    width: 1080,
    height: 1920,
    hasAudio: true,
    status: "succeeded",
    errorCode: null,
    warnings: [],
    engineVersion: ENGINE_VERSION,
    createdAt: now.toISOString(),
  };
}
