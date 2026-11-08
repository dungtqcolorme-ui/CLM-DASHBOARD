# Private Calendar thumbnails implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, followed by one independent review.

**Goal:** Show optional, lazy private thumbnails on Calendar cards, derived from the exact sealed final image.

**Architecture:** Extend the existing authenticated Calendar media endpoint with a fixed `variant=thumbnail`. Verify original bytes before transforming, then recheck rights/scope after transformation. Add an actor-scoped database budget and a single active thumbnail transform per API process. Calendar opt-in, viewport loading and serial requests avoid fetching originals into every cell.

**Stack:** Existing Next/React/Supabase; Sharp 0.35.5 (already transitive through Next, now pinned directly; Apache-2.0), WebP in memory. Existing original/full preview behavior stays available.

**Spec:** `docs/marketing/UIUX_ADDENDUM.md` 3.5 and `MASTER_SPEC.txt` sections 5/16. API references: [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [resize](https://sharp.pixelplumbing.com/api-resize/), [output](https://sharp.pixelplumbing.com/api-output/), [Supabase functions](https://supabase.com/docs/guides/database/functions).

## Constraints

- Final images from an active linked approval only; no stock images, private paths, public signed thumbnails or new persistent media objects.
- Thumbnail bounded at 160×90, inside fit/no enlargement, metadata stripped; original file/approval/hash unchanged. Max input 8 MiB/40M pixels, bounded native timeout, output cap 64 KiB.
- 30 thumbnail attempts per actor/minute, separate from other command/export budgets; actual active role and JWT checked. User cannot reset or supply the budget.
- Private no-store bytes and existing 30-second/rights deadline. Object URL revoked on expiry, unmount, option off or scope change; no automatic refresh of expired images.
- Checkbox off by default, thumbnail only first final image, serial lazy requests. A failed image leaves the card/status usable and does not invalidate workspace access.
- Local additive migration only. No hosted schema writes, external accounts, push or deploy.

## Steps

- [x] Write failing transform/endpoint tests and SQL budget tests; run to confirm missing behavior.
- [x] Implement fixed image transform, thumbnail query variant, post-transform scope checks, budget migration/readiness marker and regression fixtures.
- [x] Add serial viewport-loaded Calendar thumbnails, private lifecycle tests and browser checks for reduced dimensions, no default fetch, expiry/revocation and keyboard/scope behavior.
- [x] Run unit/API/SQL/build/browser checks, review and inspect desktop/mobile; update usage, runbook, dependency inventory and commit scoped changes.

## Review focus

Stale approval/version, revocation while rendering, malformed or huge raster, metadata leakage, failed/busy native transform, direct-RPC budget bypass, queued request after unmount, delayed body after scope change, expired tab return and hidden thumbnail auto-reloads.

## Verification · 2026-11-08

- `pnpm verify`: lint, TypeScript, 207 unit/API tests, dashboard release checks and production build passed.
- Disposable PostgreSQL: nine SQL suites (including thumbnail budgets) and 13 API-parser/RPC roundtrips passed with all nine Marketing migrations.
- Production browser harness: 33 checks, no page errors, one legacy iframe load. Verified opt-in loading, real WebP decode at 90×90 for the square fixture, expiry without refetch, revoked-source denial and existing Calendar/approval/editing flows.
- Original bytes/metadata stay unchanged; derived pixels strip metadata. API tests revoke rights/remove RLS-visible jobs/change the sealed digest after actual native transformation and confirm no bytes are released.
- Independent review found one harness decode race, corrected by awaiting `image.decode()` before dimension assertions; no remaining actionable findings. Desktop thumbnail and mobile Calendar regression screenshots inspected.
- Migration remains local. Hosted Storage, production platform native binaries, real-account RLS, advisors and load acceptance remain staging work; no live publish or deploy performed.
