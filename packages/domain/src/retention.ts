import type { MemoryStore } from "./store";

export const RETENTION = {
  rawChatMs: 7 * 86_400_000,
  renderMs: 30 * 86_400_000,
  publishedMasterMs: 90 * 86_400_000,
};

const ACTIVE = new Set(["queued", "preparing", "rendering", "review", "approved", "publishing"]);

export function sweepRetention(store: MemoryStore, now: Date): { segments: number; chats: number; renders: number } {
  let segments = 0;
  let chats = 0;
  let renders = 0;
  const held = new Set(store.data.tenants.filter((tenant) => tenant.legalHold).map((tenant) => tenant.id));
  const referenced = new Set(
    store.data.candidates.filter((candidate) => ACTIVE.has(candidate.state)).flatMap((candidate) => candidate.segmentCursor.sequences.map((sequence) => `${candidate.sessionId}:${sequence}`)),
  );
  store.data.segments = store.data.segments.filter((segment) => {
    if (held.has(segment.tenantId)) return true;
    if (Date.parse(segment.expiresAt) >= now.getTime()) return true;
    if (referenced.has(`${segment.sessionId}:${segment.sequence}`)) return true;
    segments += 1;
    return false;
  });
  for (const message of store.data.chat) {
    if (held.has(message.tenantId)) continue;
    if (Date.parse(message.occurredAt) >= now.getTime() - RETENTION.rawChatMs) continue;
    if (message.messageRedacted !== null || message.rawRef !== null) {
      message.messageRedacted = null;
      message.rawRef = null;
      chats += 1;
    }
  }
  for (const render of store.data.renders) {
    if (held.has(render.tenantId) || !render.objectKey) continue;
    const candidate = store.data.candidates.find((item) => item.id === render.candidateId);
    const age = now.getTime() - Date.parse(render.createdAt);
    const published = candidate?.state === "published";
    const limit = published ? RETENTION.publishedMasterMs : RETENTION.renderMs;
    if (age > limit && candidate && !ACTIVE.has(candidate.state)) {
      render.objectKey = null;
      renders += 1;
    }
  }
  return { segments, chats, renders };
}
