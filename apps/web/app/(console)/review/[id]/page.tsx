import { getCandidate, getSharedStore, latestRender, loadKeys, signObjectToken } from "@clipppy/domain";
import { approveAction, publishMockAction, rejectAction, rerenderAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireSession } from "@/lib/auth";
import { shortHash } from "@/lib/utils";

const reasons = ["not_interesting", "wrong_window", "too_short", "bad_crop", "bad_captions", "music_risk", "duplicate", "other"];

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const store = getSharedStore();
  let detail: ReturnType<typeof getCandidate> | null = null;
  try {
    detail = getCandidate(store, session.actor, id);
  } catch {
    return <p className="text-mist">That candidate is not in this tenant.</p>;
  }
  const render = latestRender(store, detail.candidate.id);
  const destinations = store.data.destinations.filter((item) => item.tenantId === session.actor.tenantId);
  const publications = store.data.publications.filter((item) => item.tenantId === session.actor.tenantId && store.data.approvals.some((approval) => approval.id === item.approvalId && approval.candidateId === id));
  const keys = loadKeys("local");
  const mediaToken = render?.objectKey
    ? signObjectToken({ tenantId: session.actor.tenantId, objectKey: render.objectKey, expiresAt: Date.now() + 10 * 60_000 }, keys.tokenKey)
    : null;
  const canEdit = session.role === "owner" || session.role === "editor";
  const info = query.approved ? "Approved. Publication rows are queued. Nothing has been uploaded yet." : query.rejected ? "Rejected. No upload was created." : query.published ? "Mock publisher stored a provider id for this checksum. Live adapters stay blocked." : query.rerender ? "A new render version is queued. Earlier approvals cannot post it." : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <div className="flex flex-wrap gap-2">
          <Badge tone={detail.candidate.origin}>{detail.candidate.origin}</Badge>
          <Badge tone={detail.candidate.state}>{detail.candidate.state}</Badge>
        </div>
        <h1 className="mt-3 font-display text-4xl">Exact render</h1>
        <Notice error={query.error} info={info} />
        <p className="text-sm leading-6 text-mist">{String(detail.candidate.reason.summary ?? "No explanation stored.")}</p>
        {detail.candidate.note ? <p className="mt-2 text-sm">Note: {detail.candidate.note}</p> : null}
        {render?.warnings.includes("music_risk") ? (
          <p className="mt-3 text-sm text-amber-200">Music bed suspected. This is not a copyright-safety verdict.</p>
        ) : null}
        <video className="mt-4 aspect-[9/16] max-h-[540px] w-full rounded-3xl bg-black object-cover" controls src="/fixtures/synthetic-vertical.mp4" />
        <p className="mt-3 font-mono text-xs text-mist">sha256 {render?.checksumSha256 ?? "pending"}</p>
        {mediaToken ? (
          <a className="mt-2 inline-block text-sm text-lime" href={`/api/media?token=${encodeURIComponent(mediaToken)}`}>
            Download with a short-lived signed link
          </a>
        ) : null}
      </section>
      <aside className="space-y-4">
        {canEdit && detail.candidate.state === "review" && render?.status === "succeeded" && render.checksumSha256 ? (
          <form action={approveAction} className="space-y-3 rounded-3xl border border-line p-4">
            <h2 className="font-display text-2xl">Approve this checksum</h2>
            <input type="hidden" name="candidate_id" value={detail.candidate.id} />
            <input type="hidden" name="render_id" value={render.id} />
            <input type="hidden" name="checksum" value={render.checksumSha256} />
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required maxLength={100} defaultValue="GTA 6 test cut" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue="Draft from an authorized test stream. Not a public launch post." />
            </div>
            <div>
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" name="tags" defaultValue="gta" className="mt-1" />
            </div>
            <fieldset className="space-y-2 text-sm">
              <legend className="text-xs uppercase tracking-[0.14em] text-mist">Destinations</legend>
              {destinations.length === 0 ? <p className="text-mist">No destination is connected. Approval can still be recorded with none selected, and nothing uploads.</p> : null}
              {destinations.map((destination) => (
                <label key={destination.id} className="flex items-start gap-2">
                  <input type="checkbox" name="destination_id" value={destination.id} />
                  <span>
                    {destination.label}
                    <span className="block text-mist">
                      {destination.platform} · {destination.appVisibility}. {destination.appVisibility === "unaudited" ? "Uploads may stay private until platform review." : "Audited app."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm_exact" required />
              I approve checksum {shortHash(render.checksumSha256)} and no other cut.
            </label>
            <Button type="submit">Approve exact render</Button>
          </form>
        ) : (
          <p className="rounded-3xl border border-dashed border-line p-4 text-sm text-mist">
            {canEdit ? "This candidate is not waiting for a new approval." : "Viewers cannot approve or reject."}
          </p>
        )}
        {canEdit && (detail.candidate.state === "review" || detail.candidate.state === "queued" || detail.candidate.state === "failed") ? (
          <form action={rejectAction} className="space-y-3 rounded-3xl border border-line p-4">
            <h2 className="font-display text-2xl">Reject</h2>
            <input type="hidden" name="candidate_id" value={detail.candidate.id} />
            <select name="reason" className="h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm">
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <Input name="note" placeholder="Optional note" />
            <Button type="submit" variant="danger">
              Reject candidate
            </Button>
          </form>
        ) : null}
        {canEdit ? (
          <form action={rerenderAction}>
            <input type="hidden" name="candidate_id" value={detail.candidate.id} />
            <Button type="submit" variant="outline">
              New render version
            </Button>
          </form>
        ) : null}
        {publications.map((publication) => (
          <form key={publication.id} action={publishMockAction} className="rounded-3xl border border-line p-4 text-sm">
            <p>
              Publication {publication.status}
              {publication.providerPostId ? ` · ${publication.providerPostId}` : ""}
            </p>
            <input type="hidden" name="publication_id" value={publication.id} />
            <input type="hidden" name="candidate_id" value={detail.candidate.id} />
            {publication.status === "queued" ? (
              <Button type="submit" className="mt-3" variant="outline">
                Run mock publisher
              </Button>
            ) : null}
          </form>
        ))}
      </aside>
    </div>
  );
}
