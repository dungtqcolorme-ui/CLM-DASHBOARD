import { NextResponse } from "next/server";
import {
  cleanDocumentStoragePath,
  DocumentValidationError,
  isUuid,
  type DocumentRow,
} from "@/lib/documents";
import { DOCUMENTS_BUCKET, isDocumentManager } from "@/lib/documentsServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError || error instanceof DocumentValidationError
    ? error.status
    : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await getRequestIdentity(request);
    const { id } = await context.params;
    if (!isUuid(id)) throw new DocumentValidationError("Mã tài liệu không hợp lệ.");
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiAuthError("Không tìm thấy tài liệu.", 404);
    const document = data as DocumentRow;
    if (!document.is_active && !isDocumentManager(identity.activeRole)) {
      throw new ApiAuthError("Tài liệu đã ngừng hoạt động.", 404);
    }
    if (document.document_type === "link") {
      if (!document.url) throw new ApiAuthError("Tài liệu chưa có link hợp lệ.", 409);
      const target = new URL(document.url);
      if (target.protocol !== "https:" && target.protocol !== "http:") {
        throw new ApiAuthError("Link tài liệu không an toàn.", 409);
      }
      return NextResponse.json(
        { url: target.toString(), documentType: "link", expiresIn: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const path = cleanDocumentStoragePath(document.storage_path);
    if (!path) throw new ApiAuthError("Tài liệu chưa có file trong Storage.", 409);
    const download = new URL(request.url).searchParams.get("download") === "true";
    const { data: signed, error: signedError } = await getSupabaseAdmin()
      .storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, 600, download ? { download: document.name } : undefined);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Không thể tạo link tạm thời.");
    return NextResponse.json(
      { url: signed.signedUrl, documentType: "file", expiresIn: 600 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error, "Không thể mở tài liệu.");
  }
}
