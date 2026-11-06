# Clipppy — BUILD_SPEC (v1.0, 2026-11-06)

Read this with `PLAN.md` and all addenda. **[V]** marks researched platform facts supplied for this spec; **[J]** marks design choices; **[T]** marks a value to validate against current provider documentation during integration. Never treat a platform capability as granted until the tenant connection probe succeeds.

## 0. Non-negotiable agent rules

1. Complete M1 before M2. Do not create a GitHub repo or provider apps unless separately authorized.
2. Strict TypeScript for app, adapters and orchestration; Python only in media/ML workers. No JavaScript service creep.
3. Official APIs and documented OAuth only. No cookie theft, headless account automation, captcha workarounds, or quota evasion.
4. Server enforces human approval for every publish. No tenant setting, env var, API endpoint, worker path or test helper bypasses it in production.
5. Every input, job and publish is idempotent. External calls have timeouts, bounded retries, jitter and persisted attempts.
6. Raw provider responses/events needed for debugging are stored with short retention and redaction. Never log access/refresh tokens, webhook secrets, signed media URLs or full chat usernames unless required.
7. Tenant isolation is end-to-end: RLS, queue job lookup, object key, signed URL, OAuth account lookup, Stripe webhook and admin impersonation audit.
8. Store timestamps in UTC `timestamptz`; UI localizes. Media timing uses rational seconds/milliseconds, never locale dates.
9. A discovered live channel is not an authorized channel. `authorized_source` is required before capture.
10. No claims of guaranteed virality, monetization, copyright safety, customers, or revenue.

## 1. Monorepo and technology

```text
clipppy/
  apps/web/                       # Next.js App Router dashboard + API routes
    app/(marketing)/              # product, honest pricing, legal/rights
    app/(app)/                    # streams, timeline, candidates, review, settings
    app/api/                      # REST/webhooks/cron; zod validated
    components/ lib/ emails/
  packages/db/                    # SQL migrations, Drizzle types, RLS tests, seed
  packages/contracts/             # zod + TS types; JSON schema generation for Python
  packages/ingest/                # Twitch/Kick TS adapters, discovery, normalizers
  packages/jobs/                  # durable queue, leases, idempotency, scheduling
  packages/publish/               # YouTube/TikTok OAuth/upload adapters
  workers/media/                  # Python package (uv), typed pydantic I/O
    capture/ normalize/ transcribe/ render/ probe/
  workers/gpu/                    # worker entrypoint/autoscaling health
  fixtures/                       # synthetic events + tiny licensed media
  docs/                           # copied plan/specs, OPERATIONS, THREAT_MODEL
  .github/workflows/
  PLAN.md BUILD_SPEC.md ADDENDUM_*.md
```

**Stack [J]:** Next.js, Tailwind/shadcn, Supabase Auth/Postgres/Storage, Drizzle, pnpm/Turborepo, Postgres durable jobs using `FOR UPDATE SKIP LOCKED` and leases, S3-compatible object storage, Redis only if later justified, Docker for workers, Python 3.12 + pydantic + ffmpeg/ffprobe + streamlink/yt-dlp where allowed + faster-whisper/WhisperX. Deployment provider selected by DevOps benchmark, not embedded into domain contracts.

Use a transactional outbox for events created in web mutations. Workers update job state and artifact metadata in short transactions. No distributed two-phase commit assumptions.

## 2. Database model (PostgreSQL)

All tenant tables have `tenant_id`, RLS and `created_at`; all externally received IDs have a uniqueness constraint scoped appropriately. Use UUIDs, `jsonb` for profiles/signal snapshots, and explicit state enums/checks.

