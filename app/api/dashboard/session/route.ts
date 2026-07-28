import { NextResponse } from "next/server";
import {
  DASHBOARD_ROLE_COOKIE,
  DASHBOARD_TOKEN_COOKIE,
  getDashboardRequestIdentity,
} from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";

const COOKIE_PATH = "/api/dashboard";

function clearSession(response: NextResponse) {
  response.cookies.set(DASHBOARD_TOKEN_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: COOKIE_PATH,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(DASHBOARD_ROLE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: COOKIE_PATH,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function POST(request: Request) {
  try {
    const identity = await getDashboardRequestIdentity(request);
    const response = NextResponse.json({ ok: true, activeRole: identity.activeRole });
    response.cookies.set(DASHBOARD_TOKEN_COOKIE, identity.token, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: COOKIE_PATH,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set(DASHBOARD_ROLE_COOKIE, identity.activeRole, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: COOKIE_PATH,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể tạo phiên dashboard.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
