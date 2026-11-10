# ColorME Creative OS — nâng cấp Creative Studio và Coloro

Mốc đối chiếu: commit `3cbaa9c`. Bản này được build và kiểm thử local trước khi phát hành. Kiến trúc production được đối chiếu từ source của mốc phát hành; lượt rà soát này không xác nhận được dashboard production có đăng nhập.

## Giao diện dùng chung

Creative OS cung cấp thanh điều hướng, logo, phiên đăng nhập và các bề mặt dùng chung. Tám màn hình Marketing tiếp tục dùng shell đó: Overview, Campaigns, AI Agent & Ideas, Creative Studio, Content Calendar, Asset & Template Library, Intelligence & Reports và Approval Inbox. Studio dùng lại `Panel`, trường nhập và quy tắc màu của Marketing; các cải tiến bố cục được giới hạn trong Studio. Không đổi route, API ghi dữ liệu, schema, quyền người dùng hay quy trình duyệt.

| Thành phần | Token hoặc quy tắc hiện có |
| --- | --- |
| Nền, panel, viền | `--cos-paper` #F1F1F1, `--cos-surface` #FFF, `--cos-border` #E9E9E5 |
| Văn bản | `--cos-ink` #242422, `--cos-muted` #686864; 14px thân bài, 12px phụ, 18px tiêu đề |
| Hành động và trạng thái | `--cos-brand` #E11B22, `--cos-brand-hover` #C41419; info/focus #354D8C, success #27603D, warning #805000, danger #AD1828 |
| Nhịp bố cục | 4 / 8 / 12 / 16 / 20 / 24 / 32px; góc điều khiển 8px, bề mặt 12–18px; sidebar 200px, khi thu gọn 76px |
| Kiểu chữ và tương tác | Kế thừa font của shell. Dùng chữ, focus và trạng thái nhấn cùng màu; tránh chỉ dùng màu để báo chọn. Chuyển trạng thái nhẹ theo token 140/220ms. |

Đối chiếu bằng UI UX Pro Max, Impeccable và [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines), với các mục tiêu kiểm tra thao tác từ creative-ui-quality. Impeccable detector không báo mẫu lỗi trong nhóm component được quét; kết quả tự động không thay thế kiểm tra bằng trình đọc màn hình hoặc chứng nhận WCAG.

## Coloro và chuyển động

Loader cũ có nhiều vòng lặp. `ColoroMotion` dùng cùng SVG chính thức, điều khiển bằng bảy trạng thái: idle, thinking, loading, success, error, creative và celebration. Mắt chớp hoặc liếc, thân thở, nghiêng hoặc nảy nhẹ theo trạng thái. Mỗi hoạt cảnh có số lượt chạy hữu hạn. Component tạm dừng khi khuất hoặc tab ẩn, dọn observer/listener khi rời màn hình và hiển thị tĩnh khi thiết bị yêu cầu giảm chuyển động. Các trạng thái có thể tái sử dụng; celebration chưa được gắn với một sự kiện nghiệp vụ. Loader đăng nhập giữ giao diện gọi cũ.

Motion 14.9.0 có sẵn cho trình bày ở Creative OS. CSS sở hữu toàn bộ chuyển động mới trên Coloro; không thêm GSAP cho các đoạn ngắn không cần timeline phức tạp. Không có gói mới trong manifest hoặc lockfile.

