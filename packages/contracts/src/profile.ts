import { z } from "zod";

const unitWeight = z.number().finite().min(0).max(1);

const literalTerm = z
  .string()
  .min(1)
  .max(40)
  .refine((term) => !/[[\](){}+*?\\|]|(\.\*)/.test(term), "literal terms only; pattern-like values are rejected");

export const detectionWeightsSchema = z
  .object({
    chat_zscore: unitWeight,
    emote_density: unitWeight,
    unique_chatter_zscore: unitWeight,
    audio_rms_zscore: unitWeight,
    keyword_burst: unitWeight,
  })
  .strict()
  .refine((weights) => Object.values(weights).some((value) => value > 0), {
    message: "weights cannot all be zero",
  });

export const viralProfileConfigSchema = z
  .object({
    schema_version: z.literal(1),
    language: z.string().min(2).max(16),
    detection: z
      .object({
        bucket_seconds: z.number().int().min(1).max(30),
        baseline_window_seconds: z.number().int().min(10).max(3600),
        baseline_min_events: z.number().int().min(1).max(10000),
        score_threshold: z.number().min(0).max(1),
        min_messages_per_second: z.number().min(0).max(100),
        min_unique_chatters: z.number().int().min(1).max(10000),
        weights: detectionWeightsSchema,
        emote_terms: z.array(literalTerm).max(100),
        keywords: z.array(literalTerm).max(50),
        audio_enabled: z.boolean(),
        keyword_enabled: z.boolean(),
        redistribute_missing_features: z.boolean().default(false),
        cooldown_seconds: z.number().int().min(0).max(3600),
        max_candidates_per_hour: z.number().int().min(1).max(60),
        quiet_chat_mode: z.boolean(),
      })
      .strict(),
    window: z
      .object({
        pre_seconds: z.number().int().min(10).max(90),
        post_seconds: z.number().int().min(0).max(170),
        min_duration_seconds: z.number().int().min(15).max(180),
        max_duration_seconds: z.number().int().min(15).max(180),
      })
      .strict()
      .refine((window) => window.max_duration_seconds >= window.min_duration_seconds, {
        message: "max duration is below min duration",
      })
      .refine((window) => window.pre_seconds + window.post_seconds >= window.min_duration_seconds, {
        message: "window is shorter than min duration",
      })
      .refine((window) => window.pre_seconds + window.post_seconds <= window.max_duration_seconds, {
        message: "window is longer than max duration",
      }),
    style: z
      .object({
        template_id: z.enum(["gameplay_webcam_v1", "gameplay_center_v1", "reaction_v1"]),
        caption_preset: z.enum(["karaoke_clean", "lower_third", "none"]),
        caption_language: z.string().min(2).max(16),
        hook_enabled: z.boolean(),
        end_card_enabled: z.boolean(),
        silence_cut_enabled: z.boolean(),
        face_crop_enabled: z.boolean(),
        brand_asset_keys: z.array(z.string().min(1).max(160)).max(8),
        profanity_policy: z.enum(["censor_captions_only", "leave", "mute_unknown"]),
      })
      .strict(),
  })
  .strict();

export type ViralProfileConfig = z.infer<typeof viralProfileConfigSchema>;
export type DetectionWeights = z.infer<typeof detectionWeightsSchema>;

export const REJECT_REASONS = [
  "not_interesting",
  "wrong_window",
  "too_short",
  "bad_crop",
  "bad_captions",
  "music_risk",
  "duplicate",
  "other",
] as const;

export const rejectReasonSchema = z.enum(REJECT_REASONS);
export type RejectReason = z.infer<typeof rejectReasonSchema>;

export const CANDIDATE_ORIGINS = ["automatic", "dashboard", "chat_command", "webhook"] as const;
export const CANDIDATE_STATES = [
  "queued",
  "preparing",
  "rendering",
  "review",
  "approved",
  "rejected",
  "publishing",
  "published",
  "failed",
  "expired",
] as const;

export const candidateOriginSchema = z.enum(CANDIDATE_ORIGINS);
export const candidateStateSchema = z.enum(CANDIDATE_STATES);
export type CandidateOrigin = z.infer<typeof candidateOriginSchema>;
export type CandidateState = z.infer<typeof candidateStateSchema>;
