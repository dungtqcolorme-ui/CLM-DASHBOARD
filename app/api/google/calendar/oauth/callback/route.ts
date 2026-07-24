import { NextResponse } from "next/server";
import { encryptGoogleToken, GOOGLE_OAUTH_STATE_COOKIE, googleOAuthConfig } from "@/lib/googleCalendar";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function resultPage(title: string, message: string, ok: boolean) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#111827;display:grid;place-items:center;min-height:100vh}.card{width:min(440px,calc(100% - 32px));background:white;border:1px solid #e5e7eb;border-radius:20px;padding:32px;box-shadow:0 20px 60px rgba(15,23,42,.12);text-align:center}.icon{width:54px;height:54px;margin:auto;border-radius:50%;display:grid;place-items:center;background:${ok ? "#dcfce7" : "#fee2e2"};color:${ok ? "#166534" : "#991b1b"};font-size:26px;font-weight:800}h1{font-size:22px;margin:18px 0 8px}p{color:#64748b;line-height:1.6;margin:0}.close{margin-top:22px;border:0;border-radius:11px;padding:11px 18px;background:#e11b22;color:white;font-weight:700;cursor:pointer}</style></head><body><main class="card"><div class="icon">${ok ? "✓" : "!"}</div><h1>${title}</h1><p>${message}</p><button class="close" onclick="window.close()">Đóng cửa sổ</button></main></body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`))
    ?.slice(GOOGLE_OAUTH_STATE_COOKIE.length + 1) ?? "";
  try {
    if (!state || !cookieState || state !== decodeURIComponent(cookieState)) {
      throw new Error("Phiên kết nối Google không hợp lệ hoặc đã hết hạn.");
    }
    if (!code) throw new Error(url.searchParams.get("error_description") || "Google không trả về mã xác thực.");
    const { clientId, clientSecret, redirectUri } = googleOAuthConfig(url.origin);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    const tokens = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      throw new Error(tokens.error_description || "Google không cấp refresh token. Hãy thử kết nối lại.");
    }
    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    const userInfo = await userInfoResponse.json().catch(() => ({})) as { email?: string };
    const { error } = await getSupabaseAdmin().from("google_calendar_integrations").upsert({
      id: "primary",
      google_account_email: userInfo.email ?? "",
      refresh_token_ciphertext: encryptGoogleToken(tokens.refresh_token),
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    const response = new NextResponse(
      resultPage("Đã kết nối Google Calendar", "Bạn có thể đóng cửa sổ này. Các cuộc họp mới sẽ tự tạo Google Meet.", true),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    const response = new NextResponse(
      resultPage(
        "Chưa kết nối được Google Calendar",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
        false,
      ),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }
}
