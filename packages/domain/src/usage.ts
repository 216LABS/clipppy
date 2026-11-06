import { ClipppyError } from "@clipppy/contracts";
import { assertCapability } from "./access";
import type { MemoryStore, UsageReservation } from "./store";

export function reserveUsage(
  store: MemoryStore,
  tenantId: string,
  kind: UsageReservation["kind"],
  amount: number,
  now: Date,
): UsageReservation {
  if (kind === "render") assertCapability(store, tenantId, "render", now);
  if (kind === "capture") assertCapability(store, tenantId, "capture", now);
  if (kind === "upload") assertCapability(store, tenantId, "publish", now);
  const entitlement = store.data.entitlements.find((item) => item.tenantId === tenantId);
  if (!entitlement) throw new ClipppyError("ENTITLEMENT_MISSING", "This tenant has no entitlement row.", 402);
  const used = store.data.reservations
    .filter((item) => item.tenantId === tenantId && item.kind === kind && item.status !== "refunded")
    .reduce((sum, item) => sum + item.amount, 0);
  const cap = kind === "render" ? entitlement.caps.rendersPerMonth : kind === "capture" ? entitlement.caps.concurrentStreams * 100 : entitlement.caps.uploadDestinations * 100;
  if (used + amount > cap) throw new ClipppyError("QUOTA_EXCEEDED", `Plan cap reached for ${kind}.`, 429);
  const reservation: UsageReservation = {
    id: crypto.randomUUID(),
    tenantId,
    kind,
    amount,
    status: "reserved",
    createdAt: now.toISOString(),
  };
  store.data.reservations.push(reservation);
  return reservation;
}

export function settleUsage(store: MemoryStore, reservationId: string): void {
  const reservation = store.data.reservations.find((item) => item.id === reservationId);
  if (!reservation) throw new ClipppyError("RESERVATION_MISSING", "Usage reservation was not found.", 404);
  reservation.status = "settled";
}

export function refundUsage(store: MemoryStore, reservationId: string): void {
  const reservation = store.data.reservations.find((item) => item.id === reservationId);
  if (!reservation) throw new ClipppyError("RESERVATION_MISSING", "Usage reservation was not found.", 404);
  reservation.status = "refunded";
}
