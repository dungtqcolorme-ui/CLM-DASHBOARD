import { NextResponse } from "next/server";
import { getEmailSettings, updateEmailSettings } from "@/lib/emailJobs";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

function requireManager(role: string) {
  if (role !== "Admin" && role !== "PR Leader") {
    throw new ApiAuthError("Bạn không có quyền thay đổi cấu hình email.", 403);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireManager(identity.activeRole);
    return NextResponse.json({ settings: await getEmailSettings() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không đọc được cấu hình email." },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireManager(identity.activeRole);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({
      settings: await updateEmailSettings(body, identity.user.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được cấu hình email." },
      { status },
    );
  }
}
