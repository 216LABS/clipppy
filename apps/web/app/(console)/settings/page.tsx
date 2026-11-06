import { getSharedStore } from "@clipppy/domain";
import { createHookAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireSession } from "@/lib/auth";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; hook?: string; secret?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const store = getSharedStore();
  const sources = store.data.sources.filter((source) => source.tenantId === session.actor.tenantId);
  const destinations = store.data.destinations.filter((destination) => destination.tenantId === session.actor.tenantId);
  const hooks = store.data.hooks.filter((hook) => hook.tenantId === session.actor.tenantId);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Sources and hooks</h1>
      <Notice error={query.error} info={query.secret ? "Copy the hook secret now. It is stored encrypted and will not be shown again." : undefined} />
      {query.secret ? (
        <p className="rounded-2xl bg-lime px-4 py-3 font-mono text-sm text-ink">
          {query.hook} · {query.secret}
        </p>
      ) : null}
      <section className="grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <article key={source.id} className="rounded-3xl border border-line p-4">
            <Badge tone={source.revokedAt ? "rejected" : "live"}>{source.revokedAt ? "revoked" : source.platform}</Badge>
            <h2 className="mt-2 font-display text-2xl">{source.channelLogin}</h2>
            <p className="text-sm text-mist">
              {source.permissionBasis}: {source.permissionReference}
            </p>
          </article>
        ))}
        {sources.length === 0 ? <p className="text-mist">No authorized source. Onboarding will not activate without a permission reference.</p> : null}
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {destinations.map((destination) => (
          <article key={destination.id} className="rounded-3xl border border-line p-4 text-sm">
            <Badge tone="unaudited">{destination.appVisibility}</Badge>
            <h2 className="mt-2 font-display text-2xl">{destination.label}</h2>
            <p className="text-mist">
              {destination.platform} · allowed {destination.allowedVisibility.join(", ")}. Tokens stay encrypted on the server. Unaudited apps may not be publicly visible.
            </p>
          </article>
        ))}
      </section>
      <form action={createHookAction} className="max-w-md space-y-3 rounded-3xl border border-line p-4">
        <h2 className="font-display text-2xl">Signed clip webhook</h2>
        <p className="text-sm text-mist">For a Stream Deck HTTPS action. No native plugin in v1. The secret is shown once.</p>
        <Input name="name" defaultValue="Stream Deck" />
        <Button type="submit" disabled={session.role === "viewer"}>Create hook</Button>
      </form>
      <ul className="text-sm text-mist">
        {hooks.map((hook) => (
          <li key={hook.id}>
            {hook.name} · {hook.publicId} · {hook.disabledAt ? "revoked" : "active"} · hash stored, secret not listed
          </li>
        ))}
      </ul>
    </div>
  );
}
