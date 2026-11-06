import { getSharedStore, type Actor, type Role } from "@clipppy/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function readSession(): Promise<{ actor: Actor; role: Role; email: string; name: string; tenantName: string; tenantSlug: string } | null> {
  const jar = await cookies();
  const userId = jar.get("clipppy_user")?.value;
  const tenantId = jar.get("clipppy_tenant")?.value;
  if (!userId || !tenantId) return null;
  const store = getSharedStore();
  const membership = store.data.memberships.find((item) => item.userId === userId && item.tenantId === tenantId);
  const user = store.data.users.find((item) => item.id === userId);
  const tenant = store.data.tenants.find((item) => item.id === tenantId);
  if (!membership || !user || !tenant) return null;
  return {
    actor: { type: "user", userId, tenantId },
    role: membership.role,
    email: user.email,
    name: user.displayName,
    tenantName: tenant.displayName,
    tenantSlug: tenant.slug,
  };
}

export async function requireSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}
