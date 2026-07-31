import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { getDashboardRequestIdentity, getDashboardSessionIdentity } from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";

const STATE_BUCKET = "clm-dashboard-state";
const STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";

export async function GET() {
  try {
    const identity = await getDashboardSessionIdentity();
    const { data: compressed, error: compressedError } = await identity.client.storage
      .from(STATE_BUCKET)
      .download(STATE_FILE);
    if (compressed && !compressedError) {
      const json = gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString("utf8");
      return new NextResponse(json, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Type": "application/json; charset=utf-8",
          "X-CLM-State-Format": "json",
        },
      });
    }
    const { data: legacy, error: legacyError } = await identity.client.storage
      .from(STATE_BUCKET)
      .download(LEGACY_STATE_FILE);
    if (legacyError || !legacy) throw compressedError ?? legacyError ?? new Error("Không tìm thấy dữ liệu dashboard.");
    return new NextResponse(await legacy.text(), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "application/json; charset=utf-8",
        "X-CLM-State-Format": "json",
      },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể tải dữ liệu dashboard.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getDashboardRequestIdentity(request);
    if (identity.activeRole === "Viewer") throw new ApiAuthError("Viewer chỉ có quyền xem dữ liệu.", 403);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) {
      throw new ApiAuthError("Dữ liệu dashboard không hợp lệ hoặc vượt quá 20 MB.", 400);
    }
    const stateBlob = new Blob([bytes], { type: "application/gzip" });
    const { error: uploadError } = await identity.client.storage.from(STATE_BUCKET).upload(STATE_FILE, stateBlob, {
      contentType: "application/gzip",
      upsert: true,
      cacheControl: "0",
    });
    if (uploadError) throw uploadError;
    const { error: metaError } = await identity.client.from("dashboard_state_meta").upsert({
      id: "main",
      updated_at: new Date().toISOString(),
      updated_by: identity.profile.id,
      size_bytes: bytes.byteLength,
    });
    if (metaError) throw metaError;
    return NextResponse.json({ saved: true, size: bytes.byteLength });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể lưu dữ liệu dashboard.";
    return NextResponse.json({ error: message }, { status });
  }
}
