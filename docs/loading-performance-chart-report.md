# Coloro loading, bootstrap performance và status chart hotfix

Ngày:2026-11-04. Branch:`codex/loading-performance-chart-hotfix`. Baseline source:`bceb3a1` (bản preview gần nhất). Production vẫn là`38da3a8`; không merge/promote production.

## Kết quả

- Coloro chính thức xuất hiện ngay trong SSR/loading, dùng đúng vector gốc5315 bytes và CSS3180 bytes. Giữ đường nét, màu, tỷ lệ, mặt; chỉ animate wrapper/nhóm mắt. Có checking/loading, success nhẹ và error; reduced motion giữ nguyên transform gốc của artwork. Không thêm Rive/Motion/GSAP vào loading.
- Drive folder được kiểm tra lại:AI và PDF chính thức, không có.riv/state machine. Nếu cần Rive thật phải rig thủ công trong Rive Editor; bản này dùng SVG+CSS và không tự nhận là Rive. Nguồn:https://drive.google.com/drive/folders/11oY-32X0iaVz8_LRYVKZ3ETsuo-MAE-t
- Bỏ`data-clm-ready=1` có sẵn trong HTML: baseline đã chứng minh parent có thể đánh dấu ready khi Overview còn chưa tồn tại. Ready hiện chỉ được phát sau dữ liệu bắt buộc và render.
- Sau session POST thành công, cùng protected GET`/api/dashboard/state` được tải song song với shell. Promise chỉ sống trong một attempt của component, nonce/user/role được guard; hủy ở logout, retry, đổi vai trò, unmount, kể cả lúc session chờ và đọc body. JSON giữ dạng text qua bridge rồi parse trong iframe để tránh graph object khác realm. Snapshot đã dùng được giải phóng; reload frame lấy state mới.
- Motion179011 bytes được tải async khi vào một trong4workspace cần nó; Overview/loading không chờ runtime. HTML offline nhúng sẵn runtime để vẫn hoạt động không có mạng.
- Chart legend:count24px/percent30px/gap6px cũ được thay bằng cột intrinsic, right-aligned, tabular numbers và gap12px. Không thêm khoảng trắng vào số, không hardcode số demo trong production, không đổi màu/công thức/filter/chart interaction.

## Đo trước/sau

Đây là phép đo Chrome/CDP trên production build thực, với **auth/data giả lập** và3015 hồ sơ, không phải tuyên bố tốc độ production. Điều kiện:latency80ms,1MB/s,CPU2×; profile/session/shell/state latency cố định; native browser cache bật. External fonts/Google Sheet bị chặn để phép so sánh ổn định. Không gọi DB thật hoặc gửi mutation thật.

Usable được tính khi cả iframe ready **và DOM Overview thật tồn tại**; baseline ready-flag sớm không được tính là cải thiện. Có kiểm tra click chuyển tab sau usable. Mỗi cold/warm có3mẫu, login chỉ1mẫu. Baseline source/assets cố định từ git; kết quả có nhiễu proxy/OS/JIT và không phải Lighthouse score.

| Metric | Trước | Sau |
| --- | ---: | ---: |
| Usable cold (3 lần, median) | 1.942 ms | 1.640 ms |
| Usable warm/refresh (3 lần, median) | 1.758 ms | 1.441 ms |
| Login → usable (từ token request; 1 mẫu) | 1.601 ms | 1.307 ms |
| FCP parent cold | 260 ms | 232 ms |
| LCP parent cold — loading, không phải iframe | 260 ms | 800 ms |
| CDP ScriptDuration cold | 61 ms | 45 ms |
| CDP TaskDuration cold | 497 ms | 445 ms |
| TBT iframe cold | 113 ms | 91 ms |
| TBT iframe warm | 0 ms | 27 ms |
| JS parent trước usable | 787.302 bytes | 795.314 bytes |
| JS iframe trước usable | 212.675 bytes | 34.384 bytes |
| 4 API bắt buộc auth/profile + session + shell + state | 4 request | 4 request |
| Auth/bootstrap từ profile request → usable (cold) | 1490 ms | 1200 ms |
| State HTTP response ready (cold, theo parent navigation) | 1703 ms | 1138 ms |

