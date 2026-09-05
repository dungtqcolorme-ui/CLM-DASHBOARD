import { NextResponse } from "next/server";
import {
  DASHBOARD_PROFILE_COOKIE,
  DASHBOARD_ROLE_COOKIE,
  DASHBOARD_TOKEN_COOKIE,
  DASHBOARD_TOKEN_PART_COOKIE,
  getDashboardRequestIdentity,
} from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";
import { recordLastSeenForAppLoad } from "@/lib/lastSeen";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const COOKIE_PATH = "/api/dashboard";
const TOKEN_CHUNK_SIZE = 3000;
const DASHBOARD_LOAD_COOKIE = "clm_dashboard_load";

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
  response.cookies.set(DASHBOARD_LOAD_COOKIE, "", { ...cookieOptions, maxAge: 0, path: "/" });
}

export async function POST(request: Request) {
  try {
    const identity = await getDashboardRequestIdentity(request);
    const appLoadId = (request.headers.get("x-clm-app-load") ?? "").trim().slice(0, 120);
    const previousLoadId = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${DASHBOARD_LOAD_COOKIE}=`))
      ?.slice(DASHBOARD_LOAD_COOKIE.length + 1) ?? "";
    const isNewAppLoad = !appLoadId || previousLoadId !== encodeURIComponent(appLoadId);
    const lastSeenAt = isNewAppLoad
      ? await recordLastSeenForAppLoad({
        userId: identity.profile.id,
        roles: [identity.activeRole],
        write: async (userId, seenAt) => {
          const { data, error } = await getSupabaseAdmin()
            .from("profiles")
            .update({ last_seen_at: seenAt })
            .eq("id", userId)
            .select("last_seen_at")
            .single<{ last_seen_at: string }>();
          if (error || !data?.last_seen_at) {
            throw error ?? new Error("Không thể ghi nhận lần truy cập.");
          }
          return data.last_seen_at;
        },
      })
      : null;
    const sessionProfile = lastSeenAt
      ? { ...identity.profile, lastSeenAt, lastSignInAt: lastSeenAt }
      : identity.profile;
    const response = NextResponse.json({
      ok: true,
      activeRole: identity.activeRole,
      lastSeenAt: lastSeenAt ?? sessionProfile.lastSeenAt ?? null,
    });
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
      Buffer.from(JSON.stringify(sessionProfile), "utf8").toString("base64url"),
      cookieOptions,
    );
    if (appLoadId) {
      response.cookies.set(DASHBOARD_LOAD_COOKIE, appLoadId, {
        ...cookieOptions,
        maxAge: 24 * 60 * 60,
        path: "/",
      });
    }
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
