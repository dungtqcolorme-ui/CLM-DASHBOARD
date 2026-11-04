# Báo cáo triển khai ColorME Partnership Marketing — 04/11/2026

> Đây là snapshot Phase 1 tại `ca58b3d`. Đã triển khai tiếp Phase 2 core; xem `PHASE2_REPORT.md` và `VERIFICATION_PHASE2.json` để biết trạng thái mới nhất.

Nhánh: `codex/partnership-marketing-foundation`. Base: `0515fc1bb52ce83f0d07411d555d4421285cbdf0` (`codex/loading-performance-chart-hotfix`). Phạm vi bàn giao là audit Phase 0 và nền tảng Phase 1 chạy qua API/PostgreSQL; chưa phải toàn bộ sản phẩm Phase 0–6, chưa triển khai production.

## Đã hoạt động

- Một mục Marketing trong sidebar gốc, đúng tám submenu, giữ tên/thứ tự module cũ. Tám route Next có active/deep-link/loading/error/empty states và giao diện mobile.
- Root host giữ cùng iframe dashboard khi chuyển qua Marketing và quay lại; form đang nhập không bị dựng lại. Marketing dùng layout/context riêng và session ColorME hiện có.
- Admin tạo team Marketing và thêm/gỡ thành viên UUID, độc lập với mentor. Các vai trò và trạng thái tài khoản được xác minh lại; API dùng JWT của người dùng, không dùng service role để ghi Marketing.
- Tạo/sửa Campaign Draft, gửi yêu cầu, Leader/Admin kích hoạt, freeze KPI chính thức; tạm dừng, dừng khẩn cấp, tiếp tục, hoàn thành và lưu trữ theo trạng thái hợp lệ.
- Shared Content Plan và Content Mix 100%, autosave, lịch sử, expected-version/409, giữ bản nháp và phục hồi xung đột. KPI chính thức không bị ghi đè bởi sửa Plan.
- Caption/content draft có creator bất biến, assignee trong team, trạng thái sản xuất và xuất bản riêng, hạn sản xuất/gửi duyệt/giờ đăng đề xuất riêng. Gửi duyệt và yêu cầu chỉnh sửa được lưu thực sự.
- Calendar tháng/tuần/danh sách, filter và drawer/dialog từ các bản ghi thật; chuyển UTC ↔ Asia/Ho_Chi_Minh được kiểm thử ở ranh giới ngày.
- API/RPC chỉ nhận command đã định nghĩa; database RLS, constraints, row locks và append-only revisions/audit thực thi lại quyền và phiên bản.

## Mức độ hoàn thành các trang

| Route | Trạng thái | Phần còn thiếu |
|---|---|---|
| `/marketing` | Working — Phase 1 | Feed thông báo nâng cao, freshness Meta, cấu hình OAuth |
| `/marketing/campaigns`, `/marketing/campaigns/[id]` | Working — Phase 1 | Board/timeline, official KPI revision có duyệt, cộng tác realtime |
| `/marketing/agent` | Awaiting implementation/configuration | Research gateway, Brand DNA, Idea Radar, evidence và weekly planner Phase 2 |
| `/marketing/studio` | Partially implemented | Caption thực; canvas/layers/carousel, approved media và video chưa triển khai |
| `/marketing/calendar` | Working — kế hoạch trong app | Không có remote schedule, drag-reschedule hay receipt Meta |
| `/marketing/assets` | Awaiting implementation/connection | Drive OAuth/folder grants/rights, assets và editable templates Phase 3 |
| `/marketing/intelligence` | Partially implemented | Có thống kê sản xuất; Organic ingest, insights/report/export Phase 5 chưa có |
| `/marketing/approvals` | Partially implemented | Inbox/yêu cầu sửa thực; chưa có approval snapshot media và Duyệt & Lên lịch Phase 4 |

## File và interface chính

- `app/WorkspaceHost.tsx`, `app/layout.tsx`, thay đổi tối thiểu `app/page.tsx`: giữ iframe và bridge/navigation/login return.
- `dashboard/clm-dashboard-private-34.html`: bốn dòng bổ sung cho asset/menu/render disclosure; không đổi logic nghiệp vụ cũ.
- `public/marketing/legacy-navigation.{js,css}`: disclosure và bridge same-origin/allowlist.
- `app/marketing/**`: provider, tám trang, Campaign detail, caption/strategy/plan editors, draft CAS và context sync.
- `lib/marketing/{types,domain,navigation,server}.ts`: contract, validation, ngày/giờ, quyền, read pagination và sanitized errors.
- `app/api/marketing/route.ts`: GET workspace RLS; POST typed command → user-JWT transactional RPC.
- `supabase/migrations/20261104000100_marketing_foundation.sql`: bảy bảng Marketing, private helpers và `public.marketing_command(jsonb)`; migration additive.
- `supabase/tests/marketing_foundation.test.sql`, `scripts/test-marketing-db.mjs`: quyền/RLS/constraint/RPC và DB-to-API roundtrips trên PostgreSQL tạm.
- `tests/marketing-*.test.mjs`, `scripts/test-marketing-ui.mjs`: domain/API/navigation/context/cache và browser/API/SQL fixture QA.
- `docs/marketing/`: inventory, architecture, threat model, UX, navigation, bản đặc tả gốc, hướng dẫn rollout/rollback và bằng chứng.

