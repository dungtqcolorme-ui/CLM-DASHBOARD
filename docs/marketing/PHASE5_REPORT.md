# Phase 5 · Video và báo cáo

Migration `20261105000200_marketing_video_reports.sql` bổ sung nguồn video/audio riêng tư, timeline, version và render requests. Bộ thư viện report dùng số liệu có phạm vi team/Campaign, lịch sử và duyệt chia sẻ đúng phiên bản. API bổ sung `/api/marketing/video`, `/api/marketing/video/source`, `/api/marketing/reports` và `/api/marketing/reports/export`. UI ở Creative Studio và Intelligence & Reports.

Nguồn video/audio được đặt chỗ trước khi upload trực tiếp vào Storage bằng JWT người dùng. Quyền và hiệu lực được kiểm tra lại trước khi ký URL preview 60 giây. Digest và duration khai báo phục vụ editor. Worker thực cần xác minh byte gốc trước khi sản xuất file. Timeline được lưu theo phiên bản, tách khỏi payload ảnh/caption để draft video có thể tồn tại trong lúc nội dung khác đang được duyệt. Khi worker chưa cấu hình, job giữ trạng thái `not_configured`, progress và output rỗng.

Báo cáo phân biệt tiến độ sản xuất và mẫu Organic 7 ngày. Paid và Unknown được loại khỏi baseline. Trường thiếu, định nghĩa nguồn khác nhau và tổng vượt độ chính xác an toàn giữ giá trị null. Snapshot giữ mốc coverage và thời điểm chốt, ID, thời gian lấy và định nghĩa của từng quan sát đã chọn. Báo cáo trước mốc thu thập review hiển thị “Chưa có dữ liệu”. Nội dung nhận định có version riêng. Export ngoài team cần Leader/Admin duyệt đúng version và hash.

SQL regression chạy trong PostgreSQL dùng một lần. Bốn suite của các phase trước, suite nguồn/timeline/report và 13 vòng parser → RPC → dữ liệu đều đạt. Bốn ca export đọc lại PDF/XLSX thật, kiểm tra snapshot, quyền, chữ tiếng Việt và dữ liệu nhập được lưu dưới dạng text. Review độc lập xác nhận hai lỗi về coverage và nguồn đã được xử lý. Mốc bắt đầu thu thập được ghi sau khi cài trigger trong cùng giao dịch migration.

PDFKit/ExcelJS và font Noto Sans có nguồn và license trong `INTEGRATION_INVENTORY.md`. PDF minh họa local được kiểm tra bằng Poppler và đọc chữ tiếng Việt bằng PDFium/pdfminer. XLSX được đọc lại bằng ExcelJS. File và ảnh minh họa nằm dưới `tmp/marketing/` và mang nhãn kiểm thử.

Render worker, STT, AI rough cut, Meta Organic sync và Audience Listening cần tích hợp riêng. Xem `FEATURE_READINESS.md` và `LAUNCH_RUNBOOK.md` để chuẩn bị nghiệm thu staging.

Kiểm thử trình duyệt riêng Phase 5 đạt 4 nhóm kiểm tra và 4 ảnh minh họa, không có lỗi trình duyệt. Bài test dùng byte MP4 thật từ tệp tổng hợp, API và PostgreSQL/RLS local. Test bao phủ upload, quyền, phát/tua, trim/split, caption, lock, conflict, biến thể, job render, báo cáo tuần/tháng, duyệt chia sẻ, tải PDF/XLSX và Viewer mobile. Xem `VERIFICATION_PHASE5.json`. Kiểm thử cả workspace với bản vá cuối nằm ở Phase 6.
