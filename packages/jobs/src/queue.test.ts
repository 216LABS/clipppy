import { describe, expect, it } from "vitest";
import { completeJob, enqueueJob, heartbeatJob, leaseJob } from "./queue";
import type { JobRecord } from "./types";

const now = new Date("2026-11-06T18:00:00.000Z");

function enqueue(jobs: JobRecord[], key: string, runAfter = now.toISOString()) {
  return enqueueJob(jobs, {
    tenantId: "11111111-1111-4111-8111-111111111111",
    kind: "clip.render",
    payload: { clip: true },
    idempotencyKey: key,
    now,
    runAfter,
  });
}

describe("durable job queue", () => {
  it("returns the original job for a repeated idempotency key", () => {
    const jobs: JobRecord[] = [];
    const first = enqueue(jobs, "render:1");
    const second = enqueue(jobs, "render:1");
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(jobs).toHaveLength(1);
  });

  it("recovers an expired lease and rejects the old fencing token", () => {
    const jobs: JobRecord[] = [];
    const { job } = enqueue(jobs, "render:lease");
    const first = leaseJob(jobs, "worker-a", now, 30_000);
    expect(first?.fencingToken).toBe(1);
    expect(leaseJob(jobs, "worker-b", now, 30_000)).toBeNull();
    const later = new Date(now.getTime() + 31_000);
    const second = leaseJob(jobs, "worker-b", later, 30_000);
    expect(second?.leasedBy).toBe("worker-b");
    expect(second?.fencingToken).toBe(2);
    expect(() => completeJob(jobs, job.id, 1, "worker-a", { type: "succeeded" }, later)).toThrow(
      /Stale worker/,
    );
    const done = completeJob(jobs, job.id, 2, "worker-b", { type: "succeeded" }, later);
    expect(done.state).toBe("succeeded");
  });

  it("heartbeats at the lease owner and dead-letters poison retries", () => {
    const jobs: JobRecord[] = [];
    const { job } = enqueue(jobs, "render:retry");
    job.maxAttempts = 1;
    const leased = leaseJob(jobs, "worker-a", now, 30_000)!;
    heartbeatJob(jobs, leased.id, leased.fencingToken, "worker-a", now, 45_000);
    expect(Date.parse(leased.leaseUntil!)).toBe(now.getTime() + 45_000);
    const failed = completeJob(
      jobs,
      leased.id,
      leased.fencingToken,
      "worker-a",
      { type: "retry", retryAfterSeconds: 5, error: "TRANSIENT" },
      now,
    );
    expect(failed.state).toBe("failed");
    expect(failed.lastError).toBe("TRANSIENT");
  });
});
