import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity, requireAnyRole } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PRIVATE_BUCKET = "clm-dashboard-private";
const MAX_DASHBOARD_BYTES = 2_500_000;
const DASHBOARD_FILE_PATTERN = /^clm-dashboard-private \(\d+\)\.html$/;

function apiError(error: unknown) {
  const status = error instanceof ApiAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Không thể phát hành dashboard.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireAnyRole([identity.activeRole], ["Admin"]);

    const fileName = request.headers.get("x-clm-dashboard-file")?.trim() ?? "";
    if (!DASHBOARD_FILE_PATTERN.test(fileName)) {
      throw new ApiAuthError("Tên phiên bản dashboard không hợp lệ.", 400);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DASHBOARD_BYTES) {
      throw new ApiAuthError("Dashboard vượt quá giới hạn 2,5 MB.", 413);
    }

    const body = new Uint8Array(await request.arrayBuffer());
    if (!body.byteLength || body.byteLength > MAX_DASHBOARD_BYTES) {
      throw new ApiAuthError("Nội dung dashboard trống hoặc vượt quá giới hạn.", 400);
    }
    const preview = new TextDecoder().decode(body.slice(0, 512)).toLowerCase();
    if (!preview.includes("<!doctype html") && !preview.includes("<html")) {
      throw new ApiAuthError("Tệp phát hành không phải HTML hợp lệ.", 400);
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.storage
      .from(PRIVATE_BUCKET)
      .upload(fileName, body, {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      });
    if (error) {
      const conflict = /already exists|duplicate/i.test(error.message);
      throw new ApiAuthError(
        conflict ? "Phiên bản dashboard này đã tồn tại." : error.message,
        conflict ? 409 : 500,
      );
    }

    return NextResponse.json({
      ok: true,
      fileName,
      bytes: body.byteLength,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
