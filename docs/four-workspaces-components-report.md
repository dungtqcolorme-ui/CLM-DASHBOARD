# Four workspaces — component redesign completion

Date:2026-11-04. Branch:`codex/four-workspaces-redesign`. Component baseline:`50b3af1`; original production baseline:`38da3a8`. Scope remains presentation only, preview delivery only.

## Component quality matrix

| Workspace | Cards | Existing charts | Tables | Motion |
| --- | --- | --- | --- | --- |
| Truyền thông | Dark primary Reach/On Air fallback; peach On Air/completion secondary; smaller white supporting cards. | Both donuts and Reach line restyled; matching warm/charcoal/sage/neutral legends, refined axes/gridlines/type and original-title tooltip. | Both course/staff tables, numeric columns, cohort chips, row states and both pagers restyled. | Card/section entry, actual changed-value/chart feedback, filter/layout feedback, tooltip fade and hover states. |
| Ấn phẩm & Kho | Primary cost, wide secondary budget, compact supporting inventory summaries; missing decorative budget glyph supplied. | Existing grouped HTML bars and cost SVG bars retain heights, scales and values; matching legends, rounded bars and subtle gridlines. Cost category labels wrap without dropping words; enlarged axes remain legible at real display size. | Inventory and budget tables, quantity/cost alignment, stock-status badges and locally sticky headers restyled. | Entry, changed series feedback, filter/layout update, tooltip and hover feedback. Unchanged cost chart does not replay on course change. |
| Học bổng | Primary issued, sage secondary used, white remaining/valid cards. | Existing expiry donut keeps all values and meanings with coordinated semantic colors and original labels. | Tier and recipient tables, recipient/code hierarchy, text-plus-dot state badges, local sticky headers and pagination restyled. | Entry, changed allocation feedback, search/filter/layout transitions and existing dialog treatment. |
| Task hàng ngày | Primary total, sage in-progress secondary, supporting completion/meeting cards; task, calendar and meeting surfaces refined. | No chart exists in the active task renderer. No new visualization or data feature added. | All eight original list columns retained with readable widths and local horizontal scroll; status/focus/hover/action states, calendar cards, menus and meeting section restyled. | Page/component entry, week/month/list changes, changed task-card status, filter feedback and existing-modal entry use Motion; hover/selection styling stays bounded. |

Three card tiers differ in color, spacing, proportion, value typography, icon treatment and hover. All original metric labels, numbers and contexts survive. Secondary cards are grouped first for consistent visual reading order; no control order or business operation is changed.

Chart marks are recolored in the presentation adapter alongside their legends. Original path/rect/circle coordinates, dash arrays/offsets, bar heights, chart type and native titles remain identical. Styled tooltip text comes from those original titles and is inserted using `textContent`. The old reward chart used two different gray codes for the same neutral series/legend; both now map to the same neutral token. No calculation is introduced.

Table headers stick inside bounded scroll containers, rather than changing the application scroll shell. All columns remain present. Existing focus/selected states are styled; no row-selection workflow is added. Long task/people content is allowed to wrap, while a local scrollbar preserves readable column widths and access to actions.

## Motion integration and performance scope

Official Motion14.9.0 is version pinned and self hosted with its MIT notice. Raw runtime179011 bytes; gzip59642 bytes. Browser integration follows https://motion.dev/docs/quick-start and https://motion.dev/docs/animate. No framework migration, CDN dependency or package/lockfile change.

Motion calls are limited to opacity/short translation for scoped cards, chart marks, filter/layout feedback, calendar/view changes, changed task records and existing dialogs. Chart signatures suppress unchanged replays. Rerenders cancel outstanding scoped animations; duplicate callbacks for the same root do not restart effects. Completion removes temporary opacity/transform styles. Reduced-motion skips the runtime calls and cancels active effects when the preference changes. No looping timelines, continuous pointer tracking or animation-driven data updates are introduced.

No complex transition requires GSAP. No prepared `.riv` asset/runtime exists in this implementation, so the official SVG mascot/controller remain unchanged; success styling reuses the existing artwork.

## Verification

- A browser component guard first failed for missing three-tier card surfaces, then passed after implementation.
- Final component guard checks all four routes: distinct surfaces, chart geometry/title/data identity, series-to-legend matching, readable axis/table styling, tooltip content/show/hide, real local sticky behavior, actual Motion calls, changed data versus unchanged render, week navigation, changed task status, dialog entry and reduced motion.
- **40 component captures:**32 before/after screenshots at1920×1080,1440×900,1366×768,1280×800;8 chart/table/meeting detail views.
- Existing full functional guard: **47 parity cases,49 interactions,52 screenshots,zero runtime errors**. Filters/pagers/search, missing/zero data, empty states, four roles, week/month/list and original create/edit/status/duplicate/move/meeting dialogs retain their original fields/actions.
- Approved Overview: original DOM, descendant/pseudo computed styles, geometry and asset bytes match; screenshot difference **0 pixels** out of1296000.
- Project verification passed lint/typecheck, **59/59 tests** and Next.js production build. The latest offline preview passes with no network requests; all four tabs and original Overview are reachable.
- Independent review was attempted but the reviewer service returned a usage-limit error. Final source and component-image review was performed locally; no independent approval is claimed for this component pass.

### Verification limits

All browser interaction tests use isolated synthetic data and mock networking. Task status animation is exercised by changing synthetic in-memory state. No live mutation, real account/data change or production deployment was performed. These tests establish presentation parity and unchanged business sources; they are not a live CRUD end-to-end certification.

## Review artifacts

- `preview/creative-os-four-tabs.html`: latest interactive offline preview, illustrative data, all assets including Motion embedded.
- `preview/four-tabs-components.html`: component-before50b3af1/after comparison at all four desktop sizes and eight component detail views.
- `preview/four-tabs-comparison.html`: original38da3a8/after1440×900 comparison.
- `tmp/workspace-components/`: full component captures, guard results and app/preview/functional logs.
- `tmp/workspaces/`: original baseline/responsive/detail captures and full functional results.

Main and the production alias remain unchanged. Branch preview deployment status is recorded in a local delivery receipt after the build.
