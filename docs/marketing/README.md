# Marketing foundation: run and rollout

This branch adds the Marketing workspace with Campaign planning, knowledge and DNA, private creative assets, human publishing review, editable video timelines and versioned reports. See `FEATURE_READINESS.md` for implemented paths and remaining work, and `LAUNCH_RUNBOOK.md` for staging and rollback.

## Local

Use the existing `.env.local` public Supabase configuration and normal ColorME login. Do not paste credentials into chat or commit `.env.local`.

```sh
pnpm dev
```

Open `/marketing`. A missing login returns to the original dashboard with a validated return destination; a database without the additive migration shows an actionable initialization state.

## Apply on staging before production

1. Apply the eight ordered migrations in `LAUNCH_RUNBOOK.md` to staging. Review the additive tables, RPCs and private `marketing-originals` and `marketing-footage` buckets. Review all active Storage policies before pilot access.
2. Deploy the application branch to staging. Production was not deployed by this implementation.
3. Admin creates an explicit Marketing team in Overview and adds actual profile UUIDs. Do not import mentor assignments as team scope.
4. Verify real active/locked/Viewer/Representative/Leader/Admin accounts, cross-team isolation, edit conflicts, deep links, refresh and legacy regression. Run multi-session PostgreSQL contention checks before rollout.
5. Complete the staging checklist and document the actual integration capabilities. Admin diagnostics in Marketing Overview show the migration version and integration prerequisites.

## Tests

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
```

Disposable SQL tests require a separately installed test runtime, not a new app dependency:

```sh
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-marketing-db.mjs
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-marketing-knowledge-db.mjs
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-marketing-creative-db.mjs
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-marketing-publishing-db.mjs
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-marketing-video-reports-db.mjs --task-links
```

Browser/API/SQL fixture tests require a local Next server, Chrome/Playwright and an FFmpeg CLI with libx264 for the synthetic fixture. They use synthetic identity and a disposable PostgreSQL engine, block external requests and never write live data:

```sh
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js CLM_MARKETING_QA_URL=http://localhost:3104 node scripts/test-marketing-ui.mjs
```

`CLM_QA_RUNTIME` selects an existing package.json beside Playwright and `CLM_QA_BROWSER` selects its Chromium channel. Screenshots and machine-readable results are written under ignored `tmp/marketing/`; all screenshot data are illustrative fixtures. Do not use fixture credentials/tokens against any real provider.

Creative browser tests simulate Storage HTTP bytes in memory while executing real object metadata/RLS locally. They validate actual PNG output signatures/dimensions/pixels; they do not certify the Supabase Storage service or deployed policies. Test actual authenticated upload/download, quotas, MIME metadata, role changes and multi-session behavior on staging before release.

## KPI revisions after activation

Open an active Campaign and select **Insights**. An authorized member can save proposed targets and a reason. The team Leader or Admin reviews the current and proposed targets and confirms the saved proposal. The confirmed KPI appears alongside the activation baseline and confirmation history. The KPI sequence is independent of the Campaign version used by publishing approvals.

## Existing Task links

Open a saved content item in Creative Studio and use **Task của nội dung**. Enter an existing Task ID, inspect its title/status/deadline and confirm the link. The panel reads current Task metadata. Removing a link requires a reason and keeps an audit event. The **Tạo Task trong Task hàng ngày** action opens the existing Task module. Task completion does not advance content approval or publishing. Links have a separate version and a limit of 20 active references per content item.

## Content Calendar evidence

Calendar shows the proposed hour until an active publication has a linked approval snapshot. Approved items are placed by their approved slot in Vietnam time. Verified receipts drive the Meta status. The receipt observation time and the actual publication time are separate fields, and the latter stays unavailable until the provider supplies it. Pending reconciliation and unresolved incidents appear as alerts.

The detail dialog can load final PNG/JPEG images from the exact sealed approval, one image on demand. The user-scoped endpoint rechecks the approval binding, current asset version, rights and stored bytes, then rechecks access after downloading. It returns private, non-cacheable bytes without Storage paths or public URLs. Preview object URLs are revoked on close, navigation or access reset, and expire after at most 30 seconds (earlier if rights expire). A silent server-side rights change can remain visible until that short deadline; a reload always checks current rights. Calendar cells do not fetch thumbnails.

## Reports and rollback

`PHASE5_REPORT.md` and `PHASE6_REPORT.md` capture verified behavior and the limits of local acceptance. The operator steps for staging, rollout, incident response and rollback are in `LAUNCH_RUNBOOK.md`. Use `FEATURE_READINESS.md` to track provider and workflow gaps.
