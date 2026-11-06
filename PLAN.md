# Clipppy rewrite — PLAN (v1.0, 2026-11-06)

Product: **Clipppy by 216LABS**. Owner: Sam Filipiak (Flip), 216LABS.  
Audience: coding agents implementing a fresh repo. This document sets sequence and acceptance; `BUILD_SPEC.md` is normative for implementation. Addenda extend, never weaken, the approval and tenant-safety rules.

## 0. Product and constraints

Clipppy watches streams a customer is authorized to use, proposes clips from configurable live activity, accepts manually marked moments, produces polished vertical drafts, and publishes only after a person approves the exact render. GTA 6 is Flip's own first test tenant for the November 19, 2026 launch; paying streamer seats follow only after the test gates pass.

**Locked decisions**
- New repo `216LABS/clipppy`; no fork/patch of `Lake-Effect-Labs/clipppy-2`. Old repo remains an archive/reference only.
- TypeScript application and orchestration; Python media/GPU workers. pnpm workspaces + Turborepo for TypeScript, uv for Python.
- Next.js App Router, strict TypeScript, Supabase Postgres/Auth/Storage, RLS, object storage for media, durable queue, cloud CPU ingest plus GPU render workers. Never Flip's Windows PC.
- v1 ingest: Twitch and Kick. v1 publish: YouTube Shorts and TikTok.
- Per-streamer “viral profiles”: signal weights, absolute and baseline thresholds, window, cooldown, language and edit/caption style.
- Automatic candidate detection plus dashboard clip button, `!clip`, and signed Stream Deck/webhook.
- Human approval before **every** post. There is no auto-publish feature flag or bypass.
- Stripe monthly subscription per streamer seat. No metering v1; usage caps protect margins.
- Rights and permission are part of onboarding. Creative editing does not replace permission. No fake users, results, customers, or social proof in product or marketing.

## 1. What v1 is / is not

**Is:** a multi-tenant clipping copilot, evidence-backed activity timeline, draft review, controlled publishing, per-tenant styles and thresholds, reproducible jobs, quota/cost visibility.  
**Is not:** guaranteed virality, a copyright workaround, computer-vision detection of every play, anonymous scraping, unattended posting, a clip farm, livestream recording/rebroadcast service, or a general video editor.

Success means the system reliably turns authorized live moments into reviewable, distinctive drafts with low operator effort. Detection recall is measured against annotated streams, not claimed from chat volume alone.

## 2. Architecture in one view

```text
Twitch EventSub WebSocket / Kick Events ─┐
Get Streams category discovery (opt-in) ─┼─> TS ingest/control -> Postgres job queue
Dashboard / !clip / signed webhook ──────┘            |
HLS segment recorder -> rolling encrypted object buffer |
                                                     v
                                  Python/GPU media workers
                    normalize -> transcribe -> render -> probe -> draft
                                                     |
                                      human review exact artifact
                                                     |
                             YouTube / TikTok publisher adapters
```

One event log drives all three manual input methods. One candidate state machine drives auto and manual clips. One immutable render version is what review and publish reference. Platform secrets are server-side and tenant scoped.

## 3. Milestones

### M1 — Authorized Twitch loop, end to end (foundation)
Build the repo, CI, environments, auth/tenant/RLS, Twitch connect, rolling HLS capture, EventSub chat ingest, default viral profile, automatic and all three manual candidate paths, rough-cut GPU/CPU-compatible render, review, reject, download, and audit trail. No social publish yet.

**Checklist**
- [ ] Repo scaffold, migrations, local Supabase, Python worker contract tests, preview/staging/prod isolation.
- [ ] Seed only synthetic fixtures and Flip's test tenant; cross-tenant RLS tests.
- [ ] Twitch OAuth token lifecycle and EventSub reconnect/resubscribe with fixture tests.
- [ ] Authorized stream session + resumable rolling buffer; keep enough pre-spike media, delete on expiry.
- [ ] `!clip`, dashboard button and signed webhook create the same idempotent candidate type.
- [ ] Baseline chat detector uses versioned viral profile and stores signal snapshot/reason.
- [ ] Worker creates 9:16 rough cut and ASS-caption-ready timeline; media output validated by ffprobe.
- [ ] Review queue shows candidate origin, score explanation, render, status, errors, retry.
- [ ] Approval/rejection and download work; approval cannot publish because no publisher exists yet.

