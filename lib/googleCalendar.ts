import "server-only";

import { createHash } from "node:crypto";
import {
  getGoogleAccess,
  GOOGLE_CALENDAR_SCOPE,
  googleConnectionStatus,
} from "@/lib/googleOAuth";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type CalendarEventInput = {
  id: string;
  title: string;
  notes: string;
  start: string;
  end: string;
  attendeeEmails: string[];
  recurrenceType: "none" | "weekly" | "monthly";
  recurrenceUntil: string | null;
};

type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

export async function googleCalendarStatus() {
  return googleConnectionStatus();
}

async function accessToken() {
  const access = await getGoogleAccess([GOOGLE_CALENDAR_SCOPE]);
  return access?.accessToken ?? null;
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
  const recurrence = input.recurrenceType !== "none" && input.recurrenceUntil
    ? [`RRULE:FREQ=${input.recurrenceType === "weekly" ? "WEEKLY" : "MONTHLY"};UNTIL=${input.recurrenceUntil.replaceAll("-", "")}T165959Z`]
    : undefined;
  const commonBody = {
    summary: input.title,
    description: input.notes,
    start: { dateTime: input.start, timeZone: "Asia/Ho_Chi_Minh" },
    end: { dateTime: input.end, timeZone: "Asia/Ho_Chi_Minh" },
    attendees: [...new Set(input.attendeeEmails)].map((email) => ({ email })),
    recurrence,
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
