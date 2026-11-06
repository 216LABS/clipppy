import { describe, expect, it } from "vitest";
import { filterLiveChannels } from "./discovery";
import { normalizeKickEvent, verifyKickSignature } from "./kick";
import { assertTwitchProbe, parseEventSub } from "./twitch";
import { createHmac } from "node:crypto";

describe("twitch and kick ingest", () => {
  it("parses EventSub chat, keepalive, and reconnect without treating a clip as approval", () => {
    const parsed = parseEventSub({
      metadata: { message_type: "notification", message_id: "m1", subscription_type: "channel.chat.message" },
      payload: {
        event: {
          broadcaster_user_id: "b1",
          chatter_user_id: "c1",
          message_id: "chat-1",
          message: { text: "!clip 30 boss" },
          badges: [{ set_id: "moderator" }],
          message_type: "text",
        },
      },
    });
    expect(parsed.kind).toBe("chat");
    if (parsed.kind === "chat") {
      expect(parsed.chat.sender.role).toBe("moderator");
      expect(parsed.chat.text).toBe("!clip 30 boss");
    }
    expect(parseEventSub({ metadata: { message_type: "session_keepalive" } }).kind).toBe("keepalive");
    expect(parseEventSub({ metadata: { message_type: "session_reconnect" }, payload: { session: { reconnect_url: "wss://reload" } } })).toMatchObject({
      kind: "reconnect",
      url: "wss://reload",
    });
    expect(() => assertTwitchProbe(["user:read:email"])).toThrow(/failed closed/);
  });

  it("verifies Kick signatures and fails closed on an unknown role", () => {
    const body = JSON.stringify({ ok: true });
    const secret = "kick-test-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    verifyKickSignature(body, signature, secret);
    expect(() => verifyKickSignature(body, "nope", secret)).toThrow(/does not match/);
    const normalized = normalizeKickEvent({
      type: "chat.message.sent",
      event: { id: "k1", channel_id: "ch", user_id: "u", content: "!clip", role: "mystery", created_at: "2026-11-06T00:00:00Z" },
    });
    expect("sender" in normalized && normalized.sender.role).toBe("unknown");
  });

  it("keeps discovered channels unauthorized", () => {
    const found = filterLiveChannels(
      [
        { platform: "twitch", platformChannelId: "a", login: "a", gameId: "gta6", viewerCount: 50, language: "en" },
        { platform: "twitch", platformChannelId: "b", login: "b", gameId: "gta6", viewerCount: 500, language: "en" },
        { platform: "twitch", platformChannelId: "c", login: "c", gameId: "other", viewerCount: 900, language: "en" },
        { platform: "twitch", platformChannelId: "d", login: "d", gameId: "gta6", viewerCount: 800, language: "en" },
      ],
      { gameId: "gta6", minViewers: 100, topN: 1, denylist: ["d"] },
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.platformChannelId).toBe("b");
    expect(found[0]?.authorized).toBe(false);
  });
});
