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

## Phase 3 Creative boundaries

- `marketing-originals` is a new private bucket. Originals use reservation-generated immutable paths. Only the creator with current write permission may INSERT during 20 minutes; no new client UPDATE/DELETE policy. SELECT rechecks active scope, revocation and expiry. Inspect all deployed Storage policies before rollout because permissive policies combine with OR.
- Upload API is user-JWT only, streams at most 8 MiB, accepts PNG/JPEG, checks signature/envelope/dimensions and compares actual digest to immutable reservation. This is not full raster decoding or malware scanning. Images are rendered as raster images, never inline SVG/HTML. File endpoint repeats byte checks and returns image-only, no-store/nosniff bytes without redirects or signed URLs. Real Storage service behavior still needs staging.
- A direct authenticated SQL/Storage caller can declare `reported_sha256`. The digest is only an advisory exact-duplicate hint, never an approval/publishing integrity hash. Any future publishing snapshot must hash actual immutable object bytes itself. Header MIME/size is checked against real Storage object metadata on completion; upload completion never grants rights.
- Human scoped manager review grants Facebook usage separately from file access. Export transaction checks current asset team/Campaign, readiness, approved channels/expiry and current linked idea evidence. Revoked or stale evidence blocks new exports. Previously downloaded files cannot be recalled; a cached preview is never authorization, and export must refetch current bytes. No publication operation exists.
- Scenes are structured JSON with strict nested keys, UUID references, fixed dimensions/fonts/colors, bounded geometry/pages/layers/text. No URL, HTML, arbitrary CSS, executable action or external font reference is accepted. Source text is data. Local deterministic PNG raster export is not generative AI.
- Default design creation serializes on content and returns the existing default. Explicit variants, save, restore and template apply use optimistic versions; design changes also increment content version and append content revision/audit. Dirty caption and scene must retain their original base after refresh; clean editors may adopt latest state.
- Template/version/audit RLS follows current template visibility: personal snapshots stay creator-private; scoped managers can review pending shared templates. Only Admin makes/reviews Official templates, which contain no team-bound images and can be reused across teams after approval. Template application rechecks current asset rights and version.
- The existing Foundation `submit_review` RPC is protected by an additive private database trigger on entry to `in_review`. It rechecks linked idea evidence and image rights across all current design variants; this cannot be bypassed by calling the old RPC directly. Caption-only review remains available. A final-variant selector and immutable human publishing approval snapshot remain Phase4 work.
- Manual factual, originality, typography/logo and layout checks remain visible warnings. The automated preflight must not claim these are verified. No design/export response is a human approval snapshot, permission to publish or Meta receipt.
