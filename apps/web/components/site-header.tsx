import Link from "next/link";

export function SiteHeader({ tone = "paper" }: { tone?: "paper" | "dark" }) {
  const dark = tone === "dark";
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/" className="font-display text-2xl tracking-tight">
        Clipppy
      </Link>
      <nav className={`flex flex-wrap items-center gap-4 text-sm ${dark ? "text-mist" : "text-ink/70"}`}>
        <Link href="/pricing">Pricing</Link>
        <Link href="/rights">Rights</Link>
        <Link href="/login" className={dark ? "text-lime" : "font-semibold text-ink"}>
          Open the desk
        </Link>
      </nav>
    </header>
  );
}
