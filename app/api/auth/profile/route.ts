import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const { profile } = await getRequestIdentity(request);
    return NextResponse.json({ profile });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể đọc hồ sơ tài khoản.";
    return NextResponse.json({ error: message }, { status });
  }
}
