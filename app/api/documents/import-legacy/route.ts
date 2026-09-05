import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import {
  documentIdentity,
  legacyDocumentMutation,
  UNCLASSIFIED_DOCUMENT_CATEGORY,
  type DocumentRow,
} from "@/lib/documents";
import { isDocumentManager } from "@/lib/documentsServer";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const STATE_BUCKET = "clm-dashboard-state";
const COMPRESSED_STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";
const MAX_STATE_BYTES = 50 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError ? error.status : error instanceof SyntaxError ? 400 : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status });
}

async function loadLegacyDocuments() {
  const admin = getSupabaseAdmin();
  const { data: compressed, error: compressedError } = await admin.storage
    .from(STATE_BUCKET)
    .download(COMPRESSED_STATE_FILE);
  let json = "";
  if (compressed && !compressedError) {
    const bytes = Buffer.from(await compressed.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) throw new ApiAuthError("State nén vượt quá giới hạn import.", 413);
    json = gunzipSync(bytes, { maxOutputLength: MAX_STATE_BYTES }).toString("utf8");
  } else {
    const { data: legacy, error } = await admin.storage.from(STATE_BUCKET).download(LEGACY_STATE_FILE);
    if (error || !legacy) throw compressedError ?? error ?? new Error("Không tìm thấy dashboard state.");
    if (legacy.size > MAX_STATE_BYTES) throw new ApiAuthError("Dashboard state vượt quá giới hạn import.", 413);
    json = await legacy.text();
  }
  const state = asRecord(JSON.parse(json));
  const nestedDb = asRecord(state.DB ?? state.db);
  const docs = Array.isArray(state.docs)
    ? state.docs
    : Array.isArray(nestedDb.docs) ? nestedDb.docs : [];
  if (docs.length > 5_000) throw new ApiAuthError("State có quá nhiều tài liệu để import an toàn.", 413);
  return docs;
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!isDocumentManager(identity.activeRole)) {
      throw new ApiAuthError("Chỉ Admin hoặc PR Leader được import tài liệu cũ.", 403);
    }
    const admin = getSupabaseAdmin();
    const docs = await loadLegacyDocuments();
    const { data: existingRows, error: existingError } = await admin
      .from("documents")
      .select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata");
    if (existingError) throw existingError;
    const existing = new Map<string, DocumentRow>();
    for (const row of existingRows ?? []) {
      const key = documentIdentity(row);
      if (key) existing.set(key, row as DocumentRow);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let invalid = 0;
    let unclassified = 0;
    const seen = new Set<string>();
    for (const legacy of docs) {
      let mutation;
      try {
        mutation = legacyDocumentMutation(legacy);
      } catch {
        invalid += 1;
        continue;
      }
      const key = documentIdentity(mutation);
      if (!key || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      if (mutation.main_category === UNCLASSIFIED_DOCUMENT_CATEGORY) unclassified += 1;
      const current = existing.get(key);
      if (current) {
        const improvesCategory = current.main_category === UNCLASSIFIED_DOCUMENT_CATEGORY
          && mutation.main_category !== UNCLASSIFIED_DOCUMENT_CATEGORY;
        if (!improvesCategory) {
          skipped += 1;
          continue;
        }
        const { error } = await admin.from("documents").update({
          main_category: mutation.main_category,
          sub_category: mutation.sub_category,
          keywords: [...new Set([...(current.keywords ?? []), ...mutation.keywords])],
          legacy_metadata: { ...(current.legacy_metadata ?? {}), ...mutation.legacy_metadata },
        }).eq("id", current.id);
        if (error) throw error;
        updated += 1;
        continue;
      }
      const { data: inserted, error } = await admin.from("documents").insert({
        ...mutation,
        created_by: identity.user.id,
      }).select("id,name,url,storage_path,document_type,main_category,sub_category,sort_order,is_active,keywords,created_by,created_at,updated_at,legacy_metadata").single();
      if (error) throw error;
      existing.set(key, inserted as DocumentRow);
      imported += 1;
    }
    return NextResponse.json({
      imported,
      updated,
      skipped,
      invalid,
      unclassified,
      sourceCount: docs.length,
    });
  } catch (error) {
    return apiError(error, "Không thể import tài liệu cũ.");
  }
}
