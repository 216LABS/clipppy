# Addendum — Manual “Clip This Moment” Queue (v1.0, 2026-11-06)

Manual input is a first-class candidate source even when detection is warming up, disabled, noisy or wrong. All paths call one application service `createManualCandidate(...)`, which validates an active authorized source/session, creates an idempotent candidate and audits the actor. None approves or publishes.

## Q1. Shared semantics

Default anchor is the provider event time (chat/webhook) or server request time (dashboard). Default window comes from the current viral profile, with at least 10–15s pre-roll to compensate for live/chat delay. Optional duration is bounded 15–60s in M1 and by available buffer. The response returns candidate ID and state; user does not wait for render.

Duplicate delivery returns the original candidate. Same input event cannot create multiple renders. Two intentional dashboard clicks need distinct request IDs but are deduplicated if overlapping within 10s unless the user explicitly chooses “clip anyway.” If the buffer no longer covers the anchor, return `MEDIA_WINDOW_EXPIRED`; do not silently clip the live edge.

## Q2. Dashboard

On Live Session and Activity Timeline: persistent **Clip this moment** button, optional 15/30/45/60s length, note, and submit. Button requires `owner` or `editor`, CSRF-safe session and a fresh `request_id`. Show optimistic “Moment queued” only after server candidate commit. Link to candidate/render progress. Viewers have no mutation access.

Timeline shows manual markers alongside auto score explanations; user can drag the proposed window before creating a **new** candidate request, but cannot rewrite anchor/audit after creation. A clip marker on a past session works while retained segments exist.

## Q3. Twitch/Kick `!clip`

Provider webhook/event -> signature verification -> durable raw event ID -> normalized command. Syntax: `!clip`, `!clip 30`, optionally `!clip 45 note text` (note max 200 chars). Ignore bots/self and parse only exact command prefix.

Default authorized senders: broadcaster and moderators. Tenant may restrict to broadcaster only or an allowlist of provider user IDs; subscriber/follower commands are off by default. Kick role mapping must be verified [T]; unknown role fails closed. Commands are rate limited (default 6/min/source) and share cooldown only for UI courtesy, not for dropping uniquely requested moderator moments. Reply “Clip queued” through official chat send API only if that separate capability/credential is connected; otherwise no response and dashboard status remains authoritative. Never pretend the clip succeeded before render.

Idempotency key: `chat:{session_id}:{provider_event_id}`. Store actor pseudonym/role and provider ID, not unnecessary personal profile data.

## Q4. Stream Deck / generic webhook

Settings creates a named hook with random public ID and separately stored hashed secret. Secret shown once. Request:

```http
POST /api/hooks/clip/{public_id}
X-Clipppy-Timestamp: 1730880000
X-Clipppy-Event-Id: uuid-from-trigger
X-Clipppy-Signature: v1={hex HMAC_SHA256(secret, timestamp + "." + raw_body)}
Content-Type: application/json

{"session_id":"uuid","seconds":30,"note":"optional"}
```

Reject timestamp skew over 5 minutes, bad signature, unknown/disabled hook, replayed event ID and wrong tenant/session. Use raw request body for HMAC; compare constant time. Rotate/revoke hook without changing source OAuth. Hook can act only for its tenant and selected source/session. HTTPS only, IP/user-agent logs minimized, per-hook rate limit. v1 uses a Stream Deck “HTTPS request” action/generic webhook; no native plugin.

Response `202 {candidate_id,state:"queued",status_url}`; duplicates return `200` same candidate. No media URL, OAuth token or other tenant info. End-to-end tests cover replay, skew, modified body, revoked hook, and overlapping windows.

## Q5. Operator review

Review cards distinguish origin and show requester/note plus detected signals if any. Reject reasons feed profile evaluation. A manual candidate has no score requirement, but the same media probe, rights, approval hash and publication rules. A moderator `!clip` is a request, not permission to publish to the streamer's social account.
