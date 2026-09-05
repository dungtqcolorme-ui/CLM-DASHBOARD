import type { AppRole } from "@/lib/authTypes";

export const MENTOR_ROLE: AppRole = "PR Leader";
export const TRAINEE_ROLE: AppRole = "PR Representative";
export const MENTOR_PERIODS = ["day", "week", "month", "custom"] as const;
export const MENTOR_SHIFTS = ["morning", "afternoon", "unassigned"] as const;

export type MentorPeriod = (typeof MENTOR_PERIODS)[number];
export type MentorShift = (typeof MENTOR_SHIFTS)[number];

export type MentorTaskFilters = {
  traineeId: string | null;
  period: MentorPeriod;
  anchorDate: string;
  from: string;
  to: string;
  status: string | null;
  shift: MentorShift | null;
};

export type MentorTaskRow = {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  task_date: string | null;
  deadline: string;
  status: string;
  proof_url: string;
  updated_at: string;
  kind: string;
  raw_payload?: Record<string, unknown> | null;
  shift?: string | null;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_STATUSES = new Set([
  "Mới tạo",
  "Đang thực hiện",
  "Chờ review",
  "Cần chỉnh sửa",
  "Hoàn thành",
  "Đã lùi hạn",
]);

export class MentorAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function dateParts(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) throw new MentorAccessError("Ngày lọc không hợp lệ.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new MentorAccessError("Ngày lọc không hợp lệ.");
  }
  return { year, month, day, date };
}

function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function vietnamToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function resolveMentorDateRange(
  period: MentorPeriod,
  anchorDate: string,
  customFrom?: string,
  customTo?: string,
) {
  const anchor = dateParts(anchorDate);
  if (period === "custom") {
    const from = customFrom || anchorDate;
    const to = customTo || from;
    const fromDate = dateParts(from).date;
    const toDate = dateParts(to).date;
    if (toDate < fromDate) throw new MentorAccessError("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (spanDays > 366) throw new MentorAccessError("Khoảng thời gian tối đa là 366 ngày.");
    return { from, to };
  }
  if (period === "day") return { from: anchorDate, to: anchorDate };
  if (period === "week") {
    const mondayOffset = (anchor.date.getUTCDay() + 6) % 7;
    const monday = addUtcDays(anchor.date, -mondayOffset);
    return { from: isoFromDate(monday), to: isoFromDate(addUtcDays(monday, 6)) };
  }
  const start = new Date(Date.UTC(anchor.year, anchor.month - 1, 1));
  const end = new Date(Date.UTC(anchor.year, anchor.month, 0));
  return { from: isoFromDate(start), to: isoFromDate(end) };
}

type SearchParamsLike = Pick<URLSearchParams, "get">;

export function parseMentorTaskFilters(searchParams: SearchParamsLike, now = new Date()): MentorTaskFilters {
  const rawTraineeId = (searchParams.get("traineeId") ?? "").trim();
  if (rawTraineeId && !UUID_PATTERN.test(rawTraineeId)) {
    throw new MentorAccessError("Mã Trainee không hợp lệ.");
  }
  const rawPeriod = (searchParams.get("period") ?? "week").trim();
  if (!MENTOR_PERIODS.includes(rawPeriod as MentorPeriod)) {
    throw new MentorAccessError("Kỳ lọc không hợp lệ.");
  }
  const period = rawPeriod as MentorPeriod;
  const anchorDate = (searchParams.get("date") ?? vietnamToday(now)).trim();
  const { from, to } = resolveMentorDateRange(
    period,
    anchorDate,
    (searchParams.get("from") ?? "").trim(),
    (searchParams.get("to") ?? "").trim(),
  );
  const rawStatus = (searchParams.get("status") ?? "").trim();
  if (rawStatus && !TASK_STATUSES.has(rawStatus)) {
    throw new MentorAccessError("Trạng thái task không hợp lệ.");
  }
  const rawShift = (searchParams.get("shift") ?? "").trim();
  if (rawShift && !MENTOR_SHIFTS.includes(rawShift as MentorShift)) {
    throw new MentorAccessError("Ca làm việc không hợp lệ.");
  }
  return {
    traineeId: rawTraineeId || null,
    period,
    anchorDate,
    from,
    to,
    status: rawStatus || null,
    shift: rawShift ? rawShift as MentorShift : null,
  };
}

export function assertMentorReadRole(role: AppRole) {
  if (role !== "Admin" && role !== MENTOR_ROLE) {
    throw new MentorAccessError("Chỉ Admin hoặc Mentor được theo dõi Trainee.", 403);
  }
}

export function resolveAllowedTraineeIds(input: {
  role: AppRole;
  assignedTraineeIds: string[];
  allTraineeIds?: string[];
  requestedTraineeId?: string | null;
}) {
  assertMentorReadRole(input.role);
  const source = input.role === "Admin"
    ? input.allTraineeIds ?? []
    : input.assignedTraineeIds;
  const allowed = [...new Set(source.filter((id) => UUID_PATTERN.test(id)))];
  if (!input.requestedTraineeId) return allowed;
  if (!allowed.includes(input.requestedTraineeId)) {
    throw new MentorAccessError("Trainee không thuộc phạm vi theo dõi của bạn.", 403);
  }
  return [input.requestedTraineeId];
}

export function normalizeMentorShift(value: unknown): MentorShift {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (["morning", "sang", "casang", "am"].includes(normalized)) return "morning";
  if (["afternoon", "chieu", "cachieu", "pm"].includes(normalized)) return "afternoon";
  return "unassigned";
}

function numericProgress(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
}

export function toMentorDailyTask(row: MentorTaskRow, ownerName: string) {
  const payload = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  const shift = normalizeMentorShift(row.shift ?? payload.shift ?? payload.ca ?? payload.workShift);
  const explicitProgress = numericProgress(payload.progress ?? payload.tienDo ?? payload.percentage);
  const progress = explicitProgress ?? (row.status === "Hoàn thành" ? 100 : null);
  return {
    id: row.id,
    title: row.title,
    date: row.task_date ?? row.deadline,
    shift,
    shiftLabel: shift === "morning" ? "Ca sáng" : shift === "afternoon" ? "Ca chiều" : "Chưa phân ca",
    owner: { id: row.owner_id, fullName: ownerName },
    status: row.status,
    progress,
    updatedAt: row.updated_at,
    note: row.description,
    evidenceUrl: row.proof_url || null,
    kind: row.kind,
  };
}
