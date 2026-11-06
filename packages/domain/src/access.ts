import { ClipppyError } from "@clipppy/contracts";
import type { Actor, Entitlement, Membership, MemoryStore, Role } from "./store";

export function membership(store: MemoryStore, actor: Actor): Membership {
  const row = store.data.memberships.find((item) => item.userId === actor.userId && item.tenantId === actor.tenantId);
  if (!row) throw new ClipppyError("FORBIDDEN", "You are not a member of this tenant.", 403);
  return row;
}

export function requireRole(store: MemoryStore, actor: Actor, roles: Role[]): Membership {
  const row = membership(store, actor);
  if (!roles.includes(row.role)) {
    throw new ClipppyError("FORBIDDEN", `Role ${row.role} cannot do that.`, 403);
  }
  return row;
}

export function accessFor(entitlement: Entitlement, now: Date) {
  const periodEnd = entitlement.currentPeriodEnd ? Date.parse(entitlement.currentPeriodEnd) : now.getTime();
  const inGrace = now.getTime() <= periodEnd + entitlement.graceDays * 86_400_000;
  const open = entitlement.status === "active" || entitlement.status === "trial";
  const pastDue = entitlement.status === "past_due" && inGrace;
  return {
    capture: open,
    render: open,
    publish: open,
    review: open || pastDue || entitlement.status === "suspended",
    download: open || pastDue || entitlement.status === "suspended" || (entitlement.status === "canceled" && inGrace),
  };
}

export function requireEntitlement(store: MemoryStore, tenantId: string): Entitlement {
  const entitlement = store.data.entitlements.find((item) => item.tenantId === tenantId);
  if (!entitlement) throw new ClipppyError("ENTITLEMENT_MISSING", "This tenant has no entitlement row.", 402);
  return entitlement;
}

export function assertCapability(
  store: MemoryStore,
  tenantId: string,
  capability: "capture" | "render" | "publish" | "review",
  now: Date,
): Entitlement {
  const entitlement = requireEntitlement(store, tenantId);
  const access = accessFor(entitlement, now);
  if (!access[capability]) {
    throw new ClipppyError(
      "ENTITLEMENT_BLOCKED",
      `The ${entitlement.status} entitlement does not allow ${capability}.`,
      402,
    );
  }
  return entitlement;
}

export function visibleTenantIds(store: MemoryStore, userId: string): string[] {
  return store.data.memberships.filter((item) => item.userId === userId).map((item) => item.tenantId);
}
