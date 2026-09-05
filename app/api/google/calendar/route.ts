import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { disconnectGoogleConnection, googleConnectionStatus } from "@/lib/googleOAuth";

function manager(role: string) {
  return role === "Admin" || role === "PR Leader";
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const status = await googleConnectionStatus();
    return NextResponse.json({
      ...status,
      accountEmail: manager(identity.activeRole) ? status.accountEmail : "",
      scopes: manager(identity.activeRole) ? status.scopes : [],
      lastError: manager(identity.activeRole) ? status.lastError : "",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không kiểm tra được Google Calendar." },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!manager(identity.activeRole)) {
      throw new ApiAuthError("Chỉ Admin hoặc PR Leader được ngắt kết nối Google.", 403);
    }
    return NextResponse.json(await disconnectGoogleConnection(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không ngắt được kết nối Google." },
      { status },
    );
  }
}
