# PHỤ LỤC UI/UX V1.0 — COLORME PARTNERSHIP MARKETING AGENT

> **DÁN PHẦN NÀY NGAY SAU MASTER PROMPT.** Đây là đặc tả UI/UX BẮT BUỘC, bổ sung và cụ thể hóa phần navigation, layout và thiết kế của Master Prompt. Nếu mô tả UI/navigation trước đó khác phụ lục này, ưu tiên phụ lục này; các nguyên tắc bảo mật, phân quyền, approval, Meta, asset rights và không sinh ảnh/video/giọng AI trong Master Prompt vẫn giữ nguyên.
>
> Yêu cầu: **Triển khai giao diện thực tế trong repo `dungtqcolorme-ui/CLM-DASHBOARD`**, dùng Next.js/React/TypeScript/Tailwind phù hợp codebase đang có. Không chỉ làm hình mockup, không thay thế các màn hình cũ. Ngôn ngữ giao diện: tiếng Việt; tên một số sản phẩm chức năng có thể giữ bằng tiếng Anh khi đã được thống nhất.

## 1. QUYẾT ĐỊNH THIẾT KẾ ĐÃ CHỐT — KHÔNG ĐƯỢC TỰ ĐỔI

**Chỉ có MỘT mục chính `Marketing` trong sidebar cấp 1 hiện tại.** Khi click, `Marketing` hoạt động như một accordion/dropdown để mở/đóng **chính xác 8 mục cấp 2**. Không thêm 8 mục con ngang hàng với các module cũ; không tạo thêm sidebar cấp 1 thứ hai gây rối.

Giữ nguyên các module/tab cũ, thứ tự và nội dung hiện có theo code thực tế; ví dụ Tổng quan, Ấn phẩm, Đối ngoại, Task hàng ngày. Không đổi tên hay thay icon/navigation của các module cũ chỉ để khớp mockup. Chèn Marketing ở vị trí phù hợp trước phần tài khoản/cài đặt, sau các nhóm công việc đang có.

Sidebar cấu trúc logic bắt buộc:

```
[Existing sidebar items — GIỮ NGUYÊN]
...
▾ Marketing                           ← 1 cấp chính, icon megaphone
    ├── Marketing Overview            ← icon layout-dashboard / house
    ├── Campaigns                     ← icon folder-kanban
    ├── AI Agent & Ideas              ← icon brain-circuit
    ├── Creative Studio               ← icon pen-tool
    ├── Content Calendar              ← icon calendar-days
    ├── Asset & Template Library      ← icon images
    ├── Intelligence & Reports        ← icon chart-no-axes-combined
    └── Approval Inbox                ← icon check-check
[Existing settings/account items — GIỮ NGUYÊN]
```

Tám mục này là **navigation entries**, không có nghĩa mọi tính năng/campaign tạo thêm nav ngang hàng. Các tab con trong Campaign hoặc Creative Studio nằm ở cấp nội dung (tabs/breadcrumbs), không lặp trên sidebar chính.

Định tuyến (đề xuất chuẩn; kiểm tra routing hiện có trước khi quyết định path):
- Marketing Overview: `/marketing`
- Campaigns: `/marketing/campaigns`
- AI Agent & Ideas: `/marketing/agent`
- Creative Studio: `/marketing/studio`
- Content Calendar: `/marketing/calendar`
- Asset & Template Library: `/marketing/assets`
- Intelligence & Reports: `/marketing/intelligence`
- Approval Inbox: `/marketing/approvals`

Trong Campaign, dùng routes theo ID, ví dụ `/marketing/campaigns/[campaignId]` và tabs `overview`, `strategy`, `content-plan`, `assets`, `insights`, `calendar`. Chỉ chọn URL khi phù hợp Next App Router và hệ thống route/auth hiện hữu. Có redirect/back compatibility nếu phải đổi route.

