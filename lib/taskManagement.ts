export const TASK_CREATE_ROLES = ["Admin", "PR Leader", "PR Representative"] as const;
export const TASK_SHIFT_VALUES = ["morning", "afternoon"] as const;

export type TaskShift = (typeof TASK_SHIFT_VALUES)[number];

export class TaskManagementValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TaskManagementValidationError";
  }
}

type JsonRecord = Record<string, unknown>;

export type DuplicateTaskSource = {
  id: string;
  title: string;
  description?: string | null;
  kind: string;
  owner_id: string;
  deadline: string;
  task_date?: string | null;
  related_meeting_id?: string | null;
  created_by: string;
  raw_payload?: unknown;
  shift?: unknown;
  duplicate_root_task_id?: string | null;
};

export type DuplicateTaskOptions = {
  id: string;
  actorId: string;
  taskDate?: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function normalizedToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function canCreateTaskForRole(role: unknown) {
  return TASK_CREATE_ROLES.includes(role as (typeof TASK_CREATE_ROLES)[number]);
}

export function canDuplicateTaskSource(input: {
  role: unknown;
  actorId: string;
  sourceCreatedBy: string;
}) {
  if (!canCreateTaskForRole(input.role)) return false;
  return input.role === "Admin"
    || input.role === "PR Leader"
    || input.actorId === input.sourceCreatedBy;
}

export function normalizeTaskShift(
  value: unknown,
  options: { strict?: boolean } = {},
): TaskShift | null {
  const token = normalizedToken(value);
  if (!token || token === "none" || token === "unassigned" || token === "chua phan ca") return null;
  if (["morning", "sang", "ca sang", "buoi sang"].includes(token)) return "morning";
  if (["afternoon", "chieu", "ca chieu", "buoi chieu"].includes(token)) return "afternoon";
  if (options.strict === false) return null;
  throw new TaskManagementValidationError("Ca làm việc chỉ nhận Ca sáng hoặc Ca chiều.");
}

export function taskShiftLabel(value: unknown) {
  const shift = normalizeTaskShift(value, { strict: false });
  if (shift === "morning") return "Ca sáng";
  if (shift === "afternoon") return "Ca chiều";
  return "Chưa phân ca";
}

const COPYABLE_PLANNING_KEYS = [
  "ev",
  "eventId",
  "event_id",
  "priority",
  "category",
  "labels",
  "tags",
] as const;

function copyPlanningMetadata(rawPayload: unknown) {
  const source = asRecord(rawPayload);
  const result: JsonRecord = {};
  for (const key of COPYABLE_PLANNING_KEYS) {
    const value = source[key];
    if (
      typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
      || value === null
      || (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      result[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return result;
}

/**
 * Builds a new, independent task. It deliberately does not reuse completion,
 * evidence, comments, history, timestamps, version or reschedule-chain fields.
 */
export function buildDuplicateTaskRow(
  source: DuplicateTaskSource,
  options: DuplicateTaskOptions,
) {
  const sourcePayload = asRecord(source.raw_payload);
  const shift = normalizeTaskShift(source.shift ?? sourcePayload.shift, { strict: false });
  const taskDate = options.taskDate || source.task_date || source.deadline;
  const duplicateRootId = source.duplicate_root_task_id || source.id;
  const relatedMeetingId = String(source.related_meeting_id ?? "").trim();
  const description = String(source.description ?? "");
  const rawPayload = {
    ...copyPlanningMetadata(source.raw_payload),
    id: options.id,
    ten: source.title,
    title: source.title,
    description,
    note: description,
    nguoi: source.owner_id,
    owner: source.owner_id,
    deadline: taskDate,
    taskDate,
    task_date: taskDate,
    proofUrl: "",
    status: "Mới tạo",
    xong: false,
    coordination: source.kind === "coordination",
    type: source.kind,
    relatedMeetingId,
    createdBy: source.created_by,
    shift,
    shiftLabel: taskShiftLabel(shift),
    duplicatedFromTaskId: source.id,
    duplicateRootTaskId: duplicateRootId,
    duplicatedBy: options.actorId,
  };

  return {
    id: options.id,
    title: source.title,
    description,
    kind: source.kind,
    owner_id: source.owner_id,
    deadline: taskDate,
    task_date: taskDate,
    shift,
    proof_url: "",
    status: "Mới tạo",
    related_meeting_id: relatedMeetingId,
    created_by: source.created_by,
    raw_payload: rawPayload,
    completion_confirmed: false,
    completed_at: null,
    completed_by: null,
    original_task_id: "",
    rescheduled_from_task_id: "",
    rescheduled_to_task_id: "",
    reschedule_reason: "",
    last_move_mode: "",
    last_move_reason: "",
    last_moved_at: null,
    last_moved_by: null,
    duplicated_from_task_id: source.id,
    duplicate_root_task_id: duplicateRootId,
    duplicated_by: options.actorId,
  };
}
