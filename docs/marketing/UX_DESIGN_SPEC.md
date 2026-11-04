# Marketing UX implementation

The table below is the preserved Phase 1 snapshot. Current Phase 2/3 behavior is described in the later sections and phase reports.

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

## Phase 2 — Knowledge workflow

Agent has internal Research, Idea Radar, Weekly Planner and Knowledge Review tabs. Sources/facts are human reviewed; evidence carries source/fact versions. Auto/Internal Only perform real internal keyword search, Deep Research honestly remains unconfigured. Rule-based proposals are labeled as not AI; only explicit selection makes a normal Draft. Revoked evidence hides generated text/actions and remains visible as an issue in Studio. Brand Kit contains the versioned Master/Team/Post DNA proposal/diff/confirmation workflow. See PHASE2_REPORT.md for boundaries.

## Phase 3 — Assets and Creative contract

Keep the same eight routes/sidebar items, logo, tokens and caption/evidence flow. Assets contains real upload/index/rights, Drive connection state, Templates and existing Brand Kit tabs. No sample image appears as a real asset. Upload form requests original author/provenance and optional event/tags/Campaign; a ready file still has Needs Review rights. Detail shows original dimensions/source and scoped manager review. Digest duplicates are advisory exact matches, no semantic claims or automatic deletion. Drive remains not connected.

Saved content gets a lazy Creative Workbench with page canvas, layer list/properties and current assets. New content first uses the normal caption form. The default editable design is created only explicitly; variants are separate records. Format changes retain scene, caption and selected image references. Text/shape/image layers have numeric geometry, rotation, opacity, bounded style and lock; logo uses contain. Page/layer reorder and numeric controls provide keyboard alternatives to drag. Local undo/redo stays local until explicit save. Existing content version/history is invalidated by design changes; a clean caption can adopt the new version, dirty caption remains untouched and uses explicit conflict recovery.

Version history and template application restore into the current design only after explicit choice and expected-version checks. Personal templates remain private; shared templates follow submission/manager review; Official requires Admin and has no team-bound photos. Apply/save/restore must preserve a dirty scene until the user explicitly adopts/discards or saves it.

Preflight distinguishes hard blockers (missing/wrong-scope/unready/expired/revoked rights) from manual review warnings. Server export checks latest design/evidence/rights; browser fetches current private raster bytes and exports saved pages to PNG. A local PNG download is not publishing, approval or a remotely stored final creative. AI layout, semantic asset discovery, advanced crop/style tools, automatic brand/font validation, Drive sync, video and server render are not implied by the manual editor.

Use stacked panels at mobile width, fixed aspect canvas with fit/zoom inside its region, visible labels/focus and named controls. Do not resize/remount the legacy iframe when Creative assets load. Browser fixture screenshots are labeled illustrative and must not be represented as real campaigns/photos.
