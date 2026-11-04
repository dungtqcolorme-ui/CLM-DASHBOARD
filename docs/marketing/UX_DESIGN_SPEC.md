# Marketing UX implementation — Phase 1

The supplied addendum takes priority for navigation: exactly one Marketing disclosure and eight child entries. The current implementation uses the original ColorME logo with contain sizing, the existing red/ink/neutral shell, 14px main body, 12–16px operational text, 12px bordered cards and restrained focus/hover states. Tokens are scoped to `.mk-root`; no global redesign is applied. No official brand color or mascot identity is invented.

Desktop sidebar is 252px, 224px at narrower desktop; Marketing header holds context. At ≤1180px the Studio reduces columns and overview stacks. At ≤760px the sidebar is a disclosure-controlled drawer, main controls become touch friendly and the Studio stacks caption before context. Reduced motion disables animation. Native controls, semantic labels, keyboard disclosure, visible focus and native dialog details are used. Dense calendar cells can scroll inside their own region; the document must not overflow.

| Screen | Implemented behavior | Boundary |
|---|---|---|
| Overview | Real in-app campaign/content/review counts, upcoming planned items, deadline work and Admin team setup | Organic values unavailable; no synthetic production metrics |
| Campaigns | Real list, search, status/type/team filters, create form and ID detail tabs | Board/timeline not advertised as working |
| AI Agent & Ideas | Explicit research/caption idea capability and phase state | No live chat/research tool or generated design |
| Creative Studio | Three-panel caption draft workflow, manual caption, creator/assignee, production/review/proposed times, saved preview and revisions | No canvas layers/carousel/video; media and AI controls are not fake buttons |
| Content Calendar | Month/week/list, real persisted proposed times, status/line filtering and native detail dialog | Proposed time differs from verified Meta schedule; no drag-reschedule promise |
| Assets & Templates | Phase/connection states explain rights/folder/brand prerequisites | No assets seeded, fake thumbnails, folder grants or false Drive connection |
| Intelligence & Reports | Real production summary and honest missing Organic data | No synthetic trend chart or report export |
| Approval Inbox | Actual submitted/sent/changes-requested items, eligible different-creator manager request changes | Approve & schedule unavailable until verified connector, snapshots and gateway exist |

Shared Plan autosaves after 850ms only when mix/KPI fields are valid. Each save uses the original expected version. A conflict blocks autosave, preserves the local draft and offers copy, fetch latest and explicit server-version adoption. A local unsaved plan blocks submitting/activating a different snapshot. Strategy and caption draft caches are scoped by user UUID. Official KPI targets display separately from actuals; active official edits are not silently applied.

All initial reads have skeleton, missing session, missing schema, retry and empty states. Viewer sees read-only data and no write actions. Backend permission failures remain authoritative even when a button was previously visible. A sign-out or 401/403 clears loaded data, and a stale in-flight read cannot restore another session's workspace.
