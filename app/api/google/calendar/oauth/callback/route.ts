import { NextResponse } from "next/server";
import {
  exchangeGoogleAuthorizationCode,
  GOOGLE_OAUTH_STATE_COOKIE,
  saveGoogleConnection,
  verifyGoogleOAuthState,
} from "@/lib/googleOAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resultPage(title: string, message: string, ok: boolean) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#111827;display:grid;place-items:center;min-height:100vh}.card{width:min(440px,calc(100% - 32px));background:white;border:1px solid #e5e7eb;border-radius:20px;padding:32px;box-shadow:0 20px 60px rgba(15,23,42,.12);text-align:center}.icon{width:54px;height:54px;margin:auto;border-radius:50%;display:grid;place-items:center;background:${ok ? "#dcfce7" : "#fee2e2"};color:${ok ? "#166534" : "#991b1b"};font-size:26px;font-weight:800}h1{font-size:22px;margin:18px 0 8px}p{color:#64748b;line-height:1.6;margin:0}.close{margin-top:22px;border:0;border-radius:11px;padding:11px 18px;background:#e11b22;color:white;font-weight:700;cursor:pointer}</style></head><body><main class="card"><div class="icon">${ok ? "✓" : "!"}</div><h1>${safeTitle}</h1><p>${safeMessage}</p><button class="close" onclick="window.close()">Đóng cửa sổ</button></main></body></html>`;
}

function oauthCookie(request: Request) {
  const value = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`))
    ?.slice(GOOGLE_OAUTH_STATE_COOKIE.length + 1) ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function htmlResponse(title: string, message: string, ok: boolean, status = 200) {
  const response = new NextResponse(resultPage(title, message, ok), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

async function assertManagerStillAuthorized(userId: string) {
  const admin = getSupabaseAdmin();
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    admin.from("profiles").select("status").eq("id", userId).maybeSingle<{ status: string }>(),
    admin.from("user_roles").select("role").eq("user_id", userId).in("role", ["Admin", "PR Leader"]),
  ]);
  if (profileError || rolesError) throw new Error("Không xác minh được quyền quản trị Google.");
  if (profile?.status !== "active" || !(roles ?? []).length) {
    throw new Error("Tài khoản không còn quyền kết nối Google cho hệ thống.");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnedState = url.searchParams.get("state") ?? "";
  try {
    const verifiedState = verifyGoogleOAuthState(oauthCookie(request), returnedState);
    if (!verifiedState) throw new Error("Phiên kết nối Google không hợp lệ hoặc đã hết hạn.");
    await assertManagerStillAuthorized(verifiedState.userId);
    const code = url.searchParams.get("code") ?? "";
    if (!code) throw new Error(url.searchParams.get("error_description") || "Google không trả về mã xác thực.");

    const tokens = await exchangeGoogleAuthorizationCode(code, url.origin);
    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const userInfo = await userInfoResponse.json().catch(() => ({})) as { email?: string };
    if (!userInfoResponse.ok || !userInfo.email) throw new Error("Không đọc được email tài khoản Google.");

    await saveGoogleConnection({
      accountEmail: userInfo.email,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      connectedBy: verifiedState.userId,
    });
    return htmlResponse(
      "Đã kết nối Google",
      "Google Calendar, Google Meet và Gmail đã sẵn sàng. Bạn có thể đóng cửa sổ này.",
      true,
    );
  } catch (error) {
    return htmlResponse(
      "Chưa kết nối được Google",
      error instanceof Error ? error.message : "Vui lòng thử lại.",
      false,
      400,
    );
  }
}
