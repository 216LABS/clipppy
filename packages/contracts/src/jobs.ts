import { z } from "zod";
import { viralProfileConfigSchema } from "./profile";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const objectKeySchema = z
  .string()
  .min(8)
  .max(400)
  .refine((key) => !key.startsWith("/") && !key.includes("..") && !key.includes("\\"), "unsafe object key");

export const renderSegmentSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    object_key: objectKeySchema,
    start_ms: z.number().int(),
    duration_ms: z.number().int().positive(),
    sha256,
  })
  .strict();

export const renderJobPayloadSchema = z
  .object({
    schema_version: z.literal(1),
    candidate_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    segments: z.array(renderSegmentSchema).min(1).max(400),
    window: z
      .object({
        start_ms: z.number().int(),
        end_ms: z.number().int(),
      })
      .strict()
      .refine((window) => window.end_ms > window.start_ms, "window end must follow start"),
    profile_snapshot: viralProfileConfigSchema,
    style_snapshot: z
      .object({
        template_id: z.string().min(1).max(80),
        caption_preset: z.string().min(1).max(80),
        hook_enabled: z.boolean(),
        end_card_enabled: z.boolean(),
        engine_version: z.string().min(1).max(40),
      })
      .strict(),
    output_key: objectKeySchema,
    transcript: z
      .object({
        language: z.string().min(2).max(16),
        words: z.array(
          z
            .object({
              text: z.string().max(80),
              start_ms: z.number().int().nonnegative(),
              end_ms: z.number().int().nonnegative(),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((job) => job.output_key.startsWith(`tenants/${job.tenant_id}/`), "output key must be tenant-scoped");

export const workerResultSchema = z
  .object({
    status: z.enum(["succeeded", "retry", "failed"]),
    outputs: z.record(z.unknown()),
    retry_after_seconds: z.number().int().nonnegative().optional(),
    error: z
      .object({
        code: z.string().min(1).max(80),
        safe_message: z.string().min(1).max(400),
        retryable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const jobEnvelopeSchema = z
  .object({
    job_id: z.string().uuid(),
    tenant_id: z.string().uuid().nullable(),
    kind: z.enum([
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
    ]),
    payload: z.record(z.unknown()),
    attempt: z.number().int().nonnegative(),
    idempotency_key: z.string().min(1).max(200),
    trace_id: z.string().min(1).max(80),
  })
  .strict();

export type RenderJobPayload = z.infer<typeof renderJobPayloadSchema>;
export type WorkerResult = z.infer<typeof workerResultSchema>;
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const RENDER_JOB_REQUIRED_PATHS = [
  "schema_version",
  "candidate_id",
  "tenant_id",
  "segments",
  "window.start_ms",
  "window.end_ms",
  "profile_snapshot.schema_version",
  "style_snapshot.template_id",
  "style_snapshot.engine_version",
  "output_key",
] as const;
