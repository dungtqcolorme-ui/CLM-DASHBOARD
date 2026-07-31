import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { removeGoogleCalendarMeeting, syncGoogleCalendarMeeting } from "@/lib/googleCalendar";

type JsonRecord = Record<string, unknown>;
type Identity = Awaited<ReturnType<typeof getRequestIdentity>>;

const TASK_STATUSES = new Set(["Mới tạo", "Đang thực hiện", "Chờ review", "Cần chỉnh sửa", "Hoàn thành", "Đã lùi hạn"]);
const MEETING_STATUSES = new Set(["Sắp diễn ra", "Đã hủy"]);
const MEETING_TYPES = new Set(["google_meet", "in_person"]);
const RECURRENCE_TYPES = new Set(["none", "weekly", "monthly"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_ID_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function cleanText(value: unknown, max = 10_000) {
  return String(value ?? "").trim().slice(0, max);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 120)).filter(Boolean))];
}

function isManager(identity: Identity) {
  return identity.activeRole === "Admin" || identity.activeRole === "PR Leader";
}

function ensureOperationalRole(identity: Identity) {
  if (identity.activeRole === "Viewer") {
    throw new ApiAuthError("Viewer chỉ có quyền xem công việc.", 403);
  }
}

function validItemId(value: unknown) {
  const id = cleanText(value, 120);
  if (!ITEM_ID_PATTERN.test(id)) throw new ApiAuthError("Mã công việc không hợp lệ.", 400);
  return id;
}

function isoDate(value: unknown) {
  const date = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new ApiAuthError("Deadline không hợp lệ.", 400);
  }
  return date;
}

function isoDateTime(value: unknown, label: string) {
  const raw = cleanText(value, 40);
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw);
  const normalized = localDateTime
    ? `${raw}${raw.length === 16 ? ":00" : ""}+07:00`
    : raw;
  const date = new Date(normalized);
  if (!raw || Number.isNaN(date.getTime())) throw new ApiAuthError(`${label} không hợp lệ.`, 400);
  return date.toISOString();
}

function safeRawPayload(record: JsonRecord) {
  const payload = { ...record };
  delete payload.comments;
  delete payload.history;
  delete payload.password;
  return payload;
}

async function assertActiveProfiles(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.some((id) => !UUID_PATTERN.test(id))) {
    throw new ApiAuthError("Danh sách nhân sự không hợp lệ.", 400);
  }
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("profiles").select("id,status,email").in("id", unique);
  if (error) throw error;
  const active = new Set((data ?? []).filter((row) => row.status === "active").map((row) => row.id));
  if (unique.some((id) => !active.has(id))) throw new ApiAuthError("Có nhân sự không tồn tại hoặc đã bị khóa.", 400);
  return data ?? [];
}

async function canModify(identity: Identity, kind: "task" | "meeting", id: string) {
  if (isManager(identity)) return true;
  const admin = getSupabaseAdmin();
  if (kind === "meeting") {
    const { data } = await admin.from("meetings").select("created_by").eq("id", id).maybeSingle();
    return !data || data.created_by === identity.user.id;
  }
  const { data } = await admin.from("tasks").select("created_by").eq("id", id).maybeSingle();
  return !data || data.created_by === identity.user.id;
}

async function canUpdateTaskStatus(identity: Identity, id: string) {
  if (isManager(identity)) return true;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("tasks").select("created_by,owner_id").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.created_by === identity.user.id || data.owner_id === identity.user.id) return true;
  const { data: collaborator } = await admin
    .from("task_collaborators")
    .select("task_id")
    .eq("task_id", id)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  return Boolean(collaborator);
}

async function insertHistory(
  kind: "task" | "meeting",
  id: string,
  identity: Identity,
  action: string,
  metadata: JsonRecord = {},
) {
  const { error } = await getSupabaseAdmin().from("work_history").insert({
    item_kind: kind,
    item_id: id,
    actor_id: identity.user.id,
    action,
    metadata,
  });
  if (error) throw error;
}

function vietnamDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function leapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

