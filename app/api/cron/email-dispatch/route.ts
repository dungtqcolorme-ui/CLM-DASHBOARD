import { NextResponse } from "next/server";
import { runEmailDispatcher } from "@/lib/emailJobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return { ok: false as const, status: 503, error: "Scheduler chưa được cấu hình." };
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false as const, status: 401, error: "Không có quyền gọi scheduler." };
  }
  return { ok: true as const };
}

async function dispatch(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const result = await runEmailDispatcher();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email worker thất bại." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}
