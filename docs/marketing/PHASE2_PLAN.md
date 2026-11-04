# Phase 2 Knowledge, DNA and Ideas implementation plan

> Execute with superpowers:subagent-driven-development. The user approved continuing implementation. No production migration, deploy, live social write or credentials action is authorized by this plan.

**Goal:** Add a functioning scoped Knowledge Hub, versioned Brand DNA proposals and an internal research → evidence-backed idea → explicitly selected content draft vertical slice.

**Architecture:** Preserve Phase 1 and its RPC unchanged. Add `/api/marketing/knowledge` GET/POST with the existing user-JWT auth, a separate transactional `marketing_knowledge_command(jsonb)` invoker/private-definer gateway, additive RLS tables and integrated content in the existing eight-entry Marketing navigation. Types live in `lib/marketing/knowledge-types.ts`.

**Stack:** Existing Next.js/React/TypeScript/Supabase, no app dependency changes. Reuse disposable PGlite + existing browser harness.

## Global constraints

- Preserve user changes and legacy modules; continue feature branch `codex/partnership-marketing-foundation`, base Phase 1 `ca58b3d`.
- No generated image/video/voice, Meta/Ads/comments/DM writes, publish/schedule commands, or automated Brand DNA/KPI/Content Plan application.
- No external AI provider/API code or credentials use while provider/key decision is pending. Complete independent workflow first. Do not label deterministic proposals as AI outputs.
- UTC persistence, explicit timezone inputs, Vietnam display; active DB status/actual roles, explicit Marketing membership and RLS at every boundary.
- Only explicit member `select_idea` creates a content draft. Research/generating ideas does not create content, tasks, design jobs or assets.
- Team/post DNA cannot override master hard rules. Master changes need Admin apply; team changes need scoped Leader/Admin apply; per-post changes need scoped writer apply. Every apply requires diff review and `confirmed:true`.
- Sources and quotes are untrusted data. No URL is fetched, token requested, instruction executed or external tool invoked by source text. Human approval is labeled human review, not API-verified retrieval.

## Review focus

Cross-team reference binding; source revocation/expiry after research; fake evidence/version; duplicate idea selection concurrent retries; stale DNA apply; master rules overridden by child scopes; role revocation; sensitive historical caches; pending provider status; preserving earlier API/UI/DB tests.

## Task 1 — Data and SQL (database worker)

Ownership: new `supabase/migrations/20261104000200_marketing_knowledge.sql`, `supabase/tests/marketing_knowledge.test.sql`, `scripts/test-marketing-knowledge-db.mjs`. Do not change Phase 1 migration or RPC.

Tables: `marketing_sources`, `marketing_facts`, `marketing_research_runs`, `marketing_ideas`, `marketing_dna_profiles`, `marketing_dna_proposals`, `marketing_dna_versions`, `marketing_knowledge_audit_logs`. Match exact shapes/commands in types.

- [x] Write SQL behavioral/security tests first; record RED before migration.
- [x] Reuse private `text_length`, `trim_text` and `can_read`; authenticated SELECT only and scoped RLS. Master approved DNA read by active app users; master proposals/audit only Admin. Immutable audit/versions, actor/roles/membership locks and optimistic versions.
- [x] Source approval/revoke and factual review require scoped Leader/Admin. Hypotheses/missing-verification cannot become verified facts. Business categories require a future explicit valid_until before verification. Facts must bind to the same team as source.
- [x] `run_research`: Internal Only never external; Auto executes internal search with honest fallback warning; Deep Research creates Not Configured run without external calls. Search verified, unexpired factual claims of approved sources only, max10 evidence refs containing exact fact/source versions, never cached raw summary text.
- [x] `generate_internal_ideas` uses current valid run evidence, max5 explicitly rule-based drafts/citations; deduplicates its suggestion key and never creates content. No sample metrics/claims invented. Title/hook/line/caption/manual ideas and their evidence are persisted.
- [x] `select_idea` verifies current evidence versions, source/fact status/expiry, writer/team, campaign Draft/Active. Atomically creates one ordinary content draft plus Phase 1 revision/audit and links immutable selected idea. Repeated selection returns the same content ID; no scheduling.
- [x] DNA propose/apply/reject with immutable proposal payload/base snapshot, expected current profile version, scope permissions, child hard_rules=[]; official Master hard rules inherited in read helper. Apply transaction appends version and audit, no silent overwrite.
- [x] Run all local SQL assertions and cross-layer max-value roundtrips. No production SQL writes.

## Task 2 — Domain and API (controller)

