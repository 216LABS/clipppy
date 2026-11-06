import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/60">216LABS · clipping desk</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] sm:text-7xl">Catch the moment. Approve the exact cut.</h1>
          <p className="mt-6 max-w-xl text-lg text-ink/80">
            Clipppy watches streams a tenant is allowed to use, proposes vertical drafts from chat activity or a manual mark, and will not post until a person approves that exact render.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">Open the GTA 6 test desk</Link>
            </Button>
            <Button asChild size="lg" variant="paper">
              <Link href="/rights">Read the rights rules</Link>
            </Button>
          </div>
        </div>
        <aside className="rounded-[2rem] bg-ink p-6 text-paper shadow-card">
          <p className="text-xs uppercase tracking-[0.18em] text-lime">Launch tenant</p>
          <h2 className="mt-2 font-display text-3xl">GTA 6 is Flip&apos;s own test, not a customer logo.</h2>
          <p className="mt-3 text-sm text-mist">
            The November 19, 2026 rehearsal uses an owned test channel and synthetic fixtures. There is no customer wall because there are no paying customers yet.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-mist">Ingest</dt>
              <dd>Twitch and Kick</dd>
            </div>
            <div>
              <dt className="text-mist">Publish</dt>
              <dd>Shorts and TikTok</dd>
            </div>
            <div>
              <dt className="text-mist">Approval</dt>
              <dd>Every post, exact checksum</dd>
            </div>
            <div>
              <dt className="text-mist">Workers</dt>
              <dd>Cloud CPU, GPU later</dd>
            </div>
          </dl>
        </aside>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-3 sm:px-8">
        {[
          ["Watch an authorized source", "OAuth, a permission attestation, and an authorized_source row. A discovered live channel is not captured."],
          ["Propose, don’t decide", "Chat bursts, the dashboard button, !clip, and a signed webhook all create the same candidate. None of them approve a post."],
          ["Publish the checksum", "A new render invalidates the previous approval. Rejection never uploads. Outside production, live posting is hard-blocked."],
        ].map(([title, body]) => (
          <article key={title} className="rounded-3xl border border-ink/10 bg-white/50 p-5">
            <h2 className="font-display text-2xl">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/75">{body}</p>
          </article>
        ))}
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <h2 className="font-display text-4xl">What this is not</h2>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {[
            "Not a guarantee of virality, monetization, or copyright safety.",
            "Not a workaround for rights you do not have.",
            "Not unattended posting, and there is no auto-publish switch.",
            "Not a full-stream archive or a general video editor.",
            "Not computer vision of every play.",
            "Not anonymous scraping of channels you do not control.",
          ].map((item) => (
            <li key={item} className="rounded-2xl bg-ink px-4 py-3 text-paper">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
