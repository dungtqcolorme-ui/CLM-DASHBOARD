# Kiểm tra bản sửa ngày 14/09/2026

Trạng thái: code đã qua kiểm tra tự động và các luồng giao diện local bên dưới.
Chưa nghiệm thu E2E với đăng nhập Supabase thật: `.env.local` thiếu
`SUPABASE_SERVICE_ROLE_KEY`. Đã triển khai production commit `7b00bd4` qua
GitHub → Vercel lúc 19:06 ngày 14/09/2026 (giờ Việt Nam). Đã kiểm tra thêm
các luồng đọc bằng phiên Admin thật trên production; phạm vi chi tiết ở cuối báo cáo.

## Nguyên nhân và thay đổi

| Nhóm | Nguyên nhân đã xác minh | Bản sửa |
| --- | --- | --- |
| Hiệu suất | Lỗi nguồn bị xử lý thiếu trạng thái rõ ràng; render có thể gọi lại tải điểm; tuần thiếu bị lấy nhầm theo vị trí và cộng trùng; task UUID chưa khớp nhân sự lịch sử | API đọc Sheet thật, kiểm tra cấu trúc, timeout và lỗi; gộp request; giữ null khác 0; tìm tuần theo số tuần; nối UUID với nhân sự; giữ người đang so sánh khi đổi khóa |
| Giao việc cho Đạt | Dropdown mặc định loại tài khoản quản lý; danh sách tài khoản chỉ có ở API quản trị; hồ sơ đang mang tên “Thành Đạt” | Directory người phụ trách từ API công việc có Leader; dùng ID bền vững; cập nhật tên tài khoản hiện hữu thành LÊ THÀNH ĐẠT, giữ PR Leader, không tạo trùng |
| Xóa tài khoản | DELETE cũ xóa Auth user; chỉ kiểm tra một phần quyền và có thể làm mất liên kết lịch sử; cookie shell tin trạng thái cũ | Vô hiệu hóa profile rồi ban Auth; hộp thoại có tên/cảnh báo; chặn tự khóa, bảo vệ Admin cuối; kiểm tra lại trạng thái/quyền cho shell và API; giữ lịch sử |
| Truy cập gần nhất | Chỉ theo dõi nhóm quản lý; chống ghi lặp chủ yếu bằng cookie; tài khoản cũ thiếu mốc dù Auth có lần đăng nhập thật | Ghi nhận cả bốn role; khóa/unique key theo user + lần tải; bổ sung mốc cũ từ `auth.users.last_sign_in_at`; không dùng ngày tạo/sửa |
| Responsive | Ba tab Hiệu suất bị ép vào ba cột hẹp | Tab cuộn ngang trên mobile, không chồng chữ |