Ownership: `lib/marketing/knowledge-{types,domain,server}.ts`, `app/api/marketing/knowledge/route.ts`, new domain/API tests and Phase 1 capabilities copy only.

- [x] Validate strict action fields, canonical UUIDs, exact limits shared with SQL, nullable explicit fields, https-only public URLs with no credentials/local/IP hosts/secrets query names, real dates and timezone timestamps.
- [x] Helpers: evidence freshness resolves refs against current verified facts/approved sources; duplicate warnings are explicitly exact text/title matching, not semantic search; effective DNA preserves master hard rules and merges creative fields Master→Team→Post only.
- [x] GET actual RLS-filtered entities via bounded range helper. Sanitize unavailable evidence at runtime; don't echo revoked source body as research result. POST bounded body and command allowlist → actual user-JWT RPC. Same sanitized errors/no-store as Phase 1.
- [x] No model/provider chosen without user decision. Current AI/external research status remains Not Configured; internal search genuinely works.

## Task 3 — Integrated UI (UI worker)

Ownership: new `app/marketing/knowledge/**`, existing `app/marketing/agent/page.tsx`, Brand Kit tab integration in assets page, scoped CSS append/new import. Controller owns main provider/API/domain/types.

- [x] Agent & Ideas sub-tabs Research / Idea Radar / Weekly Planner / Knowledge Review, current Campaign/team context.
- [x] Real source/fact forms with provenance, human review, expiry, revoked warnings and role controls; no automatic source verification or URL fetch claim.
- [x] Visible Auto/Internal Only/Deep selectors, actual research results/evidence, internal rule-based idea action with explicit label; truthful empty/unconfigured states.
- [x] Manual idea/caption editor and exact duplicate warning; explicit Chọn triển khai → existing Studio content draft, preserve source/idea provenance. Weekly planner only edits proposed idea dates; no schedule or Task creation.
- [x] Brand DNA Master/Team/Post editor proposals + before/after diff + explicit confirmation, scope-appropriate approval, version history and effective master hard-rule view.
- [x] Viewer read-only, pending/errors/conflicts, safe external links, user-scoped draft preservation, mounted generation guards, mobile/accessibility and no ninth sidebar item.

## Task 4 — Verification/review/delivery (controller + independent reviewer)

- [x] Full Phase 1 unit/API, SQL and browser regressions remain green.
- [x] Extend real browser→API→disposableSQL QA to cover source/fact human review, internal research, cited rule-based ideas, selection idempotence, expiry/revoke block, DNA diff/confirm and master inheritance; mobile screenshots clearly illustrative.
- [x] Full lint/typecheck/tests/build, actual unauthenticated HTTP boundaries, immutable artifacts/reports and independent security review with diff file.
- [x] Commit only Phase 2 owned files to existing feature branch. No merge/push/deploy/remote migration. Update phase report with exact working/pending/provider boundaries.

## Field limits (binding API and SQL)

Title180, source excerpt8000, author200, URL2000, claim2000, reason/rationale2000, objective5000, hook2000, caption12000, research query2000 (nonempty). Source published_at nullable ISO date. Timestamps nullable only with explicit timezone; evidence fact ID list max10, unique. DNA voice/hooks/CTA each2000, visual_notes4000, hard_rules max20 strings each200; child scopes must use empty hard_rules. expected_version safe positive integer; DNA base_version safe nonnegative. No unknown fields.

## Delivery ledger

- Baseline: 90 tests passed on ca58b3d before Phase 2.
- Task 1 SQL: RED before migration; final behavioral/security suite GREEN with seven maximum-value RPC/HTTP validator roundtrips. Phase 1 SQL 33 roundtrips preserved.
- Task 2 domain/API: recorded RED before exports; 16 security/domain/API tests GREEN. No provider/API credentials or external calls implemented.
- Task 3 UI: source/fact review, internal research, ideas, planner, DNA and Studio provenance implemented; three clean/dirty draft tests GREEN.
- Fix round 1: two reviewer P2s addressed (immutable automatic evidence; clean DNA base refresh); scoped re-review replayed prior exploit and verified rejection 22023. Stale Planner DTO overwrite path also blocked. No remaining actionable P1/P2 in reviewed scope.
- Task 4 browser: real API handlers plus disposable SQL, 24 illustrative screenshots and all existing navigation/mobile/iframe checks pass. Full verification:109 unit/API tests plus build. No production writes or deploy.
- User-owned separate chat created under CLM DB; source web history access verified. Provider/key selection remains unresolved and no API-backed artifact was added.
