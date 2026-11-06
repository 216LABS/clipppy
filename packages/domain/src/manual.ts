import { ClipppyError } from "@clipppy/contracts";
import { enqueueJob } from "@clipppy/jobs";
import { assertCapability, requireRole } from "./access";
import { audit, type Actor, type Candidate, type MemoryStore } from "./store";
import { reserveUsage } from "./usage";
import { assessMediaWindow } from "./window";

export function createManualCandidate(
  store: MemoryStore,
  input: {
    actor: Actor;
    origin: "dashboard" | "chat_command" | "webhook";
    sessionId: string;
    requestId?: string;
    providerEventId?: string;
    hookId?: string;
    seconds?: number;
    note?: string;
    clipAnyway?: boolean;
    now: Date;
    anchorAt?: Date;
    actorLabel?: string;
    skipMembership?: boolean;
  },
): { candidate: Candidate; duplicate: boolean } {
  return store.transaction(() => {
    const session = store.data.sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new ClipppyError("SESSION_NOT_FOUND", "Session was not found.", 404);
    if (session.tenantId !== input.actor.tenantId) {
      throw new ClipppyError("TENANT_MISMATCH", "That session belongs to another tenant.", 403);
    }
    if (!input.skipMembership && input.origin === "dashboard") requireRole(store, input.actor, ["owner", "editor"]);
    const source = store.data.sources.find((item) => item.id === session.sourceId && item.revokedAt === null);
    if (!source || source.tenantId !== session.tenantId) {
      throw new ClipppyError("NOT_AUTHORIZED", "Capture requires an active authorized source.", 403);
    }
    const idempotencyKey = manualKey(input);
    const existing = store.data.candidates.find(
      (item) => item.tenantId === session.tenantId && item.idempotencyKey === idempotencyKey,
    );
    if (existing) return { candidate: existing, duplicate: true };
    assertCapability(store, session.tenantId, "render", input.now);
    const profile = activeProfile(store, session);
    const window = resolveWindow(profile.config.window, input.seconds, profile.config.window.max_duration_seconds);
    const anchor = input.anchorAt ?? input.now;
    const startMs = anchor.getTime() + window.startOffsetMs;
    const endMs = anchor.getTime() + window.endOffsetMs;
    if (input.origin === "dashboard" && !input.clipAnyway) {
      const overlap = store.data.candidates.find((item) => {
        if (item.sessionId !== session.id || item.origin !== "dashboard" || !item.anchorAt) return false;
        if (Math.abs(Date.parse(item.createdAt) - input.now.getTime()) > 10_000) return false;
        const otherStart = Date.parse(item.anchorAt) + item.startOffsetMs;
        const otherEnd = Date.parse(item.anchorAt) + item.endOffsetMs;
        return startMs <= otherEnd && endMs >= otherStart;
      });
      if (overlap) return { candidate: overlap, duplicate: true };
    }
    enforceRate(store, input, session.sourceId);
    const segments = store.data.segments
      .filter((item) => item.sessionId === session.id)
      .map((item) => ({ sequence: item.sequence, startMs: item.startedAtMs, durationMs: item.durationMs }));
    const coverage = assessMediaWindow({ segments, startMs, endMs, nowMs: input.now.getTime() });
    if (!coverage.ok) throw new ClipppyError("MEDIA_WINDOW_EXPIRED", "The buffer no longer covers that moment.", 409);
    const hourAgo = input.now.getTime() - 3_600_000;
    const hourly = store.data.candidates.filter(
      (item) => item.sessionId === session.id && Date.parse(item.createdAt) >= hourAgo,
    ).length;
    if (hourly >= profile.config.detection.max_candidates_per_hour) {
      throw new ClipppyError("RATE_LIMITED", "This source is at its candidate cap for the hour.", 429);
    }
    const note = input.note?.trim() ? input.note.trim() : null;
    if (note && note.length > 200) throw new ClipppyError("NOTE_TOO_LONG", "Notes are limited to 200 characters.", 400);
    reserveUsage(store, session.tenantId, "render", 1, input.now);
    const candidate: Candidate = {
      id: crypto.randomUUID(),
      tenantId: session.tenantId,
      sessionId: session.id,
      origin: input.origin,
      anchorAt: anchor.toISOString(),
      segmentCursor: {
        sequences: coverage.sequences,
        pendingPostRoll: coverage.pendingPostRoll,
        discontinuities: coverage.discontinuities.length,
      },
      startOffsetMs: window.startOffsetMs,
      endOffsetMs: window.endOffsetMs,
      state: "queued",
      score: null,
      reason: { summary: "Manual mark. No score is required.", pendingPostRoll: coverage.pendingPostRoll },
      signalSnapshot: {},
      requestId: input.requestId ?? null,
      requestedBy: input.skipMembership ? null : input.actor.userId,
      note,
      actorLabel: input.actorLabel ?? null,
      profileId: profile.id,
      profileVersion: profile.version,
      idempotencyKey,
      createdAt: input.now.toISOString(),
    };
    store.data.candidates.push(candidate);
    store.data.outbox.push({
      id: crypto.randomUUID(),
      type: "candidate.created",
      payload: { candidateId: candidate.id, origin: candidate.origin },
      createdAt: input.now.toISOString(),
    });
    enqueueJob(store.data.jobs, {
      tenantId: session.tenantId,
      kind: "clip.prepare",
      payload: { candidateId: candidate.id },
      idempotencyKey: `prepare:${candidate.id}`,
      now: input.now,
    });
    audit(store, {
      tenantId: session.tenantId,
      actorUserId: input.actor.userId,
      actorType: input.origin,
      action: "candidate.manual_create",
      entityType: "candidate",
      entityId: candidate.id,
      metadata: { origin: input.origin, note: note ?? "" },
      createdAt: input.now.toISOString(),
    });
    return { candidate, duplicate: false };
  });
}

