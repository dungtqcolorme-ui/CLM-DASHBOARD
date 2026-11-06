# Phạm vi tính năng và mức nghiệm thu

Cột “Đã có” mô tả đường chạy trên nhánh triển khai. Tích hợp thật và vận hành cần bằng chứng staging tương ứng trong runbook. Đối chiếu `MASTER_SPEC.txt` và `UIUX_ADDENDUM.md`.

| Phần spec | Đã có trên nhánh | Việc còn lại |
|---|---|---|
| 0–4 · Audit, kiến trúc, quyền và dữ liệu | Inventory, threat model, một nhóm Marketing với tám trang, workspace theo Campaign, profile và role array hiện tại, RLS và lệnh có phạm vi. | Áp migration và kiểm thử Supabase/Storage thật trên staging. |
| 5 · Campaign và cộng tác | Draft/Pending/Active/Pause/Hold, KPI nháp, mốc KPI lúc Activate và revision KPI do Leader/Admin xác nhận, Content Mix 100%, plan autosave/conflict/version, lịch sản xuất và Content Calendar hiển thị riêng giờ đề xuất, khung giờ duyệt, biên nhận và cảnh báo. | Tích hợp liên kết Task, kéo đổi lịch và ảnh thu nhỏ. Giờ đăng thực tế cần được adapter Meta cung cấp và lưu riêng. |
| 6 · Knowledge, DNA và Idea Radar | Nguồn/fact do người duyệt, kiểm tra freshness, tìm kiếm nội bộ, bản nháp ý tưởng theo quy tắc, chọn ý tưởng tạo nội dung, Master/Team/Post DNA có diff/duyệt. | Provider AI, nghiên cứu Internet có dẫn chứng, tự phân loại/weekly planner chủ động, học từ Organic và Audience Listening. |
| 7 · Creative Studio | Caption, Canvas scene nhiều trang, lớp ảnh/text/shape/logo, template/variant/version, xem trước và xuất PNG, quyền nguồn được kiểm lại. | Chat chỉnh đúng layer, gợi ý caption theo đoạn và tạo layout/ảnh chọn tự động từ asset được phép sau khi chọn ý tưởng. |
| 8–9 · Asset và Template | Ảnh upload riêng tư, provenance/quyền/hết hạn, original và raster tách, thư viện Personal/Team/Campaign/Official có phạm vi và duyệt. | Drive OAuth/folder/index/sync/revoke, tìm theo ngữ nghĩa và xếp hạng/tìm ảnh tương tự. |
| 10 · Video | Footage/audio riêng tư, timeline và phiên bản, preview trình duyệt, job render lưu trạng thái Chưa cấu hình khi thiếu worker. | Render worker và video output đã xác minh, STT, AI rough cut/chỉnh đoạn, video xuất bản. |
| 11–12 · Duyệt, đăng, Hold | Snapshot chính xác, Leader/Admin khác Creator, durable job, lease, idempotency, receipt và trạng thái mơ hồ, Hold và incident. | Meta OAuth/Page verification, adapter production và token rotation, scheduler/worker, kiểm thử multi-session và receipt thật. |
| 13–14 · Organic và báo cáo | Ingest dành cho service, mẫu Organic tách Paid/Unknown, giá trị thiếu giữ null, số liệu sản xuất, báo cáo kỳ và narrative phiên bản, PDF/XLSX, duyệt chia sẻ đúng phiên bản, feedback insight. | Đồng bộ Meta Organic, matched comparisons, Audience Listening, AI KPI/strategy, digest theo lịch và narrative AI. |
| 15 · Độ tin cậy | Approval Inbox, audit/history, incident acknowledge và resolve riêng, giới hạn dữ liệu/command, giới hạn export theo tài khoản, trạng thái tích hợp. | Notification delivery theo người nhận, email tùy chọn, monitoring và giới hạn provider ở môi trường vận hành. |
| 16–20 và UIUX · Trải nghiệm và nghiệm thu | Giao diện tiếng Việt, giờ Việt Nam, logo giữ tỉ lệ, tám trang, responsive, scope/capability rõ, kiểm thử local có API, SQL và trình duyệt. | Nghiệm thu staging, đo tải trên kích thước dữ liệu thật và mở pilot theo runbook. |

Chat **ColorME Marketing · Kết nối chat web** trong CLM DB lưu liên kết ngữ cảnh theo yêu cầu. Chi tiết kết nối được ghi ở `CHAT_LINK.md`.
