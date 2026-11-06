import { ClipppyError } from "@clipppy/contracts";
import { membership } from "./access";
import type { Actor, Candidate, MemoryStore, StreamSession } from "./store";

export function listSessions(store: MemoryStore, actor: Actor): StreamSession[] {
  membership(store, actor);
  return store.data.sessions
    .filter((session) => session.tenantId === actor.tenantId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function getTimeline(store: MemoryStore, actor: Actor, sessionId: string, fromMs?: number, toMs?: number) {
  membership(store, actor);
  const session = store.data.sessions.find((item) => item.id === sessionId && item.tenantId === actor.tenantId);
  if (!session) throw new ClipppyError("SESSION_NOT_FOUND", "Session was not found.", 404);
  const from = fromMs ?? Date.parse(session.startedAt);
  const to = toMs ?? from + 3_600_000;
  const bucketMs = 5_000;
  const counts = new Map<number, { messages: number; chatters: Set<string> }>();
  for (const message of store.data.chat) {
    if (message.sessionId !== session.id) continue;
    const at = Date.parse(message.occurredAt);
    if (at < from || at >= to) continue;
    const bucket = Math.floor(at / bucketMs) * bucketMs;
    const row = counts.get(bucket) ?? { messages: 0, chatters: new Set<string>() };
    row.messages += 1;
    row.chatters.add(message.chatterKey);
    counts.set(bucket, row);
  }
  const markers = store.data.candidates
    .filter((candidate) => candidate.sessionId === session.id)
    .map(marker);
  return {
    sessionId: session.id,
    from,
    to,
    buckets: [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 500)
      .map(([start, row]) => ({ start, messages: row.messages, uniqueChatters: row.chatters.size })),
    markers,
  };
}

export function listReview(store: MemoryStore, actor: Actor): Candidate[] {
  membership(store, actor);
  return store.data.candidates.filter((candidate) => candidate.tenantId === actor.tenantId && candidate.state === "review");
}

export function getCandidate(store: MemoryStore, actor: Actor, candidateId: string) {
  membership(store, actor);
  const candidate = store.data.candidates.find((item) => item.id === candidateId && item.tenantId === actor.tenantId);
  if (!candidate) throw new ClipppyError("CANDIDATE_NOT_FOUND", "Candidate was not found.", 404);
  const renders = store.data.renders.filter((item) => item.candidateId === candidate.id && item.tenantId === actor.tenantId);
  return { candidate, renders };
}

function marker(candidate: Candidate) {
  return {
    id: candidate.id,
    origin: candidate.origin,
    state: candidate.state,
    anchorAt: candidate.anchorAt,
    score: candidate.score,
    summary: typeof candidate.reason.summary === "string" ? candidate.reason.summary : "",
    note: candidate.note,
  };
}
