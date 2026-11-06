import { createHmac, timingSafeEqual } from "node:crypto";
import { ClipppyError } from "@clipppy/contracts";
import type { NormalizedChat } from "./twitch";

export function verifyKickSignature(rawBody: string, header: string | null, secret: string): void {
  if (!header || !secret) throw new ClipppyError("KICK_SIGNATURE_INVALID", "Kick signature is missing.", 401);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = header.replace(/^sha256=/, "");
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ClipppyError("KICK_SIGNATURE_INVALID", "Kick signature does not match.", 401);
  }
}

export function normalizeKickEvent(message: unknown): NormalizedChat | { ignored: true; reason: string } {
  const body = message as {
    type?: string;
    event?: {
      id?: string;
      channel_id?: string;
      user_id?: string;
      content?: string;
      role?: string;
      created_at?: string;
      is_bot?: boolean;
    };
  };
  if (body.type !== "chat.message.sent") return { ignored: true, reason: body.type ?? "unknown" };
  const event = body.event;
  if (!event?.id || !event.user_id || !event.channel_id) {
    throw new ClipppyError("KICK_EVENT_INVALID", "Kick chat event is missing ids.", 422);
  }
  const role = mapKickRole(event.role);
  return {
    provider: "kick",
    providerEventId: event.id,
    channelId: event.channel_id,
    sender: {
      providerUserId: event.user_id,
      role,
      isBot: Boolean(event.is_bot),
      isSelf: false,
    },
    text: event.content ?? "",
    occurredAt: event.created_at ?? new Date().toISOString(),
  };
}

function mapKickRole(role: string | undefined): NormalizedChat["sender"]["role"] {
  if (role === "broadcaster" || role === "owner") return "broadcaster";
  if (role === "moderator") return "moderator";
  if (role === "vip") return "vip";
  if (role === "subscriber") return "subscriber";
  if (role === "viewer") return "viewer";
  return "unknown";
}

export function kickAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://id.kick.com/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "chat:read events:read");
  url.searchParams.set("state", input.state);
  return url.toString();
}