async function ensureBirthdayNotifications() {
  const admin = getSupabaseAdmin();
  const today = vietnamDateParts();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,full_name,date_of_birth,status")
    .eq("status", "active");
  if (error) throw error;
  const recipients = (profiles ?? []).map((profile) => profile.id);
  const birthdays = (profiles ?? []).filter((profile) => {
    if (!profile.date_of_birth) return false;
    const [, month, day] = String(profile.date_of_birth).split("-").map(Number);
    if (month === today.month && day === today.day) return true;
    return !leapYear(today.year) && today.month === 2 && today.day === 28 && month === 2 && day === 29;
  });
  if (!birthdays.length || !recipients.length) return;
  const dateKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const rows = birthdays.flatMap((birthday) => recipients.map((recipientId) => ({
    recipient_id: recipientId,
    event_key: `birthday:${dateKey}:${birthday.id}`,
    title: "Sinh nhật nhân sự",
    body: recipientId === birthday.id
      ? `Chúc ${birthday.full_name} một sinh nhật thật nhiều niềm vui!`
      : `Hôm nay là sinh nhật của ${birthday.full_name}. Đừng quên gửi lời chúc nhé!`,
    type: "birthday",
    item_kind: "profile",
    item_id: birthday.id,
  })));
  const { error: insertError } = await admin
    .from("user_notifications")
    .upsert(rows, { onConflict: "recipient_id,event_key", ignoreDuplicates: true });
  if (insertError) throw insertError;
}

async function notifyRecipients(
  identity: Identity,
  kind: "task" | "meeting",
  id: string,
  title: string,
  body: string,
  recipients: string[],
  type = "task",
) {
  const unique = [...new Set(recipients)].filter((userId) => UUID_PATTERN.test(userId) && userId !== identity.user.id);
  if (!unique.length) return;
  const eventBase = `${kind}:${id}:${Date.now()}`;
  const { error } = await getSupabaseAdmin().from("user_notifications").insert(
    unique.map((recipientId) => ({
      recipient_id: recipientId,
      event_key: `${eventBase}:${recipientId}`,
      title,
      body,
      type,
      item_kind: kind,
      item_id: id,
    })),
  );
  if (error) throw error;
}

async function managerIds() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("user_roles").select("user_id").in("role", ["Admin", "PR Leader"]);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.user_id))];
}

function duplicatedTaskRow(
  task: Record<string, unknown>,
  id: string,
  deadline: string,
  reason: string,
  sourceId: string,
  actorId: string,
) {
  const payload = asRecord(task.raw_payload);
  return {
    id,
    title: task.title,
    description: task.description ?? "",
    kind: task.kind,
    owner_id: task.owner_id,
    deadline,
    proof_url: "",
    status: "Mới tạo",
    related_meeting_id: task.related_meeting_id ?? "",
    created_by: task.created_by,
    raw_payload: {
      ...payload,
      id,
      deadline,
      status: "Mới tạo",
      xong: false,
      proofUrl: "",
      rescheduledFromTaskId: sourceId,
      rescheduleReason: reason,
    },
    completion_confirmed: false,
    completed_at: null,
    completed_by: null,
    original_task_id: task.original_task_id || sourceId,
    rescheduled_from_task_id: sourceId,
    rescheduled_to_task_id: "",
    reschedule_reason: reason,
    last_move_mode: "copy",
    last_move_reason: reason,
    last_moved_at: new Date().toISOString(),
    last_moved_by: actorId,
  };
}

async function copyTaskCollaborators(sourceId: string, targetId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("task_collaborators").select("user_id").eq("task_id", sourceId);
  if (error) throw error;
  if (!data?.length) return [];
  const { error: insertError } = await admin.from("task_collaborators").insert(
    data.map((row) => ({ task_id: targetId, user_id: row.user_id })),
  );
  if (insertError) throw insertError;
  return data.map((row) => row.user_id);
}

