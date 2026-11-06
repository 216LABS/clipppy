import { accessFor, getSharedStore } from "@clipppy/domain";
import { stripeSimAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const store = getSharedStore();
  const entitlement = store.data.entitlements.find((item) => item.tenantId === session.actor.tenantId);
  const access = entitlement ? accessFor(entitlement, new Date()) : null;
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl">Seat entitlement</h1>
      <p className="mt-2 text-sm text-mist">Stripe test events update this row. A client-supplied price cannot activate a seat. No charge is sent from this desk.</p>
      <Notice error={query.error} info={query.saved ? "Entitlement updated from a simulated Stripe event." : undefined} />
      {entitlement ? (
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">Status</dt><dd>{entitlement.status}</dd></div>
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">Seats</dt><dd>{entitlement.seats}</dd></div>
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">Price</dt><dd>{entitlement.priceId ?? "unset"}</dd></div>
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">Publish</dt><dd>{access?.publish ? "allowed" : "blocked"}</dd></div>
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">New renders</dt><dd>{access?.render ? "allowed" : "blocked"}</dd></div>
          <div className="rounded-2xl border border-line p-3"><dt className="text-mist">Review</dt><dd>{access?.review ? "open" : "closed"}</dd></div>
        </dl>
      ) : (
        <p className="mt-6 text-mist">No entitlement row.</p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <form action={stripeSimAction}>
          <input type="hidden" name="kind" value="past_due" />
          <Button type="submit" variant="danger">Simulate payment failed</Button>
        </form>
        <form action={stripeSimAction}>
          <input type="hidden" name="kind" value="active" />
          <Button type="submit" variant="outline">Simulate seat checkout</Button>
        </form>
      </div>
    </div>
  );
}
