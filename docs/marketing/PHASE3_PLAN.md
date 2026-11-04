# Phase 3 core — Assets and editable designs implementation plan

> Execute using superpowers:subagent-driven-development. Continuing implementation is authorized. Spec: MASTER_SPEC.txt sections 7–9 and UIUX_ADDENDUM.md Studio/Assets. Base b207e22. Existing feature checkout remains in use; preserve all unrelated user files.

**Goal:** A real team image upload → human rights review → versioned editable design → template → locally exported PNG vertical slice, with actual API/SQL permissions.

**Architecture:** Add separate user-JWT Creative RPC and API; private immutable Storage originals; bounded JSON scenes rendered by browser Canvas/SVG. No new application dependencies. Existing caption editor/navigation remain. Drive OAuth, semantic search/AI layout, video and publishing are honestly pending.

## Global Constraints

- No production migration, push/merge/deploy, credentials setup, live social writes, AI media generation or provider calls.
- Only authenticated active actual roles authorize mutations; non-Admin also needs explicit Marketing team membership. Preserve the existing global Admin scope from Master Spec role matrix; Viewer read only. No service-role Marketing writes.
- Source input is untrusted. Upload only PNG/JPEG <=8 MiB; no SVG/HTML/URLs fetched. Dimensions 16..12000, <=40 million pixels. Bucket marketing-originals is PRIVATE, immutable originals; no client UPDATE/DELETE. Path is server-generated team/id/original extension. Reservations expire for upload after 20 minutes, max10 pending per creator. Storage INSERT/SELECT requires matching authorized asset reservation; revoked previews fail on subsequent fetch. No public or long-lived signed URLs.
- reported_sha256 is a server-computed upload digest but SQL callers can declare it. Exact duplicate grouping is advisory, NEVER use this field for approval integrity/publishing snapshots. Future publishing must hash actual stored bytes.
- New fields/commands match lib/marketing/creative-types.ts. API and SQL validate exact nested keys. No arbitrary JSON/HTML/CSS/font/url in scene. Scene dimensions only 1080x1080,1080x1350,1080x1920; 1..10 pages, <=40 layers/page; UUID IDs unique throughout scene; positions finite -12000..12000, dimensions 1..12000, rotation -180..180, opacity0..1; text<=2000 UTF16, font12..240 enum, #RRGGBB colors, radius0..500. Logo always contain, preserves intrinsic ratio. Text/shape/image only. Format switches preserve pages/layers. Locked layers are an editor UX aid, not an approval security boundary.
- Images must be ready and same team; campaign-bound images must match design campaign. Rights approval requires scoped Leader/Admin, reason, provenance+author and allowed_channels subset facebook,internal. Approved assets require facebook; expired/revoked/pending/internal-only block export. Asset originals/provenance immutable; review increments version and audit.
- Default design idempotent per content, one only. Additional variant only explicit create_variant. Editing only content draft/changes_requested, eligible campaign draft/active, no Hold/publishing. Mutation increments content version/revision as well so old pending reviews cannot silently inherit changes. Every design/template snapshot and sensitive audit append-only. Personal templates private to creator, Team shared only after scoped Leader/Admin approval; Official Admin only and no asset-bound images; campaign templates scoped. Applying template rechecks current asset scope/rights, does not change caption, requires expected versions; creates no other design implicitly.
- Existing Foundation submit_review must also run private database preflight: current linked idea evidence and ALL current design variants' image rights. Before Phase4 introduces explicit final-variant selection, checking every current variant is conservative and visible in UI. Caption-only content remains supported; review still does not schedule or approve publication.
- Preflight is for export readiness, NOT publication approval. prepare_export checks current rights/expiry/current versions again and records audit; no scheduling or approval actions. Graphics without photos can export. Missing verified facts/typography/layout checks that are not automated must be listed as manual review warnings, not claimed passed.

## Review Focus

Cross-team image/template binding; private personal snapshots leaking through version RLS; stale save/restore/template apply; direct Storage upload bypass and untrusted hashes; revocation after assets are loaded; draft identity switch/auth changes; role downgrade; default/variant duplicates; canvas injection/huge payload.

## Task 1 — Database and Storage
Ownership: new migration after 00200, supabase/tests/marketing_creative.test.sql, scripts/test-marketing-creative-db.mjs. Read creative-types.ts as binding interface. CLI absent previously; recheck then use documented timestamp file fallback if absent; never remote migrate.
- [x] RED tests first, then additive marketing_assets, marketing_designs, marketing_templates, marketing_creative_versions, marketing_creative_audit_logs, constraints/RLS/immutable histories.
- [x] public invoker marketing_creative_command → non-exposed private definer; identity/membership row locks, strict actions/shape and versions. Return row JSON or design for prepare_export. reserve/complete/review assets; object exists metadata matches on complete; never autoapprove upload. create/save/variant/restore; templates save/submit/review/apply; prepare_export current rights gate. All design changes invalidate old content version via revision/audit using Phase1 patterns.
- [x] Private bucket and scoped Storage policies. Local fixture storage schema for PGlite asserts reserve-upload-complete and invalid metadata/revoke; do not touch real Storage. Regression role/cross-team/expiry/personalhistory/oldversions/appendonly tests and max field API roundtrips.
- [x] Report file /private/tmp/clm-phase3-db-report.md; do not commit, controller stages final owned files. No subagents; you are not alone, do not revert others.

