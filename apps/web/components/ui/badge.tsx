import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  live: "bg-lime text-ink",
  review: "bg-amber-200 text-ink",
  approved: "bg-emerald-300 text-ink",
  published: "bg-emerald-500 text-ink",
  rejected: "bg-coral text-white",
  failed: "bg-coral text-white",
  queued: "bg-white/10 text-paper",
  automatic: "bg-white/10 text-lime",
  dashboard: "bg-white/10 text-paper",
  webhook: "bg-white/10 text-paper",
  chat_command: "bg-white/10 text-paper",
  unaudited: "bg-amber-200 text-ink",
  neutral: "bg-white/10 text-mist",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", tones[tone] ?? tones.neutral)}>
      {children}
    </span>
  );
}
