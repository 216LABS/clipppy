import { z } from "zod";
import { rejectReasonSchema } from "./profile";

export const uuidSchema = z.string().uuid();

export const clipRequestSchema = z
  .object({
    request_id: uuidSchema,
    pre_seconds: z.number().int().min(10).max(60).optional(),
    post_seconds: z.number().int().min(0).max(60).optional(),
    seconds: z.number().int().min(15).max(60).optional(),
    note: z.string().max(200).optional(),
    profile_version: z.number().int().positive().optional(),
    clip_anyway: z.boolean().optional(),
  })
  .strict();

export const webhookClipBodySchema = z
  .object({
    session_id: uuidSchema.optional(),
    seconds: z.number().int().min(15).max(60).optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

export const approveRequestSchema = z
  .object({
    render_id: uuidSchema,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1).max(100),
    description: z.string().max(5000),
    tags: z.array(z.string().min(1).max(40)).max(15),
    destination_ids: z.array(uuidSchema).max(4),
    confirm_exact: z.literal(true),
  })
  .strict();

export const rejectRequestSchema = z
  .object({
    reason_code: rejectReasonSchema,
    note: z.string().max(500).optional(),
  })
  .strict();

export const permissionBasisSchema = z.enum([
  "owned",
  "customer_contract",
  "written_permission",
  "campaign",
]);

export const appEnvSchema = z.enum(["local", "test", "preview", "staging", "production"]);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const ENV_NAMES = [
  "APP_ENV",
  "APP_BASE_URL",
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OBJECT_ENDPOINT",
  "OBJECT_BUCKET",
  "OBJECT_ACCESS_KEY",
  "OBJECT_SECRET_KEY",
  "OBJECT_REGION",
  "TOKEN_ENCRYPTION_KEY",
  "CHAT_PSEUDONYM_HMAC_KEY",
  "CRON_SECRET",
  "WEBHOOK_BASE_URL",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "KICK_CLIENT_ID",
  "KICK_CLIENT_SECRET",
  "KICK_WEBHOOK_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_SEAT_MONTHLY",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "ADMIN_EMAILS",
] as const;

export type EnvName = (typeof ENV_NAMES)[number];