```sql
create table tenant (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, display_name text not null,
  status text not null default 'trial', -- trial|active|past_due|suspended|canceled
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create table membership (
  tenant_id uuid references tenant on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner','editor','viewer')), -- viewer cannot approve
  primary key (tenant_id,user_id)
);
create table authorized_source (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenant,
  platform text not null check(platform in ('twitch','kick')),
  platform_channel_id text not null, channel_login text not null,
  permission_basis text not null, -- owned|customer_contract|written_permission|campaign
  permission_reference text, permission_granted_at timestamptz not null,
  revoked_at timestamptz, created_at timestamptz not null default now(),
  unique(platform,platform_channel_id) -- v1 one owner per source, prevents two tenants capturing same channel
);
create table source_connection (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenant,
  authorized_source_id uuid not null references authorized_source,
  provider text not null, scopes text[] not null default '{}',
  token_ciphertext text not null, token_expires_at timestamptz,
  status text not null default 'connected', last_probe_at timestamptz,
  created_at timestamptz not null default now()
);
create table viral_profile (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenant,
  source_id uuid references authorized_source, name text not null,
  version integer not null, is_active boolean not null default true,
  config jsonb not null, created_by uuid references auth.users,
  created_at timestamptz not null default now(), unique(tenant_id,id,version)
);
create table stream_session (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenant,
  source_id uuid not null references authorized_source,
  provider_session_id text, title text, game_id text, game_name text, language text,
  started_at timestamptz not null, ended_at timestamptz,
  status text not null default 'connecting', -- connecting|live|degraded|ended|error
  capture_cursor jsonb not null default '{}', profile_id uuid not null, profile_version integer not null,
  unique(tenant_id,source_id,started_at)
);
create table chat_event (
  id bigserial primary key, tenant_id uuid not null, session_id uuid not null references stream_session,
  provider_event_id text not null, occurred_at timestamptz not null, received_at timestamptz not null default now(),
  chatter_key text not null, -- HMAC pseudonym; do not need raw usernames for scoring
  message_redacted text, emotes jsonb not null default '[]', raw_ref text,
  unique(session_id,provider_event_id)
);
create table signal_bucket (
  session_id uuid references stream_session on delete cascade, bucket_start timestamptz not null,
  message_count integer not null, unique_chatters integer not null, emote_count integer not null,
  viewer_count integer, audio_rms numeric, baseline jsonb not null, features jsonb not null,
  primary key(session_id,bucket_start)
);
create table media_segment (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null,
  sequence bigint not null, object_key text not null, started_at timestamptz, duration_ms integer not null,
  sha256 text not null, expires_at timestamptz not null, unique(session_id,sequence)
);
create table candidate (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null,
  origin text not null check(origin in ('automatic','dashboard','chat_command','webhook')),
  anchor_at timestamptz, -- null if discontinuity requires segment clock only
  segment_cursor jsonb not null, start_offset_ms integer not null, end_offset_ms integer not null,
  state text not null default 'queued', -- queued|rendering|review|approved|rejected|publishing|published|failed|expired
  score numeric, reason jsonb not null default '{}', signal_snapshot jsonb not null default '{}',
  request_id text, requested_by uuid, profile_id uuid, profile_version integer,
  idempotency_key text not null, created_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);
create table render (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, candidate_id uuid not null references candidate,
  version integer not null, profile_version integer not null, timeline jsonb not null,
  object_key text, checksum_sha256 text, duration_ms integer, width integer, height integer,
  status text not null default 'queued', error_code text, created_at timestamptz not null default now(),
  unique(candidate_id,version)
);
create table destination (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  platform text not null check(platform in ('youtube','tiktok')), label text not null,
  token_ciphertext text not null, scopes text[] not null default '{}', status text not null default 'connected',
  app_visibility text not null default 'unaudited', created_at timestamptz not null default now()
);
create table approval (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, candidate_id uuid not null,
  render_id uuid not null references render, render_checksum text not null,
  title text not null, description text not null, tags text[] not null default '{}',
  approved_by uuid not null, created_at timestamptz not null default now()
);
create table publication (
  id uuid primary key not null default gen_random_uuid(), tenant_id uuid not null,
  approval_id uuid not null references approval, destination_id uuid not null references destination,
  provider_post_id text, status text not null default 'queued', attempts integer not null default 0,
  last_error_code text, created_at timestamptz not null default now(),
  unique(approval_id,destination_id)
);
create table job (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, kind text not null, payload jsonb not null,
  state text not null default 'queued', run_after timestamptz not null default now(),
  leased_by text, lease_until timestamptz, attempts integer not null default 0, max_attempts integer not null default 6,
  idempotency_key text not null unique, last_error text, created_at timestamptz not null default now()
);
create table audit_event (
  id bigserial primary key, tenant_id uuid, actor_user_id uuid, actor_type text not null,
  action text not null, entity_type text not null, entity_id text not null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table subscription_entitlement (
  tenant_id uuid primary key references tenant, stripe_customer_id text unique,
  stripe_subscription_id text unique, price_id text, status text not null,
  current_period_end timestamptz, seats integer not null default 1,
  caps jsonb not null default '{}', updated_at timestamptz not null default now()
);
```

