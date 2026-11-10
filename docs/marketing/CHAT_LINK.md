# Chat riêng và nguồn ChatGPT web

Theo yêu cầu ngày 04/11/2026, đã tạo chat Codex **ColorME Marketing · Kết nối chat web** trong project **CLM DB**, môi trường local, cùng workspace.

- Chat mới: `01a1a6f1-1bd5-7a41-814f-4a18dd746844`, host `local`.
- Chat triển khai gốc: `01a1a4c3-6482-79f1-bc05-6ff3695fedf9`, host `local`.
- Nguồn web đã đối chiếu đúng hai đặc tả: [Tìm repo MCP social media](https://chatgpt.com/c/6ae31074-1c0c-83ec-95b1-be8cb8805401), conversation ID `6ae31074-1c0c-83ec-95b1-be8cb8805401`.

Công cụ `read_thread` đã đọc được lịch sử nguồn web. Chat mới đã xác nhận đọc các lượt gần đây, hai bản đặc tả trong `docs/marketing/` và báo cáo/kế hoạch triển khai. Nó không sửa file hoặc can thiệp vào Phase 2 đang triển khai.

## Hỏi chat Codex từ Creative Studio

Khi được bật cho tài khoản Admin đã chỉ định, **Trợ lý Studio** gửi câu hỏi văn bản vào hàng đợi riêng của ColorME. Cầu nối chạy trên máy giữ chat, nhận từng câu hỏi rồi dùng Codex CLI để tiếp tục đúng ID chat **ColorME Marketing · Kết nối chat web**. Kết quả của lượt đó hiện trong Studio và lưu trong chat Codex hiện có. Cầu nối dùng phiên ChatGPT đã đăng nhập trong Codex.

- Web cần migration `20261110000100_marketing_codex_bridge.sql`, biến máy chủ `CLM_CODEX_OWNER_ID` bằng UUID hồ sơ CLM của Admin được phép và `CLM_CODEX_BRIDGE_TOKEN` ngẫu nhiên 32 byte dạng 64 ký tự hex. Máy chủ dùng Supabase service role hiện có để gọi RPC riêng.
- Máy chạy cầu nối cần Codex CLI đã đăng nhập ChatGPT, `CLM_CODEX_WEB_URL` trỏ tới đúng môi trường Studio, `CLM_CODEX_THREAD_ID` bằng ID chat ở trên, và cùng `CLM_CODEX_BRIDGE_TOKEN`. Giữ token trong cấu hình riêng của máy chủ và máy chạy cầu nối.
- Từ workspace CLM Dashboard, chạy `node scripts/studio-codex-bridge.mjs`. Tiến trình chỉ kết nối đi ra website, không mở cổng vào máy. Khi máy ngủ hoặc tiến trình dừng, Studio hiện trạng thái chờ đến khi lượt hết hạn. Dừng tiến trình bằng Ctrl+C.
- Một lượt được nhận tại một thời điểm. Chỉ câu hỏi do Admin nhập được gửi. Chế độ Codex chỉ tư vấn văn bản với quyền đọc và công cụ shell, app, MCP, hooks, agent phụ và tìm kiếm web bị tắt. Hạn chế chạy song song trực tiếp trong chính chat này trong khi cầu nối đang xử lý một lượt.
- Bản hiện tại hiện phản hồi ở panel đang mở và duy trì lịch sử đầy đủ trong chat Codex. Lượt đã gửi tiếp tục chạy nếu người dùng đóng panel. Tải lại cùng tab tiếp tục theo dõi lượt đang chờ. Hàng đợi cho đọc kết quả trong tối đa 24 giờ và dọn lượt hết hạn khi cầu nối chạy hoặc khi gửi câu hỏi mới. Prompt được xóa khi lượt hoàn thành hoặc hết hạn và được dọn.

Tham khảo giao thức [Codex App Server](https://learn.chatgpt.com/docs/app-server) và lệnh [Codex non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode).
