# Operations

Local and CI run on a memory store plus PGlite for RLS. Production is expected to be Supabase Postgres, private object storage, and a CPU ingest container with a scale-to-zero GPU worker after the benchmark in the DevOps addendum. The domain contracts do not name that provider.

## Environments

| Env | Posting | Charges | Data |
|---|---|---|---|
| local / test | Mock adapters only | Simulated Stripe events | Synthetic fixtures and the GTA 6 test tenant |
| preview / staging | Hard-blocked | Stripe test mode only | Synthetic or Flip-owned |
| production | Live adapters if tokens and scopes probe | Live Stripe price allowlist | Never copied down into staging |

Web and worker releases share a git SHA. Migrations are expand-only. Roll back by deploying the previous SHA; do not run a destructive down migration in the same window.

## Health

- `GET /api/health/live` process up
- `GET /api/health/ready` queue depth, live sessions, publish halt. No secrets.

Alerts to add with a real Sentry DSN: no session heartbeat for 2 minutes while live, media gap over 10 seconds, oldest job over 10 minutes, repeated OAuth failure, upload failures, Stripe lag, daily spend over budget.

## Retention defaults

- Raw chat payload redacted after 7 days
- Segments expire 24 hours after the session unless a non-terminal candidate still references them
- Draft renders 30 days
- Published masters 90 days
- Audit rows are kept with the database backup target of 24 hours RPO at launch
- `legalHold` pauses deletion for that tenant

The retention sweep is `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` (`local-dev` when the secret is unset and `APP_ENV` is not production). Bucket lifecycle is a backup, not the only delete path.

## Kill switch

Admins in `ADMIN_EMAILS` can halt new uploads. Review and download stay available. Existing platform posts are not deleted automatically.

## Runbooks

**EventSub or Kick disconnect.** The recorder lease expires and another worker may claim the next epoch. Do not run two recorders against one sequence. Reconnect from the provider URL. Gaps stay visible; do not invent timestamps.

**Revoked source.** Revoke sets `revoked_at` and ends live sessions. Capture jobs must re-read the source and stop. Keep the audit row.

**Leaked OAuth token.** Rotate the provider credential, rewrite ciphertext with the new key version, and revoke the source if the token was posted. Tokens are redacted from structured logs.

**Suspected cross-tenant read.** Freeze the worker, compare RLS policies with `packages/db`, and treat any signed URL issued for the wrong tenant as an incident. Do not copy production rows into staging to debug.

**Duplicate or mistaken post.** The publication idempotency key and provider post id should show a single upload. Takedown is a manual confirmed action on the platform. Do not auto-delete.

**GPU queue outage.** CPU ffmpeg remains the fallback at lower concurrency. Automatic candidates should be disabled before manual capture if the queue is saturated. Review stays up.

**Object deletion.** Confirm legal hold, then run the sweep. A restore drill uses a backup in an isolated project and checks one render plus its approval audit without posting.

**Stripe outage.** Entitlement does not change until a signed webhook is stored. Past-due blocks new render and publish. Data remains through the grace period.

## Backup drill

Quarterly: restore the database to an isolated project, open one approval, confirm the checksum matches the render row, and do not call a publisher.

## Launch note

No paid tenant until entitlement, RLS, and the approval gate have been exercised on staging. The internal tenant is not a bypass.