**Quy tắc tương tác sidebar:**
1. Click vào hàng `Marketing` bật/tắt submenu; chevron đổi down/right; mở/đóng có animation nhẹ 150–220 ms, tôn trọng `prefers-reduced-motion`.
2. Khi đang ở bất kỳ route `/marketing/**`, mặc định submenu **mở** khi vào trang qua deep link/refresh. Sau thao tác người dùng chủ động thu gọn, có thể lưu sở thích phiên làm việc; khi điều hướng sang một route con, phải mở lại để user thấy mục active.
3. Mục đang active có nền/viền/typography nổi bật nhưng tinh tế; `Marketing` parent cũng có active indication; dùng `aria-expanded`, `aria-controls`, `aria-current="page"`, focus keyboard đầy đủ.
4. Toàn bộ row của item click được; icon và nhãn nằm cùng hàng; không thu hẹp vùng click thành phần chữ; đảm bảo touch target khoảng 40–44px trên thiết bị cảm ứng.
5. Khi sidebar thu gọn toàn app, hiển thị icon Marketing và tooltip; click mở flyout/submenu hoặc điều hướng theo pattern đã có, tránh submenu bị cắt bởi overflow.
6. Giữ scroll position/sidebar expansion khi chuyển giữa 8 trang, không reload iframe hoặc remount toàn bộ dashboard vì mở dropdown.
7. Phân quyền: chỉ hiển thị các mục user có quyền xem; `Viewer` có thể xem màn hình được phép, nhưng chức năng sửa/duyệt phải ẩn hoặc disabled có giải thích. Marketing Settings/Connectors là trang cấu hình bên trong Marketing Overview/Admin area với quyền Admin, không phải mục cấp 1 mới hoặc mục thứ chín mặc định.
8. Breadcrumb nội dung ví dụ `Marketing / Campaigns / Chào Tân 2027 / Content Plan` và back navigation chuẩn. Active state chính xác kể cả dynamic routes, search params và refresh.
9. Empty/loading/error/permission denied states phải thật, không gắn nhãn Connected hay mock số liệu nếu chưa có dữ liệu.

## 2. VISUAL DNA — HIỆN ĐẠI, CREATIVE, PROFESSIONAL

Lấy **nguyên lý UX**, không sao chép pixel/assets/source code, từ:
- **Linear**: thông tin gọn, project hierarchy, list/timeline, keyboard-first, disclosure tinh tế.
- **Planable**: content calendar, social preview, workflow draft/review/approved/published, collaboration.
- **Figma**: canvas chính giữa, layers/properties bên phải, thao tác kéo thả và chỉnh từng đối tượng.
- **Brandfolder**: asset grid, metadata filters, quyền sử dụng, preview.
- **Descript**: video preview, transcript và timeline, basic editing dễ tiếp cận.
- **Sociofy/SaaS analytics inspiration**: KPI dashboard và visual hierarchy cho báo cáo; dùng làm moodboard, không dựa vào số liệu demo.

Tên định hướng: **ColorME Creative SaaS / Modern Marketing Workspace**. Nhẹ, sáng, chính xác, ít hiệu ứng thừa. Tạo trải nghiệm nhất quán với dashboard đang chạy; không biến Marketing thành một website khác brand.

