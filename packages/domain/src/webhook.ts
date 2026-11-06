import { ClipppyError, webhookClipBodySchema } from "@clipppy/contracts";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, safeEqual, sha256Hex, signHmac } from "./crypto";
import { createManualCandidate } from "./manual";
import { requireRole } from "./access";
import { audit, type Actor, type MemoryStore } from "./store";

export function createClipHook(
  store: MemoryStore,
  input: { actor: Actor; sourceId: string; name: string; now: Date; tokenKey: Buffer },
): { publicId: string; secret: string } {
  requireRole(store, input.actor, ["owner", "editor"]);
  const source = store.data.sources.find((item) => item.id === input.sourceId && item.tenantId === input.actor.tenantId);
  if (!source || source.revokedAt) throw new ClipppyError("NOT_AUTHORIZED", "Hook source is not authorized.", 403);
  const secret = randomBytes(24).toString("base64url");
  const publicId = randomBytes(12).toString("base64url");
  store.data.hooks.push({
    id: crypto.randomUUID(),
    publicId,
    tenantId: input.actor.tenantId,
    sourceId: source.id,
    name: input.name,
    secretCiphertext: encryptSecret(secret, input.actor.tenantId, input.tokenKey),
    secretHash: sha256Hex(secret),
    disabledAt: null,
    createdAt: input.now.toISOString(),
  });
  return { publicId, secret };
}

export function revokeClipHook(store: MemoryStore, actor: Actor, publicId: string, now: Date): void {
  const hook = store.data.hooks.find((item) => item.publicId === publicId && item.tenantId === actor.tenantId);
  if (!hook) throw new ClipppyError("HOOK_NOT_FOUND", "Hook was not found.", 404);
  hook.disabledAt = now.toISOString();
}

export function handleClipHook(
  store: MemoryStore,
  input: {
    publicId: string;
    rawBody: string;
    timestamp: string | null;
    eventId: string | null;
    signature: string | null;
    now: Date;
    tokenKey: Buffer;
    actorUserId: string;
  },
): { status: number; body: { candidate_id: string; state: "queued"; status_url: string } } {
  const hook = store.data.hooks.find((item) => item.publicId === input.publicId);
  if (!hook || hook.disabledAt) throw new ClipppyError("HOOK_REJECTED", "Hook is unknown or disabled.", 401);
  const timestamp = Number(input.timestamp);
  if (!input.timestamp || !Number.isFinite(timestamp) || Math.abs(input.now.getTime() / 1000 - timestamp) > 300) {
    throw new ClipppyError("HOOK_SKEW", "Webhook timestamp is outside five minutes.", 401);
  }
  if (!input.eventId) throw new ClipppyError("HOOK_REJECTED", "Webhook event id is required.", 401);
  const secret = decryptSecret(hook.secretCiphertext, hook.tenantId, input.tokenKey);
  const expected = `v1=${signHmac(secret, `${input.timestamp}.${input.rawBody}`)}`;
  if (!input.signature || !safeEqual(expected, input.signature)) {
    throw new ClipppyError("HOOK_SIGNATURE", "Webhook signature does not match.", 401);
  }
  const parsed = webhookClipBodySchema.safeParse(JSON.parse(input.rawBody));
  if (!parsed.success) throw new ClipppyError("HOOK_BODY", "Webhook body is invalid.", 400);
  const replayKey = `${hook.id}:${input.eventId}`;
  if (store.data.replays.includes(replayKey)) {
    const existing = store.data.candidates.find((item) => item.idempotencyKey === `hook:${hook.id}:${input.eventId}`);
    if (!existing) throw new ClipppyError("HOOK_REPLAY", "Event id was already used.", 409);
    return { status: 200, body: responseBody(existing.id) };
  }
  const session = store.data.sessions.find((item) => {
    if (parsed.data.session_id) return item.id === parsed.data.session_id;
    return item.sourceId === hook.sourceId && item.status === "live";
  });
  if (!session || session.tenantId !== hook.tenantId || session.sourceId !== hook.sourceId) {
    throw new ClipppyError("HOOK_SESSION", "Hook cannot act on that session.", 403);
  }
  const actor: Actor = { type: "user", userId: input.actorUserId, tenantId: hook.tenantId };
  const created = createManualCandidate(store, {
    actor,
    origin: "webhook",
    sessionId: session.id,
    providerEventId: input.eventId,
    hookId: hook.id,
    seconds: parsed.data.seconds,
    note: parsed.data.note,
    now: input.now,
    actorLabel: `hook:${hook.name}`,
    skipMembership: true,
  });
  if (!store.data.replays.includes(replayKey)) store.data.replays.push(replayKey);
  audit(store, {
    tenantId: hook.tenantId,
    actorUserId: null,
    actorType: "webhook",
    action: "hook.clip",
    entityType: "candidate",
    entityId: created.candidate.id,
    metadata: { hookId: hook.id },
    createdAt: input.now.toISOString(),
  });
  return { status: created.duplicate ? 200 : 202, body: responseBody(created.candidate.id) };
}

function responseBody(candidateId: string) {
  return { candidate_id: candidateId, state: "queued" as const, status_url: `/review/${candidateId}` };
}
