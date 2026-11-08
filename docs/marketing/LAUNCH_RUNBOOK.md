# Runbook triển khai ColorME Partnership Marketing

## Môi trường và thứ tự áp dụng

Dùng một dự án Supabase staging riêng và một deployment preview giới hạn người truy cập. Chuẩn bị bản sao đã loại dữ liệu nhạy cảm hoặc tài khoản kiểm thử. Áp dụng các migration theo thứ tự sau bằng quy trình quản trị Supabase của dự án.

1. `20261104000100_marketing_foundation.sql`
2. `20261104000200_marketing_knowledge.sql`
3. `20261104000300_marketing_creative.sql`
4. `20261105000100_marketing_publishing.sql`
5. `20261105000200_marketing_video_reports.sql`
6. `20261106000100_marketing_hardening.sql`
7. `20261106000200_marketing_kpi_revisions.sql`
8. `20261108000100_marketing_task_links.sql`
9. `20261108000200_marketing_calendar_thumbnails.sql`

Sao lưu trước khi áp dụng. Ghi mã phiên bản ứng dụng, migration đã áp dụng và cách truy cập bản sao lưu. Kiểm tra `marketing-originals` và `marketing-footage` là bucket riêng tư, quyền SELECT/INSERT khớp với chính sách Marketing và các chính sách Storage có sẵn. Dùng tài khoản thật của staging để thử upload, tải private và phát/seek media qua URL ký 60 giây. Kiểm tra quyền khi nguồn bị thu hồi, link đã phát hành hết hạn, file sai MIME và người ngoài team.

Đặt `LIVE_META_PUBLISH_ENABLED` ở `false` trên staging. Admin mở **Marketing Overview → Trạng thái triển khai → Kiểm tra trạng thái**. Kết quả xác nhận schema và liệt kê phần thiếu theo tên cấu hình. Các tích hợp cần xác minh riêng ngay cả khi schema hiện hành. Quản lý secrets trong môi trường deploy hoặc secret manager của dự án.

## Tiêu chí nghiệm thu staging

| Luồng | Bằng chứng cần ghi |
|---|---|
| Tài khoản và RLS | Admin nhiều vai trò, Leader/Representative/Viewer thuộc hai team, tài khoản locked và membership bị gỡ giữa phiên. Test REST/RPC/Storage, kiểm tra cả truy cập trực tiếp và trình duyệt. |
| Đồng thời | Hai phiên PostgreSQL độc lập cùng duyệt, worker trùng claim, Hold khi bắt đầu dispatch, hết lease sau remote write, revoke quyền sau duyệt. Lưu trình tự giao dịch và job/incident cuối. |
| Hiệu năng | Đo p50/p95 cho Overview, list theo team, mở Studio, tải preview và PDF/XLSX trên dữ liệu staging có kích thước dự kiến. Theo dõi 429/503, kích thước response, truy vấn chậm và bộ nhớ export. Kiểm tra truy vấn bằng EXPLAIN trên staging. |
| Dashboard cũ | Login, Task, Email/Calendar, Báo cáo, catalog, điều hướng desktop/mobile và dữ liệu chưa lưu khi quay lại iframe. |
| KPI Campaign | Representative lưu đề xuất có lý do, Leader cùng team hoặc Admin xác nhận đúng phiên bản. Kiểm tra KPI gốc và bản duyệt đăng vẫn sử dụng mốc phiên bản tương ứng. |
| Liên kết Task | Gắn Task có sẵn vào nội dung, đối chiếu trạng thái Task, gỡ có lý do và xem lịch sử. Hoàn thành Task giữ quy trình duyệt nội dung độc lập. |
| Content Calendar | Đối chiếu giờ đề xuất, khung giờ trong bản duyệt và trạng thái Meta. Kiểm tra lịch theo giờ Việt Nam, biên nhận thiếu giờ đăng và cảnh báo đang đối soát. Mở ảnh trong chi tiết bài: đúng thứ tự ảnh cuối từ bản duyệt, không lộ đường dẫn Storage, tự ẩn tối đa 30 giây; thu hồi quyền rồi tải lại phải bị chặn, đóng/đổi scope phải gỡ ảnh. |
| Đổi lịch đề xuất | Kéo bản nháp sang ngày khác: chưa lưu thì DB không đổi; lưu giữ giờ Việt Nam, caption, Creator và hạn sản xuất/duyệt. Sửa đồng thời phải báo conflict, giữ giờ vừa nhập, chỉ thử lại sau khi lấy nội dung hiện tại. Kiểm tra thao tác bàn phím/chạm, Viewer, Campaign Paused/Hold và bài đã duyệt/lên lịch không được kéo sửa. |
| Báo cáo | Kỳ tuần/tháng theo giờ Việt Nam, trường thiếu hiển thị đúng, approval ràng buộc phiên bản và hai định dạng mở được bằng ứng dụng đích. |