### Theme & tokens
- **Ưu tiên phân tích và tái sử dụng theme/token/font/logo/sidebar spacing hiện hữu** trước khi tạo token mới; những giá trị dưới đây chỉ là fallback nếu codebase chưa định nghĩa.
- Neutral light: canvas `#F7F8FA`, surface `#FFFFFF`, ink `#222326`, muted ink `#667085`, subtle border `#E6E8ED`.
- Primary accent: lấy từ **Brand Kit ColorME đã xác minh**. `#EF5458` chỉ là đề xuất UI accent tạm thời, **không phải khẳng định là mã màu chuẩn thương hiệu**; không hard-code toàn app trước khi xác minh.
- Content-line label chỉ mang tính phân loại: ColorMAP warm pink, Sharing sky blue, Meme soft green, InsideME lavender. Không bắt buộc lấy pastel đó làm palette thương hiệu, không tô các mảng lớn rực màu.
- Semantic states: Approved/success, Warning/risk, Critical/error, Draft/neutral và Pending/in review; không truyền đạt trạng thái chỉ bằng màu; có text/icon.
- Light mode mặc định nếu dashboard đang dùng light; dark mode chỉ bổ sung khi hệ thống có hạ tầng theme phù hợp, không phải điều kiện chặn phase đầu.
- Typography: giữ font đang được dự án dùng; nếu chưa có hệ thống text styles, định nghĩa display/headline/body/label/caption scale hợp lý, ưu tiên `14–16px` cho nội dung chính, bảng dữ liệu tối thiểu dễ đọc. Không dùng chữ 10px cho nội dung nghiệp vụ trên desktop.
- Spacing scale 4/8/12/16/24/32 px; card radius cỡ 10–14px; shadows rất nhẹ hoặc chỉ viền; border 1px tinh tế; không dùng glassmorphism nặng, gradient neon, màu quá nhiều.
- Responsive: desktop full workspace; tablet điều chỉnh hai cột; mobile ưu tiên xem nội dung, lịch, duyệt, preview; editor timeline/layer nâng cao tập trung desktop.
- Dùng SVG/icons có sẵn hoặc Lucide nhất quán; không dùng emoji thay icon hệ thống.

### Mật độ và phân cấp
- Đảm bảo sidebar đọc dễ, các submenu không cách nhau quá rộng; nav active rõ.
- Header mỗi màn có title + 1 dòng mô tả ngắn (nếu cần), breadcrumb, primary action ở góc phải; không có 3 CTA chính cùng nổi bật.
- KPI lớn dễ đọc, ghi rõ thời gian và nguồn dữ liệu; `null/unavailable` hiện `Chưa có dữ liệu`, không hiện số `0` giả.
- Với bảng nhiều cột: sticky header, filter, search, sort, pagination/virtualization; column density hợp lý, không kéo ngang mặc định trên desktop nếu không cần.
- Layout loading dùng skeleton tương ứng, trạng thái lỗi có retry/copy lỗi phù hợp, never fake progress.
- Tôn trọng dữ liệu thật: các con số và hình ảnh bên trong mẫu demo phải có `Dữ liệu minh họa` rõ ràng, và không được xuất hiện như dữ liệu production.

## 3. WIREFRAME / UX CONTRACT CHO 8 SUBMENU

### 3.1 Marketing Overview (`/marketing`)
Mục tiêu: Landing của team Partnership, 1 màn nhìn rõ cần làm gì.
- Header `Marketing` + chọn Campaign gần đây và action `Tạo Campaign` (nếu được quyền).
- Hàng KPI: Active Campaigns, Planned/Drafts, Waiting Approval, Scheduled/Published, Data Freshness — tính từ data thật theo quyền.
- Main 2 cột desktop: `Campaign Health / Upcoming Calendar` và `AI Insights / Alerts`.
- Khu vực `Việc cần xử lý` hiển thị các bài sắp trễ, request review và lỗi xuất bản có deep link.
- Team activity feed và những draft gần đây; các card nhỏ không thay thế bảng chi tiết.
- Cấu hình Meta/Drive chỉ đặt trong khu vực Settings có quyền phù hợp.

### 3.2 Campaigns (`/marketing/campaigns`)
- Header + `Tạo Campaign`.
- Chuyển view `List / Board / Timeline` (ít nhất List dùng thật giai đoạn đầu, view khác có thể feature-flag nếu chưa triển khai).
- Filter: Active / Draft / Pending Activation / Paused / Completed / Archived; Seasonal / Always-on; assignee/team.
- Campaign row/card có tên, loại, hoạt động con, người phụ trách, trạng thái, tiến độ đáng tin và mốc sắp tới.
- Detail có tabs nội bộ `Overview / Strategy / Content Plan / Calendar / Assets / Insights`, không làm sidebar dài thêm.
- Shared Content Plan editable bởi PR Representative và PR Leader, autosave + version history + conflict resolution; ColorMAP/Sharing/Meme/InsideME chỉ là labels/filter.
- KPI target và actual hiển thị getren biệt; KPI cuối chỉ Leader/Admin xác nhận khi kích hoạt. Không fake campaign score.

