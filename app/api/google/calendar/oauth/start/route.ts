import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { GOOGLE_OAUTH_STATE_COOKIE, googleOAuthConfig } from "@/lib/googleCalendar";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (identity.activeRole !== "Admin" && identity.activeRole !== "PR Leader") {
      throw new ApiAuthError("Chỉ Admin hoặc PR Leader được kết nối Google Calendar.", 403);
    }
    const origin = new URL(request.url).origin;
    const { clientId, redirectUri } = googleOAuthConfig(origin);
    const state = randomBytes(32).toString("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("scope", [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "));
    url.searchParams.set("state", state);
    const response = NextResponse.json({ url: url.toString() });
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return response;
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không bắt đầu được kết nối Google." },
      { status },
    );
  }
}