Các module chính: `dashboard/clm-dashboard-private-34.html`,
`app/api/performance/scores/route.ts`, `lib/performance.mjs`, `app/page.tsx`,
`app/api/work-items/route.ts`, `app/api/admin/users/`,
`app/api/dashboard/session/route.ts`, `lib/dashboardSession.ts`, `lib/lastSeen.ts`.
Test bổ sung trong `tests/`, runner tại `scripts/verify.mjs`.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| ESLint, TypeScript | PASS |
| Unit/API integration | 54/54 PASS. Thực thi handler thật với Supabase fixture: tạo tài khoản, trùng email, phân quyền, giao task cho Leader, hoàn thành, reload dữ liệu, vô hiệu hóa, giữ task/lịch sử, từ chối token cũ, lần tải trùng, lỗi nguồn điểm |
| Dashboard release checks | PASS |
| Production build | PASS (Next.js 16.2.10). Runner bổ sung thư mục Node vào PATH cho tiến trình PostCSS |
| HTTP bản production local | PASS: trang chủ 200; 11 API riêng tư trả 401; API tài khoản theo ID kiểm tra PATCH/DELETE 401, POST 405 |
| SQL trên Supabase thật | PASS: chống ghi lần tải trùng, không đổi ngày sửa profile, chặn tài khoản khóa, bảo vệ Admin cuối và quyền RPC; toàn bộ dữ liệu test rollback |
| Đối chiếu Sheet thật | K141 / Qu. Dũng: 26 + 23.5 + 25 + 28 = 102.5 điểm; 74.5 giờ; Hiệu suất TB 256.25, UI làm tròn 256.3 |
| Giao diện local với API giả lập riêng | Tạo task → Leader thấy task → hoàn thành → reload → Hiệu suất 1/1, 100%; hủy/xác nhận khóa → danh sách cập nhật → reload → loại khỏi dropdown → mở lại |
| Giao diện và role | Smoke test Đối ngoại, Truyền thông, Ấn phẩm, Học bổng, Hiệu suất, Task, Tài liệu, Tài khoản theo các màn được cấp cho Admin/PR Leader/PR Representative/Viewer; không ghi nhận console error/warn trong các lượt kiểm tra này |
| Trạng thái và bộ lọc | Loading, API lỗi và nút thử lại, nguồn rỗng, thiếu điểm nhân sự; đổi khóa/nhân sự/nhóm chỉ số; giữ lựa chọn so sánh; reload |
| Responsive | Quan sát Hiệu suất ở 390px, 768px và desktop 1440px; không tràn chiều ngang toàn trang; bảng/tab có vùng cuộn riêng |

Manager/Mentor dùng role PR Leader; Trainee/nhân sự dùng PR Representative theo
mô hình hiện hữu. Test scope Mentor/Trainee nằm trong bộ unit test. Không tạo
thêm loại role mới.

Task chưa liên kết hồ sơ của một khóa chỉ được tính ở “Tất cả khóa”; không tự
gán task mới vào khóa cụ thể để làm số liệu tăng. Điểm Sheet không tự thay đổi
theo task: nhóm “Tiến độ công việc” phản ánh task, nhóm điểm phản ánh Sheet.

## Thay đổi đã áp dụng lên dữ liệu thật

- Cập nhật tên hồ sơ Đạt và metadata Auth trên cùng tài khoản hiện hữu.
- Áp dụng `20260913175631_account_access_and_load_events.sql`.
- Áp dụng `20260914024352_backfill_verified_sign_in_activity.sql`: bổ sung 4 tài
  khoản từ thời điểm đăng nhập đã được Auth ghi nhận; 2 tài khoản chưa từng đăng
  nhập giữ null; các mốc mới hơn và `updated_at` giữ nguyên.
- Không tạo task/tài khoản thử hoặc vô hiệu hóa tài khoản nghiệp vụ trên production.

## Phần còn cần xác minh trước nghiệm thu

Cấu hình khóa server-only `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local` (không
gửi khóa trong chat), sau đó chạy đăng nhập thật theo role, tạo tài khoản thử,
đăng nhập/reload/đăng xuất, kiểm tra ban/unban Auth và giao task qua trọn luồng
browser → Next API → Supabase. Kiểm thử fixture ở trên không thay thế bước này.
Các tích hợp ngoài như Google OAuth/Calendar/Gmail chưa được thử gửi thật trong
lượt sửa này.

## Bổ sung hiển thị người giao / người nhận task

- Form tạo/sửa có người giao chỉ đọc và dropdown người nhận; thẻ task tuần/tháng,
  danh sách và chi tiết hiển thị cả hai tên. Người phối hợp hiển thị riêng.
- Người giao lấy từ `created_by`, người nhận từ `owner_id`; ưu tiên tên hồ sơ
  hiện tại và giữ tên lịch sử khi tài khoản đã khóa. Không lấy người đang xem
  làm người giao cho task cũ thiếu thông tin.
