import { ConsoleShell } from "@/components/console-shell";
import { requireSession } from "@/lib/auth";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <ConsoleShell name={session.name} role={session.role} tenantName={session.tenantName}>
      {children}
    </ConsoleShell>
  );
}
