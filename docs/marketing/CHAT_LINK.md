# Chat riêng và nguồn ChatGPT web

Theo yêu cầu ngày 04/11/2026, đã tạo chat Codex **ColorME Marketing · Kết nối chat web** trong project **CLM DB**, môi trường local, cùng workspace.

- Chat mới: `01a1a6f1-1bd5-7a41-814f-4a18dd746844`, host `local`.
- Chat triển khai gốc: `01a1a4c3-6482-79f1-bc05-6ff3695fedf9`, host `local`.
- Nguồn web đã đối chiếu đúng hai đặc tả: [Tìm repo MCP social media](https://chatgpt.com/c/6ae31074-1c0c-83ec-95b1-be8cb8805401), conversation ID `6ae31074-1c0c-83ec-95b1-be8cb8805401`.

Công cụ `read_thread` đã đọc được lịch sử nguồn web. Chat mới đã xác nhận đọc các lượt gần đây, hai bản đặc tả trong `docs/marketing/` và báo cáo/kế hoạch triển khai. Nó không sửa file hoặc can thiệp vào Phase 2 đang triển khai.

## Hỏi chat Codex từ Creative Studio

Khi cầu nối được bật, mọi tài khoản CLM đang hoạt động và có vai trò Marketing đều có thể hỏi từ **Trợ lý Studio**, gồm Admin, PR Leader, PR Representative và Viewer. Câu hỏi đi vào hàng đợi riêng của ColorME. Cầu nối chạy trên máy giữ chat rồi dùng Codex CLI tiếp tục đúng chat **ColorME Marketing · Kết nối chat web**. Phản hồi của một lượt chỉ được trả về tài khoản gửi lượt đó. Các lượt chia sẻ ngữ cảnh của cùng chat Codex.

- Áp dụng migration `20261110000100_marketing_codex_bridge.sql`. Người vận hành đặt một cấu hình riêng trong `marketing_private.codex_relay` với ID chat cố định và SHA-256 của token ngẫu nhiên 32 byte ở dạng hex. Cấu hình đó bật cầu nối. Vercel dùng phiên Supabase theo tài khoản CLM như các trang Marketing khác.
- Máy chạy cầu nối cần Codex CLI đã đăng nhập ChatGPT, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLM_CODEX_THREAD_ID` bằng ID chat đã ghim và `CLM_CODEX_BRIDGE_TOKEN` đúng token trước khi băm. Giữ token trong file env riêng trên máy. Supabase lưu bản băm.
- Từ workspace CLM Dashboard, chạy `node --env-file=.env.codex-bridge.local scripts/studio-codex-bridge.mjs`. Tiến trình chỉ kết nối đi ra Supabase. Khi máy ngủ hoặc cầu nối dừng, Studio hiện trạng thái chờ tới khi lượt hết hạn. Dừng tiến trình chạy tay bằng Ctrl+C.
- Cầu nối xử lý từng lượt theo thứ tự. Mỗi tài khoản có tối đa một lượt đang chờ hoặc đang chạy, tối đa ba lượt mới mỗi phút và tám lượt chờ hoặc đang chạy trong hàng đợi chung. Chỉ câu hỏi do người dùng nhập được gửi. Codex chạy ở chế độ tư vấn văn bản với shell, app, MCP, hooks, agent phụ và tìm kiếm web bị tắt.
- Tải lại cùng tab tiếp tục theo dõi lượt đang chờ. Studio hiển thị phản hồi của lượt mình gửi, còn lịch sử đầy đủ nằm trong chat Codex gốc. Hàng đợi cho đọc kết quả tối đa 24 giờ và dọn lượt hết hạn trong các lần chạy tiếp theo. Prompt được xóa khỏi hàng đợi khi lượt hoàn thành hoặc khi được dọn vì hết hạn.

Tham khảo giao thức [Codex App Server](https://learn.chatgpt.com/docs/app-server) và lệnh [Codex non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode).
