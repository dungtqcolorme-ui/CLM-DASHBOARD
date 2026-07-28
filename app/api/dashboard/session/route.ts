import { NextResponse } from "next/server";
import {
  DASHBOARD_PROFILE_COOKIE,
  DASHBOARD_ROLE_COOKIE,
  DASHBOARD_TOKEN_COOKIE,
  DASHBOARD_TOKEN_PART_COOKIE,
  getDashboardRequestIdentity,
} from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";

const COOKIE_PATH = "/api/dashboard";
const TOKEN_CHUNK_SIZE = 3000;

const cookieOptions = {
  httpOnly: true,
  maxAge: 10 * 60,
  path: COOKIE_PATH,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function clearSession(response: NextResponse) {
  [
    DASHBOARD_TOKEN_COOKIE,
    DASHBOARD_TOKEN_PART_COOKIE,
    DASHBOARD_ROLE_COOKIE,
    DASHBOARD_PROFILE_COOKIE,
  ].forEach((name) => {
    response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
  });
}

export async function POST(request: Request) {
  try {
    const identity = await getDashboardRequestIdentity(request);
    const response = NextResponse.json({ ok: true, activeRole: identity.activeRole });
    response.cookies.set(
      DASHBOARD_TOKEN_COOKIE,
      identity.token.slice(0, TOKEN_CHUNK_SIZE),
      cookieOptions,
    );
    response.cookies.set(
      DASHBOARD_TOKEN_PART_COOKIE,
      identity.token.slice(TOKEN_CHUNK_SIZE),
      cookieOptions,
    );
    response.cookies.set(DASHBOARD_ROLE_COOKIE, identity.activeRole, cookieOptions);
    response.cookies.set(
      DASHBOARD_PROFILE_COOKIE,
      Buffer.from(JSON.stringify(identity.profile), "utf8").toString("base64url"),
      cookieOptions,
    );
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
