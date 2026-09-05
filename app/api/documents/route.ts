import { NextResponse } from "next/server";
import {
  DocumentValidationError,
  normalizeDocumentMutation,
  toDocumentDto,
  type DocumentRow,
} from "@/lib/documents";
import {
  isDocumentManager,
  requireDocumentCreate,
  requireDocumentStorageScope,
} from "@/lib/documentsServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError || error instanceof DocumentValidationError
    ? error.status
    : error instanceof SyntaxError ? 400 : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true"
      && isDocumentManager(identity.activeRole);
    let query = getSupabaseAdmin()
      .from("documents")
      .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata");
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query
      .order("main_category", { ascending: true })
      .order("sub_category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json(
      { documents: (data ?? []).map((row) => toDocumentDto(row as DocumentRow)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error, "Không thể tải danh sách tài liệu.");
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireDocumentCreate(identity.activeRole);
    const body = await request.json();
    const mutation = normalizeDocumentMutation(body);
    requireDocumentStorageScope(identity.activeRole, mutation.storage_path, identity.user.id);
    if (!isDocumentManager(identity.activeRole)) mutation.is_active = true;
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .insert({
        ...mutation,
        created_by: identity.user.id,
      })
      .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata")
      .single();
    if (error) throw error;
    return NextResponse.json(
      { document: toDocumentDto(data as DocumentRow) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "Không thể thêm tài liệu.");
  }
}