Không thay package.json/lockfile hoặc thêm dependency vào ứng dụng. `pnpm verify` đã đồng bộ React từ phiên bản node_modules 19.2.6 ban đầu về 19.2.4 theo lockfile. PGlite chỉ cài tại `/private/tmp` để test. Các thay đổi `.gitignore`, README, preview và tài liệu thiết kế có sẵn trước phiên làm việc được giữ nguyên và không đưa vào commit Marketing.

## Kiểm chứng thực tế

| Lệnh / kiểm tra | Kết quả |
|---|---|
| Baseline `node scripts/verify.mjs` | Lint/TypeScript/68 tests/dashboard checks qua; Turbopack bị sandbox chặn mở cổng |
| Baseline `next build --webpack` | Qua |
| Final `pnpm verify` | Qua lint, TypeScript, **90/90 tests**, dashboard release checks và production build Turbopack |
| `MARKETING_PGLITE_MODULE=… node scripts/test-marketing-db.mjs` | Qua SQL/RLS/privilege/constraint suite và **33 roundtrip bản ghi thật qua API validator** |
| `MARKETING_PGLITE_MODULE=… node scripts/test-marketing-ui.mjs` | Browser → handler API thật → PostgreSQL tạm; đủ tám trang, mobile, lifecycle, autosave, caption, UTC, read-only roles, context và giữ iframe |
| `CLM_TEST_URL=http://localhost:3104 node scripts/test-http-auth.mjs` | Các ranh giới HTTP dashboard gốc trả đúng 200/401; không regression xác thực |
| HTTP thật GET/POST `/api/marketing` không token | Cả hai trả **401** |
| `git diff --check`, lint script QA | Qua |
| Review độc lập | Các lỗi phân trang, SQL/API bounds, mất iframe, draft CAS, trạng thái sửa và context đã sửa; không còn phát hiện P1/P2 trong phạm vi review |

Browser dùng **identity fixture** cùng dữ liệu PostgreSQL tạm; không đăng nhập tài khoản thật, không ghi production, không thử đăng Page. Bản SQL dùng PostgreSQL-compatible engine PGlite, chưa chứng minh contention hai session thật trên Supabase. Cần staging real-account/RLS/concurrency acceptance trước rollout.

Bằng chứng máy đọc: `VERIFICATION.json`. Ảnh tại `tmp/marketing/`, gồm đủ tám trang desktop, bốn viewport mobile, trạng thái conflict và sidebar trước/sau. Mọi ảnh đều có nhãn **Dữ liệu minh họa**; không phải dữ liệu production.

## Trạng thái tích hợp và an toàn

Meta: **Not Connected**. Chưa xác minh Page ID/name/tasks/scopes. `103245086061688` chỉ là asset hint, không dùng làm Page ID. Không có live publish, scheduler/cron hay external write adapter.

Không có command duyệt/xuất bản trong Phase 1; bảng snapshot dự phòng có constraint khác creator/approver. Phê duyệt chéo media hoàn chỉnh, hash/payload freeze, gateway/outbox, cancel/hold race và remote receipt thuộc Phase 4. Không coi gửi duyệt là đã duyệt/lên lịch.

Không gọi tạo ảnh/video/giọng AI. Không tự sửa Brand DNA, KPI chính thức, shared plan bằng agent, task cũ hoặc dữ liệu dashboard cũ. Không lưu OAuth secrets, raw comments hay private Drive content trong module. Marketing core của Codex trả `CONTEXT_MISSING`, không được coi là Meta connection.

## Cần làm để dùng với tài khoản thật

Migration Marketing **chưa áp dụng lên Supabase production**; ứng dụng **chưa deploy**. Cần chọn staging, áp dụng migration, deploy branch, Admin tạo team/mapping và chạy real-account acceptance. Quy trình cụ thể và rollback tại `docs/marketing/README.md`.

Phase 2–6 còn lại theo `IMPLEMENTATION_PLAN.md` và hai đặc tả gốc. Các phụ thuộc tương ứng gồm provider research/LLM được cấu hình, Meta OAuth/App Review và xác minh Partnership Page, Google Drive OAuth/rights, queue/scheduler, worker render và audit license. Không cần dán secret vào chat; cấu hình bằng quy trình secret/OAuth của môi trường.
