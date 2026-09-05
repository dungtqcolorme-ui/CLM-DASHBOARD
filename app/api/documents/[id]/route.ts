import { NextResponse } from "next/server";
import {
  DocumentValidationError,
  isUuid,
  normalizeDocumentMutation,
  toDocumentDto,
  type DocumentRow,
} from "@/lib/documents";
import {
  isDocumentManager,
  requireDocumentDelete,
  requireDocumentStorageScope,
  requireDocumentUpdate,
} from "@/lib/documentsServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError || error instanceof DocumentValidationError
    ? error.status
    : error instanceof SyntaxError ? 400 : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}

async function documentId(context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) throw new DocumentValidationError("Mã tài liệu không hợp lệ.");
  return id;
}

async function findDocument(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiAuthError("Không tìm thấy tài liệu.", 404);
  return data as DocumentRow;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const identity = await getRequestIdentity(request);
    const id = await documentId(context);
    const current = await findDocument(id);
    requireDocumentUpdate(identity.activeRole, current.created_by, identity.user.id);
    if (!current.is_active && !isDocumentManager(identity.activeRole)) {
      throw new ApiAuthError("Tài liệu đã ngừng hoạt động.", 409);
    }
    const mutation = normalizeDocumentMutation(await request.json(), current);
    requireDocumentStorageScope(identity.activeRole, mutation.storage_path, identity.user.id);
    if (!isDocumentManager(identity.activeRole)) mutation.is_active = current.is_active;
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .update(mutation)
      .eq("id", id)
      .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata")
      .single();
    if (error) throw error;
    return NextResponse.json({ document: toDocumentDto(data as DocumentRow) });
  } catch (error) {
    return apiError(error, "Không thể cập nhật tài liệu.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const identity = await getRequestIdentity(request);
    requireDocumentDelete(identity.activeRole);
    const id = await documentId(context);
    const current = await findDocument(id);
    if (!current.is_active) return NextResponse.json({ deleted: true, id, alreadyInactive: true });
    const { error } = await getSupabaseAdmin()
      .from("documents")
      .update({
        is_active: false,
        legacy_metadata: {
          ...(current.legacy_metadata ?? {}),
          deactivatedAt: new Date().toISOString(),
          deactivatedBy: identity.user.id,
        },
      })
      .eq("id", id);
    if (error) throw error;
    // The Storage object is deliberately retained. Deactivating metadata is recoverable
    // and avoids deleting a file that may still be referenced by legacy dashboard state.
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiError(error, "Không thể xóa tài liệu.");
  }
}
