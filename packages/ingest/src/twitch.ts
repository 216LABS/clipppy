import { ClipppyError } from "@clipppy/contracts";

export const TWITCH_CHAT_SCOPES = ["user:read:chat"] as const;

export type NormalizedChat = {
  provider: "twitch" | "kick";
  providerEventId: string;
  channelId: string;
  sender: {
    providerUserId: string;
    role: "broadcaster" | "moderator" | "vip" | "subscriber" | "viewer" | "unknown";
    isBot: boolean;
    isSelf: boolean;
  };
  text: string;
  occurredAt: string;
};

type EventSubMessage = {
  metadata?: { message_type?: string; message_id?: string; subscription_type?: string };
  payload?: {
    session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    event?: {
      broadcaster_user_id?: string;
      chatter_user_id?: string;
      message_id?: string;
      message?: { text?: string };
      badges?: { set_id?: string }[];
      message_type?: string;
    };
  };
};

export type TwitchControl =
  | { kind: "welcome"; sessionId: string; keepaliveSeconds: number }
  | { kind: "keepalive" }
  | { kind: "reconnect"; url: string }
  | { kind: "revocation" }
  | { kind: "chat"; chat: NormalizedChat }
  | { kind: "ignored"; reason: string };

export function parseEventSub(message: unknown): TwitchControl {
  const body = message as EventSubMessage;
  const type = body.metadata?.message_type;
  if (type === "session_welcome") {
    return {
      kind: "welcome",
      sessionId: body.payload?.session?.id ?? "",
      keepaliveSeconds: body.payload?.session?.keepalive_timeout_seconds ?? 10,
    };
  }
  if (type === "session_keepalive") return { kind: "keepalive" };
  if (type === "session_reconnect") return { kind: "reconnect", url: body.payload?.session?.reconnect_url ?? "" };
  if (type === "revocation") return { kind: "revocation" };
  if (type === "notification" && body.metadata?.subscription_type === "channel.chat.message") {
    const event = body.payload?.event;
    if (!event?.message_id || !event.chatter_user_id || !event.broadcaster_user_id) {
      throw new ClipppyError("TWITCH_EVENT_INVALID", "Chat notification is missing ids.", 422);
    }
    const badges = new Set((event.badges ?? []).map((badge) => badge.set_id));
    const role = badges.has("broadcaster")
      ? "broadcaster"
      : badges.has("moderator")
        ? "moderator"
        : badges.has("vip")
          ? "vip"
          : badges.has("subscriber")
            ? "subscriber"
            : "viewer";
    return {
      kind: "chat",
      chat: {
        provider: "twitch",
        providerEventId: event.message_id,
        channelId: event.broadcaster_user_id,
        sender: {
          providerUserId: event.chatter_user_id,
          role,
          isBot: event.message_type === "bot",
          isSelf: event.chatter_user_id === event.broadcaster_user_id && event.message_type === "bot",
        },
        text: event.message?.text ?? "",
        occurredAt: body.metadata?.message_id ? new Date().toISOString() : new Date().toISOString(),
      },
    };
  }
  return { kind: "ignored", reason: type ?? "unknown" };
}

export function twitchAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; scopes: string[] }): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function assertTwitchProbe(granted: string[]): void {
  const missing = TWITCH_CHAT_SCOPES.filter((scope) => !granted.includes(scope));
  if (missing.length) throw new ClipppyError("SCOPES_MISSING", `Twitch probe failed closed: ${missing.join(", ")}`, 403);
}
