# Four workspace visual redesign — review report

Date: 2026-11-04. Baseline: `38da3a834d6109d963dc466119abe9b3e8dcbf41`. Branch: `codex/four-workspaces-redesign`. Target: preview only.

## Scope and implementation

Only Truyền thông, Ấn phẩm & Kho, Học bổng and Task hàng ngày receive presentation changes. The authenticated Next.js `/api/dashboard/shell` still serves `dashboard/clm-dashboard-private-34.html`; this is the actual application entry, not an unused preview.

The private HTML loads two scoped assets and calls a presentation adapter. Original renderer, data, calculation, permission and action functions remain unchanged. The adapter rearranges their rendered nodes, preserving control attributes, inline handlers, original values, chart geometry, tables and conditional columns. No dependency, API, auth, database schema, Supabase query, Sheet mapping, status or workflow changes.

Approved Overview assets, logo, mascot controller, sidebar and topbar sources remain unchanged. The adapter returns other routes' markup untouched. Dialog styling and decorative success feedback apply only when entered from these four workspaces.

## Measured layout causes

| Viewport | Available inner width | Original media width | Original inventory/scholar/task width | New four-route width |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | 1808px | 1808px | 1680px | 1808px |
| 1440×900 | 1328px | 1328px | 1328px | 1328px |
| 1366×768 | 1254px | 1254px | 1254px | 1254px |
| 1280×800 | 1168px | 1168px | 1168px | 1168px |

The 1680px page cap creates side whitespace at 1920px on three routes. It does not explain density at smaller desktop sizes. Media's narrow filter columns and split chart/table grid, equal-weight small metric cards and compact table typography also contribute. Computed zoom was 1 and page transform none; no global scale defect was reproduced. The new layout uses fluid width and local table/chart/calendar overflow, without zoom/scale compensation.

## Visual changes

| Workspace | Presentation |
| --- | --- |
| Truyền thông | Primary Reach metric (On Air fallback when Reach is absent), supporting metrics, comparable status charts and visible Reach trend, full-width course and staff tables. |
| Ấn phẩm & Kho | Primary cost summary, supporting budget/stock metrics, asymmetric stock/category analysis and full-width inventory and budget tables. |
| Học bổng | Primary issued allocation, supporting usage states, distribution and tier table, full-width recipient list. |
| Task hàng ngày | Consistent summary, two-row labeled toolbar, seven readable day columns within local horizontal scrolling, separate meetings section. Week/month/list actions retain their original logic. |

Motion uses brief real-value opacity transitions, chart entrance on route entry, filter feedback, hover and scoped dialog/success feedback. It does not replay chart entrance for every filter. Reduced-motion users get static final states. Official artwork is reused.

## Functional regression evidence

Browser tests compare baseline and redesigned renderings with the same synthetic fixture and state. They compare metric text, all table headers/cells, chart text, task IDs and controls/handlers/options/disabled states. Original business-function bodies are also compared directly.

| Area | Verified |
| --- | --- |
| Media | Course, month/undated and PIC filters; reset of both pagers; each pager; missing reward/Reach/Engagement columns; zero versus missing source values. |
| Inventory | Default latest course and course switching, snapshot values, cost-year independence, negative stock reconciliation, tables/chart series and empty state. |
| Scholarship | Year, tier, search, expiry, recent toggle, pagination and empty state; existing latest-received-date recent logic retained. |
| Tasks | Four native filters/reset, existing shift state, week navigation, week/month/list, four roles, empty state and original unfiltered summaries/separate meetings. |
| Dialogs | Create, detail, edit, status, duplicate, move date and meeting dialogs: opening, fields/actions, and closing compared. |
| Overview | Returning from four routes preserves original values/controls. Fresh equal-viewport contexts have identical DOM, computed styles including descendants/pseudo-elements, geometry and approved asset bytes; final screenshots have **0 differing pixels** out of 1,296,000. |

A later reassignment of `renderPhoiHop` includes a shift dropdown/mentor panel, but the live `PAGES.phoihop` map captured the original renderer earlier. This dormant wrapper was left dormant; no feature activation was included.

Final focused result: **47 parity cases, 49 interactions, 52 screenshots, zero runtime exceptions**. Captures include before/after for all four tabs at 1920×1080, 1440×900, 1366×768 and 1280×800; additional after captures at 1024, 768 and 390px; and eight scrolled/detail views. Page overflow is contained; computed zoom is 1. Normal-motion entry and changed-value feedback were exercised as well as reduced motion.

`node scripts/verify.mjs` passed lint, typecheck, **59/59 tests**, and Next.js production build. Existing Overview/mascot regression passed five course cases and 29 role/module visits. Both old preview and the new four-tab offline preview passed. The latter makes no network requests and keeps the original Overview reachable.

### Limits

These interaction tests use isolated synthetic data and mock networking. Dialog mutations were not submitted to live APIs; no live task creation, edits or status writes were performed. This is evidence for presentation parity plus unchanged operation sources, not a claim of live CRUD end-to-end testing. Production remains on the approved baseline while this branch is reviewed.

## Review artifacts

Generate the self-contained synthetic preview with `node scripts/create-creative-os-preview.mjs --workspaces`.

Local artifacts (not published source/data):

- `preview/creative-os-four-tabs.html`: interactive preview, all assets inlined, labeled illustrative data.
- `preview/four-tabs-comparison.html`: four 1440×900 before/after pairs.
- `tmp/workspaces/qa-results.json`: exact cases, geometry, interactions and capture paths.
- `tmp/workspaces/`: complete four-viewport image matrix, extra responsive/detail captures and validation logs.

The existing overview preview files are preserved. No environment/protection/project-wide setting is changed to enable preview. Deployment details are recorded separately after the branch build.