- Kiểm tra giao diện local: Admin giao cho LÊ THÀNH ĐẠT, cả hai tên xuất hiện
  ngay, vẫn đúng sau reload ở phía Leader, form sửa giữ người giao ban đầu;
  kiểm tra thẻ task ở 390px không chồng chữ, console không có error/warn.
- Mở rộng test API: bỏ qua tên/ID người giao giả từ client, giữ người giao khi
  Leader sửa task, cập nhật tên theo profile, giữ tên người nhận sau vô hiệu hóa.
- Chạy lại toàn bộ `scripts/verify.mjs`: lint, typecheck, 54/54 test, dashboard
  release và production build đều PASS. Giới hạn E2E Auth thật ở trên vẫn áp dụng.

## Xác minh sau deploy production

- Commit: `7b00bd4c4cc9c64aa3570a9650470a0f5563f4d5`, đã push lên `main` và
  `codex/task-management-overhaul`. Vercel Production deployment `6436613155`
  (GitHub deployment ID) báo `success` lúc `2026-09-14T12:06:19Z`.
- Website: https://clm-dashboard-eosin.vercel.app
- Deployment: https://clm-dashboard-gmn69k9j9-tran-dung-clm.vercel.app
- `CLM_TEST_URL=https://clm-dashboard-eosin.vercel.app node scripts/test-http-auth.mjs`:
  PASS, trang chủ 200, 11 API riêng tư 401 và kiểm tra method tài khoản đúng kỳ vọng.
- Phiên Admin thật tải dashboard và kết nối Sheet thành công. K141 / Qu. Dũng
  hiển thị 26, 23.5, 25, 28; tổng 102.5 điểm, 74.5 giờ, hiệu suất TB 256.3.
- Task thật hiển thị đúng tên người giao/người nhận trên thẻ và chi tiết.
  Form mới có người giao Trần Quang Dũng chỉ đọc, chọn được LÊ THÀNH ĐẠT làm
  người nhận; đã hủy form, không tạo task thử trên production.
- Trang tài khoản hiển thị Đạt có PR Leader và đang hoạt động. Truy cập Admin
  hiển thị `19:07:37 14/9/2026`, khớp `profiles.last_seen_at` và bản ghi
  `profile_access_loads` trong Supabase (`2026-09-14 12:07:37.050012+00`).
- Không ghi nhận console error/warn trong lượt kiểm tra production này.
- Chưa chạy tạo/khóa tài khoản và gửi Google Calendar/Gmail thật trên production;
  kết quả deploy không đồng nghĩa các luồng ghi này đã được nghiệm thu E2E.

## Giao diện thẻ task theo ảnh tham chiếu

- Thẻ trắng bo góc, header vàng/icon mặt trời cho ca sáng, tím/icon mặt trăng
  cho ca chiều; task chưa phân ca dùng màu trung tính.
- Tiêu đề xuống dòng đầy đủ. Người giao, người nhận, người phối hợp và trạng thái
  có icon riêng; nhãn ca nằm dưới đường phân cách ở cuối thẻ.
- Menu ba chấm thay hai nút chiếm chỗ trên thẻ: xem chi tiết, nhân bản và đổi ngày
  (hai thao tác sửa vẫn theo quyền hiện hữu). Hỗ trợ đóng bằng Escape/nhấp ngoài
  và mở chi tiết bằng Enter/Space trên thẻ.
- Lịch tuần/tháng có chiều rộng cột tối thiểu và cuộn ngang khi cần để giữ chữ
  dễ đọc. Kiểm tra giao diện local với dữ liệu cách ly ở 1440px và 390px:
  tên/tiêu đề dài không tràn, menu mobile không bị cắt, mở đúng hộp thoại đổi ngày
  và nhân bản; lịch tháng render đủ thẻ; không ghi nhận console error/warn.
- Chạy `scripts/verify.mjs`: lint, typecheck, 54/54 test, dashboard release và
  production build đều PASS cho thay đổi giao diện này.