**M1 exit:** using a prerecorded authorized Twitch stream replay and then Flip's live test, an operator can mark a moment and receive a playable draft; an auto chat burst also produces a candidate; two events with the same idempotency key produce one job; cross-tenant tests fail closed; no job survives worker restart in a lost state.

### M2 — Draft quality + YouTube approval-gated publishing
- [ ] faster-whisper/WhisperX word timing, language setting, transcript correction and caption templates.
- [ ] Silence trimming, pre-roll, jump/speed adjustments, gameplay/webcam crop, hook and optional branded end card.
- [ ] Loudness/probe checks; copyright-music risk flag; no unsupported “Content ID safe” label.
- [ ] YouTube OAuth, resumable upload, draft metadata, per-tenant destination and quota tracking.
- [ ] Publish only exact approved checksum; edits after approval revoke approval.
- [ ] App review/quota evidence recorded; unaudited/visibility limitations shown honestly.

**M2 exit:** three distinct template fixtures pass golden media checks; approved upload is idempotent across retry; changed render requires re-approval; rejection never uploads.

### M3 — Kick ingest + TikTok publishing
- [ ] Official Kick livestream and Events API adapter, including chat event verification and reconnect.
- [ ] Shared normalized chat/stream contract; Kick-specific limitations logged.
- [ ] TikTok Content Posting API (`video.upload`/`video.publish` as approved) with creator consent and publish status.
- [ ] Unaudited/private restrictions enforced by destination configuration, not hidden from operator.
- [ ] Shared review UI handles both networks, one or both selected per approval.

**M3 exit:** one authorized Kick fixture and live test create drafts; TikTok test-account publication follows approval exactly; webhook replay cannot double-post.

### M4 — Sellable multi-tenant product
- [ ] Onboarding: channel, permission attestation, ingest OAuth, destination OAuth, profile wizard, style preview.
- [ ] Stripe Checkout/Portal/webhooks; monthly seat entitlement, grace period and cancellation behavior.
- [ ] Plan caps for concurrent streams, stored minutes, renders/month, upload destinations; no surprise metered bill.
- [ ] Operational admin: sessions, job age/retries, GPU spend, provider quota, disconnects, deletion/export.
- [ ] Rights/takedown workflow and disconnect purge; security review and backup restore drill.

**M4 exit:** a second synthetic tenant can onboard in staging without engineering help, is billed in Stripe test mode, cannot see Flip's media, and loses ingest/publish access on entitlement expiry while retaining its data for the documented grace period.

### M5 — GTA 6 test tenant + category discovery + launch hardening
- [ ] Opt-in Get Streams by `game_id`, language/min-viewer/top-N filters, allowlist/denylist; discovery never grants rights.
- [ ] Only Flip-owned/authorized channels enter capture; discovered channels require explicit authorization.
- [ ] Calibrate detector on annotated GTA V/other gameplay first and GTA 6 after release; audio and keyword weights remain optional.
- [ ] Load/soak test reconnects, backlogs, object expiry, GPU saturation, provider quotas.
- [ ] Runbook, launch-week on-call, cost/quota caps, rollback, daily quality sample and rejection-reason review.

**M5 exit:** Flip can run the whole launch workflow without developer intervention; no unauthorized discovery target is captured; all posts have human approval; measured precision and operator time are recorded without revenue promises.

### M6 — Evidence-based improvement (post-launch)
- [ ] Per-profile feedback from accepted/rejected candidates; recommend settings, never silently change them.
- [ ] Optional audio-event and active-speaker/face-crop improvements against labeled fixtures.
- [ ] Outcome imports where APIs permit, with views separated from “viral” claims and no fabricated attribution.
- [ ] Evaluate compilations or scheduling only as separately reviewed drafts.

