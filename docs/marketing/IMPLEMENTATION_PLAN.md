# ColorME Partnership Marketing implementation plan

> Execution: use superpowers:subagent-driven-development for independent UI/database tasks; controller owns API, bridge and integration. The user explicitly requested implementation of the supplied fixed specification. Continue without a new design approval round; no production deployment or remote writes.

**Goal:** Ship a real Phase 1 vertical slice with authenticated navigation, scoped teams, campaign activation, versioned shared plans, content drafts and a master calendar.

**Architecture:** Add Next.js `/marketing` routes and one disclosure in the existing sidebar. Reads use the user's Supabase JWT and RLS; mutations use a narrow transactional `marketing_command(p_command jsonb)` RPC that rechecks identity, status, roles, team scope and expected version in the database. Do not use service-role writes for Marketing.

**Tech stack:** Existing Next.js 16.2.10, React 19.2.4, TypeScript, CSS/Tailwind 4, Supabase JS; no new application dependency.

**Specs:** `MASTER_SPEC.txt`, `UIUX_ADDENDUM.md` in this directory, copied verbatim from the user-selected attachments.

## Constraints

- Preserve existing legacy modules and uncommitted user changes; work on `codex/partnership-marketing-foundation`.
- Exactly one Marketing parent and eight children; Vietnamese interface, existing theme/logo.
- Live Meta publishing disabled; no generated image/video/voice, external sends, ads writes, fake metrics or fake connection states.
- UTC persistence, Asia/Ho_Chi_Minh display; immutable creator, optimistic locking and append-only version/audit history.
- Admin manages explicit Marketing memberships; mentor assignments are unrelated.

## Review focus

Revoked membership/status between requests, forged roles, direct RPC bypass, simultaneous plan edits, changing content after submission, timezone day boundaries, dirty worktree preservation, missing migrations and expired sessions.

## Task 1 — Database and security

**Owner/files:** database worker, new `supabase/migrations/*marketing_foundation.sql`, `supabase/tests/marketing_foundation.test.sql`, `scripts/test-marketing-db.mjs`.

**Interface:** tables and command payloads in `lib/marketing/types.ts`; RPC `marketing_command(p_command jsonb)` returns affected row JSON. Private schema helpers, explicit grants, RLS SELECT policies and no direct client DML grants.

- [x] Write executable SQL regression tests first; verify rejection before feature exists.
- [x] Implement additive schema and RPC with atomic campaign/plan/content versions, membership checks, activation KPI snapshot, frozen creator and no self approval.
- [x] Test locally in disposable PostgreSQL-compatible runtime; never apply to production automatically.

## Task 2 — API and domain

**Owner/files:** controller, `lib/marketing/{types,domain,server,navigation}.ts`, `app/api/marketing/route.ts`, `tests/marketing*.test.mjs`.

- [x] Failing tests for missing/forged/locked identity, bad fields, team scope, mix sum, self review, stale versions and unavailable schema.
- [x] GET returns actual RLS-filtered workspace plus honest capability states; POST validates bounded allowlisted input before RPC.
- [x] Reuse `getDashboardRequestIdentity` (JWT), never trust active-role header as authorization.

## Task 3 — Real UI

**Owner/files:** UI worker, `app/marketing/**`, UI-specific smoke tests/scripts. Controller supplies types and API.

- [x] Eight routable pages and persistent navigation/context layout; matching empty/loading/error/read-only states.
- [x] Admin team setup, campaign list/create/detail, Draft → Pending Activation → Active, plan autosave/version history with explicit conflict recovery.
- [x] Content create/edit/submit and calendar using stored UTC times; dates for Vietnam timezone.
- [x] Other five workspaces explain current phase/connection without fake actions/data; Studio supports real caption drafts for Phase 1, advanced editable media in later phases.

## Task 4 — Legacy navigation bridge

**Owner/files:** controller, minimal edits to `dashboard/clm-dashboard-private-34.html`, `app/page.tsx`, new `public/marketing/legacy-navigation.js` and scoped CSS.

- [x] Insert parent before system/account navigation; no reorder/rename of existing entries.
- [x] Open Marketing through same-origin bridge, preserve mounted legacy frame and back/forward state; deep-link route auth uses existing session.
- [x] Keyboard/mobile/reduced-motion tests with actual sidebar.

## Task 5 — Verification and delivery

- [x] Inventory installed tools/licenses and explicit deferrals; architecture/threat model/navigation/UX/rollback documentation.
- [x] Lint, typecheck, full unit/API suite, database security tests, build, desktop/mobile browser smoke and screenshots.
- [x] Independent security/code review; address actionable findings.
- [x] Commit only owned Marketing files and minimal bridge modifications if checks pass. No push/merge/deploy or production migration.

## Rollout boundary

Production Supabase currently has no Marketing tables (read-only inspection on 2026-11-04). Migration, Admin team setup and application deployment are prerequisites for real-account usage. Phase 2–6 remain explicitly pending; do not describe Phase 1 as the full agent product.

## Delivery record

Implemented the Phase 1 scope above. Final application verification: 90 tests, lint, TypeScript, dashboard source checks and Turbopack build pass. Disposable SQL/RLS suite and 33 returned-row validator roundtrips pass. Browser/API/SQL fixture checks pass with 15 labeled screenshots, including Back/Forward, Campaign switching, delayed autosave conflict recovery and the same retained legacy iframe. Independent review has no remaining actionable P1/P2 findings in scope. See IMPLEMENTATION_REPORT.md and VERIFICATION.json for exact boundaries; no production migration/deployment was performed.
