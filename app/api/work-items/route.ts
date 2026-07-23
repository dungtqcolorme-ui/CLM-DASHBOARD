import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type JsonRecord = Record<string, unknown>;
type Identity = Awaited<ReturnType<typeof getRequestIdentity>>;

const TASK_STATUSES = new Set(["Mới tạo", "Đang thực hiện", "Chờ review", "Cần chỉnh sửa", "Hoàn thành"]);
const MEETING_STATUSES = new Set(["Sắp diễn ra", "Đã hủy"]);
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
  const date = new Date(raw);
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
  const { data, error } = await admin.from("profiles").select("id,status").in("id", unique);
  if (error) throw error;
  const active = new Set((data ?? []).filter((row) => row.status === "active").map((row) => row.id));
  if (unique.some((id) => !active.has(id))) throw new ApiAuthError("Có nhân sự không tồn tại hoặc đã bị khóa.", 400);
}

async function canModify(identity: Identity, kind: "task" | "meeting", id: string) {
  if (isManager(identity)) return true;
  const admin = getSupabaseAdmin();
  if (kind === "meeting") {
    const { data } = await admin.from("meetings").select("created_by").eq("id", id).maybeSingle();
    return !data || data.created_by === identity.user.id;
  }
  const { data } = await admin.from("tasks").select("created_by,owner_id").eq("id", id).maybeSingle();
  if (!data || data.created_by === identity.user.id || data.owner_id === identity.user.id) return true;
  const { data: collaborator } = await admin
    .from("task_collaborators")
    .select("task_id")
    .eq("task_id", id)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  return Boolean(collaborator);
}

async function insertHistory(kind: "task" | "meeting", id: string, identity: Identity, action: string) {
  const { error } = await getSupabaseAdmin().from("work_history").insert({
    item_kind: kind,
    item_id: id,
    actor_id: identity.user.id,
    action,
  });
  if (error) throw error;
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

async function loadWorkItems(identity: Identity) {
  const admin = getSupabaseAdmin();
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
    const item = { id: row.id, by: row.actor_id, action: row.action, t: row.created_at };
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
      actions: row.action_items,
      taskId: row.related_task_id,
      link: row.meeting_link,
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
      await assertActiveProfiles(participantIds);
      const { data: existing } = await admin.from("meetings").select("created_by,version").eq("id", id).maybeSingle();
      if (existing && Number(record.version) && Number(record.version) !== existing.version) {
        throw new ApiAuthError("Cuộc họp vừa được người khác cập nhật. Hãy tải lại trước khi lưu.", 409);
      }
      const status = MEETING_STATUSES.has(cleanText(record.status)) ? cleanText(record.status) : "Sắp diễn ra";
      const { data: saved, error } = await admin.from("meetings").upsert({
        id,
        title,
        starts_at: start,
        ends_at: end,
        notes: cleanText(record.notes, 20_000),
        action_items: cleanText(record.actions, 20_000),
        meeting_link: cleanText(record.link, 2_000),
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
      return NextResponse.json({ saved: true, id, version: saved.version, updatedAt: saved.updated_at });
    }

    const title = cleanText(record.ten ?? record.title, 240);
    const description = cleanText(record.description ?? record.note, 20_000);
    const deadline = isoDate(record.deadline);
    const ownerId = cleanText(record.nguoi ?? record.owner, 120);
    const taskKind = record.type === "coordination" || record.coordination === true ? "coordination" : "personal";
    const collaboratorIds = stringList(record.collaborators).filter((userId) => userId !== ownerId);
    if (!title) throw new ApiAuthError("Vui lòng nhập tiêu đề công việc.", 400);
    if (!description) throw new ApiAuthError("Vui lòng nhập nội dung công việc.", 400);
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
    const { error } = await getSupabaseAdmin().from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiError(error, "Không thể xóa công việc.");
  }
}
