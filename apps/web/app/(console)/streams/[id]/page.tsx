import Link from "next/link";
import { advanceFixtureBuffer, getSharedStore, getTimeline } from "@clipppy/domain";
import { ClipForm } from "@/components/clip-form";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { utcStamp } from "@/lib/utils";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; queued?: string; duplicate?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const store = getSharedStore();
  advanceFixtureBuffer(store, id, new Date());
  const stream = store.data.sessions.find((item) => item.id === id && item.tenantId === session.actor.tenantId);
  if (!stream) {
    return <p className="text-mist">That session is not in this tenant.</p>;
  }
  const timeline = getTimeline(store, session.actor, id, Date.parse(stream.startedAt), Date.now() + 60_000);
  const max = Math.max(1, ...timeline.buckets.map((bucket) => bucket.messages));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section>
        <p className="text-xs uppercase tracking-[0.16em] text-mist">{stream.gameName}</p>
        <h1 className="font-display text-4xl">{stream.title}</h1>
        <p className="mt-2 text-sm text-mist">Started {utcStamp(stream.startedAt)}. Chat text is not shown here; the bars are counts.</p>
        <Notice
          error={query.error}
          info={query.queued ? `Moment queued${query.duplicate ? " (existing candidate returned)" : ""}.` : undefined}
        />
        {timeline.buckets.length === 0 ? (
          <p className="mt-6 text-mist">No chat buckets in this window yet. Manual marks still work while detection is warming up.</p>
        ) : (
          <div className="mt-6 flex h-40 items-end gap-1 overflow-x-auto rounded-3xl border border-line bg-black/20 p-3">
            {timeline.buckets.slice(-80).map((bucket) => (
              <div key={bucket.start} title={`${bucket.messages} messages`} className="w-2 shrink-0 rounded-full bg-lime" style={{ height: `${Math.max(8, (bucket.messages / max) * 100)}%` }} />
            ))}
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {timeline.markers.map((marker) => (
            <li key={marker.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
              <span>
                <Badge tone={marker.origin}>{marker.origin}</Badge> {marker.summary || marker.note || "Marked moment"}
              </span>
              <Link href={`/review/${marker.id}`} className="text-lime">
                {marker.state}
              </Link>
            </li>
          ))}
          {timeline.markers.length === 0 ? <li className="text-sm text-mist">No clip markers on this session.</li> : null}
        </ul>
      </section>
      <aside className="rounded-3xl border border-line bg-moss/80 p-5">
        <h2 className="font-display text-3xl">Clip this moment</h2>
        <p className="mt-2 text-sm text-mist">The button commits only after the server stores a candidate. It does not approve or publish.</p>
        <div className="mt-4">
          <ClipForm sessionId={id} disabled={session.role === "viewer" || stream.status === "ended"} />
        </div>
      </aside>
    </div>
  );
}