async function loadWorkItems(identity: Identity) {
  const admin = getSupabaseAdmin();
  await ensureBirthdayNotifications();
  const [
    taskResult,
    collaboratorResult,
    meetingResult,
    participantResult,
    commentResult,
    historyResult,
    profileResult,
    notificationResult,
    dismissalResult,
  ] = await Promise.all([
    admin.from("tasks").select("*").order("updated_at", { ascending: false }),
    admin.from("task_collaborators").select("task_id,user_id"),
    admin.from("meetings").select("*").order("starts_at", { ascending: true }),
    admin.from("meeting_participants").select("meeting_id,user_id"),
    admin.from("work_comments").select("*").order("created_at", { ascending: true }),
    admin.from("work_history").select("*").order("created_at", { ascending: true }),
    admin.from("profiles").select("id,full_name,status"),
    admin.from("user_notifications").select("*").eq("recipient_id", identity.user.id).order("created_at", { ascending: false }).limit(100),
    admin.from("notification_dismissals").select("notification_key").eq("user_id", identity.user.id).limit(500),
  ]);
  const firstError = [taskResult, collaboratorResult, meetingResult, participantResult, commentResult, historyResult, profileResult, notificationResult, dismissalResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const names = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const collaborators = new Map<string, string[]>();
  for (const row of collaboratorResult.data ?? []) {
    collaborators.set(row.task_id, [...(collaborators.get(row.task_id) ?? []), row.user_id]);
  }
  const participants = new Map<string, string[]>();
  for (const row of participantResult.data ?? []) {
    participants.set(row.meeting_id, [...(participants.get(row.meeting_id) ?? []), row.user_id]);
  }
  const comments = new Map<string, JsonRecord[]>();
  for (const row of commentResult.data ?? []) {
    const key = `${row.item_kind}:${row.item_id}`;
    const item = {
      id: row.id,
      by: row.author_id,
      name: row.author_name || names.get(row.author_id) || "Người dùng",
      text: row.body,
      attachments: row.attachments ?? [],
      t: row.created_at,
    };
    comments.set(key, [...(comments.get(key) ?? []), item]);
  }
  const history = new Map<string, JsonRecord[]>();
  for (const row of historyResult.data ?? []) {
    const key = `${row.item_kind}:${row.item_id}`;
    const item = { id: row.id, by: row.actor_id, action: row.action, metadata: row.metadata ?? {}, t: row.created_at };
    history.set(key, [...(history.get(key) ?? []), item]);
  }

  const tasks = (taskResult.data ?? []).map((row) => ({
    ...asRecord(row.raw_payload),
    id: row.id,
    ten: row.title,
    description: row.description,
    note: row.description,
    nguoi: row.owner_id,
    collaborators: collaborators.get(row.id) ?? [],
    deadline: row.deadline,
    proofUrl: row.proof_url,
    status: row.status,
    xong: row.status === "Hoàn thành",
    coordination: row.kind === "coordination",
    type: row.kind,
    relatedMeetingId: row.related_meeting_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    completionConfirmed: row.completion_confirmed,
    originalTaskId: row.original_task_id,
    rescheduledFromTaskId: row.rescheduled_from_task_id,
    rescheduledToTaskId: row.rescheduled_to_task_id,
    rescheduleReason: row.reschedule_reason,
    lastMoveMode: row.last_move_mode,
    lastMoveReason: row.last_move_reason,
    lastMovedAt: row.last_moved_at,
    lastMovedBy: row.last_moved_by,
    comments: comments.get(`task:${row.id}`) ?? [],
    history: history.get(`task:${row.id}`) ?? [],
    persisted: true,
  }));
  const meetings = (meetingResult.data ?? []).map((row) => {
    const participantIds = participants.get(row.id) ?? [];
    return {
      ...asRecord(row.raw_payload),
      id: row.id,
      title: row.title,
      start: row.starts_at,
      time: row.starts_at,
      end: row.ends_at ?? "",
      participantIds,
      attendees: participantIds.map((id) => names.get(id) ?? id),
      notes: row.notes,
      actions: "",
      taskId: row.related_task_id,
      link: row.meeting_link,
      meetingType: row.meeting_type,
      location: row.location,
      recurrenceType: row.recurrence_type,
      recurrenceUntil: row.recurrence_until,
      googleEventId: row.google_event_id,
      googleCalendarLink: row.google_calendar_link,
      googleSyncStatus: row.google_sync_status,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
      comments: comments.get(`meeting:${row.id}`) ?? [],
      history: history.get(`meeting:${row.id}`) ?? [],
      persisted: true,
    };
  });
  const notifications = (notificationResult.data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_key,
    text: row.body,
    title: row.title,
    read: Boolean(row.read_at),
    t: row.created_at,
    type: row.type,
    page: "phoihop",
    kind: row.item_kind,
    recordId: row.item_id,
    persisted: true,
  }));
  return {
    tasks,
    meetings,
    notifications,
    dismissedNotificationIds: (dismissalResult.data ?? []).map((row) => row.notification_key),
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    return NextResponse.json(await loadWorkItems(identity));
  } catch (error) {
    return apiError(error, "Không thể tải công việc từ Supabase.");
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    ensureOperationalRole(identity);
    const body = asRecord(await request.json());
    const kind = body.kind === "meeting" ? "meeting" : "task";
    const record = asRecord(body.record);
    const id = validItemId(record.id);
    if (!(await canModify(identity, kind, id))) throw new ApiAuthError("Bạn không có quyền cập nhật công việc này.", 403);
    const admin = getSupabaseAdmin();

    if (kind === "meeting") {
      const title = cleanText(record.title, 240);
      const start = isoDateTime(record.start ?? record.time, "Thời gian bắt đầu");
      const endRaw = cleanText(record.end, 40);
      const end = endRaw ? isoDateTime(endRaw, "Thời gian kết thúc") : null;
      if (end && new Date(end) <= new Date(start)) throw new ApiAuthError("Thời gian kết thúc phải sau thời gian bắt đầu.", 400);
      const participantIds = stringList(record.participantIds);
      if (!title) throw new ApiAuthError("Vui lòng nhập tiêu đề cuộc họp.", 400);
      if (!participantIds.length) throw new ApiAuthError("Cuộc họp phải có ít nhất một người tham gia.", 400);
      const participantProfiles = await assertActiveProfiles(participantIds);
      const { data: existing } = await admin.from("meetings").select("created_by,version,google_event_id").eq("id", id).maybeSingle();
      if (existing && Number(record.version) && Number(record.version) !== existing.version) {
        throw new ApiAuthError("Cuộc họp vừa được người khác cập nhật. Hãy tải lại trước khi lưu.", 409);
      }
      const status = MEETING_STATUSES.has(cleanText(record.status)) ? cleanText(record.status) : "Sắp diễn ra";
      const meetingType = MEETING_TYPES.has(cleanText(record.meetingType)) ? cleanText(record.meetingType) : "google_meet";
      const requestedRecurrence = cleanText(record.recurrenceType);
      const recurrenceType: "none" | "weekly" | "monthly" = RECURRENCE_TYPES.has(requestedRecurrence)
        ? requestedRecurrence as "none" | "weekly" | "monthly"
        : "none";
      const location = meetingType === "in_person" ? cleanText(record.location, 500) : "";
      const recurrenceUntilRaw = cleanText(record.recurrenceUntil, 10);
      const recurrenceUntil = recurrenceUntilRaw ? isoDate(recurrenceUntilRaw) : null;
      if (meetingType === "in_person" && !location) throw new ApiAuthError("Vui lòng nhập địa điểm họp trực tiếp.", 400);
      if (recurrenceType !== "none" && !recurrenceUntil) throw new ApiAuthError("Vui lòng chọn ngày kết thúc lặp lại.", 400);
      if (recurrenceUntil && recurrenceUntil < start.slice(0, 10)) throw new ApiAuthError("Ngày kết thúc lặp lại phải từ ngày bắt đầu trở đi.", 400);
      const { data: saved, error } = await admin.from("meetings").upsert({
        id,
        title,
        starts_at: start,
        ends_at: end,
        notes: cleanText(record.notes, 20_000),
        action_items: "",
        meeting_link: meetingType === "google_meet" ? cleanText(record.link, 2_000) : "",
        meeting_type: meetingType,
        location,
        recurrence_type: recurrenceType,
        recurrence_until: recurrenceUntil,
        related_task_id: cleanText(record.taskId, 120),
        status,
        created_by: existing?.created_by ?? identity.user.id,
        raw_payload: safeRawPayload(record),
      }).select("version,updated_at").single();
      if (error) throw error;
      await admin.from("meeting_participants").delete().eq("meeting_id", id);
      const { error: participantError } = await admin.from("meeting_participants").insert(
        participantIds.map((userId) => ({ meeting_id: id, user_id: userId })),
      );
      if (participantError) throw participantError;
      await insertHistory("meeting", id, identity, existing ? "Cập nhật cuộc họp" : "Tạo cuộc họp");
      await notifyRecipients(identity, "meeting", id, existing ? "Cuộc họp được cập nhật" : "Cuộc họp mới", `“${title}” đã được ${existing ? "cập nhật" : "tạo"}.`, participantIds);
      let googleSyncStatus = meetingType === "google_meet" ? "not_connected" : "not_connected";
      let googleEventId = existing?.google_event_id ?? "";
      let meetUrl = cleanText(record.link, 2_000);
      let googleCalendarLink = "";
      let finalVersion = saved.version;
      let finalUpdatedAt = saved.updated_at;
      try {
        if (meetingType === "in_person") {
          if (existing?.google_event_id) await removeGoogleCalendarMeeting(existing.google_event_id);
          const { data: directRow, error: directError } = await admin.from("meetings").update({
            meeting_link: "",
            google_event_id: "",
            google_calendar_link: "",
            google_sync_status: "not_connected",
            google_sync_error: "",
            google_synced_at: null,
          }).eq("id", id).select("version,updated_at").single();
          if (directError) throw directError;
          finalVersion = directRow.version;
          finalUpdatedAt = directRow.updated_at;
          return NextResponse.json({
            saved: true,
            id,
            version: finalVersion,
            updatedAt: finalUpdatedAt,
            googleSyncStatus,
            googleEventId: "",
            meetUrl: "",
            googleCalendarLink: "",
          });
        }
        const calendar = await syncGoogleCalendarMeeting({
          id,
          title,
          notes: cleanText(record.notes, 20_000),
          start,
          end: end ?? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(),
          attendeeEmails: participantProfiles.map((profile) => profile.email).filter(Boolean),
          recurrenceType,
          recurrenceUntil,
        });
        googleSyncStatus = calendar.status;
        googleEventId = calendar.eventId || googleEventId;
        meetUrl = calendar.meetUrl || meetUrl;
        googleCalendarLink = calendar.calendarLink;
        const { data: syncedRow, error: syncUpdateError } = await admin.from("meetings").update({
          meeting_link: meetUrl,
          google_event_id: googleEventId,
          google_calendar_link: googleCalendarLink,
          google_sync_status: googleSyncStatus,
          google_sync_error: "",
          google_synced_at: googleSyncStatus === "synced" ? new Date().toISOString() : null,
        }).eq("id", id).select("version,updated_at").single();
        if (syncUpdateError) throw syncUpdateError;
        finalVersion = syncedRow.version;
        finalUpdatedAt = syncedRow.updated_at;
      } catch (calendarError) {
        googleSyncStatus = "error";
        const { data: failedSyncRow } = await admin.from("meetings").update({
          google_sync_status: googleSyncStatus,
          google_sync_error: calendarError instanceof Error ? calendarError.message.slice(0, 2_000) : "Lỗi Google Calendar",
        }).eq("id", id).select("version,updated_at").single();
        if (failedSyncRow) {
          finalVersion = failedSyncRow.version;
          finalUpdatedAt = failedSyncRow.updated_at;
        }
      }
      return NextResponse.json({
        saved: true,
        id,
        version: finalVersion,
        updatedAt: finalUpdatedAt,
        googleSyncStatus,
        googleEventId,
        meetUrl,
        googleCalendarLink,
      });
    }

    const title = cleanText(record.ten ?? record.title, 240);
    const description = cleanText(record.description ?? record.note, 20_000);
    const deadline = isoDate(record.deadline);
    const ownerId = cleanText(record.nguoi ?? record.owner, 120);
    const taskKind = record.type === "coordination" || record.coordination === true ? "coordination" : "personal";
    const collaboratorIds = stringList(record.collaborators).filter((userId) => userId !== ownerId);
    if (!title) throw new ApiAuthError("Vui lòng nhập tiêu đề công việc.", 400);
    if (taskKind === "coordination" && !collaboratorIds.length) {
      throw new ApiAuthError("Công việc phối hợp phải có ít nhất một người phối hợp.", 400);
    }
    await assertActiveProfiles([ownerId, ...collaboratorIds]);
    const { data: existing } = await admin.from("tasks").select("created_by,version,status").eq("id", id).maybeSingle();
    if (existing && Number(record.version) && Number(record.version) !== existing.version) {
      throw new ApiAuthError("Công việc vừa được người khác cập nhật. Hãy tải lại trước khi lưu.", 409);
    }
    const proofUrl = cleanText(record.proofUrl, 2_000);
    let status = TASK_STATUSES.has(cleanText(record.status)) ? cleanText(record.status) : "Mới tạo";
    if (!isManager(identity)) {
      if (proofUrl) status = "Chờ review";
      else if (status === "Hoàn thành" || status === "Cần chỉnh sửa") status = existing?.status === "Cần chỉnh sửa" ? "Cần chỉnh sửa" : "Đang thực hiện";
    }
    const { data: saved, error } = await admin.from("tasks").upsert({
      id,
      title,
      description,
      kind: taskKind,
      owner_id: ownerId,
      deadline,
      proof_url: proofUrl,
      status,
      related_meeting_id: cleanText(record.relatedMeetingId, 120),
      created_by: existing?.created_by ?? identity.user.id,
      raw_payload: safeRawPayload(record),
    }).select("version,updated_at,status").single();
    if (error) throw error;
    await admin.from("task_collaborators").delete().eq("task_id", id);
    if (collaboratorIds.length) {
      const { error: collaboratorError } = await admin.from("task_collaborators").insert(
        collaboratorIds.map((userId) => ({ task_id: id, user_id: userId })),
      );
      if (collaboratorError) throw collaboratorError;
    }
    await insertHistory("task", id, identity, existing ? "Cập nhật công việc" : "Tạo công việc");
    const recipients = [ownerId, ...collaboratorIds];
    if (saved.status === "Chờ review") recipients.push(...await managerIds());
    await notifyRecipients(identity, "task", id, existing ? "Công việc được cập nhật" : "Công việc mới", `“${title}” đã được ${existing ? "cập nhật" : "giao"}.`, recipients);
    return NextResponse.json({ saved: true, id, version: saved.version, updatedAt: saved.updated_at, status: saved.status });
  } catch (error) {
    return apiError(error, "Không thể lưu công việc vào Supabase.");
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const body = asRecord(await request.json());
    if (body.action === "mark-notifications") {
      const admin = getSupabaseAdmin();
      const ids = stringList(body.ids);
      let query = admin
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", identity.user.id)
        .is("read_at", null);
      if (ids.length) query = query.in("id", ids);
      const { error } = await query;
      if (error) throw error;
      return NextResponse.json({ updated: true });
    }
    if (body.action === "delete-notifications") {
      const admin = getSupabaseAdmin();
      const ids = stringList(body.ids).filter((id) => UUID_PATTERN.test(id));
      const legacyIds = stringList(body.legacyIds).slice(0, 200);
      const deleteAll = body.all === true;

      if (deleteAll || ids.length) {
        let query = admin
          .from("user_notifications")
          .delete()
          .eq("recipient_id", identity.user.id);
        if (!deleteAll) query = query.in("id", ids);
        const { error } = await query;
        if (error) throw error;
      }

      if (legacyIds.length) {
        const { error } = await admin
          .from("notification_dismissals")
          .upsert(
            legacyIds.map((notificationKey) => ({
              user_id: identity.user.id,
              notification_key: notificationKey,
            })),
            { onConflict: "user_id,notification_key", ignoreDuplicates: true },
          );
        if (error) throw error;
      }

      return NextResponse.json({ deleted: true });
    }
    if (body.action === "reschedule-task") {
      ensureOperationalRole(identity);
      const id = validItemId(body.id);
      if (!(await canModify(identity, "task", id))) {
        throw new ApiAuthError("Chỉ người tạo, PR Leader hoặc Admin được di chuyển task này.", 403);
      }
      const targetDate = isoDate(body.targetDate);
      const reason = cleanText(body.reason, 500);
      const mode = body.mode === "copy" ? "copy" : "move";
      if (!reason) throw new ApiAuthError("Vui lòng nhập lý do thay đổi ngày.", 400);
      const admin = getSupabaseAdmin();
      const { data: task, error: taskError } = await admin.from("tasks").select("*").eq("id", id).single();
      if (taskError || !task) throw taskError ?? new ApiAuthError("Không tìm thấy task.", 404);
      if (task.deadline === targetDate) throw new ApiAuthError("Ngày mới phải khác ngày hiện tại.", 400);
      if (Number(body.version) && Number(body.version) !== Number(task.version)) {
        throw new ApiAuthError("Task vừa được cập nhật. Hãy tải lại trước khi di chuyển.", 409);
      }
      const metadata = { mode, reason, fromDate: task.deadline, toDate: targetDate };
      if (mode === "copy") {
        const newId = `T-${randomUUID()}`;
        const { error: insertError } = await admin.from("tasks").insert(
          duplicatedTaskRow(task, newId, targetDate, reason, id, identity.user.id),
        );
        if (insertError) throw insertError;
        let collaboratorIds: string[] = [];
        try {
          collaboratorIds = await copyTaskCollaborators(id, newId);
        } catch (copyError) {
          await admin.from("tasks").delete().eq("id", newId);
          throw copyError;
        }
        await insertHistory("task", id, identity, `Sao chép task sang ${targetDate}`, { ...metadata, targetTaskId: newId });
        await insertHistory("task", newId, identity, `Tạo từ bản sao của ${id}`, { ...metadata, sourceTaskId: id });
        await notifyRecipients(identity, "task", newId, "Task được sao chép", `“${task.title}” đã được sao chép sang ngày ${targetDate}.`, [task.owner_id, ...collaboratorIds]);
        return NextResponse.json({ updated: true, mode, id, targetId: newId });
      }
      const nextPayload = { ...asRecord(task.raw_payload), deadline: targetDate, lastMoveReason: reason };
      const { data: moved, error: moveError } = await admin.from("tasks").update({
        deadline: targetDate,
        last_move_mode: "move",
        last_move_reason: reason,
        last_moved_at: new Date().toISOString(),
        last_moved_by: identity.user.id,
        raw_payload: nextPayload,
      }).eq("id", id).eq("version", task.version).select("version,updated_at").single();
      if (moveError) throw moveError;
      await insertHistory("task", id, identity, `Di chuyển deadline ${task.deadline} → ${targetDate}`, metadata);
      return NextResponse.json({ updated: true, mode, id, version: moved.version, updatedAt: moved.updated_at });
    }
    if (body.action === "update-task-status") {
      ensureOperationalRole(identity);
      const id = validItemId(body.id);
      if (!(await canUpdateTaskStatus(identity, id))) {
        throw new ApiAuthError("Bạn không có quyền cập nhật trạng thái task này.", 403);
      }
      const admin = getSupabaseAdmin();
      const { data: task, error: taskError } = await admin.from("tasks").select("*").eq("id", id).single();
      if (taskError || !task) throw taskError ?? new ApiAuthError("Không tìm thấy task.", 404);
      if (Number(body.version) && Number(body.version) !== Number(task.version)) {
        throw new ApiAuthError("Task vừa được cập nhật. Hãy tải lại trước khi đổi trạng thái.", 409);
      }
      if (body.statusAction === "complete") {
        if (body.confirmed !== true) throw new ApiAuthError("Bạn cần xác nhận task đã hoàn thành.", 400);
        const completedAt = new Date().toISOString();
        const { data: completed, error } = await admin.from("tasks").update({
          status: "Hoàn thành",
          completion_confirmed: true,
          completed_at: completedAt,
          completed_by: identity.user.id,
          raw_payload: {
            ...asRecord(task.raw_payload),
            status: "Hoàn thành",
            xong: true,
            completionConfirmed: true,
            completedAt,
            completedBy: identity.user.id,
          },
        }).eq("id", id).eq("version", task.version).select("version,updated_at").single();
        if (error) throw error;
        await insertHistory("task", id, identity, "Xác nhận hoàn thành task", { completedAt });
        return NextResponse.json({ updated: true, id, status: "Hoàn thành", completedAt, version: completed.version, updatedAt: completed.updated_at });
      }
      if (body.statusAction === "delay") {
        const newDeadline = isoDate(body.newDeadline);
        const reason = cleanText(body.reason, 500);
        if (!reason) throw new ApiAuthError("Vui lòng nhập lý do lùi deadline.", 400);
        if (newDeadline <= task.deadline) throw new ApiAuthError("Deadline mới phải sau deadline hiện tại.", 400);
        const newId = `T-${randomUUID()}`;
        const replacement = duplicatedTaskRow(task, newId, newDeadline, reason, id, identity.user.id);
        const { error: insertError } = await admin.from("tasks").insert(replacement);
        if (insertError) throw insertError;
        let collaboratorIds: string[] = [];
        try {
          collaboratorIds = await copyTaskCollaborators(id, newId);
          const { error: oldUpdateError } = await admin.from("tasks").update({
            status: "Đã lùi hạn",
            rescheduled_to_task_id: newId,
            reschedule_reason: reason,
            raw_payload: {
              ...asRecord(task.raw_payload),
              status: "Đã lùi hạn",
              xong: false,
              rescheduledToTaskId: newId,
              rescheduleReason: reason,
            },
          }).eq("id", id).eq("version", task.version);
          if (oldUpdateError) throw oldUpdateError;
        } catch (delayError) {
          await admin.from("tasks").delete().eq("id", newId);
          throw delayError;
        }
        const metadata = { reason, oldDeadline: task.deadline, newDeadline, replacementTaskId: newId };
        await insertHistory("task", id, identity, `Lùi deadline đến ${newDeadline}`, metadata);
        await insertHistory("task", newId, identity, `Tạo thay thế task ${id}`, { ...metadata, sourceTaskId: id });
        await notifyRecipients(identity, "task", newId, "Task được lùi deadline", `“${task.title}” có deadline mới ${newDeadline}.`, [task.owner_id, ...collaboratorIds]);
        return NextResponse.json({ updated: true, id, status: "Đã lùi hạn", replacementTaskId: newId });
      }
      throw new ApiAuthError("Trạng thái yêu cầu không hợp lệ.", 400);
    }
    ensureOperationalRole(identity);
    const kind = body.kind === "meeting" ? "meeting" : "task";
    const id = validItemId(body.id);
    const text = cleanText(body.text, 10_000);
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
    if (!text && !attachments.length) throw new ApiAuthError("Bình luận không được để trống.", 400);
    const admin = getSupabaseAdmin();
    const table = kind === "meeting" ? "meetings" : "tasks";
    const { data: item } = await admin.from(table).select("id").eq("id", id).maybeSingle();
    if (!item) throw new ApiAuthError("Công việc chưa được lưu vào Supabase. Hãy lưu lại trước khi bình luận.", 409);
    const { data: comment, error } = await admin.from("work_comments").insert({
      item_kind: kind,
      item_id: id,
      author_id: identity.user.id,
      author_name: identity.profile.fullName,
      body: text || "Đã gửi một tệp đính kèm",
      attachments,
    }).select("id,created_at").single();
    if (error) throw error;
    await insertHistory(kind, id, identity, "Thêm bình luận");
    return NextResponse.json({
      saved: true,
      comment: {
        id: comment.id,
        by: identity.user.id,
        name: identity.profile.fullName,
        text: text || "Đã gửi một tệp đính kèm",
        attachments,
        t: comment.created_at,
      },
    });
  } catch (error) {
    return apiError(error, "Không thể lưu bình luận.");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    ensureOperationalRole(identity);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "meeting" ? "meeting" : "task";
    const id = validItemId(url.searchParams.get("id"));
    if (!(await canModify(identity, kind, id))) throw new ApiAuthError("Bạn không có quyền xóa công việc này.", 403);
    const table = kind === "meeting" ? "meetings" : "tasks";
    if (kind === "meeting") {
      const { data: meeting } = await getSupabaseAdmin()
        .from("meetings")
        .select("google_event_id")
        .eq("id", id)
        .maybeSingle();
      if (meeting?.google_event_id) await removeGoogleCalendarMeeting(meeting.google_event_id);
    }
    const { error } = await getSupabaseAdmin().from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiError(error, "Không thể xóa công việc.");
  }
}