- Các giá trị bundle là`decodedBodySize`, không phải byte gzip. Parent tăng nhẹ vì vector/helper; tổng JS parent+iframe trước usable giảm khoảng17%. JS riêng iframe giảm khoảng84%.
- Auth/profile/session vẫn một request mỗi lần boot; state không được bỏ qua hoặc cache dùng chung. State bắt đầu gần như ngay sau session và trước/sát shell, thay vì sau shell/asset parsing. Chi tiết timing từng request trong`tmp/loading-hotfix/*-performance.json`.
- LCP parent tăng ở cold load vì nó đo text/mascot loading đổi trạng thái, không đo nội dung trong iframe. Không gọi đây là cải thiện LCP ứng dụng.
- TBT iframe là tổng phần vượt50ms của Long Tasks trong frame; không phải số TBT Lighthouse toàn trang và không cộng trùng parent/frame. Warm TBT tăng một lượng nhỏ khi data sẵn ngay lúc bootstrap; không tuyên bố mọi chỉ số đều cải thiện.
- Chưa đo thời gian Supabase/Google Sheet thật hoặc tốc độ live production. Đồng bộ nền, invalidation và tất cả API server/auth/RLS/schema/mapping giữ nguyên; không bỏ request kiểm tra quyền.

## Kiểm thử và bảo vệ operation

- Lint, typecheck, **68/68tests**, dashboard source guards và Next.js production build đạt.
-9 focused tests:vector trùng chính xác asset gốc; không ready tĩnh; dedup một request/attempt; scope user/role; abort/clear; error/retry; hủy và deadline bao phủ body; truyền JSON text không đổi dữ liệu.
- Browser thật:checking/loading animate khi dữ liệu còn pending; ready chưa bật; success có frame-ready và pointer-events:none; loading unmount không còn animation; lỗiHTTP thật trong harness giữ nguyên thông báo và Thử lại hoạt động; reduced motion không animation và geometry BODY gốc còn nguyên; hai session vai trò trả ngược thứ tự chỉ mở một state request/frame mới nhất; reload frame lấy state mới.
- Chart:30tổ hợp5viewport(1920/1440/1366/1280/1024), số4–6chữ số,0/100%, nhãn Việt dài và viewport tương đương zoom125%; đo **vùng chữ thực**, min gap12px, không overlap. DPR2 cho ảnh Retina. Zoom là mô phỏng CSS viewport tương đương, chưa chứng nhận thao tác zoom native trong Chrome UI. Số trong ảnh là fixture kiểm thử, không phải source production.
-4workspace regression:47parity cases,49interactions,52captures; component guard4routes/40captures pass. Overview DOM giữ nguyên; styles/geometry/assets được bảo vệ ngoài5selector legend cho phép. Pixel diff1202 nằm trong legend; **0pixel thay đổi ngoài legend** ở ảnh1440×900. Không dùng mask ảnh.
- Server API, Supabase client/schema, Google Sheet mapping, business calculation/permission handlers, official logo/mascot asset đều không đổi.
- Independent source review phát hiện và xác nhận đã sửa cancellation ở session/body và continuation sau unmount; không còn issue quan trọng.

## Review artifacts

-`preview/loading-hotfix-review.html`:mô phỏng Coloro và ảnh chartBefore/After, không kết nối dữ liệu thật.
-`preview/creative-os-four-tabs.html`:offline regression preview4tab.
-`tmp/loading-hotfix/`:performance JSON/log, ảnh checking/loading/error/reduced, before/after chart, report số đo.

Loading Before được render trực tiếp từ React component/CSS của baseline bceb3a1; ảnh After lấy từ production build local đang chạy. Mô phỏng review không thay thế kiểm thử auth/data.

Preview deployment sẽ được xác nhận sau push. Giữ nguyên production cho đến khi bản sửa được kiểm chứng và người dùng phê duyệt.
