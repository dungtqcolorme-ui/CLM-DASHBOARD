import { NextResponse } from "next/server";
import { emailAdminStatus } from "@/lib/emailJobs";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

function requireManager(role: string) {
  if (role !== "Admin" && role !== "PR Leader") {
    throw new ApiAuthError("Bạn không có quyền xem cấu hình email.", 403);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireManager(identity.activeRole);
    return NextResponse.json(await emailAdminStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đọc được trạng thái email." },
      { status },
    );
  }
}
