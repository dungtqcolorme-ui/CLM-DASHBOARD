# Bàn giao Phase 2 core — Knowledge, DNA và Ideas

Ngày 04/11/2026. Nhánh `codex/partnership-marketing-foundation`, phát triển tiếp từ Phase 1 `ca58b3d`. Chưa áp dụng migration hoặc deploy production.

## Phần đã chạy thật

1. **Nguồn và dữ kiện:** thành viên nhập brief/tham chiếu HTTPS, trích nội dung, tác giả/ngày; Leader/Admin trong phạm vi duyệt hoặc thu hồi nguồn và xác minh/tranh chấp dữ kiện. Phân biệt sự kiện, giả thuyết, thông tin chờ xác minh. Thông tin khóa học/ưu đãi/học bổng/sự kiện/nhân sự cần hạn hiệu lực tương lai trước khi được xác minh. Đây là review của người dùng, không tuyên bố đã tải hoặc xác minh URL qua API.
2. **Nghiên cứu nội bộ:** Auto và Internal Only tìm từ khóa trong dữ kiện đã xác minh, còn hiệu lực và nguồn đã duyệt. Lưu run và tối đa 10 dẫn chứng chứa đúng ID/phiên bản nguồn và fact. Auto ghi rõ dùng nguồn nội bộ; Internal Only không gọi mạng. Deep Research lưu trạng thái Chưa cấu hình và không có tiến trình/nguồn giả.
3. **Idea Radar:** tạo đề xuất thủ công hoặc tối đa 5 đề xuất theo quy tắc từ dẫn chứng. Có hook/caption nháp, tuyến bài, mục tiêu/lý do, dấu vết nguồn và cảnh báo trùng văn bản. Đề xuất theo quy tắc được ghi rõ **không phải AI**. Chưa có kiểm tra ngữ nghĩa/embeddings.
4. **Chọn triển khai:** chỉ thao tác của thành viên mới tạo content Draft bình thường, giữ liên kết ý tưởng/dẫn chứng. SQL kiểm tra lại quyền, Campaign, nguồn/fact/phiên bản/hạn và khóa row trong transaction. Retry chọn cùng ý tưởng trả về cùng content ID; không tạo thêm bản nháp, Task, asset/render job hay lịch đăng. Studio hiển thị nguồn gốc và cảnh báo dẫn chứng không còn hợp lệ.
5. **Weekly Planner:** chỉnh ngày dự kiến của ý tưởng, lưu UTC/hiển thị giờ Việt Nam; không tự xếp lịch xuất bản. Ý tưởng tự động có dẫn chứng cũ không được gửi lại trường đã che để ghi đè caption.
6. **Brand DNA:** Master/Team/Post có đề xuất, diff trước/sau, phiên bản cơ sở, checkbox xác nhận áp dụng, từ chối và lịch sử bất biến. Admin áp dụng Master; Leader/Admin đúng team áp dụng Team; writer đúng team áp dụng Post. Team/Post không thể tạo hoặc thay Master hard rules. Dữ liệu sáng tạo kế thừa Master → Team → Post, không tự bịa font/màu/logo chuẩn.

Tất cả nằm trong tám entry Marketing sẵn có: Agent & Ideas, Brand Kit bên trong Assets, cùng panel evidence của Studio; không thêm mục sidebar thứ chín.

## API, dữ liệu và quyền

- Thêm `GET/POST /api/marketing/knowledge`, dùng xác thực JWT/profile/roles hiện có; không nhận role/actor do client tự khai và không ghi Marketing bằng service role.
- Thêm `lib/marketing/knowledge-{types,domain,server}.ts`: command allowlist, field limits, nullable fields, Unicode length, UUID, URL/timezone, evidence freshness, DNA inheritance, exact duplicate warnings và runtime redaction.
- Migration additive `20261104000200_marketing_knowledge.sql`: `marketing_sources`, `marketing_facts`, `marketing_research_runs`, `marketing_ideas`, `marketing_dna_profiles`, `marketing_dna_proposals`, `marketing_dna_versions`, `marketing_knowledge_audit_logs`.
- Invoker `public.marketing_knowledge_command(jsonb)` → private definer với search path rỗng, active status/actual roles/team, locks, version và kiểm tra quan hệ đúng team. Client chỉ có SELECT theo RLS, không có direct DML. Master proposals/audit chỉ Admin; Master DNA đã áp dụng đọc được bởi tài khoản active.
- Không sửa migration/RPC Phase 1. Ý tưởng chọn triển khai tạo content/revision/audit qua quy tắc hiện có. Creator/scope/provenance, nghiên cứu và lịch sử nhạy cảm được giữ bất biến.
- Runtime API che trích nội dung nguồn đã thu hồi, claim tương ứng và text đề xuất tự động có dẫn chứng cũ; vẫn giữ refs để UI phát hiện sai phiên bản. Audit/history vẫn được giữ theo quyền database. Chưa có ingest private Drive hay raw comments.
- Không thay package.json/lockfile, không cài thêm dependency ứng dụng, MCP hoặc media engine.

