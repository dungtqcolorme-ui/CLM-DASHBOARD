# Marketing foundation: run and rollout

This branch implements Phase 0 audit, the Phase 1 vertical slice and Phase 2 core: sourced knowledge, internal research, explicit idea selection and versioned DNA proposals. See `PHASE2_REPORT.md` for current capabilities and `IMPLEMENTATION_REPORT.md` for the Phase 1 snapshot. The supplied full product spans Phase 0–6; external AI, OAuth, media and publishing features are explicitly deferred, not reported as finished.

## Local

Use the existing `.env.local` public Supabase configuration and normal ColorME login. Do not paste credentials into chat or commit `.env.local`.

```sh
pnpm dev
```

Open `/marketing`. A missing login returns to the original dashboard with a validated return destination; a database without the additive migration shows an actionable initialization state.

## Apply on staging before production

1. Review and apply `supabase/migrations/20261104000100_marketing_foundation.sql`, then `20261104000200_marketing_knowledge.sql` to the selected staging database with the existing migration process. They create only additive Marketing tables/functions/policies; do not edit/reapply an already applied migration.
2. Deploy the application branch to staging. Production was not deployed by this implementation.
3. Admin creates an explicit Marketing team in Overview and adds actual profile UUIDs. Do not import mentor assignments as team scope.
4. Verify real active/locked/Viewer/Representative/Leader/Admin accounts, cross-team isolation, edit conflicts, deep links, refresh and legacy regression. Run multi-session PostgreSQL contention checks before rollout.
5. Production migration/deployment is a separate operational action. Meta publishing stays unavailable; no Phase 1 environment flag can bypass the missing publishing implementation.

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
```

Browser/API/SQL fixture tests require a local Next server and installed Chrome/Playwright. They use synthetic identity and a disposable PostgreSQL engine, block external requests and never write live data:

```sh
MARKETING_PGLITE_MODULE=/absolute/test-runtime/node_modules/@electric-sql/pglite/dist/index.js CLM_MARKETING_QA_URL=http://localhost:3104 node scripts/test-marketing-ui.mjs
```

`CLM_QA_RUNTIME` selects an existing package.json beside Playwright and `CLM_QA_BROWSER` selects its Chromium channel. Screenshots and machine-readable results are written under ignored `tmp/marketing/`; all screenshot data are illustrative fixtures. Do not use fixture credentials/tokens against any real provider.

## Rollback

Revert the Marketing application commit, leaving existing unrelated work untouched. Keep additive tables/history for recovery. To stop data access, revoke authenticated execution of `public.marketing_command(jsonb)` and `marketing_private.command(jsonb)` in the selected environment through a reviewed migration. Never drop legacy data or rewrite applied migrations to roll back a UI release.

## Next phases

2. Core source validation, DNA proposals and explicit idea selection implemented. A configured AI/web research provider, semantic analysis and proactive model-driven planning remain pending; see `CHAT_LINK.md` for the separate context-link chat.
3. Controlled Drive OAuth/folders/rights, editable scene graph, assets and templates.
4. Exact human approval snapshots, cross-creator enforcement, verified ColorME Partnership Page, durable publishing gateway, receipts and hold/cancellation reconciliation.
5. Authorized footage/audio editor and background worker, true Organic data, reports and separately approved sharing.
6. Real staging OAuth/API/RLS/concurrency/performance acceptance and controlled launch.