Add foreign keys/indexes for all `tenant_id` lookups, queue `(state,run_after)` and candidate review lists. Use RLS policies based on membership and role; only service-role worker bypasses RLS after re-fetching the tenant and authorized source. `approval` is insert-only to application roles. There is no update path from candidate `approved` to a different render checksum.

## 3. Worker/job contract

Jobs: `source.discover`, `session.start`, `session.heartbeat`, `segment.persist`, `candidate.score`, `clip.prepare`, `clip.render`, `clip.probe`, `publish.youtube`, `publish.tiktok`, `provider.webhook`, `retention.sweep`.

All jobs use `{ job_id, tenant_id, kind, payload, attempt, idempotency_key, trace_id }`. Worker result:
`{ status: "succeeded"|"retry"|"failed", outputs, retry_after_seconds?, error: { code, safe_message, retryable } }`.
Python validates generated JSON Schema at the boundary. It never accepts arbitrary shell commands, URLs or output paths. Object keys come from the server; ffmpeg args are arrays.

Leases heartbeat at one-third timeout; expired lease is recoverable. State transition check includes attempt/fencing token so an old worker cannot overwrite newer output. Poison jobs go failed with actionable code, not infinite retry. Every output uses content-addressed object key + DB uniqueness before side effects.

## 4. Capture and timing

**Twitch [V]:** Get Streams supports `game_id` discovery. EventSub WebSocket `channel.chat.message` is preferred for chat. Create Clip Helix (`clips:edit`) is asynchronous and polled; it is an optional fast/manual reference, not the sole media source because custom edits require local media. Respect documented scopes, heartbeat, reconnect and rate limits [T].

**Kick [V]:** official livestreams API and Events webhooks include `chat.message.sent`; verify event signatures and normalize [T].

Use streamlink/yt-dlp only within provider terms and authorized channels. Produce time-indexed HLS segments into a rolling buffer sized for maximum pre-roll plus in-flight clips. Initial default: 180s pre-spike retained, candidate start `anchor - max(10s, profile.pre_roll_seconds)` and 30–60s total clip as profile dictates. Chat latency means start looking 10–15s before burst [V].

Do not assume wall-clock alignment across missing segments. Candidate stores anchor + segment cursor. Build a normalized local timeline with discontinuity map; when source media cannot cover requested window, fail `MEDIA_WINDOW_EXPIRED` or trim with explicit warning. No silent substitution.

## 5. Candidate state machine

```text
input -> queued -> preparing -> rendering -> review
                                      review -> rejected (terminal, can clone)
review + owner/editor approval -> approved -> publishing -> published
any failure -> failed -> retry to previous safe state
missing media -> expired
new edit/render -> new render version; old approval invalid
```

Automatic detector creates at most one candidate per session/cooldown bucket. Manual commands use `tenant:session:provider_event_id`; dashboard uses generated request ID; webhook uses event ID and timestamp validation. Manual candidate may be created with score null. A clip request must not imply publish approval.

## 6. Render contract

Input JSON contains candidate ID, immutable ordered segment keys, timing map, viral profile snapshot, style snapshot, optional transcript, output key. Output includes artifact key/hash, ffprobe report, timeline, transcript/caption file keys and warnings.

M1 rough render: H.264/AAC MP4, 1080×1920 where source allows, 30fps or source-normalized, centered gameplay crop with optional webcam region, loudness normalization, no caption fabrication. M2: word-timed ASS captions, optional silence cuts and speed ramps, face/active-speaker crop when confidence passes threshold, hook text and end card if enabled. Keep licensed source/game audio only as authorized; detect likely music as review warning, never guarantee safety.

Templates are data, not arbitrary user code. Validate fonts/assets licensed for use. Escape ASS text; normalize line length; highlight words from actual timestamps. Store `engine_version` and config for reproducibility. Probe black/empty frames, missing audio, duration and dimensions. Render must be deterministic given same inputs wherever practical.

## 7. HTTP API

JSON, zod validation, authenticated membership and role checks, CSRF protection for cookie mutations, rate limits.