### 3.3 AI Agent & Ideas (`/marketing/agent`)
- Bố cục 2 cột: chat/brief phía trái hoặc chính, `Idea Radar / Evidence / Related Campaign` ở bên cạnh; mobile thành tabs.
- Các chế độ nghiên cứu `Auto / Internal Only / Deep Research` luôn hiển thị ngắn gọn, chỉ báo nguồn/độ mới thật.
- Prompt starter hữu ích: `Lên ý tưởng Sharing`, `Phân tích nội dung đã đăng`, `Gợi ý lịch tuần`, `Tìm ý tưởng ColorMAP`.
- Idea cards nêu Content Line, mục tiêu, hook, caption nháp, provenance, lý do, trạng thái đề xuất, duplicate warning.
- CTA chính `Chọn triển khai` mới tạo Creative Draft; chỉ nghiên cứu/chủ động đề xuất không kích hoạt thiết kế.
- AI tool actions phải qua backend security; không cấp quyền publish thẳng cho chat.

### 3.4 Creative Studio (`/marketing/studio`)
**Đây là nơi cần tập trung nhất về UX.** Workspace desktop 3 vùng resizable:
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb / Campaign / Content item / Save state / Preview / Send Review │
├─────────────────┬────────────────────────────────┬─────────────────────────┤
│ AI Chat          │ Canvas Preview                 │ Layers & Asset Explorer │
│ Research/Evidence│ Editable caption               │ Properties / Brand rules│
│ Context & History│ Page thumbnails (carousel)     │ Rights / File source    │
├─────────────────┴────────────────────────────────┴─────────────────────────┤
│ Optional Video Timeline / Transcript / Audio tracks (khi mode video)      │
└────────────────────────────────────────────────────────────────────────────┘
```
- AI chat có thể collapse; canvas có zoom/fit, grid/guides, safe margins; Properties thay đổi theo layer được chọn.
- Caption editor cho chỉnh trực tiếp, AI rewrite vùng đang chọn, version compare và lock approved pieces.
- Photo Dump / Graphic Carousel / Hybrid chuyển đổi giữ Content Source + Selected Assets + variant cũ.
- Trang carousel thêm/xóa/reorder, text/image/shape/logo layers, drag, crop, snap, undo/redo, lock layer, copy style, apply to all khi phù hợp.
- Mặc định **1 bản editable**, `Tạo thêm phương án` mới sinh variants; có compare, restore, không overwrite edits thủ công.
- Video cơ bản: preview + timeline tracks footage / text / captions / authorized audio; thao tác clip, subtitle và render status. Không đưa tính năng AI generated image/video/audio vào toolbars hoặc command palette.
- Label cảnh báo file thiếu rights, expired, unverified fact ngay tại panel; blocking errors phải ngăn `Gửi duyệt` đúng cách.
- Preview theo Facebook Partnership; Instagram/Threads chỉ xuất hiện khi Admin đã cấu hình capability hợp lệ.

### 3.5 Content Calendar (`/marketing/calendar`)
- Mượn nguyên lý Planable: Month / Week / List, filters Campaign, content line, status, channel, assignee.
- Calendar chips gọn, có thumbnail, status màu + text, proposed vs approved vs scheduled rõ ràng.
- Click một card mở drawer với preview caption/media, owner, approval stage, actual/target time và deep link tới Studio.
- Drag-reschedule chỉ cho quyền và trạng thái hợp lệ; đã Approved/Scheduled cần gửi duyệt lại nếu đổi lịch.
- Master Calendar hợp nhất tất cả Campaign, tránh xung đột, có giờ theo Asia/Ho_Chi_Minh.
- Không hiện bài giả do không có kết nối Meta; phân biệt planned in app vs remotely scheduled.

### 3.6 Asset & Template Library (`/marketing/assets`)
- Tabs nội bộ: `Assets / Drive Folders / Templates / Brand Kit`.
- Grid thumbnail có List view tùy chọn, search theo ngữ nghĩa, filter campaign/event/source/rights/media type.
- Asset card có source, rights badge, dimensions, selected usage, thumbnail; click mở detail drawer: metadata, versions, rights, exact provenance, usage in posts, `Dùng trong Studio`.
- Review rights status: Approved / Needs Review / Internal Only / Revoked; không chỉ dựa vào folder access.
- Google Drive: status thật, sync last time, permission/selection; Admin manages connection, Representative/Leader attach approved folders to Campaign.
- Duplicates grouped, never auto deleted; locked selections preserved.
- Template management: Personal Member, Team Leader-reviewed, Official Admin; preview editable layer, save as template, request team approval.
- Camera/event semantic tags không được suy ra danh tính cá nhân hoặc trường từ ảnh nếu metadata không xác minh.

### 3.7 Intelligence & Reports (`/marketing/intelligence`)
- Overview trend: Campaign health, Production KPIs, Organic-only results, Content Line comparison, Data freshness and sync coverage.
- View `Partnership Page / Per Campaign` and time window; charts must show actual metrics, scope and date, consistent denominator/age of posts.
- Organic excludes paid/boosted when not separable; unknown marked unavailable.
- Actionable Insights feed with priority, evidence link, recommendation, `Chấp nhận / Bỏ qua`, no auto-plan change.
- Weekly / Monthly internal reports auto-created and editable narrative; export PDF/XLSX; external formal sharing needs Leader/Admin approval snapshot.
- Do not use inspirational chart values in real UI. Empty states explain whether OAuth, permission or data is missing.

### 3.8 Approval Inbox (`/marketing/approvals`)
- Tabs `Cần tôi duyệt / Đã gửi / Changes Requested / Lịch sử` filtered by actual scope/role.
- Reviewer sees full immutable candidate: caption, all pages/video, target channel/account, source rights, planned time, creator, version diff and preflight results.
- Primary action `Duyệt & Lên lịch` only available to PR Leader/Admin DIFFERENT FROM creator; server validates again. Other actions `Yêu cầu chỉnh sửa`, `Từ chối`, `Mở Studio`.
- Never add `Approve Own` convenience action or auto approve from AI. Approval should not run directly from client call to unrestricted MCP; always via privileged server gateway.
- Clear `Scheduled`, `Published`, `Failed`, `Unknown` receipt state; unknown ≠ success.

## 4. NAVIGATION & CROSS-SCREEN UX

- Shared global Campaign Context selection remembered when navigating Campaigns → Agent → Studio → Calendar → Assets → Intelligence, but switching to page-wide view explicit and visible.
- Stable deep links `/marketing/studio?content=...`, `/marketing/campaigns/{id}` etc only after validating IDs/rights; no cross-team leakage.
- `AI Agent` entry from context cards should pass safe IDs (Campaign/Content/Asset), not arbitrary secrets or large raw blobs.
- User unsaved edits: autosave + optimistic concurrency; UI conflict resolution rather than silent overwrite.
- Scroll and dropdown expansion do not reset between child pages. Browser back/forward works; refreshing deep route restores appropriate selected view.
- A clear status distinction: Draft/Review/Approved/Scheduled/Published and Campaign Paused/Emergency Hold.
- Buttons: optimistic UI only for reversible local changes; never show green success before Meta or server confirms external action.

## 5. QUALITY GATES & IMPLEMENTATION DETAILS

- Build design tokens/components reusable **within Marketing** without rewriting legacy dashboard global styles. Prefer existing primitives; scope new CSS and avoid selectors that alter old iframe DOM.
- Components (conceptual): `MarketingSidebarGroup`, `MarketingBreadcrumb`, `PageHeader`, `StatusBadge`, `MetricCard`, `CampaignCard`, `ContentCard`, `ApprovalDrawer`, `AssetGrid`, `CreativeWorkbench`, `EditorToolbar`, `InsightCard`, `EmptyState`, `PermissionGate`.
- Support keyboard-only navigation, screen readers, focus management, contrast WCAG AA where achievable, text zoom, responsive and `prefers-reduced-motion`.
- Performance: code-split/lazy load canvas/video editor and expensive charts; paginate assets; debounce search; optimistic updates with rollback; avoid request loops or remount old app; skeleton loading.
- Security: route access enforced server-side, no client-only security; approved version and rights cannot be bypassed by hiding buttons. Sanitized user text/AI outputs; no unsanitized HTML injection.
- Empty states are designed first; deliver genuinely useful UI even when Meta/Drive OAuth not yet connected, with actionable Admin CTA and no fake data.
- Do not install dependencies solely for visuals if codebase already has accessible components/icons. If Figma/Planable/Linear visual reference assets are copyrighted, do not copy images/code; use abstract UX patterns.

## 6. ACCEPTANCE CRITERIA (BẮT BUỘC KIỂM THỬ)

1. Sidebar giữ tất cả module cũ; chỉ thêm 1 `Marketing` parent và đúng 8 submenu; mở/đóng, active, deep link, refresh, role visibility hoạt động.
2. Parent Marketing active khi ở bất kỳ route con. Khi user vào từ đường dẫn `/marketing/studio` trực tiếp, submenu mở và `Creative Studio` active.
3. Browser back/forward và chuyển child page không reload vô hạn app cũ, không mất role/session/unsaved editing.
4. Mobile nav usable; keyboard Tab/Enter/Space/arrow behavior tuân theo accessible disclosure pattern, `aria-expanded` chính xác, reduced motion được tôn trọng.
5. 8 trang có layout thực và kết nối route; không có nút giả/improper success. Nếu phase chưa triển khai, phải có empty state/feature flag rõ và không gắn nhãn hoàn thành.
6. Brand logo không bị méo; theme harmonizes existing app; basic spacing/type/accessibility tests.
7. Studio tạo/giữ các editable layers, AI chat edits scoped selection; Content Calendar correct statuses; Approval Inbox không cho self-approval; assets chưa xác minh rights không thành published media.
8. Viewer không thể sửa; Representative không được approve; leader/Admin không được approve own item; permissions enforced backend.
9. Tests: sidebar unit/component + navigation E2E, keyboard + mobile smoke, pages empty state, campaign deep link, old dashboard regression, no global CSS leakage.
10. Run repo's `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm verify` when environment supports; report commands actual, test evidence and blockers.

## 7. DELIVERABLES CHO CODEX

- Cập nhật `docs/marketing/UX_DESIGN_SPEC.md` mô tả layout, routes, tokens, responsive breakpoints, interaction and states.
- Tạo `docs/marketing/NAVIGATION_MAP.md` với sơ đồ chính xác: ONE Marketing parent → 8 subitems.
- Components + route code thực tế, sử dụng data source và permissions từ Master Prompt.
- Screenshots trước/sau của sidebar và từng trang/viewport nếu môi trường hỗ trợ; chỉ xác nhận screenshot đã có khi thực sự tạo ra.
- Checklist acceptance và tests, nêu rõ mức độ hoàn thành từng trang (`Working / Partially Implemented / Awaiting Connection`).

**LỆNH TRIỂN KHAI:** Đọc và áp dụng phụ lục này như một yêu cầu ràng buộc của Master Prompt. Sau discovery/baseline, ưu tiên xây sidebar Marketing + navigation shell + design tokens + Campaign Overview/List/Shared Plan thành một vertical slice hoạt động thật. Các khu vực khác thực hiện theo phase của Master Prompt. KHÔNG thay thế module cũ, KHÔNG triển khai giao diện chỉ để chụp mockup, KHÔNG xuất bản nội dung hoặc kết nối tài khoản ngoài khi chưa có quyền/duyệt.
