import { getSharedStore } from "@clipppy/domain";

export function GET() {
  const data = getSharedStore().data;
  const live = data.sessions.filter((session) => session.status === "live");
  const oldest = data.jobs.filter((job) => job.state === "queued").sort((a, b) => a.runAfter.localeCompare(b.runAfter))[0];
  return Response.json({
    ok: true,
    env: process.env.APP_ENV ?? "local",
    db: "memory",
    queueDepth: data.jobs.filter((job) => job.state === "queued" || job.state === "leased").length,
    oldestQueuedJob: oldest?.runAfter ?? null,
    liveSessions: live.length,
    publishHalted: data.killSwitch.global,
  });
}
