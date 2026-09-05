import "server-only";

import { randomUUID } from "node:crypto";
import {
  dailyReportTemplate,
  DEFAULT_EMAIL_TIMEZONE,
  meetingReminderTemplate,
  testEmailTemplate,
  type DailyReportMeeting,
  type DailyReportTask,
} from "@/lib/emailTemplates";
import { GmailSendError, sendGmail, validEmail } from "@/lib/gmail";
import { googleConnectionStatus } from "@/lib/googleOAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EmailJobStatus = "pending" | "processing" | "sent" | "failed" | "skipped";
type DailyRecipientMode = "personal" | "team_summary";

export type DailyRecipient = {
  email?: string;
  userId?: string;
  name?: string;
  mode: DailyRecipientMode;
};

type EmailSettingsRow = {
  id: string;
  meeting_reminders_enabled: boolean;
  meeting_reminder_minutes: number;
  daily_report_enabled: boolean;
  daily_report_time: string | null;
  timezone: string;
  daily_report_recipients: unknown;
  max_retry_count: number;
  updated_at: string;
};

type EmailJobRow = {
  id: string;
  type: "meeting_reminder" | "daily_report";
  reference_id: string;
  occurrence_start: string | null;
  recipient_id: string | null;
  recipient_email: string;
  recipient_name: string;
  scheduled_for: string;
  status: EmailJobStatus;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  next_attempt_at: string | null;
  locked_at: string | null;
  locked_by: string;
  error_message: string;
  provider_message_id: string;
  sent_at: string | null;
  skipped_at: string | null;
  payload: Record<string, unknown> | null;
  is_manual: boolean;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
};

type MeetingRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  notes: string;
  meeting_link: string;
  meeting_type: "google_meet" | "in_person";
  location: string;
  recurrence_type: "none" | "weekly" | "monthly";
  recurrence_until: string | null;
  status: string;
  created_by: string;
  version: number;
};

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
};

type TaskRow = {
  id: string;
  title: string;
  owner_id: string;
  deadline: string;
  status: string;
  completed_at: string | null;
  original_task_id: string;
  rescheduled_from_task_id: string;
  updated_at: string;
  deleted_at: string | null;
};

type PlannedMeetingJob = {
  type: "meeting_reminder";
  reference_id: string;
  occurrence_start: string;
  recipient_id: string;
  recipient_email: string;
  recipient_name: string;
  scheduled_for: string;
  status: "pending";
  idempotency_key: string;
  max_retries: number;
  payload: Record<string, unknown>;
};

function safeError(value: unknown, max = 2_000) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function dateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timeKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function zonedDateTime(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const rendered = localParts(new Date(naive), timezone);
  const renderedAsUtc = Date.UTC(
    rendered.year,
    rendered.month - 1,
    rendered.day,
    rendered.hour,
    rendered.minute,
    rendered.second,
  );
  return new Date(naive - (renderedAsUtc - naive));
}

function addDateDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days, 12));
  return result.toISOString().slice(0, 10);
}

function normalizeTime(value: string | null) {
  const time = String(value ?? "").slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}

function validUuid(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
    ? text
    : "";
}

function normalizedRecipients(value: unknown): DailyRecipient[] {
  if (!Array.isArray(value)) return [];
  const recipients: DailyRecipient[] = [];
  for (const item of value.slice(0, 50)) {
    if (typeof item === "string") {
      const email = validEmail(item);
      if (email) recipients.push({ email, name: email, mode: "team_summary" });
      continue;
    }
    const source = record(item);
    const email = validEmail(source.email);
    const userId = validUuid(source.userId);
    const mode = source.mode === "personal" ? "personal" : "team_summary";
    if (mode === "personal" && !userId) continue;
    if (!email && !userId) continue;
    recipients.push({
      ...(email ? { email } : {}),
      ...(userId ? { userId: userId.slice(0, 120) } : {}),
      name: String(source.name ?? "").trim().slice(0, 160),
      mode,
    });
  }
  const deduped = new Map<string, DailyRecipient>();
  for (const recipient of recipients) {
    deduped.set(`${recipient.userId || ""}:${recipient.email || ""}:${recipient.mode}`, recipient);
  }
  return [...deduped.values()];
}

export async function getEmailSettings() {
  const { data, error } = await getSupabaseAdmin()
    .from("system_settings")
    .select("id,meeting_reminders_enabled,meeting_reminder_minutes,daily_report_enabled,daily_report_time,timezone,daily_report_recipients,max_retry_count,updated_at")
    .eq("id", "email")
    .single<EmailSettingsRow>();
  if (error) throw error;
  return {
    meetingRemindersEnabled: data.meeting_reminders_enabled,
    meetingReminderMinutes: data.meeting_reminder_minutes,
    dailyReportEnabled: data.daily_report_enabled,
    dailyReportTime: normalizeTime(data.daily_report_time),
    timezone: data.timezone || DEFAULT_EMAIL_TIMEZONE,
    dailyReportRecipients: normalizedRecipients(data.daily_report_recipients),
    maxRetryCount: data.max_retry_count,
    updatedAt: data.updated_at,
  };
}

