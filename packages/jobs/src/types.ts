export const JOB_KINDS = [
  "source.discover",
  "session.start",
  "session.heartbeat",
  "segment.persist",
  "candidate.score",
  "clip.prepare",
  "clip.render",
  "clip.probe",
  "publish.youtube",
  "publish.tiktok",
  "provider.webhook",
  "retention.sweep",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];
export type JobState = "queued" | "leased" | "succeeded" | "failed" | "cancelled";

export type JobRecord = {
  id: string;
  tenantId: string | null;
  kind: JobKind;
  payload: Record<string, unknown>;
  state: JobState;
  runAfter: string;
  leasedBy: string | null;
  leaseUntil: string | null;
  attempts: number;
  maxAttempts: number;
  fencingToken: number;
  idempotencyKey: string;
  lastError: string | null;
  createdAt: string;
};

export type JobOutcome =
  | { type: "succeeded" }
  | { type: "retry"; retryAfterSeconds: number; error: string }
  | { type: "failed"; error: string };
