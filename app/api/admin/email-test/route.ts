import { NextResponse } from "next/server";
import { queueTestEmail } from "@/lib/emailJobs";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (identity.activeRole !== "Admin" && identity.activeRole !== "PR Leader") {
      throw new ApiAuthError("Bạn không có quyền gửi email thử.", 403);
    }
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await queueTestEmail(body, identity.user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không gửi được email thử." },
      { status },
    );
  }
}
