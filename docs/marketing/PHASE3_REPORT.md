# Bàn giao Phase 3 core — Assets, Templates và Creative Workbench

Ngày 04/11/2026. Phát triển tiếp từ `b207e22` trên nhánh `codex/partnership-marketing-foundation`. Không deploy hoặc áp dụng migration production.

## Phần triển khai

- **Ảnh tải trực tiếp:** PNG/JPEG tối đa 8 MiB, nguồn/tác giả/tags/Campaign, kích thước thật và digest từ file. API kiểm tra giới hạn stream, signature/envelope, pixel và digest; upload bằng JWT người dùng vào bucket private `marketing-originals`, không upsert. Original có path bất biến. Upload hoàn tất vẫn cần người duyệt quyền.
- **Thư viện và quyền:** tìm theo tên/tag, lọc quyền/Campaign, preview private, provenance, trạng thái và kích thước. Leader/Admin đúng scope xét quyền Facebook, nội bộ, cần review hoặc thu hồi; có audit và optimistic version. Digest trùng chỉ là gợi ý, không tự xóa ảnh hay xác nhận quyền.
- **Canvas editable:** bản thiết kế mặc định chỉ tạo khi chọn rõ; retry trả lại cùng bản mặc định. Chỉnh text/shape/ảnh/logo bằng lớp có geometry, rotation, opacity, font enum, màu HEX, fit cover/contain; logo giữ tỷ lệ. Nhiều trang, thêm/xóa/đổi thứ tự, lock, numeric controls, kéo/phím mũi tên, undo/redo, fit/zoom, đổi format giữ scene. JSON scene là nguồn chỉnh sửa, PNG chỉ là bản xuất.
- **Phiên bản và phương án:** lưu với expected version, lịch sử bất biến, restore và tạo variant rõ ràng. Thay đổi thiết kế tăng phiên bản content/revision/audit để bước duyệt không dùng nhầm phiên bản cũ. Caption sạch nhận phiên bản mới; caption đang nhập giữ nguyên và xử lý xung đột rõ ràng.
- **Giữ bản đang nhập:** scene chưa lưu nằm trong RAM theo user/content, giữ base version khi chuyển trang trong Marketing. Không lưu scene/raster/token vào localStorage. Reload có cảnh báo; tắt/reload trình duyệt vẫn có thể mất bản chưa lưu. Lỗi GET tạm thời giữ draft để retry; mất quyền/đăng xuất hoặc scope exclusion đã xác nhận sẽ xóa cache. Chặn thay đổi canvas trong lúc request đang chờ để response không ghi đè thao tác mới.
- **Templates:** Personal riêng tư; Team/Campaign có submit/review; Official do Admin quản lý, không chứa ảnh gắn team. Lưu từ thiết kế đã lưu, apply có version/rights checks và giữ caption. Mẫu Personal/Team chỉ dùng ảnh cấp team; ảnh gắn Campaign phải lưu mẫu Campaign. Quyền/phạm vi ảnh luôn được kiểm tra lại, không nới scope để tái sử dụng.
- **Xuất PNG:** lưu scene trước, đọc phiên bản hiện hành, preflight và RPC `prepare_export`; fetch lại ảnh private, vẽ từng trang tuần tự, đóng bitmap sau dùng, tải PNG thật. Preview và export dùng chung renderer. Ảnh decode cho canvas giới hạn cạnh dài 1920; original không đổi. PNG không phải phê duyệt hay media final đã đóng băng trên server.
- **Gửi duyệt:** private trigger bổ sung vào luồng Foundation hiện có kiểm tra quyền ảnh của **tất cả variant hiện tại** và dẫn chứng ý tưởng đã chọn. Không bypass được bằng gọi trực tiếp RPC cũ. Caption-only vẫn hoạt động. Chưa có selector final variant/snapshot phê duyệt xuất bản Phase 4, nên một variant cũ có ảnh thiếu quyền cũng cần sửa trước khi gửi.

Vẫn đúng tám route Marketing; giữ logo, Brand DNA và caption/evidence/legacy iframe hiện hữu. Workbench lazy load cho nội dung đã lưu; mobile xếp panel dọc.

## Dữ liệu và API

Migration additive `20261104000300_marketing_creative.sql` tạo `marketing_assets`, `marketing_designs`, `marketing_templates`, `marketing_creative_versions`, `marketing_creative_audit_logs`, private bucket/policies và RPC invoker/private definer `marketing_creative_command`. Không sửa migration hoặc RPC Phase 1/2. Active identity/actual roles và membership của non-Admin được xác minh trong transaction; Admin giữ global scope theo Master Spec. Viewer chỉ đọc, personal template/history creator-private. Không có Marketing service-role write.