- `POST /api/sources/twitch/connect`, `/api/sources/kick/connect`; OAuth start/callback. Permissions fields required before activation.
- `POST /api/sources/:id/revoke` stops capture, revokes tokens when possible, queues retention.
- `GET /api/sessions`, `GET /api/sessions/:id/timeline?from&to` (paginated signals, not raw unlimited chat).
- `POST /api/sessions/:id/clip` body `{request_id, pre_seconds?, post_seconds?, profile_version?}`; manual input addendum limits overrides.
- `POST /api/hooks/clip/:public_id` HMAC signature + timestamp + event ID; raw-body verification, replay store, no auth cookie.
- `POST /api/chat/commands` provider webhook, normalizes `!clip [seconds]`; sender authorization per addendum.
- `GET /api/candidates?state=review`, `GET /api/candidates/:id`; signed short-lived render URLs.
- `POST /api/candidates/:id/reject {reason_code,note?}`.
- `POST /api/candidates/:id/render {style_changes}` creates new render version and invalidates earlier approvals.
- `POST /api/candidates/:id/approve {render_id,checksum,title,description,tags,destination_ids}` owner/editor only; transaction creates approval + publication rows, verifies render review state and tenant entitlement.
- `POST /api/publications/:id/retry` only failed/retryable; same idempotency identity, not new approval.
- OAuth callbacks for YouTube/TikTok; webhook handlers acknowledge only after durable storage; provider signature checks.
- `GET /api/health/live`, `/api/health/ready` (DB, queue, newest heartbeat; no secrets); `/api/cron/...` bearer/queue authentication.

## 8. YouTube and TikTok publication [V/T]

YouTube `videos.insert` OAuth, resumable upload. Vertical videos up to 3 minutes may be Shorts; do not infer public Short status solely from upload. Research notes: default upload quota roughly 100/day per GCP project with a separate uploads quota bucket; verify current values [T]. Multi-tenant volume needs a quota plan/audit. Unaudited app/visibility restrictions are stored and surfaced.

TikTok uses Content Posting API and approved `video.upload` / `video.publish` capability; unaudited clients may be private until audit [V]. Use creator token, selected visibility allowed by API, and status fetch/webhook if available [T]. Never silently widen privacy. Persist provider request ID/post ID. API success is not treated as public proof until provider status confirms.

Approval checksum is rechecked immediately before provider call. Destination idempotency and provider ID reconciliation prevent retry duplication. Delete/disconnect does not delete already published social posts automatically; provide clear manual links/actions only if provider supports and separate confirmation is given.

## 9. Billing and entitlement

Stripe Billing monthly price per source seat, Checkout + Customer Portal. Map webhook events (`checkout.session.completed`, subscription updated/deleted, invoice payment failed) idempotently by Stripe event ID. Entitlement service is sole source for activation/caps. `past_due` grace stops new capture/render but preserves review/export for configured period; suspended tenant cannot publish. Webhooks do not trust client price IDs. Internal Flip tenant gets explicit entitlement, not hidden bypass of approval/isolation.

Initially one active authorized source = one seat. Additional concurrent session limits and monthly render caps are plan data. Usage is recorded before expensive jobs; reserve then settle/refund on failure. No per-upload metering v1.

## 10. Observability and evaluation

Structured logs: trace/job/tenant/session/candidate IDs and safe error codes. Metrics: connected sources, event lag, missing segments, queue age, render seconds, GPU minutes, render failure, candidate acceptance/rejection reason, upload success, provider quota. Sentry scrubs headers/query strings.

Evaluation corpus: consented short streams or replay fixtures. Human annotate clip-worthy intervals before tuning. Report precision@review, acceptance rate, median time live-moment→review, capture coverage, percent candidates with sufficient pre-roll. Do not claim recall unless the full test stream is annotated. Baseline and improved profile outputs stay comparable by version.

## 11. Minimal M1 implementation tickets

1. Scaffold monorepo, env validation, lint/typecheck/test/build and docs.
2. SQL migrations/RLS + local seed of two synthetic tenants; tests that B cannot read/mutate A.
3. Job queue/outbox + fixture worker, lease/restart/idempotency tests.
4. Twitch OAuth/permission/source activation and EventSub fixture parser + heartbeat adapter.
5. HLS segment recorder fixture and retention; discontinuity-aware timeline unit tests.
6. Viral profile validator/default + rolling baseline detector + cooldown/golden event fixtures.
7. Unified manual clip endpoints incl. raw HMAC verification and `!clip` permissions.
8. Candidate/review API/UI, status/error/reject/download and signed media access.
9. Python rough renderer + probe + tiny golden media test.
10. Staging deployment, Sentry, backup/restore drill, M1 acceptance test notes.

No YouTube/TikTok/Kick/Stripe work in these tickets except disabled type contracts.
