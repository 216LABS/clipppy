# Threat model

Clipppy stores other people's live video, OAuth refresh tokens, and the right to post to their social accounts. The controls below are the v1 boundary.

## Assets

- Authorized source media and renders
- OAuth refresh tokens and webhook secrets
- Approval records and publication idempotency keys
- Tenant membership and Stripe entitlement

## Trust boundaries

- Browser cookies authenticate a tenant member. They never receive refresh tokens, webhook secrets, or service-role keys.
- Provider webhooks are authenticated by raw-body HMAC or the provider's signature, not by a session cookie.
- Workers receive a job payload with tenant-scoped object keys. They do not accept shell strings, arbitrary URLs, or output paths.
- `APP_ENV != production` refuses live social adapters even if live client ids are present.

## Invariants

1. **Human approval.** `executePublish` is the only upload caller. It requires an approval row, a matching render id, and the same checksum, checked again immediately before the adapter call. There is no skip flag.
2. **New render invalidates posting.** A later render version cancels queued publications and makes the old approval stale without mutating the approval row. Approval updates are rejected by a database trigger.
3. **Tenant isolation.** Postgres policies are forced even for the table owner. Application reads filter on membership. Signed media URLs bind tenant id and object key. Discovery rows cannot set `authorized = true`.
4. **Secrets at rest.** Hook secrets and OAuth tokens are AES-GCM ciphertext with the tenant id as associated data. A SHA-256 hash is stored for bookkeeping. HMAC verification needs the secret, so a one-way hash alone is not sufficient; the ciphertext is the verification material and the plaintext is shown once.
5. **Chat identities.** Scoring uses an HMAC chatter key. Timeline APIs return counts, not raw messages.
6. **Quota honesty.** Provider 429s are retried with backoff. The product does not create extra platform projects to evade quota.

## Out of scope for this slice

Live OAuth apps, a production GPU host, and a hosted Supabase project are not configured here. Adapters fail closed until those credentials exist. See the README credential list.
