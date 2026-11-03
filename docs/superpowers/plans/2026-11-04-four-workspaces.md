# Four ColorME Workspaces Implementation Plan

> **For agentic workers:** use superpowers:executing-plans for sequential implementation with one final independent review.

**Goal:** Redesign only Truyền thông, Ấn phẩm & Kho, Học bổng and Task hàng ngày as modular workspaces matching the approved overview, preserving every operation.

**Architecture:** Keep all original renderer/data/permission functions. A dedicated `CLMWorkspaces.present(page, markup)` adapter moves original DOM nodes into scoped presentation containers; `afterRender(page)` animates only these routes. New CSS starts at `.cos-workspace`. The existing overview adapter/CSS/tokens, logo and shell remain byte-identical. Production entry remains the authenticated Next.js private shell endpoint.

**Tech Stack:** Existing vanilla HTML/CSS/SVG/WAAPI inside Next.js16 private iframe; no dependencies.

**Spec:** COLORME CREATIVE OS — REDESIGN 4 REMAINING TABS, supplied 2026-11-04; production baseline `38da3a8`. Preview delivery only; production release requires later review.

## Global Constraints

- Four routes only: truyenthong/anpham/hocbong/phoihop. No other route styling or structure changes.
- Keep API/auth/Sheet/Supabase/data/calculation functions and all inline event handlers/IDs unchanged.
- No zoom/scale compensation, new workflow, invented metric, status, chart series or persistent mascot over data.
- Keep existing detail modals, conditional columns, pagination and task drag/drop behavior exactly.
- Separate branch `codex/four-workspaces-redesign`; preview only; never push main/promote production.

## Design and approaches

Selected: a dedicated scoped adapter, reusing original nodes/controls/values/SVGs. This permits structural KPI hierarchy and wider table/chart placement while preserving handlers. CSS alone cannot change the equal-card hierarchy adequately; rewriting renderers/React migration increases business risk and is rejected. These are implementation decisions within the supplied detailed brief, not a new visual direction.

White/ink panels, existing neutral surface and semantic ColorME tokens,18px radii,16px modular gutters,20–24px padding. Body/table12–13px, clear numeric hierarchy, readable minimum day/card width. Media emphasizes reach and OnAir with supporting metrics, two comparable charts plus a wide reach chart and full-width tables. Inventory separates financial primary/supporting stock metrics, wide inventory analysis and a supporting category chart. Scholarship uses a primary issued summary with supporting state cards, distribution and full-width recipient table. Tasks use a compact summary, two-row labeled toolbar, full-width locally scrollable calendar and separate meetings section. No added business copy or changed labels.

## Review Focus

1. Media reward/reach/engagement missing flags hide columns; preserve null/zero and conditional KPIs.
2. Inventory course switching must not alter latest-year costs; negative stock retains reconciliation text.
3. Scholarship recent filter uses latest received date, not today; pagination/search/year/expiry remain unchanged.
4. Task metrics are unfiltered; meetings are separate/unfiltered; permissions distinguish edit vs status; existing shift state and badge logic remain intact; dormant wrapper stays dormant.
5. Overflow stays inside table/calendar; overview must have identical DOM/geometry and screenshot before/after, including mascot/reduced motion.

## Execution ledger

### 1. Audit, fixtures and baseline
- [x] Add rich synthetic fixtures for all four routes.
- [x] Capture before at1920×1080,1440×900,1366×768,1280×800, plus overview guard.
- [x] Record computed page/ancestor width, caps, transforms and fonts; do not infer a nonexistent shrink cause.
- [x] Add a real-browser test that fails because the four scoped workspaces do not exist yet. Preserve snapshots of original controls/handlers/tables/SVG values for parity.

### 2. Scoped foundation
- [x] Add workspaces.css/js, private HTML imports and presentation hooks. Adapter returns original markup for every other route.
- [x] Use full available width, min-width0 and local overflow. Test overview source/screenshot unchanged and width fill without zoom.

### 3–6. Sequential tab redesign
- [x] Media: move original metrics/chart/table nodes into primary/supporting regions; retain all controls/conditional series/pagers.
- [x] Inventory: primary finance card/support stock, asymmetric analysis, full-width inventory and budget tables.
- [x] Scholarship: primary allocation/supporting stats, paired distribution/tier table, full-width list/search/pager.
- [x] Task: full-width calendar wrapper, readable cards and labeled toolbar; unchanged calendar renderer/actions; separate meetings scoped panel.
- [x] After each route, compare exact original metric/table/handler/option signatures and run its real filter/navigation/modal tests.

### 7. Presentation motion
- [x] Use restrained opacity/value-change/chart entrance feedback with real final values, no zero count-up or replay on unchanged renders. Reduced-motion returns static final state.
- [x] Modal feedback applies only when opened from a scoped workspace, without changing modal code or global overview motion.

### 8. Verification/review
- [x] Four-size screenshots for each route; mobile1024/768/390 containment; long task titles and large table values.
- [x] Test media pagers/filters, inventory snapshots, scholarship search/page/expiry, task filters/week/month/list and create/edit/duplicate/move/status/meeting dialogs and role restrictions in isolated data.
- [x] Run project verify, old overview/mascot QA, dedicated workspace parity QA and independent whole-branch review; fix important findings.

### 9. Preview delivery
- [x] Generate labeled offline preview with all assets inlined and synthetic data only, preserving existing overview preview files.
- [ ] Commit/push only this separate branch and verify Vercel preview build; no production mutation. Protected preview access limitations must be disclosed; provide local offline review regardless.
- [ ] Deliver screenshot comparison, audit/parity report, preview links and explicit production-unchanged status.

## Evidence and rulings

- Actual PAGES binding uses the original task renderer. A later reassignment adding a shift dropdown/mentor panel is dormant; activating it would add behavior and is outside scope.
- The original 1680px cap affects three routes at 1920px. At 1440px and below these routes already fill available width; narrow internal grids and small text explain density, not a global zoom/scale.
- Original business renderer/helper/permission/action bodies remain identical to baseline. Reuse one shared scoped adapter rather than overlapping per-tab rewrites.
- Final browser QA: 47 parity cases, 49 interactions, 52 before/after/detail captures; zero runtime errors. Overview in fresh equal-viewport contexts: identical DOM, descendant/pseudo computed styles, geometry, original assets and zero differing pixels.
- Screenshot setup normalizes scroll, pointer, fonts, motion and initial viewport history. Old unequal viewport histories could cache different rasterization of the original filtered decorative SVG. No screenshot masks or forced product styles.
- Modal opening, fields, actions and role restrictions were compared; mutations were not submitted to live APIs. No database writes.
- Project verify: lint/typecheck, 59 tests and production build passed. Offline preview and prior Overview/mascot QA passed.
