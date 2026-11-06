# Phase 6 · Hardening và nghiệm thu local

Ngày 06/11/2026 theo giờ Việt Nam. Nhánh `codex/partnership-marketing-foundation`, sau Phase 5 `811b179`.

Migration `20261106000100_marketing_hardening.sql` bảo vệ cả sáu RPC ghi bằng ngân sách dùng chung ở database theo tài khoản và theo phút. Các hàm ghi gốc trở thành đường chạy nội bộ. Quyền, trạng thái tài khoản, membership, trạng thái Campaign và phiên bản vẫn được kiểm tra. Emergency Hold dùng quyền và lý do hiện tại, đi qua luồng xử lý riêng khi hết ngân sách thường. Xuất báo cáo giới hạn 10 lần/phút và đọc lại snapshot qua RLS sau bước giữ lượt. Review phát hiện thứ tự cũ có thể trả báo cáo khi quyền bị gỡ trong lúc đợi giữ lượt. Bản sửa đã qua test thu hồi quyền và review lại.

`/api/marketing/readiness` và bảng chẩn đoán trên Marketing Overview dành cho Admin thực tế. Probe SQL xác nhận phiên bản migration. Kết quả chỉ gồm trạng thái và tên thiết lập còn thiếu. Các tích hợp vẫn hiển thị đúng trạng thái chưa có bộ kết nối hay worker. Nhà vận hành có thể dựa vào `LAUNCH_RUNBOOK.md` để chuẩn bị staging, nghiệm thu, mở pilot và rollback. `FEATURE_READINESS.md` liệt kê phần đã có và phần còn lại theo spec.

## Kiểm thử

- `pnpm verify` đạt lint, typecheck, 190 unit/API tests, dashboard release và Turbopack production build. Sau khi giảm khoảng trắng PDF để tránh trang chỉ có một dòng, lint mục tiêu, sáu test export và build production chạy lại thành công.
- PostgreSQL tạm áp dụng đủ sáu migration theo thứ tự. Sáu suite SQL và 13 lượt parser → RPC → dữ liệu lưu đều đạt. Bao phủ quyền RPC, budget, Hold, upload metadata, Organic/paid/null, timeline và report version.
- PDF fixture ngắn một trang, PDF narrative dài bốn trang. Cả hai dùng font nhúng, có số trang và đọc lại được chữ tiếng Việt bằng PDFium và pdfminer. XLSX được mở bằng ExcelJS để kiểm tra chữ, giá trị null và số 0.
- Bản build production chạy toàn bộ browser fixture. 27 nhóm kiểm tra, 37 ảnh minh họa, 0 lỗi trình duyệt, một lần tải iframe cũ. Bao phủ tám trang, lịch sử điều hướng, Viewer 390 px, việc giữ dữ liệu chưa lưu trong Dashboard cũ, media và export. Kiểm tra HTTP trực tiếp xác nhận export yêu cầu đăng nhập. `VERIFICATION_PHASE6.json` lưu kết quả và thời gian mỗi bước của fixture. Các số này không thay cho đo p95 trên staging.
- Review độc lập Phase 5 xác nhận các bản sửa số liệu thiếu, manifest nguồn, nháp theo quyền và thời hạn preview. Review Phase 6 xác nhận bản sửa export và các đường RPC kiểm soát quyền.

## Dependency verification

The app baseline production audit reported 5 critical, 19 high, 13 moderate and 1 low advisory on 5 November 2026. The updated lockfile uses Next.js and eslint-config-next 16.4.5, React and React DOM 19.3.1, and targeted compatible overrides for transitive packages. ExcelJS's UUID dependency uses 11.1.1. The dev-only TypeScript ESLint parser path uses Minimatch 11.0.1. The final candidate lockfile audit covered production and development and returned zero advisories on 6 November 2026. Package deprecation notices remain separate from advisories.

Sources. [Next.js 16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5), [Next.js critical advisory and patched range](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Next.js npm registry metadata](https://registry.npmjs.org/next/16.4.5), [React npm registry metadata](https://registry.npmjs.org/react/19.3.1).

## Điều kiện vận hành còn lại

Các kiểm thử hiện có dùng database tạm, danh tính minh họa và Storage mô phỏng với byte thực của file fixture. Cần nghiệm thu trên Supabase và Storage staging, nhiều phiên PostgreSQL độc lập và dữ liệu có kích thước sử dụng dự kiến. Tích hợp Meta/Drive/AI, scheduler, render worker/STT và dữ liệu Organic thực cần các bước quyền, cấu hình và xác minh trong runbook. Phần cập nhật hiện ở nhánh local.
