# Addendum — Cloud, GPU, Secrets and Delivery (v1.0, 2026-11-06)

Provider selection is open until a benchmark. Use containers and object-storage/queue interfaces so M1 is portable. Suggested starting split: Vercel web, Supabase prod/staging, one cloud CPU capture/orchestration container service, scale-to-zero CUDA workers (RunPod/Fly GPU/other benchmark winner). This is a recommendation [J], not a committed vendor.

## D1. Environments

- `local`: Supabase CLI, LocalStack or S3-compatible local bucket, synthetic HLS/chat fixtures, CPU ffmpeg; no provider live publishing.
- `preview/staging`: separate Supabase project/bucket/Stripe test/YouTube + TikTok test accounts, nonpublic app where possible. Only synthetic or Flip-owned content. `APP_ENV != production` hard-blocks live social posting and real charges even if live keys are accidentally configured.
- `production`: separate project/bucket/keys/OAuth apps, locked network policies, backup and alerting. Production data never copied down to staging.

Web and worker release share a git SHA. DB migrations are backward compatible with both versions. `main` protected; PR previews use staging only.

## D2. Compute and storage

CPU ingest containers are small and independently scalable per active source; sticky EventSub WebSocket ownership uses session lease/epoch. Reconnect transfers ownership without two live recorders writing the same sequence. HLS segments go directly to private object storage; the DB stores metadata, not video blobs.

GPU worker image pins Python, ffmpeg and ASR model versions. Models cached on worker volume; image contains no secrets or customer media. Autoscale on oldest queued GPU job + active stream count, max concurrency by benchmark, scale to zero when idle. Timeouts: rough render 10min, ASR/render 30min initially [T]. Dead-letter after bounded attempts. Dirty input/output directories per job are deleted at completion.

Storage lifecycle defaults [J/T]: raw chat payload 7d, raw media segments 24h after session end unless referenced by active candidate, rendered drafts 30d, published master 90d, DB audit 1y. Legal/rights hold can pause deletion. Tenant disconnect queues secure deletion and bucket lifecycle is backup, not sole erasure mechanism. Bucket denies public access; playback via short-lived signed URLs or authenticated streaming proxy. Content hash verifies artifact.

## D3. Benchmark before provider lock

Run same 5-minute licensed 1080p fixture: baseline faster-whisper model + ASS vertical render, cold and warm. Record GPU model, VRAM, setup/cold start, processing minutes, $/render, failure/retry, upload bandwidth and availability. Choose cheapest provider meeting 95th percentile moment→review target under 5 minutes for a 45s clip [J initial]. Do not state this target as achieved before test. Keep a CPU fallback at lower concurrency for outages.

## D4. Secrets and OAuth

Names only (values stay in managed secret store):
```
APP_ENV APP_BASE_URL DATABASE_URL DATABASE_URL_DIRECT
SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
OBJECT_ENDPOINT OBJECT_BUCKET OBJECT_ACCESS_KEY OBJECT_SECRET_KEY OBJECT_REGION
TOKEN_ENCRYPTION_KEY CHAT_PSEUDONYM_HMAC_KEY CRON_SECRET WEBHOOK_BASE_URL
TWITCH_CLIENT_ID TWITCH_CLIENT_SECRET
KICK_CLIENT_ID KICK_CLIENT_SECRET KICK_WEBHOOK_SECRET
YOUTUBE_CLIENT_ID YOUTUBE_CLIENT_SECRET
TIKTOK_CLIENT_KEY TIKTOK_CLIENT_SECRET
STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_SEAT_MONTHLY
SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN ADMIN_EMAILS
```
Separate per environment and per worker minimum permissions. Token encryption uses authenticated encryption with key version and tenant-associated data [J]; rotation supports old versions. No secrets in browser bundle, CI, fixtures, logs, exception context, signed URLs, or commit history. Refresh tokens are write-only to logs and redacted by structured logger. Gitleaks + dependency scanning + secret manager access audit. Webhook raw-body verification before JSON parse side effects.

## D5. CI/CD

Every PR: install cache, TS lint/format/strict typecheck, unit/integration, generated contract parity TS↔Pydantic, migrations + RLS on service Postgres, Python tests, tiny media golden/ffprobe, build, gitleaks. On-demand GPU workflow uses a small licensed fixture and isolated project. Migrations staging first, health check, then production. Migrator role separate from runtime. Destructive schema changes ship expand→deploy→contract later.

Branch protection and PR template require spec section, acceptance test, tenant isolation/approval impact, rollout/rollback. Dependabot/Renovate weekly. Container scan and pinned actions. `risky` label for auth, RLS, OAuth, Stripe, publisher, retention, FFmpeg command handling.

## D6. Reliability, monitoring and cost

Sentry web/ingest/media/publish tagged env/release/tenant-safe IDs; no chat/media content in breadcrumbs. Health distinguishes liveness from readiness. Alerts: no session heartbeat 2min during live, session media gap >10s, oldest job >10min, repeated OAuth failure, upload provider failure spike, disk/bucket lifecycle failure, Stripe webhook lag, daily spend above budget.

Per-tenant and global quotas: active sources, buffered bytes, GPU minutes, candidates/hour, concurrent renders, YouTube/TikTok request caps. Reserve budget before job, release unused on failure. Provider 429 honors Retry-After and never creates extra projects/accounts to evade quotas. Graceful degradation disables automatic candidates before manual capture when overloaded.

## D7. Backups, restore and incident runbooks

Supabase production backups plus weekly encrypted dump off-project; object versioning/lifecycle where cost-effective. Quarterly restore drill to isolated project and validate a render/approval audit without posting. RPO target 24h DB at launch [J], improve if paid use requires.

Runbooks: EventSub/Kick disconnect; revoked source rights; leaked OAuth token; cross-tenant access suspected; duplicate/mistaken social post; GPU queue outage; object deletion; Stripe outage. Publication worker has global and per-destination kill switch that stops **new** uploads but leaves review available. Existing provider post handling remains manual/confirmed. Incident records contain facts and remediation, not customer-facing claims.

## D8. M1 done operations

Staging and production separation, CI/RLS/security scans, worker reconnect/lease test, retention sweep, budget cap, Sentry/health alerts, backup and restore evidence, launch rollback instructions. No real paid tenant before M4 security/entitlement gates pass.