function manualKey(input: {
  origin: string;
  sessionId: string;
  requestId?: string;
  providerEventId?: string;
  hookId?: string;
}): string {
  if (input.origin === "chat_command") {
    if (!input.providerEventId) throw new ClipppyError("EVENT_ID_REQUIRED", "Chat clips need a provider event id.", 400);
    return `chat:${input.sessionId}:${input.providerEventId}`;
  }
  if (input.origin === "webhook") {
    if (!input.hookId || !input.providerEventId) {
      throw new ClipppyError("EVENT_ID_REQUIRED", "Webhook clips need a hook and event id.", 400);
    }
    return `hook:${input.hookId}:${input.providerEventId}`;
  }
  if (!input.requestId) throw new ClipppyError("REQUEST_ID_REQUIRED", "Dashboard clips need a fresh request id.", 400);
  return `dash:${input.sessionId}:${input.requestId}`;
}

function activeProfile(store: MemoryStore, session: { profileId: string; tenantId: string }) {
  const profile = store.data.profiles.find((item) => item.id === session.profileId && item.tenantId === session.tenantId);
  if (!profile) throw new ClipppyError("PROFILE_MISSING", "The session profile is missing.", 409);
  return profile;
}

function resolveWindow(
  window: { pre_seconds: number; post_seconds: number; max_duration_seconds: number },
  seconds: number | undefined,
  maxSeconds: number,
): { startOffsetMs: number; endOffsetMs: number } {
  const pre = Math.max(10, window.pre_seconds);
  if (!seconds) return { startOffsetMs: -pre * 1000, endOffsetMs: window.post_seconds * 1000 };
  if (seconds < 15 || seconds > Math.min(60, maxSeconds)) {
    throw new ClipppyError("WINDOW_OUT_OF_RANGE", "Clip length must stay within the plan window.", 400);
  }
  return { startOffsetMs: -pre * 1000, endOffsetMs: Math.max(0, seconds - pre) * 1000 };
}

function enforceRate(
  store: MemoryStore,
  input: { origin: string; now: Date },
  sourceId: string,
): void {
  if (input.origin === "dashboard") return;
  const key = `${input.origin}:${sourceId}`;
  const recent = store.data.chatRate.filter((item) => item.key === key && Date.parse(item.at) >= input.now.getTime() - 60_000);
  store.data.chatRate = store.data.chatRate.filter((item) => Date.parse(item.at) >= input.now.getTime() - 60_000);
  const limit = input.origin === "chat_command" ? 6 : 30;
  if (recent.length >= limit) throw new ClipppyError("RATE_LIMITED", "Too many clip requests on this source.", 429);
  store.data.chatRate.push({ key, at: input.now.toISOString() });
}