## Kiểm chứng

| Kiểm tra | Bằng chứng |
|---|---|
| Baseline | 90/90 unit/API tests của Phase 1 qua trước thay đổi |
| Full `pnpm verify` | 109/109 tests, lint, TypeScript, dashboard regression và production build |
| SQL Phase 2 | Suite quyền/RLS/constraints/workflow/stale evidence/DNA/idempotence qua; 7 maximum-value RPC→API validator roundtrips |
| SQL Phase 1 | Regression qua, giữ 33 RPC→API validator roundtrips |
| Browser/API/SQL | Playwright với identity fixture, handler API thật và PostgreSQL tạm: source/fact review → research → ideas → chọn đúng một Draft → Studio evidence; Deep Research chưa cấu hình; weekly UTC; DNA v1/v2/Team/Post; source revoke; đủ tám route/Back/Forward/mobile/iframe cũ |
| Review độc lập | Hai P2 về evidence stripping và base version DNA đã được sửa và re-review; exploit authenticated RPC cũ hiện bị từ chối `22023` |
| Bằng chứng máy đọc | `VERIFICATION_PHASE2.json`, ảnh minh họa dưới `tmp/marketing/phase2-*.png` |

SQL dùng PGlite tạm; identity của browser là fixture, không có tài khoản hoặc database production được dùng để ghi thử. Chưa chứng minh concurrency hai kết nối trên Supabase staging, OAuth thực, provider API, hoặc tác vụ background. Cần staging acceptance trước rollout.

## Các sửa lỗi từ review

- **Evidence laundering:** ý tưởng `rule_based` không thể xóa/thay dẫn chứng gốc rồi giữ caption để vượt source revoke. Update phải kiểm tra và giữ nguyên refs/versions gốc; constraint/trigger/selection cùng chặn evidence rỗng. Nguồn/fact được duyệt lại ở phiên bản mới có thể tạo ý tưởng mới; cùng phiên bản vẫn dedup giữa các run.
- **Bản nhập DNA:** form sạch nhận payload/base version mới đúng một lần sau apply; form dirty hoặc có cache giữ nguyên phiên bản cơ sở. Có nút bỏ bản nhập và nhận phiên bản máy chủ rõ ràng.
- **Date editor sau redaction:** Planner không mở form ghi đè từ DTO của đề xuất tự động có dẫn chứng cũ; dữ liệu và lịch sử không bị thay bằng placeholder.
- Giao diện dịch enum thành nhãn tiếng Việt; text dài dùng field limits giống API/SQL và không có nút giả gọi AI.

## Ranh giới còn lại

Đây là **Phase 2 core/workflow**, không khẳng định toàn bộ Marketing Agent đã hoàn tất. AI caption/strategy, web research thật, tự nghiên cứu định kỳ, semantic ranking/classifier, learning từ Organic Performance và tự đề xuất DNA bằng model vẫn chưa có provider. Chưa có Drive OAuth/assets/canvas/video, Meta adapter/publishing gateway/snapshot media, queue/render worker hoặc Organic/report ingest Phase 3–6.

Theo yêu cầu mới, đã tạo chat riêng trong CLM DB và xác minh đọc được chat web nguồn; xem `CHAT_LINK.md`. Liên kết đó phục vụ lấy bối cảnh, không thay API backend hay tự chọn provider/khóa. Không tạo hoặc sử dụng khóa AI, không sinh media AI và không gửi bài Meta.

## Chạy, rollout và rollback

Dùng hướng dẫn `README.md` trong thư mục này. Staging cần cả migration Foundation rồi Knowledge, profile/roles hiện có và Admin gán Marketing membership. Với database chưa có schema, UI trả trạng thái khởi tạo/migration thay vì dữ liệu giả. Chưa triển khai production trong phiên này.

Rollback ứng dụng bằng cách revert commit Phase 2, giữ bảng/history additive. Nếu cần tắt riêng command Knowledge, revoke authenticated execute của `public.marketing_knowledge_command(jsonb)` và `marketing_private.knowledge_command(jsonb)` bằng migration được review trên môi trường đã chọn. Không drop dữ liệu legacy hay sửa ngược migration đã áp dụng.
