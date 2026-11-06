import { ClipppyError } from "@clipppy/contracts";
import { parseClipCommand, senderAllowed, type ChatSender } from "./commands";
import { createManualCandidate } from "./manual";
import { chatterKey } from "./crypto";
import type { Actor, MemoryStore } from "./store";

export function ingestChatCommand(
  store: MemoryStore,
  input: {
    tenantId: string;
    sessionId: string;
    providerEventId: string;
    text: string;
    sender: ChatSender;
    occurredAt: Date;
    now: Date;
    chatKey: Buffer;
    auditUserId: string;
  },
) {
  const session = store.data.sessions.find((item) => item.id === input.sessionId && item.tenantId === input.tenantId);
  if (!session) throw new ClipppyError("SESSION_NOT_FOUND", "Session was not found.", 404);
  const source = store.data.sources.find((item) => item.id === session.sourceId);
  if (!source) throw new ClipppyError("NOT_AUTHORIZED", "Source is missing.", 403);
  const parsed = parseClipCommand(input.text);
  if (!parsed) return { ignored: true as const };
  if (!senderAllowed(input.sender, source.senderPolicy)) {
    return { ignored: true as const, reason: "sender" as const };
  }
  const actor: Actor = { type: "user", userId: input.auditUserId, tenantId: input.tenantId };
  const created = createManualCandidate(store, {
    actor,
    origin: "chat_command",
    sessionId: session.id,
    providerEventId: input.providerEventId,
    seconds: parsed.seconds,
    note: parsed.note,
    now: input.now,
    anchorAt: input.occurredAt,
    actorLabel: chatterKey(input.tenantId, input.sender.providerUserId, input.chatKey),
    skipMembership: true,
  });
  return { ignored: false as const, ...created };
}
