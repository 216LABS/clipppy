import Link from "next/link";
import { getSharedStore, listSessions } from "@clipppy/domain";
import { requireSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { utcStamp } from "@/lib/utils";

export default async function StreamsPage() {
  const session = await requireSession();
  const streams = listSessions(getSharedStore(), session.actor);
  return (
    <div>
      <h1 className="font-display text-4xl">Live sessions</h1>
      <p className="mt-2 max-w-2xl text-sm text-mist">Only sessions in {session.tenantName} are listed. A second tenant&apos;s media stays in that tenant.</p>
      {streams.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-line p-6 text-mist">No sessions yet. Finish onboarding and authorize a source before capture starts.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {streams.map((stream) => (
            <li key={stream.id}>
              <Link href={`/streams/${stream.id}`} className="block rounded-3xl border border-line bg-moss/70 p-5 hover:border-lime">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl">{stream.title}</p>
                    <p className="text-sm text-mist">
                      {stream.gameName ?? "No category"} · started {utcStamp(stream.startedAt)}
                    </p>
                  </div>
                  <Badge tone={stream.status === "live" ? "live" : "neutral"}>{stream.status}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