`GET/POST /api/marketing/creative`, raw upload `/creative/upload?reservation=...` và private file `/creative/file?id=...` đều dùng JWT. Không fetch URL ngoài, không signed URL dài hạn, không SVG/HTML upload, không token/log/role client tự khai. File trả no-store/nosniff và kiểm tra lại bytes hiện tại. Reservation upload giới hạn 20 phút, tối đa 10 pending còn hiệu lực mỗi creator.

`reported_sha256` là metadata khai báo đối với client SQL/Storage trực tiếp. Dù endpoint bình thường tính/kiểm tra bytes, digest này **không** phải hash integrity cho publishing snapshot. Phase 4 phải hash lại object bytes thực tế. Header/envelope validation không phải malware scan hoặc full raster decoder.

## Kiểm chứng

Kết quả máy đọc: `VERIFICATION_PHASE3.json` có **22 checks, 28 screenshots, errors=[]**, legacy iframe chỉ tải một lần. Browser→API thật→PostgreSQL tạm qua: upload/rights/canvas hai trang/PNG byte-pixel/template Campaign/clean caption submit/dirty caption conflict/thu hồi ảnh/mobile; giữ toàn bộ regression Phase 1/2. Hai PNG tải xuống được lưu ở `tmp/marketing/phase3-export-page-{1,2}.png`, đúng signature/kích thước 1080×1080; browser decode và kiểm tra pixel ảnh thật đã upload trong fixture.

`pnpm verify` cuối cùng qua **136/136 tests**, lint không warning, TypeScript, dashboard regression và production build. Các route Creative GET/POST/upload/file đã được kiểm tra HTTP local: chưa đăng nhập trả 401. Đã có baseline 109 tests. SQL creative dùng PostgreSQL PGlite tạm, gồm quyền/RLS, Storage reservation/metadata, template/history riêng tư, current rights/expiry, default/variant/restore, version invalidation, direct Foundation review và stale evidence. Bộ creative có 11 actual SQL-result → API validator roundtrips; foundation/knowledge regression lần lượt 33/7. Storage HTTP trong browser fixture là mô phỏng bytes trong RAM với metadata/RLS SQL thật, **không phải** kiểm thử service Supabase Storage thực.

Independent core review đạt yêu cầu. Whole-change review tìm hai P2 mất draft do GET tạm lỗi và canvas vẫn chỉnh khi đang lưu; đã có fix wave và regression chuyên biệt. Re-review hai P2 và review riêng resource-403 đều PASS, không có P1/P2 mới trong phạm vi kiểm tra. Browser chứng minh GET 500 + retry giữ draft, canvas không đổi trong deferred save, và revoke chặn download mới mà giữ scene.

## Phần còn lại

Đây là Phase 3 core thủ công, không khẳng định toàn bộ Phase 3–6 hoàn tất. Drive OAuth/folder grants/incremental sync/reconcile, semantic image search, AI layout/classifier/asset ranking, crop pan nâng cao, snap/copy-style/apply-all, khóa lựa chọn ảnh khi AI chọn lại, template slots tổng quát và server media snapshots còn chờ. UI review quyền hiện chưa nhập hạn mới (API/SQL hỗ trợ expiry); đây là giới hạn giao diện hiện tại.

Font là lựa chọn hệ thống cho editor, không phải font ColorME đã xác minh. Factual claims, quyền gốc, tính nguyên bản, chính tả, typography/logo và layout cần người kiểm tra; preflight ghi warning, không tự tuyên bố đạt. Cần kiểm tra file PNG xuất ra trước khi dùng.

AI/provider, web research, Drive và Meta chưa kết nối. Không sinh media AI, không publish/schedule/approve bài, không dựng video/voice, không background render hoặc analytics Organic giả. Chat riêng đã tạo trước đó chỉ nối bối cảnh web, không thay backend AI.

## Staging, rollout và rollback

Áp dụng Foundation → Knowledge → Creative trên staging được chọn rồi deploy app theo README thư mục này. Cần kiểm tra real Storage HTTP, MIME/metadata thực tế, toàn bộ policy inventory (policy kết hợp OR), real Auth/RLS, hai kết nối PostgreSQL, role revocation, dung lượng/quota và browser thật trước production. CLI chưa có trong môi trường nên migration file dùng timestamp fallback như các phase trước.

Chưa chạy remote migration hoặc deploy. Rollback app bằng revert commit Phase 3; giữ bảng/bucket/history additive để bảo toàn dữ liệu. Nếu cần tắt module trên môi trường đã rollout, dùng migration được review để revoke RPC và policy dành riêng bucket Marketing; không drop dữ liệu legacy hoặc viết lại migration đã áp dụng.
