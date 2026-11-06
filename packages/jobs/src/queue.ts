import { ClipppyError } from "./errors";
import type { JobKind, JobOutcome, JobRecord } from "./types";

export function retryDelaySeconds(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(300, 2 ** Math.max(1, attempt));
  const jitter = Math.floor(random() * Math.min(5, base));
  return base + jitter;
}

export function enqueueJob(
  jobs: JobRecord[],
  input: {
    id?: string;
    tenantId: string | null;
    kind: JobKind;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    maxAttempts?: number;
    runAfter?: string;
    now: Date;
  },
): { job: JobRecord; duplicate: boolean } {
  const existing = jobs.find((job) => job.idempotencyKey === input.idempotencyKey);
  if (existing) return { job: existing, duplicate: true };
  const job: JobRecord = {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    kind: input.kind,
    payload: input.payload,
    state: "queued",
    runAfter: input.runAfter ?? input.now.toISOString(),
    leasedBy: null,
    leaseUntil: null,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 6,
    fencingToken: 0,
    idempotencyKey: input.idempotencyKey,
    lastError: null,
    createdAt: input.now.toISOString(),
  };
  jobs.push(job);
  return { job, duplicate: false };
}

function eligible(job: JobRecord, nowMs: number): boolean {
  if (Date.parse(job.runAfter) > nowMs) return false;
  if (job.state === "queued") return true;
  if (job.state === "leased" && job.leaseUntil && Date.parse(job.leaseUntil) <= nowMs) return true;
  return false;
}

/** Mirrors FOR UPDATE SKIP LOCKED: one worker claims the oldest eligible job. */
export function leaseJob(
  jobs: JobRecord[],
  workerId: string,
  now: Date,
  leaseMs: number,
): JobRecord | null {
  const nowMs = now.getTime();
  const next = jobs
    .filter((job) => eligible(job, nowMs))
    .sort((a, b) => Date.parse(a.runAfter) - Date.parse(b.runAfter) || a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return null;
  next.state = "leased";
  next.leasedBy = workerId;
  next.leaseUntil = new Date(nowMs + leaseMs).toISOString();
  next.attempts += 1;
  next.fencingToken += 1;
  return next;
}

export function heartbeatJob(
  jobs: JobRecord[],
  jobId: string,
  fencingToken: number,
  workerId: string,
  now: Date,
  leaseMs: number,
): JobRecord {
  const job = requireLease(jobs, jobId, fencingToken, workerId);
  job.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
  return job;
}

export function completeJob(
  jobs: JobRecord[],
  jobId: string,
  fencingToken: number,
  workerId: string,
  outcome: JobOutcome,
  now: Date,
): JobRecord {
  const job = requireLease(jobs, jobId, fencingToken, workerId);
  if (outcome.type === "succeeded") {
    job.state = "succeeded";
    job.leasedBy = null;
    job.leaseUntil = null;
    job.lastError = null;
    return job;
  }
  if (outcome.type === "failed" || job.attempts >= job.maxAttempts) {
    job.state = "failed";
    job.leasedBy = null;
    job.leaseUntil = null;
    job.lastError = outcome.error;
    return job;
  }
  job.state = "queued";
  job.leasedBy = null;
  job.leaseUntil = null;
  job.lastError = outcome.error;
  job.runAfter = new Date(now.getTime() + outcome.retryAfterSeconds * 1000).toISOString();
  return job;
}

function requireLease(jobs: JobRecord[], jobId: string, fencingToken: number, workerId: string): JobRecord {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) throw new ClipppyError("JOB_NOT_FOUND", "Job does not exist", 404);
  if (job.fencingToken !== fencingToken || job.leasedBy !== workerId || job.state !== "leased") {
    throw new ClipppyError("FENCING_MISMATCH", "Stale worker cannot overwrite a newer lease", 409);
  }
  return job;
}
