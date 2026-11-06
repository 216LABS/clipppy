# Clipppy

Clipppy is 216LABS' clipping desk. It watches a stream a tenant is allowed to use, proposes a vertical draft from chat activity or a manual mark, and posts only after a person approves that exact render.

This repository is the greenfield control plane and media worker. It is not a fork of any earlier Clipppy repo.

## What runs locally

- Next.js desk on port 43123, with the GTA 6 test tenant and a second synthetic tenant
- TypeScript domain: viral profiles, manual queue, approval checksum, Stripe seat state, retention
- Postgres schema and forced RLS, tested with PGlite
- Python media worker: timeline, ASS captions, ffmpeg rough cut, ffprobe
- Mock YouTube and TikTok adapters. Live posting is refused unless `APP_ENV=production`

Specs live in `docs/`.

## Local desk

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:43123 and choose a persona. Flip can approve. The viewer cannot. Harbor cannot see Flip's sessions.

Production login is Supabase Auth. The persona list exists only when `APP_ENV` is not `production`.

## Tests

```bash
pnpm verify
```

That command typechecks, lints, runs Vitest (domain, ingest, publish, PGlite RLS), runs the Python worker tests, scans for obvious secrets, and builds the Next.js app.

`ffmpeg` and `ffprobe` must be on `PATH` for the media golden test. `uv` runs the Python package.

## Credential blockers

The desk boots without these. Live connections fail closed until they exist in a secret store, one set per environment:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`, `CHAT_PSEUDONYM_HMAC_KEY` (required in production; local uses a labeled dev derivation)
- `OBJECT_*` for private media storage
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_WEBHOOK_SECRET`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SEAT_MONTHLY`
- `CRON_SECRET`, `SENTRY_DSN`

Names are listed in `.env.example`. Do not commit values.

## Defaults chosen

- Memory store for the local desk; Postgres when `DATABASE_URL` is wired. RLS is already in `packages/db/migrations`.
- Busy-gameplay profile from the viral-profile addendum. Pre-roll 15s, cooldown 90s, threshold 0.72.
- Zero-dispersion chat z-score uses relative excess over the median, scaled so +1 against a unit baseline maps to z=3. The fixture test locks that branch.
- Retention: chat text 7 days, segments 24 hours, drafts 30 days, published masters 90 days.
- One seat, one concurrent source, 120 renders/month, 60-second clips, two destinations. Price is unset (`price_seat_monthly_test` only).
- CPU ffmpeg fallback. GPU host is not selected.
- Hook secrets are AES-GCM ciphertext plus a SHA-256 hash, because HMAC cannot be verified from a hash alone.
- Unaudited TikTok visibility stays private.
- GTA 6 tenant slug `gta6-flip-test`, owned test channel `flip_gta6_test`. It is not a scraped login and it is not a customer.

## Layout

```text
apps/web                 Next.js desk and API routes
packages/contracts       Zod schemas shared with the worker fixture
packages/domain          Approval, detection, manual queue, billing, retention
packages/ingest          Twitch EventSub, Kick events, discovery filters
packages/publish         The publish gate and mock/live adapters
packages/jobs            Lease queue with fencing tokens
packages/db              SQL, RLS, Drizzle models
workers/media            Python render, probe, captions
```