## Task 2 — Domain, API and image transfer (controller)
Ownership: lib/marketing/creative-{domain,server,image}.ts, /api/marketing/creative, /api/marketing/creative/upload, /api/marketing/creative/file, tests/marketing-creative-*.test.mjs (except UI-specific tests).
- [x] RED unit/API tests for strict scenes/commands, bounded data, identity/origin, permissions, preflight and signature/dimensions.
- [x] read Creative RLS data; endpoint command validated; upload raw bounded file with query JSON metadata headers avoided via two-step reserve? Upload API accepts multipart? Final ruling: POST /creative/upload?reservation=id receives raw bytes image/png|jpeg; reads reservation via user RLS, validates exact hash/size/dims against immutable reservation then user-client Storage upload upsert:false and complete RPC. UI computes digest using crypto.subtle when reserving; never log content/token. Object upload success+complete failure remains explicit retryable pending reservation; complete command permits finish, never grants rights. file GET?id uses user RLS row, ready/notrevoked and private Storage.download; streams bytes with no-store/nosniff, image-only MIME, no redirect. No service key.
- [x] Actual preflight helper maps current asset rights/expiry/scope plus scene bounds/quality; immutable server export gate SQL. Initial local PNG export needs all pages; filename v/page; deterministic canvas no AI generation.

## Task 3 — Asset library and Creative Workbench UI
Ownership: new app/marketing/creative/**, app/marketing/assets/page.tsx, app/marketing/studio/page.tsx; scripts/marketing-creative-ui-checks.mjs and UI draft helper tests. Use current tokens/components/hook patterns. No other product files. Controller passes completed Task1 contract.
- [x] Real upload form/reservation/upload, card/list search tags/rights/campaign, exact reported-digest duplicate advisory, detail and human rights review, revoke. Blob previews fetched with auth, objectURLs revoked on cleanup; no assetURL signed metadata persisted. Drive tab honest unavailable.
- [x] Lazy Workbench for saved content only, default explicit creation, variants explicit, local undo/redo, page add/delete/reorder, zoom/fit, layers text/shape/image, keyboard and numeric move/resize/rotate/opacity/fill/text/font, drag selected unlocked layer, lock/reorder/delete, logo contain. Asset explorer inserts actual private image, scoped issues panel. Scene editable JSON persists versions optimistic conflict keeps dirty draft, auth changes clear private cache, format changes keep scene. Version restore explicit. Preserve caption UI/evidence.
- [x] Templates Personal/Team/Campaign/Official persistence, submit/review/apply, exact base version, creator-private pending. Effective rights rechecked, no fake auto-design AI buttons. PNG export all pages after save/current preflight/prepare_export, actual canvas draws text/shapes/authorized uploaded images; no SVG/dataURL injection. Mobile usable with stacked panels; label manual preflight checks explicitly.
- [x] Report /private/tmp/clm-phase3-ui-report.md. No commits/subagents; you are not alone, preserve unrelated edits.

## Task 4 — Integration, security review and delivery
- [x] Baseline109 tests, SQL previous suites. New actual API+PGlite browser fixture includes Storage simulation clearly marked, upload/review/canvas/template/revoke/conflict/Viewer/mobile. Existing navigation and retained iframe regression.
- [x] Independent task and whole-change review, fix important findings, full verify lint/type/tests/build, unauthenticated HTTP, report exact limits and no real Storage/production claim.
- [x] Commit only Phase3 owned paths, update README/report/verification. No deploy, remote migration, OAuth or API provider.

## Decisions and ledger

- Ruling: implement manual editing/selection and native browser PNG first — no provider authorization is needed — automated design/semantic retrieval remains pending.
- Ruling: user-JWT Storage with immutable paths, server byte sniff/digest checks, manager rights review — avoids service-role writes. Digest is advisory because direct authenticated SQL/Storage clients can declare metadata; publishing integrity is Phase4 and must rehash real objects.
- Ruling: continue existing feature checkout, retain unrelated dirty files and explicit owned staging — no destructive workspace move or repeat setup.
- Ruling: preserve global Admin scope consistently with the Master Spec and Phase1/2 RPC; explicit Marketing membership is mandatory for non-Admin. An earlier sentence omitted this existing exception and has been corrected before UI implementation.
- Ruling: gate existing content submit_review with an additive private trigger, without editing old migrations — closes the direct RPC bypass for missing creative rights/evidence. All current variants are checked until a final-variant selector/snapshot exists in Phase4; an unused invalid variant may require removal of its photo before submission.

## Delivery ledger

- Baseline109 tests. Final136/136 + lint/type/dashboard checks/build GREEN.
- Foundation33 / Knowledge7 / Creative11 SQL-result→API roundtrips GREEN in disposable PGlite. Storage HTTP simulated only.
- Actual browser/API/SQL:22 checks,28 illustrative screenshots,errors=[], one legacy iframe load. Both exported PNGs validated by signatures/dimensions and decoded pixel.
- Independent core review PASS; whole-change review2P2 fixed and scoped re-review PASS; resource-403 revoke regression fixed/re-reviewed PASS.
- RAM draft navigation + initial500 retry + deferred canvas save guard + clean/dirty caption + revoked-file no-download/retained-scene verified in browser.
- Manual editor/assets/templates/PNG delivered; Drive/provider/advanced tools/Meta/video remain pending. No production migration/deploy or external writes.
- Preserve existing feature branch and unrelated user changes; commit only owned paths.
