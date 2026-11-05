# Phase 4 core — Human review, snapshots and durable jobs

05/11/2026, feature branch continuing from9d28449. No production migration/deployment, no real Meta or other external write.

## Working code paths
- User-JWT candidate intent binds exact content creator/caption/version, Campaign/version, verified connection/version/Page, selected final design, ordered final raster IDs, original source IDs/versions, current rights/evidence and Vietnam proposed time. Sealing is a separate server-only service operation after downloading/hashing actual private bytes. Reported client digest is never publishing integrity. Snapshot JSON/SQL SHA256 immutable; private credentials never in safe workspace.
- Actual Leader/Admin different from immutable content creator confirms exact sealed hash/version. Candidate requester is shown separately. Atomic existing approval snapshot plus unique internal durable job. Queued/approved is not Meta-scheduled; only verified external receipts can set scheduled/published.
- Opaque leased SKIP LOCKED jobs, due-time gate, limited retry/backoff before remote start; expired started dispatch and ambiguous network outcomes become Unknown, never blind re-post. Inspect and verify bytes before begin; begin rechecks current refs/hold immediately before external operation.
- Hold/Pause, rights revoke and connection invalidation cancel prewrite jobs or create cancellation-pending risk for in-flight/remote schedules. Published posts are never auto-deleted. Resume never resurrects cancelled jobs. Cancellation intent persists separately across Unknown/failed/timeout; verified wrong remote IDs cannot replace/cancel the bound post. Only explicit verified cancellation resolves the remote state.
- Deduplicated incidents distinguish acknowledgment from resolution and retain unresolved remote risk. Every status transition has scoped append-only events/audit. Different target/time candidate supersedes older sealed approval through an authoritative current-candidate pointer.
- Studio preparation and Approval Inbox show exact payload/creator/requester/assignee/Page/time/hash/design/media roles/rights/evidence, confirmation, real internal job states and incidents. Viewer read only, private previews authenticated. Normal request-changes remains available when a sealed snapshot loses rights/connection validity; content version bumps and old approval becomes unusable.

## Trusted boundary
Additive20261105000100 migration. User marketing_publishing_command cannot attest, connect, read credentials, claim or complete jobs. Separate marketing_publishing_gateway_command is service-role-only and accepts narrow allowlisted operations; no generic privileged CRUD endpoint. Actual user roles/membership rechecked under locks; Admin global scope follows Master Spec. Current Page IDs are not inferred from the Business Suite hint.

The MetaConnector interface includes account discovery, permitted reads/metrics and publishing/cancellation/status operations. Production driver deliberately returns Unsupported/NotConfigured: current primary Meta docs returned429 and actual app/Page/OAuth/worker/service configuration is absent. Test adapters exist only as injected fixture objects, not a production mode switch. Worker HTTP endpoint refuses missing secret and remains closed even if a LIVE flag is set while a supported connector is absent. No scheduler was installed.

Private credential ciphertext storage/RPC is present, but production OAuth/token exchange/encryption integration is not certified or enabled. Do not place plaintext credentials into that field; real credential onboarding remains a separate integration prerequisite. No real credentials were created, read from an account or logged.

## Verification
Baseline136 tests; Phase4 adds22 domain/API/worker cases, full158 tests and initial full Turbopack build passed. Final sandbox lint/typecheck/unit/dashboard checks and Webpack production build pass. The final Turbopack escalation did not execute because automatic approval review hit its usage limit; Webpack completed within the normal sandbox, with no permission bypass. Publishing SQL suite passes with2 actual SQL-result/API roundtrips, plus role separation/byte attestation/self-review/multi-role Admin/stale refs/leases/Unknown/holds/remote-ID/candidate supersession/cancellation regressions.

Final browser fixture:24 checks,32 illustrative screenshots,errors=[], one legacy iframe load. Actual handlers and PostgreSQL/RLS/service-role commands exercised; Storage HTTP bytes and identity are fixtures. Includes prepare/seal/different-creator confirmation/single job/duplicate rejection/Hold+Resume/no resurrection and revoked-connection correction to editable Studio. Previous Phase1–3 browser flow and real PNG byte/pixel checks preserved.

Independent core review three findings fixed and re-reviewed PASS. Final UI review one recovery finding fixed and re-reviewed PASS. No remaining actionable P1/P2 in reviewed scope. PGlite does not certify real multi-connection contention or deployed provider/Storage.

## Remaining operational boundaries
Live OAuth/account discovery, version-specific production Graph adapter, verified capabilities/permissions/tasks/App Review, real token encryption/rotation/reconnect, worker hosting/scheduler, real Storage and staging contention acceptance remain required. No live publisher/go-live claim. Internal queue exists and has not been sent to Meta.

Continue Phase5 next, then Phase6 hardening and feature-by-feature launch readiness; do not mistake this report for completion of all integrations.
