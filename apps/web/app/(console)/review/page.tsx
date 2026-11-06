import Link from "next/link";
import { getSharedStore, listReview } from "@clipppy/domain";
import { requireSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export default async function ReviewIndexPage() {
  const session = await requireSession();
  const queue = listReview(getSharedStore(), session.actor);
  return (
    <div>
      <h1 className="font-display text-4xl">Review queue</h1>
      <p className="mt-2 text-sm text-mist">Each card is one candidate. Approval is a separate step on the exact render.</p>
      {queue.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-line p-6 text-mist">Nothing is waiting. Rejected and published cuts leave this list.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {queue.map((candidate) => (
            <li key={candidate.id}>
              <Link href={`/review/${candidate.id}`} className="block rounded-3xl border border-line p-5 hover:border-lime">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={candidate.origin}>{candidate.origin}</Badge>
                  <Badge tone="review">review</Badge>
                  {candidate.score != null ? <span className="text-sm text-mist">score {candidate.score.toFixed(2)}</span> : <span className="text-sm text-mist">manual, no score</span>}
                </div>
                <p className="mt-3 text-paper">{String(candidate.reason.summary ?? candidate.note ?? "Marked moment")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