export async function updateEmailSettings(value: unknown, actorId: string) {
  const input = record(value);
  const current = await getEmailSettings();
  const timezone = String(input.timezone ?? current.timezone).trim();
  if (!validTimezone(timezone)) throw new Error("Timezone không hợp lệ.");
  const dailyReportTime = input.dailyReportTime === null || input.dailyReportTime === ""
    ? null
    : normalizeTime(String(input.dailyReportTime ?? current.dailyReportTime ?? ""));
  const dailyReportEnabled = input.dailyReportEnabled === undefined
    ? current.dailyReportEnabled
    : input.dailyReportEnabled === true;
  if (dailyReportEnabled && !dailyReportTime) throw new Error("Vui lòng cấu hình thời gian gửi Daily Report.");
  const recipients = input.dailyReportRecipients === undefined
    ? current.dailyReportRecipients
    : normalizedRecipients(input.dailyReportRecipients);
  if (dailyReportEnabled && !recipients.length) throw new Error("Vui lòng cấu hình ít nhất một người nhận Daily Report.");
  if (dailyReportEnabled) {
    const resolved = await resolveDailyRecipients(recipients);
    const resolvedPersonalIds = new Set(
      resolved.filter((recipient) => recipient.mode === "personal").map((recipient) => recipient.userId),
    );
    const unresolvedPersonal = recipients.some((recipient) => (
      recipient.mode === "personal" && (!recipient.userId || !resolvedPersonalIds.has(recipient.userId))
    ));
    if (!resolved.length || unresolvedPersonal) {
      throw new Error("Người nhận Daily Report không còn hoạt động hoặc chưa có email hợp lệ.");
    }
  }
  const reminderMinutes = Number(input.meetingReminderMinutes ?? current.meetingReminderMinutes);
  if (!Number.isInteger(reminderMinutes) || reminderMinutes < 1 || reminderMinutes > 60) {
    throw new Error("Thời gian nhắc họp phải từ 1 đến 60 phút.");
  }
  const maxRetries = Number(input.maxRetryCount ?? current.maxRetryCount);
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new Error("Số lần thử lại phải từ 0 đến 10.");
  }
  const { error } = await getSupabaseAdmin().from("system_settings").update({
    meeting_reminders_enabled: input.meetingRemindersEnabled === undefined
      ? current.meetingRemindersEnabled
      : input.meetingRemindersEnabled === true,
    meeting_reminder_minutes: reminderMinutes,
    daily_report_enabled: dailyReportEnabled,
    daily_report_time: dailyReportTime,
    timezone,
    daily_report_recipients: recipients,
    max_retry_count: maxRetries,
    updated_by: actorId,
  }).eq("id", "email");
  if (error) throw error;
  return getEmailSettings();
}

function monthOccurrence(base: ReturnType<typeof localParts>, monthIndex: number, timezone: string) {
  const monthStart = new Date(Date.UTC(base.year, base.month - 1 + monthIndex, 1, 12));
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (base.day > daysInMonth) return null;
  const key = `${year}-${String(month).padStart(2, "0")}-${String(base.day).padStart(2, "0")}`;
  const time = `${String(base.hour).padStart(2, "0")}:${String(base.minute).padStart(2, "0")}:${String(base.second).padStart(2, "0")}`;
  return zonedDateTime(key, time, timezone);
}

function meetingOccurrences(meeting: MeetingRow, from: Date, to: Date, timezone: string) {
  const base = new Date(meeting.starts_at);
  if (Number.isNaN(base.getTime()) || to <= from) return [];
  if (meeting.recurrence_type === "none") {
    return base >= from && base < to ? [base] : [];
  }
  const until = meeting.recurrence_until
    ? zonedDateTime(meeting.recurrence_until, "23:59:59", timezone)
    : base;
  const result: Date[] = [];
  if (meeting.recurrence_type === "weekly") {
    const weekMs = 7 * 24 * 60 * 60 * 1_000;
    const firstIndex = Math.max(0, Math.floor((from.getTime() - base.getTime()) / weekMs) - 1);
    for (let index = firstIndex; index < firstIndex + 8; index += 1) {
      const occurrence = new Date(base.getTime() + index * weekMs);
      if (occurrence > until || occurrence >= to) break;
      if (occurrence >= from) result.push(occurrence);
    }
    return result;
  }
  const baseLocal = localParts(base, timezone);
  const fromLocal = localParts(from, timezone);
  const startIndex = Math.max(0, (fromLocal.year - baseLocal.year) * 12 + fromLocal.month - baseLocal.month - 1);
  for (let index = startIndex; index < startIndex + 6; index += 1) {
    const occurrence = monthOccurrence(baseLocal, index, timezone);
    if (!occurrence) continue;
    if (occurrence > until || occurrence >= to) break;
    if (occurrence >= from) result.push(occurrence);
  }
  return result;
}

async function skipJobs(ids: string[], message: string) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("email_jobs").update({
    status: "skipped",
    skipped_at: now,
    locked_at: null,
    locked_by: "",
    next_attempt_at: null,
    error_message: safeError(message),
  })
    .in("id", ids)
    .in("status", ["pending", "failed"]);
  if (error) throw error;
}