## 4. Delivery and quality gates

Every PR: lint, strict typecheck, unit tests, migrations on disposable Postgres, RLS tests, Python tests, worker-contract/golden fixtures, build, gitleaks, dependency scan. Small media fixtures only; no real OAuth tokens or customer content in CI. Large/GPU tests run on demand in an isolated worker project.

Definitions:
- **Done render:** ffprobe confirms codec, duration, dimensions, audio unless intentionally muted; expected captions/timeline present; artifact hash stored.
- **Done approval:** authenticated tenant member approves immutable `render_version`; audit event stores actor/time/destinations/checksum.
- **Done publish:** idempotency key + provider ID stored; replayed provider webhook is harmless; failure is retryable without duplicate post.
- **Done tenant isolation:** RLS and signed object URLs deny tenant B in automated tests; worker re-checks tenant and entitlement with service role.

## 5. Decisions log

| ID | Decision | Reason |
|---|---|---|
| D01 | Fresh repo and clean contracts | Avoid Windows-bound coupling and hardcoded streamers. |
| D02 | TS control plane, Python media plane | Product velocity plus ffmpeg/Whisper ecosystem. |
| D03 | Official APIs only; no credential/session scraping | Reliability and platform compliance. |
| D04 | Segment-based rolling buffer | Captures pre-chat-spike action without archiving full streams indefinitely. |
| D05 | Chat is evidence, not truth | Viewer/activity spikes miss quiet moments; manual path stays first-class. |
| D06 | Human approval is a server invariant | Brand and rights safety; cannot be disabled per tenant. |
| D07 | Version profiles and renders | Reproduce why a candidate/render was made and revoke stale approvals. |
| D08 | Postgres-backed durable jobs initially | Few moving parts; SKIP LOCKED, leases and idempotency. |
| D09 | Discovery separated from authorization | Popular category channels are not automatically licensed inputs. |
| D10 | No auto-publish, fake traction, or rights guarantees | Product honesty and durable customer trust. |
| D11 | Flip's tenant precedes paid onboarding | Prove quality and operations before selling seats. |
| D12 | Plan caps instead of usage billing v1 | Predictable subscription and blast radius. |

## 6. Risks and responses

| Risk | Response / stop condition |
|---|---|
| Rights/claims despite edits | Authorized sources only; attestation, disconnect/takedown, destination audit. Stop capture on revoked permission. |
| YouTube reused/inauthentic content | Distinct transformations and human selection; never promise monetization. Measure rejection/quality feedback. |
| API/app review or quota delay | Start YouTube/TikTok review early; private/limited test states explicit; quota dashboard; do not evade limits with extra projects. |
| Chat-only detector misses moments | Manual inputs always available; optional audio/keywords; labeled evaluation per profile. |
| EventSub/HLS gaps | Heartbeats, reconnect, sequence/gap metrics; never invent a continuous timestamp timeline. |
| GPU queue cost/latency | Caps, autoscaling to zero, bounded retries, cheaper rough preview before full render. |
| Duplicate publishing | Approval hash + destination idempotency + provider ID reconciliation. |
| Cross-tenant media exposure | RLS, short-lived signed URLs, tenant-bound jobs, separate secrets, isolation tests. |
| Creator account compromise | Encrypted refresh tokens, least scopes, rotate/revoke; tokens never browser/log/CI. |
| Scope creep before launch | M1→M5 order; no full editor, vision-everything, or autopilot. |

## 7. Open decisions (explicit stubs)

- O1: production cloud/GPU provider after benchmark; contract is provider-neutral (see DevOps addendum).
- O2: monthly price and included render/concurrency/storage caps after measured M1–M2 cost.
- O3: precise raw-segment retention default (start 24h) and rendered-draft retention (start 30d), with tenant deletion.
- O4: whether category discovery is exposed outside Flip's admin tenant after rights workflow is proven.
- O5: native Stream Deck plugin later; v1 uses signed HTTPS webhook.
- O6: Kick/YouTube/TikTok exact approved scopes/capabilities recorded during app setup; adapters must fail closed if absent.

