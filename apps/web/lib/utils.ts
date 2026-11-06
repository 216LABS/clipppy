import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function utcStamp(value: string | null | undefined): string {
  if (!value) return "—";
  return `${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function shortHash(value: string | null | undefined): string {
  if (!value) return "pending";
  return `${value.slice(0, 12)}…${value.slice(-6)}`;
}
