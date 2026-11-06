import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

const links = [
  ["/streams", "Streams"],
  ["/review", "Review"],
  ["/profiles", "Profiles"],
  ["/onboarding", "Onboarding"],
  ["/settings", "Settings"],
  ["/billing", "Billing"],
  ["/admin", "Admin"],
];

export function ConsoleShell({
  name,
  role,
  tenantName,
  children,
}: {
  name: string;
  role: string;
  tenantName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="font-display text-2xl">
              Clipppy
            </Link>
            <p className="text-xs uppercase tracking-[0.16em] text-mist">
              {tenantName} · {name} · {role}
            </p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full border border-line px-3 py-1.5 text-sm text-paper hover:border-lime hover:text-lime">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
