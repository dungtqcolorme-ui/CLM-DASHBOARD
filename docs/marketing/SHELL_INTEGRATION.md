# Tích hợp Marketing vào ColorME Creative OS

`WorkspaceHost` trước đây ẩn iframe Dashboard khi URL chuyển sang `/marketing`. `MarketingProvider` dựng một sidebar, logo, thông tin tài khoản và thanh đầu trang riêng. Chế độ `embedded=1` bỏ sidebar phụ nhưng đường điều hướng `clm-marketing-open` vẫn đi tới trang Marketing ở cấp ứng dụng.

Dashboard giờ giữ một iframe đã xác thực trong suốt phiên. React đặt nội dung của route Marketing vào vùng `clm-marketing-content` trong chính iframe đó. URL cấp ứng dụng vẫn do Next.js quản lý. Sidebar dùng disclosure Marketing hiện có, với tám mục và trạng thái active theo route. Cầu nối chỉ nhận sự kiện từ iframe Dashboard cùng origin. Khi quay lại Legacy, shell hiện lại nội dung cũ hoặc mở đúng tab trong URL. Khi mở Marketing, các lượt vẽ nền của Legacy không ghi đè biểu mẫu đang ẩn.

| File | Thay đổi |
|---|---|
| `app/WorkspaceHost.tsx`, `app/dashboard-outlet.ts`, `app/page.tsx` | Giữ shell, truyền route vào vùng nội dung, khôi phục vai trò đã chọn cho đường dẫn Marketing và đồng bộ lịch sử. |
| `dashboard/clm-dashboard-private-34.html`, `lib/marketing/navigation.ts`, `public/marketing/legacy-navigation.{js,css}` | Gắn vùng nội dung, cập nhật menu theo URL, chuyển về tab Legacy và bảo toàn DOM khi vẽ lại shell. |
| `app/marketing/layout.tsx`, `app/marketing/workspace.tsx`, `app/marketing/components.tsx`, `app/marketing/task-links.tsx`, `app/marketing/video/sources.tsx` | Hiển thị nội dung Marketing, giữ Campaign Context, dùng Coloro khi tải, mở Task qua cùng router và xử lý tệp video từ document của shell. |
| `public/marketing/{workspace,knowledge,phase-five}.css`, `app/marketing/knowledge/{agent,dna,studio-evidence}.tsx`, `app/marketing/{reports/workspace,video/workbench}.tsx` | Chuyển stylesheet của Marketing vào document đang hiển thị. Các thành phần chung lấy font, màu, khoảng cách, bán kính và thời lượng chuyển động từ Creative OS. |
| `scripts/test-marketing-ui.mjs` | Chạy các luồng qua iframe Dashboard thực với dữ liệu giả lập, kiểm tra menu, lịch sử, biểu mẫu và breakpoint. |

Các hộp thoại Legacy được tạm ẩn khi chuyển sang Marketing bằng lịch sử trình duyệt. Nếu thao tác lưu Task đang chờ, phản hồi chỉ đóng hộp thoại đã gửi yêu cầu. Khi đăng xuất, shell bỏ hồ sơ và vai trò đã lưu trong bộ nhớ, đồng thời bỏ qua phản hồi hồ sơ thuộc phiên cũ.

## Kiểm thử

- `pnpm verify` đạt lint, TypeScript, 219 kiểm thử unit/API, hồi quy Dashboard và production build.
- Chrome đạt 37 kiểm tra với bốn vai trò trên dữ liệu giả lập và PostgreSQL tạm. Tám route Marketing, ba kích thước màn hình, sidebar thu gọn, lịch sử Back/Forward, Campaign Context, bản nháp caption, biểu mẫu Legacy và phản hồi Task đến muộn đều nằm trong lượt chạy.
- Luồng Dashboard → Overview → Campaigns → Studio → Calendar → Task → Marketing giữ một iframe Dashboard và một sidebar/header. Các lượt tải trực tiếp từng route được kiểm tra riêng.

Báo cáo chi tiết nằm ở `tmp/marketing/qa-report.json`. Ảnh so sánh ở `tmp/marketing-integration/before-marketing.png` và `tmp/marketing-integration/after-marketing.png`, cùng ảnh tablet và mobile trong thư mục đó. Dữ liệu trên ảnh là dữ liệu kiểm thử cục bộ.
