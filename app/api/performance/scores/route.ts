import { NextResponse } from "next/server";
import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";
import { parseCsvGrid, parseScoreGrid } from "@/lib/performance.mjs";

const SOURCE = "https://docs.google.com/spreadsheets/d/1-IGdPJkD3llFLZ7ityNyI8QaZeCm90YWqOaPjV0IbBE/export?format=csv&gid=662784842";

export async function GET(request: Request) {
  try {
    await getDashboardRequestIdentity(request);
    const response = await fetch(SOURCE, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ApiAuthError(`Không thể đọc Google Sheet (${response.status}).`, 502);
    const csv = await response.text();
    if (/<(?:!doctype|html)/i.test(csv)) throw new ApiAuthError("Google Sheet yêu cầu quyền truy cập.", 502);
    const grid = parseCsvGrid(csv);
    if (grid[0]?.[0]?.trim() !== "Nhân sự" || grid[0]?.[3]?.trim() !== "Hạng mục") {
      throw new ApiAuthError("Cấu trúc cột Google Sheet đã thay đổi; cần kiểm tra nguồn điểm.", 502);
    }
    const courses = parseScoreGrid(grid);
    return NextResponse.json({ courses, source: { url: SOURCE, rows: grid.length, fetchedAt: new Date().toISOString() } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải Hiệu suất." }, {
      status: error instanceof ApiAuthError ? error.status : 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
