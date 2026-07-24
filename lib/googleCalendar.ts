import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const INTEGRATION_ID = "primary";
export const GOOGLE_OAUTH_STATE_COOKIE = "clm_google_oauth_state";

type GoogleIntegrationRow = {
  refresh_token_ciphertext: string;
  google_account_email: string | null;
};

type CalendarEventInput = {
  id: string;
  title: string;
  notes: string;
  start: string;
  end: string;
  attendeeEmails: string[];
};

type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu cấu hình ${name}.`);
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_KEY")).digest();
}

export function encryptGoogleToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptGoogleToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Refresh token Google không hợp lệ.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function googleOAuthConfig(origin?: string) {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim()
    || (origin ? new URL("/api/google/calendar/oauth/callback", origin).toString() : "");
  if (!redirectUri) throw new Error("Thiếu cấu hình GOOGLE_REDIRECT_URI.");
  return { clientId, clientSecret, redirectUri };
}

export async function googleCalendarStatus() {
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
  if (!configured) return { configured: false, connected: false, accountEmail: "" };
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_integrations")
    .select("google_account_email,refresh_token_ciphertext")
    .eq("id", INTEGRATION_ID)
    .maybeSingle<GoogleIntegrationRow>();
  if (error) throw error;
  return {
    configured: true,
    connected: Boolean(data?.refresh_token_ciphertext),
    accountEmail: data?.google_account_email ?? "",
  };
}

async function accessToken() {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_integrations")
    .select("refresh_token_ciphertext,google_account_email")
    .eq("id", INTEGRATION_ID)
    .maybeSingle<GoogleIntegrationRow>();
  if (error) throw error;
  if (!data?.refresh_token_ciphertext) return null;
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptGoogleToken(data.refresh_token_ciphertext),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Không làm mới được quyền Google Calendar.");
  }
  return payload.access_token;
}

function stableCalendarEventId(meetingId: string) {
  return `clm${createHash("sha256").update(meetingId).digest("hex").slice(0, 32)}`;
}

function meetUrl(event: GoogleCalendarEvent) {
  return event.hangoutLink
    || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri
    || "";
}

async function calendarRequest<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Google Calendar từ chối yêu cầu.");
  return payload;
}

export async function syncGoogleCalendarMeeting(input: CalendarEventInput) {
  const token = await accessToken();
  if (!token) return { status: "not_connected" as const, eventId: "", meetUrl: "", calendarLink: "" };
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID?.trim() || "primary");
  const eventId = stableCalendarEventId(input.id);
  const existing = await calendarRequest<GoogleCalendarEvent>(
    token,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`,
  );
  const commonBody = {
    summary: input.title,
    description: input.notes,
    start: { dateTime: input.start, timeZone: "Asia/Ho_Chi_Minh" },
    end: { dateTime: input.end, timeZone: "Asia/Ho_Chi_Minh" },
    attendees: [...new Set(input.attendeeEmails)].map((email) => ({ email })),
  };
  const event = existing
    ? await calendarRequest<GoogleCalendarEvent>(
      token,
      `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "PUT",
        body: JSON.stringify({ ...commonBody, conferenceData: existing.conferenceData }),
      },
    )
    : await calendarRequest<GoogleCalendarEvent>(
      token,
      `/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify({
          id: eventId,
          ...commonBody,
          conferenceData: {
            createRequest: {
              requestId: `meet-${createHash("sha256").update(`${input.id}:${Date.now()}`).digest("hex").slice(0, 24)}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
  if (!event) throw new Error("Google Calendar không trả về sự kiện.");
  return {
    status: "synced" as const,
    eventId: event.id || eventId,
    meetUrl: meetUrl(event),
    calendarLink: event.htmlLink || "",
  };
}

export async function removeGoogleCalendarMeeting(eventId: string) {
  const token = await accessToken();
  if (!token || !eventId) return;
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID?.trim() || "primary");
  const response = await fetch(
    `${CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "Không thể xóa sự kiện Google Calendar.");
  }
}
