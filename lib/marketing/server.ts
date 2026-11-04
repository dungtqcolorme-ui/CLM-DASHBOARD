import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingWorkspace } from "./types";
import { MarketingError } from "@/lib/marketing/domain";

export const MARKETING_CAPABILITIES: MarketingWorkspace["capabilities"] = {
  meta: { status: "not_connected", label: "Chưa kết nối Meta", detail: "Chưa xác minh Page ColorME Partnership, OAuth và quyền xuất bản. Xuất bản trực tiếp đang tắt." },
  drive: { status: "not_connected", label: "Chưa kết nối Google Drive", detail: "Kết nối Calendar/Gmail hiện có không cấp quyền Drive. Cần cấu hình riêng và duyệt quyền sử dụng tài sản." },
  agent: { status: "not_configured", label: "AI chưa cấu hình", detail: "Kho kiến thức, tìm kiếm nội bộ và đề xuất theo quy tắc đã có trong AI Agent & Ideas. Chưa kết nối provider AI/nghiên cứu Internet; không có tác vụ AI chạy ngầm." },
  render: { status: "not_configured", label: "Render chưa cấu hình", detail: "Chưa có worker render video. Không có ảnh, video hoặc giọng nói được sinh bằng AI." },
};

export function databaseError(error: { code?: string } | null): never {
  const code = error?.code;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code ?? "")) {
    throw new MarketingError("Marketing chưa được khởi tạo trên database này. Admin cần áp dụng migration Marketing trên môi trường đã chọn.", 503, "schema_unavailable");
  }
  if (code === "40001" || code === "23505") throw new MarketingError("Dữ liệu đã thay đổi. Giữ bản đang chỉnh và tải phiên bản mới trước khi thử lại.", 409, "conflict");
  if (code === "42501" || code === "PGRST301") throw new MarketingError("Bạn không có quyền thực hiện thao tác này hoặc quyền truy cập đã thay đổi.", 403, "forbidden");
  if (["22023", "23514", "23503", "22P02", "22007", "22008"].includes(code ?? "")) throw new MarketingError("Dữ liệu hoặc trạng thái không hợp lệ. Kiểm tra các trường và phiên bản hiện tại.", 400, "invalid_input");
  throw new MarketingError("Không thể xử lý dữ liệu Marketing. Vui lòng thử lại.", 500, "internal_error");
}

export function marketingResponse(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
export function marketingErrorResponse(error: unknown) {
  if (error instanceof MarketingError) return marketingResponse({ error: error.message, code: error.code }, error.status);
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : 500;
  if (status === 401 || status === 403) return marketingResponse({ error: status === 401 ? "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại." : "Tài khoản không có quyền truy cập hoặc đã bị khóa.", code: status === 401 ? "unauthorized" : "forbidden" }, status);
  return marketingResponse({ error: "Không thể tải Marketing. Vui lòng thử lại.", code: "internal_error" }, 500);
}

// Return an explicit capacity error instead of silently presenting incomplete counts/calendar.
export async function readMarketingRows(client: SupabaseClient, table: string, columns: string, limit: number) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500; // Below Supabase's default Data API maximum of 1,000 rows.
  let offset = 0;
  while (offset <= limit) {
    let query = client.from(table).select(columns, { count: "exact" }).order("created_at", { ascending: false });
    query = table === "marketing_team_memberships"
      ? query.order("team_id").order("user_id") : query.order("id");
    const { data, error, count } = await query.range(offset, offset + pageSize - 1);
    if (error) databaseError(error);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (rows.length > limit || (count !== null && count > limit)) throw new MarketingError("Workspace vượt giới hạn tải của phiên bản này. Cần bổ sung phân trang theo team/Campaign trước khi xem đầy đủ.", 503, "capacity_limit");
    offset += data?.length ?? 0;
    if (count !== null && offset >= count) return rows;
    if (!data?.length) {
      if (count && count > offset) throw new MarketingError("Dữ liệu đang thay đổi. Vui lòng tải lại để xem đầy đủ.", 503, "read_incomplete");
      return rows;
    }
    if (count === null && data.length < pageSize) return rows;
  }
  return rows;
}

export async function readBoundedJson(request: Request) {
  if (!(request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase().match(/^application\/json$/)) throw new MarketingError("Yêu cầu cần định dạng JSON.", 415, "unsupported_media_type");
  const maxBytes = 256 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new MarketingError("Dữ liệu vượt giới hạn 256 KB.", 413, "payload_too_large");
  if (!request.body) throw new MarketingError("Thiếu nội dung yêu cầu.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new MarketingError("Dữ liệu vượt giới hạn 256 KB.", 413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new MarketingError("Nội dung JSON không hợp lệ."); }
}