Ngân sách database tính theo phút và theo tài khoản. Mutation thông thường 240, tạo báo cáo 12, yêu cầu render 6, xuất báo cáo 10, tạo thumbnail Calendar 30. Command bị rollback cũng rollback bộ đếm; reservation thumbnail đã nhận vẫn tính nếu tải/xử lý ảnh sau đó thất bại. Emergency Hold vẫn qua kiểm tra quyền và lý do khi chạm ngân sách. Các giới hạn này không bao phủ truy vấn đọc trực tiếp hoặc request vô danh. Chỉ mở rộng nhóm pilot sau khi theo dõi mức dùng và cấu hình giới hạn hạ tầng tương ứng. Giữ nguyên RLS và quyền riêng tư cho dữ liệu nguồn trong mọi phép đo.

Thumbnail Calendar tắt mặc định; bật để kiểm tra ảnh WebP tối đa 160×90, tải tuần tự khi ô lịch đi vào viewport, gỡ sau tối đa 30 giây và không tự tải lại. Tắt tùy chọn/đổi scope phải gỡ ảnh và hủy request chờ. Đối chiếu ảnh đầu từ đúng bản duyệt, metadata đã bỏ, thu hồi quyền trong lúc resize phải chặn response. Kiểm tra 429 và bộ nhớ/timeout của Sharp trên runtime staging; mỗi tiến trình chỉ chạy một thumbnail native tại một thời điểm. Không ghi ảnh thu nhỏ thành object Storage hay URL công khai.

## Tích hợp cần xử lý trước khi bật live

- **Meta**. Hoàn thành app review và xác minh đúng Page ColorME Partnership qua tài khoản Admin, Page ID thật, Business tasks, quyền và phiên bản Graph. Triển khai adapter production và mã hóa/rotation token sau khi xác minh. `103245086061688` hiện chỉ là gợi ý Business Suite. Chạy dry run bằng test Page được phê duyệt trước khi bật live. Đối chiếu receipt, quota, lỗi timeout và quy trình hủy lịch từ Meta.
- **Worker xuất bản**. Chọn máy chạy worker và lịch được hosting plan hỗ trợ. Bật theo feature flag sau kiểm thử lease, idempotency, reconciliation và cảnh báo. Chỉ phê duyệt và lên lịch từng snapshot bằng Leader/Admin khác Creator.
- **Google Drive**. Tạo OAuth riêng cho phạm vi Drive tối thiểu. Admin xác nhận folder whitelist, cấp quyền theo Campaign và thử revoke/moved file. Quyền đọc Drive và quyền xuất bản asset được xét riêng.
- **Video**. Chọn renderer và môi trường worker sau kiểm tra license, chi phí, giới hạn CPU/memory/timeout/concurrency. Chứng minh worker tạo artifact thật và lưu digest/receipt cho đúng version. Tích hợp STT từ âm thanh thật cần cấu hình riêng.
- **AI và Organic**. Xác nhận kết nối AI ở chat đã tách theo yêu cầu. Cần triển khai provider riêng cho ứng dụng, nguồn được phép đọc, budget và kiểm thử chống prompt injection. Organic sync/Audience Listening cần quyền Page và khả năng tách Paid, Organic, Unknown trước khi dùng số liệu làm baseline.

## Rollout và xử lý sự cố

1. Admin thêm một team pilot và phân vai theo tài khoản ColorME thực tế. Kiểm tra read-only và quy trình Campaign, nội dung, báo cáo trước khi mở tích hợp.
2. Với rủi ro xuất bản, đặt Emergency Hold kèm lý do. Đọc job và incident theo từng snapshot. `Unknown` hoặc `Cancellation Pending` cần kiểm tra trên Meta và lưu receipt xác minh trước khi đóng incident. Acknowledge chỉ ghi nhận người đã xem cảnh báo.
3. Nếu cần rollback ứng dụng, dùng bản deploy đã xác minh trước đó. Giữ bảng và revision Marketing để điều tra và khôi phục. Nếu rollback ứng dụng về trước migration KPI, giao diện cũ hiển thị KPI tại mốc kích hoạt. Lịch sử và KPI revision đã xác nhận vẫn lưu trong database. Nếu cần khóa API, dùng migration thu hồi quyền execute của các RPC Marketing và chính sách Storage liên quan, đồng thời vô hiệu hóa worker/secret tương ứng. Kiểm tra RLS và chức năng legacy sau rollback.
4. Mỗi lần mở rộng rollout cần người vận hành xác nhận test staging, nguồn lưu bằng chứng và người chịu trách nhiệm xử lý incident. Trạng thái của từng tính năng được ghi trong `FEATURE_READINESS.md`.
