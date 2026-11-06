import { getSharedStore } from "@clipppy/domain";
import { killSwitchAction } from "@/lib/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { utcStamp } from "@/lib/utils";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const session = await requireSession();
  const store = getSharedStore();
  const mine = store.data.jobs.filter((job) => job.tenantId === session.actor.tenantId);
  const isAdmin = store.data.adminEmails.includes(session.email);
  return (
    <div>
      <h1 className="font-display text-4xl">Operations</h1>
      <p className="mt-2 max-w-2xl text-sm text-mist">The kill switch stops new uploads and leaves review available. GPU provider selection is still open; this desk runs the CPU fallback.</p>
      <Notice error={query.error} info={query.saved ? "Kill switch updated." : undefined} />
      <p className="mt-4 text-sm">Global publish halt: {store.data.killSwitch.global ? "on" : "off"}</p>
      {isAdmin ? (
        <form action={killSwitchAction} className="mt-3 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="halted" defaultChecked={store.data.killSwitch.global} />
            Halt new uploads
          </label>
          <Button type="submit" size="sm" variant="outline">Save</Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-mist">Your login is not in ADMIN_EMAILS, so the kill switch stays read-only.</p>
      )}
      <ul className="mt-6 space-y-2 text-sm">
        {mine.slice(0, 12).map((job) => (
          <li key={job.id} className="rounded-2xl border border-line px-3 py-2">
            {job.kind} · {job.state} · attempts {job.attempts}/{job.maxAttempts} · run {utcStamp(job.runAfter)}
            {job.lastError ? ` · ${job.lastError}` : ""}
          </li>
        ))}
        {mine.length === 0 ? <li className="text-mist">No jobs for this tenant.</li> : null}
      </ul>
    </div>
  );
}
