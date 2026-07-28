import { NextResponse } from "next/server";
import { getDashboardSessionIdentity } from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";

const STATE_BUCKET = "clm-dashboard-state";
const STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";

export async function GET() {
  try {
    const identity = await getDashboardSessionIdentity();
    const client = identity.client;
    const [{ data: compressed, error: compressedError }, { data: legacy }] = await Promise.all([
      client.storage.from(STATE_BUCKET).createSignedUrl(STATE_FILE, 60),
      client.storage.from(STATE_BUCKET).createSignedUrl(LEGACY_STATE_FILE, 60),
    ]);
    if (compressedError || !compressed?.signedUrl) {
      throw compressedError ?? new Error("Không tìm thấy dữ liệu dashboard.");
    }
    return NextResponse.json(
      {
        compressedUrl: compressed.signedUrl,
        legacyUrl: legacy?.signedUrl ?? "",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể tải dữ liệu dashboard.";
    return NextResponse.json({ error: message }, { status });
  }
}
