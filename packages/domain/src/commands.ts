import { ClipppyError } from "@clipppy/contracts";

export type ParsedClipCommand = { seconds?: number; note?: string };

export function parseClipCommand(text: string): ParsedClipCommand | null {
  const trimmed = text.trim();
  const match = /^!clip(?:\s+(\d{1,2})(?:\s+([\s\S]{1,200}))?)?$/.exec(trimmed);
  if (!match) return null;
  if (!match[1]) return {};
  const seconds = Number(match[1]);
  if (seconds < 15 || seconds > 60) {
    throw new ClipppyError("WINDOW_OUT_OF_RANGE", "Chat clip length must be 15-60 seconds.", 400);
  }
  const note = match[2]?.trim();
  return note ? { seconds, note } : { seconds };
}

export type ChatSender = {
  providerUserId: string;
  role: "broadcaster" | "moderator" | "vip" | "subscriber" | "viewer" | "unknown";
  isBot: boolean;
  isSelf: boolean;
};

export function senderAllowed(
  sender: ChatSender,
  policy: { mode: "broadcaster_and_mods" | "broadcaster" | "allowlist"; allowlist: string[] },
): boolean {
  if (sender.isBot || sender.isSelf) return false;
  if (sender.role === "unknown") return false;
  if (policy.mode === "broadcaster") return sender.role === "broadcaster";
  if (policy.mode === "allowlist") return policy.allowlist.includes(sender.providerUserId);
  return sender.role === "broadcaster" || sender.role === "moderator";
}
