# Bản bàn giao CLM Marketing · 09/11/2026

Ứng viên phát hành local trên nhánh `codex/partnership-marketing-foundation`. Phạm vi gồm tám trang Marketing, phân quyền hiện tại của ColorME, các đường chạy đã kiểm chứng trong [bảng mức nghiệm thu](FEATURE_READINESS.md), và cách vận hành staging trong [runbook](LAUNCH_RUNBOOK.md).

## Các hạng mục chốt trong bản bàn giao

- Approval Inbox có thông báo theo người nhận cho gửi duyệt, yêu cầu chỉnh sửa, duyệt, đăng, lỗi xuất bản, sự cố nghiêm trọng và Hold. Mục đã đọc thuộc riêng người nhận. Thông báo bắt đầu từ các sự kiện sau migration `20261109000100`. Liên kết sự kiện tải phiên bản lịch sử theo quyền hiện tại. Sự kiện xuất bản gắn với phiên bản được niêm phong.
- Research đề xuất tuyến khi từ khóa trong brief khớp một nhóm. Người dùng bấm áp dụng hoặc chọn tuyến khác.
- Intelligence & Reports đối chiếu mẫu Organic mới nhất cùng Campaign, Page, kết nối, tuyến, định dạng, cửa sổ và định nghĩa chỉ số. Mẫu Paid/Unknown mới hơn thay thế phân loại cũ. Mẫu thiếu chỉ số được loại khỏi lượt đối chiếu chỉ số đó. Bảng hiển thị mục tiêu Campaign hiện tại nếu có. Mục tiêu riêng của từng bài tại thời điểm đăng còn thiếu dữ liệu nguồn.

## Chạy lại nghiệm thu local

Dùng Node 24, pnpm, Chrome và FFmpeg có sẵn. FFmpeg tạo clip minh họa cho bộ kiểm thử. Bộ kiểm thử trình duyệt cần URL Supabase công khai trong `.env.local` để dựng phiên thử, dùng tài khoản giả lập và PostgreSQL tạm. Các request ra ngoài localhost bị chặn trong kiểm thử.

```sh
pnpm verify
npm install --prefix /private/tmp/clm-final-qa --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.3 playwright@1.58.2

MARKETING_PGLITE_MODULE=/private/tmp/clm-final-qa/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/test-marketing-video-reports-db.mjs --notifications

pnpm start --hostname 127.0.0.1 --port 3104
```

Chạy lệnh trình duyệt ở terminal thứ hai, từ thư mục repo.

```sh
CLM_QA_RUNTIME=/private/tmp/clm-final-qa/package.json \
MARKETING_PGLITE_MODULE=/private/tmp/clm-final-qa/node_modules/@electric-sql/pglite/dist/index.js \
CLM_MARKETING_QA_URL=http://127.0.0.1:3104 \
  node scripts/test-marketing-ui.mjs
```

Ảnh chụp và báo cáo trình duyệt ở `tmp/marketing/`. Hai màn hình mới có ảnh `marketing-notification-version.png` và `reports-organic-phase5.png`.

## Kết quả nghiệm thu

- `pnpm verify` đạt lint, TypeScript, 208 kiểm thử unit/API, hồi quy Dashboard và build production.
- PostgreSQL tạm đạt 10 bộ SQL và 13 lượt kiểm tra parser qua RPC. Các bộ kiểm thử nạp đủ mười migration Marketing.
- Chrome đạt 35 kiểm tra và ghi nhận một lượt tải iframe Dashboard cũ. Báo cáo `tmp/marketing/qa-report.json` có danh sách kiểm tra và đường dẫn ảnh.
- Kiểm thử xác nhận người nhận có thể đọc phiên bản đã gửi dù nội dung đã thay đổi, quyền gỡ khỏi team chặn thông báo cũ, và mẫu Paid mới hơn ở độ chính xác micro giây loại mẫu Organic cũ.
- Rà soát độc lập đã kiểm tra lại các sửa đổi về phiên bản niêm phong, quyền đọc lịch sử và thứ tự mẫu. Dữ liệu chứng minh ở đây thuộc môi trường local với danh tính và Storage giả lập.

## Điều kiện để chốt bản production

1. Chỉ định Supabase và URL staging tách biệt. Ngày 09/11/2026, danh sách dự án được kết nối có CLM DASHBOARD và kết quả liệt kê nhánh phát triển của dự án này trống. Áp dụng mười migration theo thứ tự trong runbook. Nghiệm thu đăng nhập thật, RLS, Storage, tải và rollback.
2. Xác minh Page Partnership, quyền Meta và nguồn Organic trên tài khoản được duyệt. Hoàn thiện adapter, scheduler, biên nhận thật và Audience Listening trước khi bật xuất bản. Admin xác nhận vận hành theo runbook.
3. Cấp cấu hình Drive và thư mục được phép. Chọn môi trường render và STT nếu dùng video tự động. Chọn provider cho AI trong ứng dụng nếu cần. Chat Codex riêng tiếp tục dùng liên kết ngữ cảnh đã ghi trong [CHAT_LINK.md](CHAT_LINK.md).
4. Xác nhận báo cáo staging và lịch mở pilot. Mục chưa nghiệm thu hoặc còn phần triển khai được ghi theo tính năng trong [FEATURE_READINESS.md](FEATURE_READINESS.md).
