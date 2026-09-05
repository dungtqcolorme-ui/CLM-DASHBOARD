import { NextResponse } from "next/server";
import { listEmailJobs, resendEmailJob } from "@/lib/emailJobs";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requireManager(role: string) {
  if (role !== "Admin" && role !== "PR Leader") {
    throw new ApiAuthError("Bạn không có quyền xem lịch sử email.", 403);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireManager(identity.activeRole);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return NextResponse.json({ jobs: await listEmailJobs(limit) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đọc được lịch sử email." },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireManager(identity.activeRole);
    const body = await request.json().catch(() => ({})) as { action?: string; jobId?: string };
    if (body.action !== "resend" || !body.jobId) throw new ApiAuthError("Yêu cầu gửi lại không hợp lệ.", 400);
    return NextResponse.json(await resendEmailJob(body.jobId, identity.user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không gửi lại được email." },
      { status },
    );
  }
}
