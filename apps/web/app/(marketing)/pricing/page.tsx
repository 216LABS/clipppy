export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">Seat billing</p>
      <h1 className="mt-2 font-display text-5xl">One monthly seat per authorized source.</h1>
      <p className="mt-4 text-lg text-ink/75">
        v1 does not meter uploads. Caps are plan data so a busy night cannot become a surprise bill. The dollar price is not set; it waits on measured render cost.
      </p>
      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink/15 text-ink/50">
            <th className="py-2 font-medium">Starting cap</th>
            <th className="py-2 font-medium">Default</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Concurrent live sources per seat", "1"],
            ["Stored raw minutes", "600"],
            ["Renders per month", "120"],
            ["Upload destinations", "2"],
            ["Clip length", "60 seconds"],
            ["Raw segment retention", "24 hours after the session"],
            ["Draft retention", "30 days"],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-ink/10">
              <td className="py-3">{label}</td>
              <td className="py-3 font-semibold">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-sm text-ink/70">
        These are operating defaults, not a promise of included volume for a future price. The internal GTA 6 tenant carries an explicit entitlement and still cannot skip human approval. Stripe test mode is the only billing path until a live price id is configured. Past-due grace stops new capture and render, keeps review for the grace window, and never publishes while suspended.
      </p>
    </main>
  );
}