[Mẫu chiều sâu của Coloro](../creative-os/coloro-depth-review.html) đặt SVG chính thức trên ba lớp CSS, xoay thủ công, có chế độ tĩnh và không có vòng render liên tục. Mẫu nằm ngoài `public/` và chưa được tích hợp. Chưa tìm thấy mô hình 3D đã duyệt trong repo. Nếu duyệt phát triển tiếp, [Three.js](https://threejs.org/docs/) cung cấp renderer và scene, [React Three Fiber](https://r3f.docs.pmnd.rs/) gắn scene vào React, [Drei](https://drei.docs.pmnd.rs/) bổ sung tiện ích, [Theatre.js](https://www.theatrejs.com/docs/latest) phục vụ dựng timeline khi có nhu cầu. Chỉ cân nhắc tải theo yêu cầu và giữ SVG tĩnh cho thiết bị yếu hoặc người dùng giảm chuyển động.

## Trải nghiệm Studio

- Panel chat chỉnh được 248–376px và vẫn hiện cạnh canvas khi cuộn trên màn hình đủ rộng; khi xếp dọc, nút chuyển thẳng tới trợ lý đưa focus vào đúng vùng. Chat hướng dẫn kiểm tra caption, bố cục carousel, quyền ảnh và hồ sơ gửi duyệt. Đây là phản hồi theo quy tắc, chưa có LLM; hội thoại giữ tối đa sáu lượt trong phiên giao diện và không gửi dữ liệu ra ngoài.
- Canvas tự vừa cả chiều rộng lẫn chiều cao, vẫn có zoom và chỉnh layer bằng chuột hoặc bàn phím. Thuộc tính layer và ảnh nằm ở vùng riêng. Dải carousel cho chọn trang bằng bàn phím và xem hình của trang khác.
- Ảnh thu nhỏ chỉ tải ảnh được tham chiếu và có trong phạm vi thiết kế, qua đường đọc đã xác thực. Chỉ bắt đầu khi dải hiện trên màn hình, tải tuần tự, giữ bitmap cạnh tối đa 144px và hủy/giải phóng khi rời Studio hoặc đổi nguồn. Ảnh chưa tải hoặc không truy cập được có ô giữ chỗ. Canvas chính và PNG xuất vẫn dùng trình kết xuất hiện có.
- Video Studio và timeline hiện có tải theo yêu cầu. Không thêm sinh ảnh, video, giọng nói hoặc nội dung xuất bản tự động.

## Đo tải trang và phạm vi kiểm thử

Ba stylesheet thay đổi và controller cũ tăng tổng cộng **958 byte gzip** khi so nguồn ở `3cbaa9c` với bản local (gồm CSS loader được nhập vào stylesheet build). HTML build của `/marketing/studio` tham chiếu 11 chunk JS, tổng 886.822 byte thô / 263.996 byte gzip và một CSS 29.461 / 7.315 byte. Đây là kích thước asset ban đầu đo từ build, chưa tính cache, dữ liệu, ảnh và các chunk tải theo thao tác. Mẫu chiều sâu không nằm trong các chunk ứng dụng. Chưa có số trước/sau tương đương cho toàn bộ bundle JS.

- `pnpm verify`: lint, TypeScript, 219 bài kiểm thử unit/API, kiểm tra phát hành dashboard và build Next.js đều đạt.
- Chromium: 38 nhóm kiểm tra đạt, không có lỗi trình duyệt được ghi nhận. QA dùng phiên đăng nhập mẫu và PostgreSQL tách biệt, kiểm tra đủ tám route, chuyển sidebar, Back/Forward, nháp, quyền Viewer, duyệt và xuất PNG. Studio kiểm tra đổi chiều rộng bằng phím, focus trên mobile, ảnh thu nhỏ của trang không chọn, Fit 1080×1920, lọc ảnh, bảy trạng thái hữu hạn, tạm dừng ngoài màn hình và chế độ giảm chuyển động. [Chi tiết QA](../../tmp/creative-upgrade/qa-report.json)
- Mẫu chiều sâu đã mở bằng Chromium ở 390px: dùng phím End tới 35°, tải đủ SVG và chuyển sang trạng thái tĩnh khi bật giảm chuyển động.
- Độ tương phản token đo được trên nền trắng: chữ chính 15,55:1, chữ phụ 5,60:1, chữ trắng trên nút đỏ 4,79:1 và viền focus xanh 8,10:1. Kết quả này chỉ áp dụng cho các cặp màu đã đo.

Kiểm thử Chromium dùng dữ liệu mẫu local, không ghi dữ liệu thật. Ảnh thu nhỏ hiện tải byte ảnh gốc đã xác thực trước khi thu nhỏ ở máy khách; nên đo lưu lượng với carousel nhiều ảnh. Chưa đo trên thiết bị di động vật lý, chưa kiểm tra bằng trình đọc màn hình và chưa kiểm tra Supabase Storage production. Bước tiếp theo: xem trước bằng tài khoản staging, kiểm tra trên thiết bị thật, rồi xác nhận riêng nếu muốn đưa bản này lên production.

## Các file thay đổi

| File | Vai trò |
| --- | --- |
| `app/ColoroLoading.tsx`, `public/creative-os/coloro-loading.css` | Component Coloro theo trạng thái, loader tương thích và chuyển động CSS |
| `public/creative-os/creative-os.css`, `public/creative-os/mascot-controller.js` | Giới hạn chuyển động ở Overview và bổ sung trạng thái Creative |
| `app/marketing/studio/page.tsx`, `app/marketing/studio/assistant.tsx` | Bố cục Studio, panel chat, dẫn chứng và khu vực video |
| `app/marketing/creative/workbench.tsx`, `app/marketing/creative/carousel-strip.tsx`, `app/marketing/creative/render.ts` | Fit/zoom, bộ lọc ảnh, chọn trang, ảnh thu nhỏ và ô giữ chỗ |
| `public/marketing/workspace.css` | Bố cục theo chiều rộng, focus và kiểu Studio từ token dùng chung |
| `scripts/test-marketing-ui.mjs`, `scripts/marketing-creative-ui-checks.mjs` | Kiểm thử trình duyệt và ảnh QA |
| `docs/creative-os/coloro-depth-review.html`, `docs/marketing/CREATIVE_UPGRADE.md` | Mẫu thử cô lập và báo cáo |

Dependency đã dùng: React/Next.js hiện có và Canvas 2D, SVG, CSS, IntersectionObserver, ImageBitmap của trình duyệt. Chromium và PostgreSQL mẫu dùng bộ QA có sẵn ngoài repo.

## Ảnh đối chiếu local

| Màn hình | Trước | Sau |
| --- | --- | --- |
| Studio desktop | [Giao diện](../../tmp/creative-upgrade/studio-before-desktop.png) | [Giao diện](../../tmp/creative-upgrade/studio-after-desktop.png) |
| Workbench desktop | [Canvas](../../tmp/creative-upgrade/studio-editor-before-desktop.png) | [Canvas, carousel và chat](../../tmp/creative-upgrade/studio-editor-after-desktop.png) |
| Studio mobile | [Giao diện](../../tmp/creative-upgrade/studio-before-mobile.png) | [Giao diện](../../tmp/creative-upgrade/studio-after-mobile.png) · [Chat](../../tmp/creative-upgrade/studio-assistant-after-mobile.png) |

[Ảnh mẫu chiều sâu Coloro](../../tmp/creative-upgrade/coloro-depth-preview.png). Các ảnh Studio dùng dữ liệu mẫu, lưu local trong thư mục QA.
