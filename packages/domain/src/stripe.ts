import { ClipppyError } from "@clipppy/contracts";
import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";
import { audit, defaultCaps, type MemoryStore, type TenantStatus } from "./store";

export const DEFAULT_SEAT_PRICE = "price_seat_monthly_test";

export function priceAllowlist(configured?: string): string[] {
  return configured ? [DEFAULT_SEAT_PRICE, configured] : [DEFAULT_SEAT_PRICE];
}

export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs: number): void {
  if (!header || !secret) throw new ClipppyError("STRIPE_SIGNATURE_INVALID", "Stripe signature is missing.", 401);
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new ClipppyError("STRIPE_SIGNATURE_INVALID", "Stripe signature is malformed.", 401);
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > 300) {
    throw new ClipppyError("STRIPE_SIGNATURE_SKEW", "Stripe signature timestamp is outside the window.", 401);
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!safeEqual(expected, signature)) throw new ClipppyError("STRIPE_SIGNATURE_INVALID", "Stripe signature does not match.", 401);
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export function handleStripeEvent(store: MemoryStore, event: StripeEvent, allow: string[], now: Date): { duplicate: boolean } {
  if (store.data.stripeEvents.includes(event.id)) return { duplicate: true };
  store.transaction(() => {
    if (store.data.stripeEvents.includes(event.id)) return;
    applyStripe(store, event, allow, now);
    store.data.stripeEvents.push(event.id);
  });
  return { duplicate: false };
}

function applyStripe(store: MemoryStore, event: StripeEvent, allow: string[], now: Date): void {
  const object = event.data.object;
  const tenantId = String(object.metadata && (object.metadata as { tenant_id?: string }).tenant_id || object.client_reference_id || "");
  if (event.type === "checkout.session.completed") {
    const priceId = String((object.metadata as { price_id?: string } | undefined)?.price_id ?? "");
    if (!allow.includes(priceId)) throw new ClipppyError("PRICE_NOT_ALLOWED", "Checkout price is not the seat price.", 400);
    if (!tenantId) throw new ClipppyError("TENANT_REQUIRED", "Checkout is missing a tenant.", 400);
    const clientPrice = object.client_price_id;
    if (clientPrice && clientPrice !== priceId) {
      throw new ClipppyError("PRICE_NOT_ALLOWED", "A client-supplied price cannot activate a seat.", 400);
    }
    upsertEntitlement(store, tenantId, {
      status: "active",
      stripeCustomerId: String(object.customer ?? ""),
      stripeSubscriptionId: String(object.subscription ?? ""),
      priceId,
      seats: 1,
      now,
    });
    return;
  }
  const subscriptionTenant = tenantId || findTenantBySubscription(store, String(object.id ?? object.subscription ?? ""));
  if (!subscriptionTenant) throw new ClipppyError("TENANT_REQUIRED", "Stripe event is not tied to a tenant.", 400);
  if (event.type === "invoice.payment_failed") {
    upsertEntitlement(store, subscriptionTenant, { status: "past_due", now });
    return;
  }
  if (event.type === "customer.subscription.deleted") {
    upsertEntitlement(store, subscriptionTenant, { status: "canceled", now });
    return;
  }
  if (event.type === "customer.subscription.updated") {
    const priceId = extractPrice(object);
    if (priceId && !allow.includes(priceId)) {
      throw new ClipppyError("PRICE_NOT_ALLOWED", "Subscription price is not the seat price.", 400);
    }
    const status = mapStripeStatus(String(object.status ?? "active"));
    const quantity = Number((object.items as { data?: { quantity?: number }[] } | undefined)?.data?.[0]?.quantity ?? 1);
    upsertEntitlement(store, subscriptionTenant, { status, priceId: priceId ?? undefined, seats: quantity, now });
  }
}

function extractPrice(object: Record<string, unknown>): string | null {
  const items = object.items as { data?: { price?: { id?: string } }[] } | undefined;
  return items?.data?.[0]?.price?.id ?? null;
}

function mapStripeStatus(status: string): TenantStatus {
  if (status === "active" || status === "trialing") return status === "trialing" ? "trial" : "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "incomplete_expired" || status === "paused") return "suspended";
  return "suspended";
}

function findTenantBySubscription(store: MemoryStore, subscriptionId: string): string | null {
  return store.data.entitlements.find((item) => item.stripeSubscriptionId === subscriptionId)?.tenantId ?? null;
}

function upsertEntitlement(
  store: MemoryStore,
  tenantId: string,
  patch: { status: TenantStatus; stripeCustomerId?: string; stripeSubscriptionId?: string; priceId?: string; seats?: number; now: Date },
): void {
  const tenant = store.data.tenants.find((item) => item.id === tenantId);
  if (!tenant) throw new ClipppyError("TENANT_NOT_FOUND", "Stripe tenant does not exist.", 404);
  if (tenant.isInternal) {
    audit(store, {
      tenantId,
      actorUserId: null,
      actorType: "stripe",
      action: "entitlement.internal_update",
      entityType: "entitlement",
      entityId: tenantId,
      metadata: { status: patch.status },
      createdAt: patch.now.toISOString(),
    });
  }
  tenant.status = patch.status;
  const existing = store.data.entitlements.find((item) => item.tenantId === tenantId);
  if (!existing) {
    store.data.entitlements.push({
      tenantId,
      stripeCustomerId: patch.stripeCustomerId ?? null,
      stripeSubscriptionId: patch.stripeSubscriptionId ?? null,
      priceId: patch.priceId ?? null,
      status: patch.status,
      currentPeriodEnd: new Date(patch.now.getTime() + 30 * 86_400_000).toISOString(),
      seats: patch.seats ?? 1,
      caps: defaultCaps(),
      graceDays: 7,
      updatedAt: patch.now.toISOString(),
    });
    return;
  }
  existing.status = patch.status;
  if (patch.stripeCustomerId) existing.stripeCustomerId = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId) existing.stripeSubscriptionId = patch.stripeSubscriptionId;
  if (patch.priceId) existing.priceId = patch.priceId;
  if (patch.seats) existing.seats = patch.seats;
  existing.updatedAt = patch.now.toISOString();
}
