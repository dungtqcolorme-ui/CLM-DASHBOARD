# Phase 1 threat model

| Threat / input | Enforced boundary | Evidence / limit |
|---|---|---|
| Forged role header, multi-role account | Auth provider verifies JWT, active profile and actual roles; SQL repeats roles from DB | API and SQL rejection tests; UI role is only presentation |
| Cross-team ID / revoked membership | RLS for all reads; SQL membership check and row lock for writes | Disposable PostgreSQL tests for read isolation and command rejection |
| Locked account / revoked role between requests | Fresh identity plus locked profile/roles in mutation | Regression tests; real multi-session races still need staging PostgreSQL |
| Direct PostgREST table write / raw RPC bypass | SELECT-only grants, strict SQL command keys/types/bounds and no generic write operation | SQL privilege, malformed RPC and API-roundtrip tests |
| Stale shared-plan/content edit | Compare immutable expected version under row lock; no silent server-version adoption | SQL 40001 tests, UI conflict controls and local user-scoped draft preservation |
| Self approval / agent publishing | No approval/publish command; reserved table CHECK rejects same creator/approver | SQL check + API unknown-command/forged-field tests. Complete approval workflow is deferred |
| Official KPI overwrite | Activation snapshot + immutable trigger; later plan writes must preserve exact targets | SQL activated KPI tamper tests |
| Editing reviewed content | New content version resets draft; old revisions remain immutable | SQL review invalidation test |
| Fake remote success | Meta/Drive/agent/render status unconfigured; no remote adapter in Phase 1 | App API response and browser states |
| Secrets/logging/raw SQL messages | User JWT stays in existing auth client/header; no credentials stored in Marketing; sanitized error codes | API redaction tests; no tokens/source docs/comments in database fixture/report |
| Prompt injection / unsafe tool execution | No runtime LLM/MCP execution or URL fetch command | Narrow command union and SQL allowlist; later research must treat sources as untrusted |
| Oversized body / malformed date / bad Content Mix | 256 KB stream limit, API+DB validated schema, finite dates, timezone required, sum exactly100 | API and real SQL tests |
| Disappearing legacy form | Persistent root host retains same iframe; Next Links return without reloading shell | Browser roundtrip test; hard browser reload still uses legacy safeguards |

## Deferred controls

No Phase 1 test certifies remote Meta permissions, OAuth token encryption, Drive rights revocation, storage signing, immutable rendered media, content snapshot hashes, queue claims/retries, ambiguous remote receipts, hold/dispatch races, publishing cancellation, organic metric eligibility or report-share approval. Those are required before the corresponding Phase 3–6 features are enabled.

PGlite exercises actual PostgreSQL SQL, privileges, constraints, RLS and transactions in a disposable local engine. It does not validate Supabase deployment settings, browser-to-live-Auth integration, or true two-connection contention. Run staging PostgreSQL concurrency and real-account acceptance before production rollout.
