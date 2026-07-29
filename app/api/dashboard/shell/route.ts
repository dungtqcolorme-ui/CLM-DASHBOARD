import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardRole } from "@/lib/authTypes";
import { getDashboardSessionIdentity } from "@/lib/dashboardSession";
import { ApiAuthError } from "@/lib/serverAuth";

const PRIVATE_BUCKET = "clm-dashboard-private";
const PRIVATE_DASHBOARD = "clm-dashboard-private (30).html";
const FALLBACK_DASHBOARD = "clm-dashboard-private (29).html";
const SHELL_CACHE_MS = 5 * 60 * 1000;

let shellCache: { html: string; expiresAt: number } | null = null;

async function loadDashboardShell(client: SupabaseClient) {
  if (shellCache && shellCache.expiresAt > Date.now()) return shellCache.html;
  const { data, error } = await client.storage
    .from(PRIVATE_BUCKET)
    .download(PRIVATE_DASHBOARD);
  if (!error && data) {
    const html = await data.text();
    shellCache = { html, expiresAt: Date.now() + SHELL_CACHE_MS };
    return html;
  }

  const { data: fallbackData, error: fallbackError } = await client.storage
    .from(PRIVATE_BUCKET)
    .download(FALLBACK_DASHBOARD);
  if (fallbackError || !fallbackData) {
    throw error ?? fallbackError ?? new Error("Không tìm thấy dashboard.");
  }
  const html = await fallbackData.text();
  return html;
}

function safeInlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(request: Request) {
  try {
    const identity = await getDashboardSessionIdentity();
    const profile = {
      id: identity.profile.id,
      email: identity.profile.email,
      fullName: identity.profile.fullName,
      status: identity.profile.status,
      roles: identity.profile.roles,
      activeRole: identity.activeRole,
      dashboardRole: dashboardRole(identity.activeRole),
      logoUrl: `${new URL(request.url).origin}/colorme-logo.png`,
    };
    const shell = await loadDashboardShell(identity.client);
    const bootstrap = `<script>window.__CLM_BOOTSTRAP_PROFILE__=${safeInlineJson(profile)};</script>`;
    const html = shell.includes("</head>")
      ? shell.replace("</head>", `${bootstrap}</head>`)
      : `${bootstrap}${shell}`;
    return new NextResponse(html, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể tải dashboard.";
    const safeMessage = escapeHtml(message);
    return new NextResponse(
      `<!doctype html><html lang="vi" data-clm-error="${safeMessage}"><meta charset="utf-8"><title>CLM Dashboard</title><body style="min-height:100vh;display:grid;place-items:center;font:16px Arial;color:#b42318">${safeMessage}</body></html>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