async function skipActiveType(type: EmailJobRow["type"], reason: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("email_jobs")
    .select("id")
    .eq("type", type)
    .in("status", ["pending", "failed"]);
  if (error) throw error;
  await skipJobs((data ?? []).map((row) => row.id), reason);
}

async function loadProfiles(ids?: string[]) {
  let query = getSupabaseAdmin().from("profiles").select("id,full_name,email,status");
  if (ids?.length) query = query.in("id", [...new Set(ids)]);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function reconcileMeetingReminderJobs(now = new Date()) {
  const settings = await getEmailSettings();
  if (!settings.meetingRemindersEnabled) {
    await skipActiveType("meeting_reminder", "Nhắc họp đang tắt trong cài đặt hệ thống.");
    return { created: 0, skipped: 0, enabled: false };
  }
  const horizon = new Date(now.getTime() + settings.meetingReminderMinutes * 60_000 + 60_000);
  const admin = getSupabaseAdmin();
  const [meetingResult, participantResult, profileResult, activeJobResult] = await Promise.all([
    admin.from("meetings").select("id,title,starts_at,ends_at,notes,meeting_link,meeting_type,location,recurrence_type,recurrence_until,status,created_by,version").eq("status", "Sắp diễn ra"),
    admin.from("meeting_participants").select("meeting_id,user_id"),
    admin.from("profiles").select("id,full_name,email,status").eq("status", "active"),
    admin.from("email_jobs").select("id,idempotency_key,recipient_email,recipient_name,scheduled_for,retry_count,max_retries,payload,status").eq("type", "meeting_reminder").in("status", ["pending", "failed"]),
  ]);
  const firstError = [meetingResult, participantResult, profileResult, activeJobResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const meetings = (meetingResult.data ?? []) as MeetingRow[];
  const profiles = new Map(((profileResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const participants = new Map<string, string[]>();
  for (const row of participantResult.data ?? []) {
    participants.set(row.meeting_id, [...(participants.get(row.meeting_id) ?? []), row.user_id]);
  }
  const validKeys = new Set<string>();
  const rows: PlannedMeetingJob[] = [];
  for (const meeting of meetings) {
    if (meeting.status !== "Sắp diễn ra") continue;
    const duration = Math.max(0, new Date(meeting.ends_at ?? meeting.starts_at).getTime() - new Date(meeting.starts_at).getTime());
    for (const occurrence of meetingOccurrences(meeting, now, horizon, settings.timezone)) {
      if (occurrence <= now) continue;
      const recipientIds = [...new Set([meeting.created_by, ...(participants.get(meeting.id) ?? [])])];
      for (const recipientId of recipientIds) {
        const profile = profiles.get(recipientId);
        const email = validEmail(profile?.email);
        if (!profile || profile.status !== "active" || !email) continue;
        const key = `meeting_reminder:${meeting.id}:${occurrence.toISOString()}:${recipientId}`;
        validKeys.add(key);
        rows.push({
          type: "meeting_reminder",
          reference_id: meeting.id,
          occurrence_start: occurrence.toISOString(),
          recipient_id: recipientId,
          recipient_email: email,
          recipient_name: profile.full_name,
          scheduled_for: new Date(occurrence.getTime() - settings.meetingReminderMinutes * 60_000).toISOString(),
          status: "pending",
          idempotency_key: key,
          max_retries: settings.maxRetryCount,
          payload: {
            meetingVersion: meeting.version,
            occurrenceEnd: new Date(occurrence.getTime() + duration).toISOString(),
            reminderMinutes: settings.meetingReminderMinutes,
          },
        });
      }
    }
  }
  if (rows.length) {
    const { error } = await admin.from("email_jobs").upsert(rows, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
  const activeByKey = new Map((activeJobResult.data ?? []).map((job) => [job.idempotency_key, job]));
  for (const planned of rows) {
    const active = activeByKey.get(planned.idempotency_key);
    if (!active) continue;
    const scheduleChanged = active.recipient_email !== planned.recipient_email
      || active.scheduled_for !== planned.scheduled_for
      || active.max_retries !== planned.max_retries;
    const patch: Record<string, unknown> = {
      recipient_email: planned.recipient_email,
      recipient_name: planned.recipient_name,
      scheduled_for: planned.scheduled_for,
      max_retries: planned.max_retries,
      payload: planned.payload,
    };
    if (scheduleChanged) {
      Object.assign(patch, {
        status: "pending",
        retry_count: 0,
        next_attempt_at: null,
        error_message: "",
        locked_at: null,
        locked_by: "",
      });
    }
    const { error } = await admin
      .from("email_jobs")
      .update(patch)
      .eq("id", active.id)
      .in("status", ["pending", "failed"]);
    if (error) throw error;
  }
  const stale = (activeJobResult.data ?? [])
    .filter((job) => !validKeys.has(job.idempotency_key))
    .map((job) => job.id);
  await skipJobs(stale, "Cuộc họp, thời gian hoặc danh sách người nhận đã thay đổi.");
  return { created: rows.length, skipped: stale.length, enabled: true };
}

async function resolveDailyRecipients(input: DailyRecipient[]) {
  const profileIds = input.map((recipient) => recipient.userId).filter(Boolean) as string[];
  const profiles = new Map((await loadProfiles(profileIds)).map((profile) => [profile.id, profile]));
  const result: Array<Required<Pick<DailyRecipient, "email" | "name" | "mode">> & { userId?: string }> = [];
  for (const recipient of input) {
    const profile = recipient.userId ? profiles.get(recipient.userId) : undefined;
    if (recipient.mode === "personal" && (!profile || profile.status !== "active")) continue;
    if (profile && profile.status !== "active") continue;
    const email = validEmail(recipient.mode === "personal" ? profile?.email : profile?.email || recipient.email);
    if (!email) continue;
    result.push({
      email,
      name: profile?.full_name || recipient.name || email,
      mode: recipient.mode,
      ...(profile ? { userId: profile.id } : {}),
    });
  }
  const deduped = new Map<string, (typeof result)[number]>();
  for (const recipient of result) {
    if (!deduped.has(recipient.email)) deduped.set(recipient.email, recipient);
  }
  return [...deduped.values()];
}

export async function reconcileDailyReportJobs(now = new Date()) {
  const settings = await getEmailSettings();
  if (!settings.dailyReportEnabled) {
    await skipActiveType("daily_report", "Daily Report đang tắt trong cài đặt hệ thống.");
    return { created: 0, enabled: false, due: false };
  }
  if (!settings.dailyReportTime || timeKey(now, settings.timezone) < settings.dailyReportTime) {
    return { created: 0, enabled: true, due: false };
  }
  const reportDate = dateKey(now, settings.timezone);
  const recipients = await resolveDailyRecipients(settings.dailyReportRecipients);
  const rows = recipients.map((recipient) => ({
    type: "daily_report",
    reference_id: reportDate,
    recipient_id: recipient.userId ?? null,
    recipient_email: recipient.email,
    recipient_name: recipient.name,
    scheduled_for: now.toISOString(),
    status: "pending",
    idempotency_key: `daily_report:${recipient.userId || recipient.email}:${reportDate}`,
    max_retries: settings.maxRetryCount,
    payload: { template: "daily_report", reportDate, mode: recipient.mode },
  }));
  if (rows.length) {
    const { error } = await getSupabaseAdmin().from("email_jobs").upsert(rows, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
  const desiredKeys = new Set(rows.map((row) => row.idempotency_key));
  const { data: active, error: activeError } = await getSupabaseAdmin()
    .from("email_jobs")
    .select("id,idempotency_key")
    .eq("type", "daily_report")
    .eq("reference_id", reportDate)
    .in("status", ["pending", "failed"])
    .eq("is_manual", false);
  if (activeError) throw activeError;
  await skipJobs(
    (active ?? []).filter((job) => !desiredKeys.has(job.idempotency_key)).map((job) => job.id),
    "Người nhận Daily Report đã bị xóa khỏi cấu hình.",
  );
  return { created: rows.length, enabled: true, due: true };
}

function reportBounds(reportDate: string, timezone: string) {
  return {
    start: zonedDateTime(reportDate, "00:00:00", timezone),
    end: zonedDateTime(addDateDays(reportDate, 1), "00:00:00", timezone),
    tomorrowEnd: zonedDateTime(addDateDays(reportDate, 2), "00:00:00", timezone),
  };
}

async function dailyReportData(reportDate: string, mode: DailyRecipientMode, userId: string | null, recipientName: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("Ngày báo cáo không hợp lệ.");
  const settings = await getEmailSettings();
  const { start, end, tomorrowEnd } = reportBounds(reportDate, settings.timezone);
  const admin = getSupabaseAdmin();
  const [deadlineResult, completedResult, delayedResult, collaboratorResult, meetingResult, participantResult] = await Promise.all([
    admin.from("tasks").select("id,title,owner_id,deadline,status,completed_at,original_task_id,rescheduled_from_task_id,updated_at,deleted_at").is("deleted_at", null).is("completed_at", null).neq("status", "Hoàn thành").lte("deadline", reportDate),
    admin.from("tasks").select("id,title,owner_id,deadline,status,completed_at,original_task_id,rescheduled_from_task_id,updated_at,deleted_at").is("deleted_at", null).gte("completed_at", start.toISOString()).lt("completed_at", end.toISOString()),
    admin.from("tasks").select("id,title,owner_id,deadline,status,completed_at,original_task_id,rescheduled_from_task_id,updated_at,deleted_at").is("deleted_at", null).eq("status", "Đã lùi hạn").gte("updated_at", start.toISOString()).lt("updated_at", end.toISOString()),
    userId ? admin.from("task_collaborators").select("task_id").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
    admin.from("meetings").select("id,title,starts_at,ends_at,notes,meeting_link,meeting_type,location,recurrence_type,recurrence_until,status,created_by,version").neq("status", "Đã hủy"),
    userId ? admin.from("meeting_participants").select("meeting_id").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ]);
  const firstError = [deadlineResult, completedResult, delayedResult, collaboratorResult, meetingResult, participantResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const collaboratorTaskIds = new Set((collaboratorResult.data ?? []).map((row) => row.task_id));
  const allTasks = new Map<string, TaskRow>();
  for (const row of [...(deadlineResult.data ?? []), ...(completedResult.data ?? []), ...(delayedResult.data ?? [])] as TaskRow[]) {
    if (mode === "personal" && userId && row.owner_id !== userId && !collaboratorTaskIds.has(row.id)) continue;
    allTasks.set(row.id, row);
  }
  const logicalTasks = new Map<string, TaskRow[]>();
  for (const task of allTasks.values()) {
    const root = task.original_task_id || task.id;
    logicalTasks.set(root, [...(logicalTasks.get(root) ?? []), task]);
  }
  const owners = new Map((await loadProfiles([...new Set([...allTasks.values()].map((task) => task.owner_id))]))
    .map((profile) => [profile.id, profile.full_name]));
  const tasks: DailyReportTask[] = [];
  for (const group of logicalTasks.values()) {
    const ordered = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const current = ordered.find((task) => task.status !== "Đã lùi hạn");
    if (current) {
      tasks.push({
        ownerId: current.owner_id,
        ownerName: owners.get(current.owner_id) ?? "Chưa xác định nhân sự",
        title: current.title,
        status: current.status,
        deadline: current.deadline,
        completedAt: current.completed_at,
      });
    }
    const delayed = ordered.find((task) => task.status === "Đã lùi hạn");
    if (delayed) {
      tasks.push({
        ownerId: delayed.owner_id,
        ownerName: owners.get(delayed.owner_id) ?? "Chưa xác định nhân sự",
        title: delayed.title,
        status: delayed.status,
        deadline: delayed.deadline,
        completedAt: delayed.completed_at,
        delayed: true,
      });
    }
  }
  const participantMeetingIds = new Set((participantResult.data ?? []).map((row) => row.meeting_id));
  const meetings: DailyReportMeeting[] = [];
  const tomorrowMeetings: DailyReportMeeting[] = [];
  for (const meeting of (meetingResult.data ?? []) as MeetingRow[]) {
    if (mode === "personal" && userId && meeting.created_by !== userId && !participantMeetingIds.has(meeting.id)) continue;
    for (const occurrence of meetingOccurrences(meeting, start, end, settings.timezone)) {
      meetings.push({ title: meeting.title, startsAt: occurrence.toISOString(), meetingType: meeting.meeting_type });
    }
    for (const occurrence of meetingOccurrences(meeting, end, tomorrowEnd, settings.timezone)) {
      tomorrowMeetings.push({ title: meeting.title, startsAt: occurrence.toISOString(), meetingType: meeting.meeting_type });
    }
  }
  return dailyReportTemplate({
    reportDate,
    recipientName,
    tasks,
    meetings: meetings.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    tomorrowMeetings: tomorrowMeetings.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    timezone: settings.timezone,
    groupByPerson: mode === "team_summary",
  });
}

async function skipJob(job: EmailJobRow, reason: string, attemptId?: number) {
  const now = new Date().toISOString();
  await getSupabaseAdmin().from("email_jobs").update({
    status: "skipped",
    skipped_at: now,
    locked_at: null,
    locked_by: "",
    next_attempt_at: null,
    error_message: safeError(reason),
  }).eq("id", job.id).eq("status", "processing").eq("locked_by", job.locked_by);
  if (attemptId) {
    await getSupabaseAdmin().from("email_job_attempts").update({
      status: "skipped",
      error_message: safeError(reason),
      finished_at: now,
    }).eq("id", attemptId);
  }
  return { status: "skipped" as const, reason };
}

async function meetingJobTemplate(job: EmailJobRow) {
  const occurrenceStart = new Date(job.occurrence_start ?? "");
  if (Number.isNaN(occurrenceStart.getTime())) return { skip: "Thời gian occurrence không hợp lệ." } as const;
  if (occurrenceStart <= new Date()) return { skip: "Cuộc họp đã bắt đầu hoặc đã kết thúc." } as const;
  const admin = getSupabaseAdmin();
  const { data: meeting, error } = await admin
    .from("meetings")
    .select("id,title,starts_at,ends_at,notes,meeting_link,meeting_type,location,recurrence_type,recurrence_until,status,created_by,version")
    .eq("id", job.reference_id)
    .maybeSingle<MeetingRow>();
  if (error) throw error;
  if (!meeting || meeting.status !== "Sắp diễn ra") return { skip: "Cuộc họp không còn hiệu lực." } as const;
  const settings = await getEmailSettings();
  if (!settings.meetingRemindersEnabled) return { skip: "Nhắc họp đang tắt trong cài đặt hệ thống." } as const;
  const occurrenceMatches = meetingOccurrences(
    meeting,
    new Date(occurrenceStart.getTime() - 1_000),
    new Date(occurrenceStart.getTime() + 1_000),
    settings.timezone,
  ).some((value) => value.toISOString() === occurrenceStart.toISOString());
  if (!occurrenceMatches) return { skip: "Thời gian cuộc họp đã thay đổi." } as const;

  const [{ data: participantRows, error: participantError }, profiles] = await Promise.all([
    admin.from("meeting_participants").select("user_id").eq("meeting_id", meeting.id),
    loadProfiles([meeting.created_by, ...(job.recipient_id ? [job.recipient_id] : [])]),
  ]);
  if (participantError) throw participantError;
  const allowedIds = new Set([meeting.created_by, ...(participantRows ?? []).map((row) => row.user_id)]);
  if (!job.recipient_id || !allowedIds.has(job.recipient_id)) return { skip: "Người nhận không còn trong cuộc họp." } as const;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const recipient = profilesById.get(job.recipient_id);
  if (!recipient || recipient.status !== "active" || validEmail(recipient.email) !== validEmail(job.recipient_email)) {
    return { skip: "Email người nhận không còn hợp lệ hoặc đã thay đổi." } as const;
  }
  const creator = profilesById.get(meeting.created_by) ?? (await loadProfiles([meeting.created_by]))[0];
  const baseStart = new Date(meeting.starts_at);
  const baseEnd = new Date(meeting.ends_at ?? meeting.starts_at);
  const duration = Math.max(0, baseEnd.getTime() - baseStart.getTime());
  return {
    template: meetingReminderTemplate({
      recipientName: recipient.full_name,
      title: meeting.title,
      startsAt: occurrenceStart.toISOString(),
      endsAt: new Date(occurrenceStart.getTime() + duration).toISOString(),
      meetingType: meeting.meeting_type,
      meetingLink: meeting.meeting_link,
      location: meeting.location,
      creatorName: creator?.full_name ?? "Không xác định",
      notes: meeting.notes,
      timezone: settings.timezone,
      reminderMinutes: settings.meetingReminderMinutes,
    }),
  } as const;
}

async function templateForJob(job: EmailJobRow) {
  const payload = record(job.payload);
  if (job.type === "meeting_reminder") return meetingJobTemplate(job);
  if (payload.template === "test") {
    return { template: testEmailTemplate(job.recipient_name) } as const;
  }
  const reportDate = String(payload.reportDate ?? job.reference_id);
  const mode: DailyRecipientMode = payload.mode === "personal" ? "personal" : "team_summary";
  if (mode === "personal" && !job.recipient_id) return { skip: "Daily Report cá nhân thiếu mã nhân sự." } as const;
  const settings = await getEmailSettings();
  if (!job.is_manual && !settings.dailyReportEnabled) {
    return { skip: "Daily Report đang tắt trong cài đặt hệ thống." } as const;
  }
  const recipients = await resolveDailyRecipients(settings.dailyReportRecipients);
  const stillConfigured = recipients.some((recipient) => (
    recipient.email === validEmail(job.recipient_email)
    && recipient.mode === mode
    && (mode !== "personal" || recipient.userId === job.recipient_id)
  ));
  if (!stillConfigured) return { skip: "Người nhận không còn trong cấu hình Daily Report." } as const;
  return {
    template: await dailyReportData(reportDate, mode, job.recipient_id, job.recipient_name),
  } as const;
}

function retryDelay(retryCount: number) {
  const minutes = [1, 5, 15, 30, 60][Math.min(Math.max(0, retryCount - 1), 4)];
  const jitterSeconds = Math.floor(Math.random() * 30);
  return (minutes * 60 + jitterSeconds) * 1_000;
}

async function processJob(job: EmailJobRow) {
  const admin = getSupabaseAdmin();
  const attemptNumber = job.retry_count + 1;
  let acceptedProviderMessageId = "";
  let acceptedAt = "";
  const { data: attempt, error: attemptError } = await admin.from("email_job_attempts").insert({
    job_id: job.id,
    attempt_number: attemptNumber,
    status: "processing",
  }).select("id").single<{ id: number }>();
  if (attemptError) throw attemptError;
  try {
    const { data: current } = await admin.from("email_jobs").select("status,locked_by").eq("id", job.id).single();
    if (current?.status !== "processing" || current.locked_by !== job.locked_by) {
      return skipJob(job, "Job đã được worker khác tiếp quản trước khi gửi.", attempt.id);
    }
    const built = await templateForJob(job);
    if ("skip" in built && typeof built.skip === "string") return skipJob(job, built.skip, attempt.id);
    const sent = await sendGmail({
      to: job.recipient_email,
      recipientName: job.recipient_name,
      subject: built.template.subject,
      text: built.template.text,
      html: "html" in built.template && typeof built.template.html === "string"
        ? built.template.html
        : undefined,
      idempotencyKey: job.idempotency_key,
    });
    acceptedProviderMessageId = sent.providerMessageId;
    acceptedAt = new Date().toISOString();
    const { error: attemptReceiptError } = await admin.from("email_job_attempts").update({
      status: "sent",
      provider_message_id: acceptedProviderMessageId,
      finished_at: acceptedAt,
    }).eq("id", attempt.id).eq("status", "processing");
    const { data: finalizedJob, error } = await admin.from("email_jobs").update({
      status: "sent",
      provider_message_id: acceptedProviderMessageId,
      sent_at: acceptedAt,
      locked_at: null,
      locked_by: "",
      next_attempt_at: null,
      error_message: "",
    })
      .eq("id", job.id)
      .eq("status", "processing")
      .eq("locked_by", job.locked_by)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!finalizedJob) {
      return {
        status: "sent" as const,
        persistencePending: true,
        error: "Gmail đã nhận email nhưng worker không còn quyền chốt job; hệ thống sẽ không tự động gửi lại.",
      };
    }
    if (attemptReceiptError) {
      return {
        status: "sent" as const,
        persistencePending: true,
        error: `Email đã gửi nhưng chưa chốt được nhật ký lần gửi: ${safeError(attemptReceiptError.message)}`,
      };
    }
    return { status: "sent" as const };
  } catch (error) {
    if (acceptedProviderMessageId) {
      const message = `Gmail đã nhận email nhưng hệ thống chưa chốt được trạng thái; không tự động gửi lại để tránh trùng. ${safeError(error instanceof Error ? error.message : error)}`;
      await admin.from("email_job_attempts").update({
        status: "sent",
        provider_message_id: acceptedProviderMessageId,
        error_message: message,
        finished_at: acceptedAt || new Date().toISOString(),
      }).eq("id", attempt.id);
      await admin.from("email_jobs").update({
        error_message: message,
      }).eq("id", job.id).eq("status", "processing").eq("locked_by", job.locked_by);
      return { status: "sent" as const, persistencePending: true, error: message };
    }
    const nextRetryCount = job.retry_count + 1;
    const gmailError = error instanceof GmailSendError ? error : null;
    const canRetry = Boolean(gmailError?.retryable && !gmailError.ambiguous && nextRetryCount <= job.max_retries);
    const message = gmailError?.ambiguous
      ? `Kết quả gửi không xác định; không tự động thử lại để tránh gửi trùng. ${safeError(error instanceof Error ? error.message : error)}`
      : safeError(error instanceof Error ? error.message : error);
    const finishedAt = new Date().toISOString();
    await admin.from("email_jobs").update({
      status: "failed",
      retry_count: nextRetryCount,
      next_attempt_at: canRetry ? new Date(Date.now() + retryDelay(nextRetryCount)).toISOString() : null,
      locked_at: null,
      locked_by: "",
      error_message: message,
    }).eq("id", job.id).eq("status", "processing").eq("locked_by", job.locked_by);
    await admin.from("email_job_attempts").update({
      status: "failed",
      error_message: message,
      finished_at: finishedAt,
    }).eq("id", attempt.id);
    return { status: "failed" as const, retryScheduled: canRetry, error: message };
  }
}

export async function processEmailJobs(batchSize = 8) {
  const workerId = `vercel:${randomUUID()}`;
  const { data, error } = await getSupabaseAdmin().rpc("claim_email_jobs", {
    worker_id: workerId,
    batch_size: Math.max(1, Math.min(batchSize, 100)),
  });
  if (error) throw error;
  const jobs = (data ?? []) as EmailJobRow[];
  const results: Awaited<ReturnType<typeof processJob>>[] = [];
  for (let offset = 0; offset < jobs.length; offset += 4) {
    results.push(...await Promise.all(jobs.slice(offset, offset + 4).map((job) => processJob(job))));
  }
  return {
    claimed: jobs.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
}

async function processSpecificEmailJob(jobId: string) {
  const workerId = `manual:${randomUUID()}`;
  const { data, error } = await getSupabaseAdmin()
    .from("email_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString(), locked_by: workerId })
    .eq("id", jobId)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .select("*")
    .maybeSingle<EmailJobRow>();
  if (error) throw error;
  if (!data) return { status: "not_claimed" as const };
  return processJob(data);
}

export async function runEmailDispatcher(now = new Date()) {
  const connection = await googleConnectionStatus();
  if (!connection.gmailConnected) {
    return {
      active: false,
      reason: connection.requiresReconnect ? "Google cần được kết nối lại với quyền Gmail." : "Gmail hệ thống chưa được kết nối.",
      meeting: { created: 0, skipped: 0, enabled: false },
      daily: { created: 0, enabled: false, due: false },
      delivery: { claimed: 0, sent: 0, failed: 0, skipped: 0 },
    };
  }
  const [meeting, daily] = await Promise.all([
    reconcileMeetingReminderJobs(now),
    reconcileDailyReportJobs(now),
  ]);
  const delivery = await processEmailJobs();
  return { active: true, meeting, daily, delivery };
}

export async function previewDailyReport(input: unknown) {
  const source = record(input);
  const settings = await getEmailSettings();
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.reportDate ?? ""))
    ? String(source.reportDate)
    : dateKey(new Date(), settings.timezone);
  const hasRequestedRecipient = Object.prototype.hasOwnProperty.call(source, "recipient");
  const requested = normalizedRecipients([source.recipient]);
  const requestedRecipient = (await resolveDailyRecipients(requested))[0];
  if (hasRequestedRecipient && !requestedRecipient) {
    throw new Error("Người nhận xem trước không còn hoạt động hoặc chưa có email hợp lệ.");
  }
  const recipient = requestedRecipient
    ?? (hasRequestedRecipient ? undefined : (await resolveDailyRecipients(settings.dailyReportRecipients))[0]);
  if (!recipient) throw new Error("Chưa có người nhận hợp lệ để xem trước Daily Report.");
  const template = await dailyReportData(reportDate, recipient.mode, recipient.userId ?? null, recipient.name);
  return { recipientEmail: recipient.email, recipientName: recipient.name, reportDate, ...template };
}

async function assertManualRateLimit(actorId: string) {
  const { error } = await getSupabaseAdmin().rpc("consume_manual_email_rate_limit", {
    actor_id: actorId,
  });
  if (error) {
    if (error.message.includes("tối đa 3 email")) {
      throw new Error("Bạn đã gửi tối đa 3 email thủ công trong 10 phút. Vui lòng thử lại sau.");
    }
    throw error;
  }
}

export async function queueTestEmail(input: unknown, actorId: string) {
  const connection = await googleConnectionStatus();
  if (!connection.gmailConnected) throw new Error("Gmail hệ thống chưa được kết nối hoặc cần cấp lại quyền.");
  const source = record(input);
  const email = validEmail(source.recipientEmail);
  if (!email) throw new Error("Email nhận thử không hợp lệ.");
  const name = String(source.recipientName ?? email).trim().slice(0, 160) || email;
  await assertManualRateLimit(actorId);
  const id = randomUUID();
  const { error } = await getSupabaseAdmin().from("email_jobs").insert({
    id,
    type: "daily_report",
    reference_id: `test:${id}`,
    recipient_email: email,
    recipient_name: name,
    scheduled_for: new Date().toISOString(),
    status: "pending",
    idempotency_key: `gmail_test:${actorId}:${id}`,
    max_retries: 0,
    payload: { template: "test" },
    is_manual: true,
    requested_by: actorId,
  });
  if (error) throw error;
  const delivery = await processSpecificEmailJob(id);
  const { data: job, error: jobError } = await getSupabaseAdmin()
    .from("email_jobs")
    .select("id,status,recipient_email,sent_at,error_message")
    .eq("id", id)
    .single();
  if (jobError) throw jobError;
  const effectiveJob = delivery.status === "sent" && job.status !== "sent"
    ? {
      ...job,
      status: "sent",
      error_message: "error" in delivery ? delivery.error : "",
    }
    : job;
  return { job: effectiveJob, delivery };
}

export async function resendEmailJob(jobId: string, actorId: string) {
  const connection = await googleConnectionStatus();
  if (!connection.gmailConnected) throw new Error("Gmail hệ thống chưa được kết nối hoặc cần cấp lại quyền.");
  const admin = getSupabaseAdmin();
  const { data: source, error } = await admin.from("email_jobs").select("*").eq("id", jobId).single<EmailJobRow>();
  if (error || !source) throw error ?? new Error("Không tìm thấy email job.");
  await assertManualRateLimit(actorId);
  const id = randomUUID();
  const { error: insertError } = await admin.from("email_jobs").insert({
    id,
    type: source.type,
    reference_id: source.reference_id,
    occurrence_start: source.occurrence_start,
    recipient_id: source.recipient_id,
    recipient_email: source.recipient_email,
    recipient_name: source.recipient_name,
    scheduled_for: new Date().toISOString(),
    status: "pending",
    idempotency_key: `${source.idempotency_key}:manual:${id}`,
    max_retries: 0,
    payload: source.payload ?? {},
    is_manual: true,
    requested_by: actorId,
  });
  if (insertError) throw insertError;
  const delivery = await processSpecificEmailJob(id);
  return { queued: true, id, delivery };
}

export async function emailAdminStatus() {
  const [connection, settings] = await Promise.all([
    googleConnectionStatus(),
    getEmailSettings(),
  ]);
  const counts: Record<EmailJobStatus, number> = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  const statuses = Object.keys(counts) as EmailJobStatus[];
  const countResults = await Promise.all(statuses.map((status) => getSupabaseAdmin()
    .from("email_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", status)));
  for (const [index, result] of countResults.entries()) {
    if (result.error) throw result.error;
    counts[statuses[index]] = result.count ?? 0;
  }
  return {
    connection,
    settings,
    scheduler: {
      endpoint: "/api/cron/email-dispatch",
      cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      readyToDispatch: Boolean(process.env.CRON_SECRET?.trim() && connection.gmailConnected),
    },
    jobCounts: counts,
  };
}

export async function listEmailJobs(limit = 100) {
  const { data, error } = await getSupabaseAdmin()
    .from("email_jobs")
    .select("id,type,reference_id,recipient_id,recipient_email,recipient_name,scheduled_for,status,retry_count,max_retries,error_message,provider_message_id,sent_at,skipped_at,is_manual,requested_by,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw error;
  return data ?? [];
}
