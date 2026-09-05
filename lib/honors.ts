export const HONOR_TIMEZONE = "Asia/Ho_Chi_Minh";
export const HONOR_FORMULA_VERSION = "clm-honor-v1-legacy-2026-08";

export type HonorPeriodType = "week" | "month" | "quarter" | "custom";

export type HonorPeriod = {
  type: HonorPeriodType;
  start: string;
  end: string;
  label: string;
  timezone: typeof HONOR_TIMEZONE;
};

export type HonorTask = {
  id: string;
  title: string;
  ownerId: string;
  collaboratorIds: string[];
  kind: string;
  status: string;
  deadline: string;
  taskDate?: string | null;
  completedAt?: string | null;
  originalTaskId?: string | null;
  rescheduledFromTaskId?: string | null;
  rescheduledToTaskId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

export type HonorProfile = {
  id: string;
  fullName: string;
  email?: string | null;
};

export type HonorExternalMetrics = {
  workScore?: number | null;
  efficiencyScore?: number | null;
  qualityScore?: number | null;
  disciplineScore?: number | null;
  eventCount?: number | null;
  signedEvents?: number | null;
  weeksWithScore?: number | null;
  meetingActionsTotal?: number | null;
  meetingActionsCompleted?: number | null;
};

export type HonorTaskMetrics = {
  validTasks: number;
  completedTasks: number;
  onTimeTasks: number;
  overdueTasks: number;
  completionRate: number | null;
  onTimeRate: number | null;
  collaborationTasks: number;
};

export type HonorTaskAudit = {
  id: string;
  title: string;
  ownerId: string;
  taskDate: string | null;
  deadline: string;
  status: string;
  chainId: string;
  reasonCode?: HonorExclusionReason;
  reason?: string;
  selectedTaskId?: string;
};

export type HonorExclusionReason =
  | "soft_deleted"
  | "demo_data"
  | "meeting_not_task"
  | "rescheduled_source"
  | "duplicate_chain"
  | "outside_period"
  | "missing_task_date"
  | "missing_owner";

export type HonorRanking = {
  userId: string;
  fullName: string;
  rank: number | null;
  score: number | null;
  metrics: HonorTaskMetrics;
  highlight: string | null;
  reason: string;
  contributingTasks?: HonorTaskAudit[];
  excludedTasks?: HonorTaskAudit[];
};

export type HonorInsufficient = {
  userId: string;
  fullName: string;
  reason: string;
  missingSources: string[];
};

type ScoreComponent = { value: number; weight: number };
type ScoreGroup = { value: number; weight: number };

export class HonorValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedText(value: unknown) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HONOR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function keyFromUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, amount: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return keyFromUtcDate(date);
}

function endOfMonth(year: number, month: number) {
  return keyFromUtcDate(new Date(Date.UTC(year, month, 0, 12)));
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function periodLabel(type: HonorPeriodType, start: string, end: string) {
  if (type === "week") return `Tuần ${displayDate(start)} – ${displayDate(end)}`;
  if (type === "month") return `Tháng ${start.slice(5, 7)}/${start.slice(0, 4)}`;
  if (type === "quarter") {
    const quarter = Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1;
    return `Quý ${quarter}/${start.slice(0, 4)}`;
  }
  return `${displayDate(start)} – ${displayDate(end)}`;
}

export function resolveHonorPeriod(
  input: { periodType?: unknown; start?: unknown; end?: unknown },
  now = new Date(),
): HonorPeriod {
  const requestedType = cleanText(input.periodType);
  if (requestedType && !["week", "month", "quarter", "custom"].includes(requestedType)) {
    throw new HonorValidationError("Loại kỳ Vinh danh không hợp lệ.");
  }
  const type: HonorPeriodType = requestedType === "month"
    || requestedType === "quarter"
    || requestedType === "custom"
    || requestedType === "week"
    ? requestedType
    : "month";
  const requestedStart = cleanText(input.start);
  const requestedEnd = cleanText(input.end);
  const anchor = requestedStart || dateKey(now);
  if (!validDateKey(anchor)) throw new HonorValidationError("Ngày bắt đầu không hợp lệ.");

  let start = anchor;
  let end = anchor;
  if (type === "week") {
    const weekday = dateFromKey(anchor).getUTCDay();
    start = addDays(anchor, -(weekday === 0 ? 6 : weekday - 1));
    end = addDays(start, 6);
  } else if (type === "month") {
    const [year, month] = anchor.split("-").map(Number);
    start = `${year}-${String(month).padStart(2, "0")}-01`;
    end = endOfMonth(year, month);
  } else if (type === "quarter") {
    const [year, month] = anchor.split("-").map(Number);
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    start = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
    end = endOfMonth(year, firstMonth + 2);
  } else {
    if (!validDateKey(requestedStart) || !validDateKey(requestedEnd)) {
      throw new HonorValidationError("Khoảng thời gian tùy chọn cần đủ ngày bắt đầu và kết thúc.");
    }
    start = requestedStart;
    end = requestedEnd;
  }
  if (end < start) throw new HonorValidationError("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
  const days = Math.round((dateFromKey(end).getTime() - dateFromKey(start).getTime()) / 86_400_000) + 1;
  if (days > 366) throw new HonorValidationError("Khoảng thời gian Vinh danh tối đa là 366 ngày.");

  return {
    type,
    start,
    end,
    label: periodLabel(type, start, end),
    timezone: HONOR_TIMEZONE,
  };
}

function rawBoolean(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return false;
  return keys.some((key) => payload[key] === true || normalizedText(payload[key]) === "true");
}

function effectiveTaskDate(task: HonorTask) {
  const candidates = [
    task.taskDate,
    task.rawPayload?.taskDate,
    task.rawPayload?.task_date,
    task.rawPayload?.date,
    task.deadline,
  ];
  for (const candidate of candidates) {
    const raw = cleanText(candidate).slice(0, 10);
    if (validDateKey(raw)) return raw;
  }
  return null;
}

function taskAudit(task: HonorTask): HonorTaskAudit {
  return {
    id: task.id,
    title: task.title,
    ownerId: task.ownerId,
    taskDate: effectiveTaskDate(task),
    deadline: task.deadline,
    status: task.status,
    chainId: cleanText(task.originalTaskId) || task.id,
  };
}

function excluded(task: HonorTask, code: HonorExclusionReason, reason: string): HonorTaskAudit {
  return { ...taskAudit(task), reasonCode: code, reason };
}

function isDemoTask(task: HonorTask) {
  return rawBoolean(task.rawPayload, ["isDemo", "is_demo", "demo", "isSample", "is_sample", "mock"]);
}

function isMeetingTask(task: HonorTask) {
  const kind = normalizedText(task.kind || task.rawPayload?.type || task.rawPayload?.kind).replace(/[\s-]+/g, "_");
  return kind === "meeting" || kind === "cuoc_hop";
}

function isRescheduledSource(task: HonorTask) {
  return Boolean(cleanText(task.rescheduledToTaskId))
    || normalizedText(task.status) === "da lui han";
}

function taskSelectionTime(task: HonorTask) {
  const taskDate = effectiveTaskDate(task);
  const fallback = cleanText(task.updatedAt || task.createdAt);
  const parsed = Date.parse(fallback);
  return `${taskDate ?? "0000-00-00"}|${Number.isFinite(parsed) ? String(parsed).padStart(16, "0") : fallback}|${task.id}`;
}

export function auditHonorTasks(tasks: HonorTask[], period: HonorPeriod) {
  const eligible: HonorTask[] = [];
  const excludedTasks: HonorTaskAudit[] = [];

  for (const task of tasks) {
    if (!cleanText(task.ownerId)) {
      excludedTasks.push(excluded(task, "missing_owner", "Task không có người phụ trách."));
      continue;
    }
    if (task.deletedAt) {
      excludedTasks.push(excluded(task, "soft_deleted", "Task đã bị xóa mềm."));
      continue;
    }
    if (isDemoTask(task)) {
      excludedTasks.push(excluded(task, "demo_data", "Task được đánh dấu là dữ liệu demo/mẫu."));
      continue;
    }
    if (isMeetingTask(task)) {
      excludedTasks.push(excluded(task, "meeting_not_task", "Cuộc họp không được tính như task."));
      continue;
    }
    if (isRescheduledSource(task)) {
      excludedTasks.push(excluded(task, "rescheduled_source", "Bản nguồn đã được lùi hạn/thay thế."));
      continue;
    }
    const taskDate = effectiveTaskDate(task);
    if (!taskDate) {
      excludedTasks.push(excluded(task, "missing_task_date", "Task không có ngày hợp lệ để xác định kỳ."));
      continue;
    }
    if (taskDate < period.start || taskDate > period.end) {
      excludedTasks.push(excluded(task, "outside_period", "Task nằm ngoài kỳ đánh giá."));
      continue;
    }
    eligible.push(task);
  }

  const byChain = new Map<string, HonorTask[]>();
  for (const task of eligible) {
    const key = cleanText(task.originalTaskId) || task.id;
    byChain.set(key, [...(byChain.get(key) ?? []), task]);
  }

  const contributingTasks: HonorTask[] = [];
  for (const chain of byChain.values()) {
    const sorted = [...chain].sort((left, right) => taskSelectionTime(right).localeCompare(taskSelectionTime(left)));
    const selected = sorted[0];
    contributingTasks.push(selected);
    for (const duplicate of sorted.slice(1)) {
      excludedTasks.push({
        ...excluded(duplicate, "duplicate_chain", "Bản trùng trong cùng chuỗi task chỉ được tính một lần."),
        selectedTaskId: selected.id,
      });
    }
  }

  return { contributingTasks, excludedTasks };
}

function completed(task: HonorTask) {
  return normalizedText(task.status) === "hoan thanh"
    || Boolean(task.completedAt)
    || rawBoolean(task.rawPayload, ["xong", "completionConfirmed", "completion_confirmed"]);
}

function completedOnTime(task: HonorTask) {
  if (!completed(task) || !task.completedAt || !validDateKey(task.deadline.slice(0, 10))) return false;
  const timestamp = new Date(task.completedAt);
  if (Number.isNaN(timestamp.getTime())) return false;
  const completedDate = dateKey(timestamp);
  return completedDate <= task.deadline.slice(0, 10);
}

function hasComparableCompletionDate(task: HonorTask) {
  return completed(task)
    && Boolean(task.completedAt)
    && !Number.isNaN(new Date(task.completedAt as string).getTime())
    && validDateKey(task.deadline.slice(0, 10));
}

function overdue(task: HonorTask, periodEnd: string) {
  const deadline = task.deadline.slice(0, 10);
  if (!validDateKey(deadline)) return false;
  if (completed(task)) return Boolean(task.completedAt) && !completedOnTime(task);
  return deadline <= periodEnd;
}

function participant(task: HonorTask, userId: string) {
  return task.ownerId === userId || task.collaboratorIds.includes(userId);
}

export function computeHonorTaskMetrics(tasks: HonorTask[], userId: string, periodEnd: string): HonorTaskMetrics {
  const relevant = tasks.filter((task) => participant(task, userId));
  const completedTasks = relevant.filter(completed);
  const comparableCompletedTasks = completedTasks.filter(hasComparableCompletionDate);
  const onTimeTasks = comparableCompletedTasks.filter(completedOnTime);
  const collaborationTasks = relevant.filter((task) => task.kind === "coordination" || task.collaboratorIds.length > 0);
  return {
    validTasks: relevant.length,
    completedTasks: completedTasks.length,
    onTimeTasks: onTimeTasks.length,
    overdueTasks: relevant.filter((task) => overdue(task, periodEnd)).length,
    completionRate: relevant.length ? completedTasks.length / relevant.length * 100 : null,
    onTimeRate: comparableCompletedTasks.length ? onTimeTasks.length / comparableCompletedTasks.length * 100 : null,
    collaborationTasks: collaborationTasks.length,
  };
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function weightedAverage(components: Array<ScoreComponent | null>) {
  const available = components.filter(
    (item): item is ScoreComponent => item !== null && Number.isFinite(item.value),
  );
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return null;
  return available.reduce((sum, item) => sum + clampScore(item.value) * item.weight, 0) / weight;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : null;
}

export function computeHonorScore(
  metrics: HonorTaskMetrics,
  tasks: HonorTask[],
  userId: string,
  external: HonorExternalMetrics | undefined,
  teamConversionRate: number | null,
) {
  const workScore = finiteNumber(external?.workScore);
  const efficiencyScore = finiteNumber(external?.efficiencyScore);
  const qualityScore = finiteNumber(external?.qualityScore);
  const disciplineScore = finiteNumber(external?.disciplineScore);
  const eventCount = finiteNumber(external?.eventCount);
  const signedEvents = finiteNumber(external?.signedEvents);
  const weeksWithScore = finiteNumber(external?.weeksWithScore) ?? 0;
  const meetingActionsTotal = finiteNumber(external?.meetingActionsTotal);
  const meetingActionsCompleted = finiteNumber(external?.meetingActionsCompleted);
  const relevantCollaboration = tasks.filter((task) => participant(task, userId) && (task.kind === "coordination" || task.collaboratorIds.length > 0));
  const completedCollaboration = relevantCollaboration.filter(completed).length;

  const execution = weightedAverage([
    metrics.completionRate !== null
      ? { value: metrics.completionRate, weight: 16 }
      : workScore !== null ? { value: workScore, weight: 16 } : null,
    metrics.onTimeRate !== null ? { value: metrics.onTimeRate, weight: 14 } : null,
    efficiencyScore !== null ? { value: efficiencyScore, weight: 10 } : null,
  ]);

  let business: number | null = null;
  if (eventCount !== null && eventCount > 0 && signedEvents !== null && teamConversionRate !== null && teamConversionRate > 0) {
    const adjustedRate = (signedEvents + 5 * teamConversionRate) / (eventCount + 5);
    business = clampScore(adjustedRate / teamConversionRate * 100);
  }

  const coordination = weightedAverage([
    relevantCollaboration.length
      ? { value: rate(completedCollaboration, relevantCollaboration.length) ?? 0, weight: 10 }
      : null,
    meetingActionsTotal !== null && meetingActionsTotal > 0 && meetingActionsCompleted !== null
      ? { value: rate(meetingActionsCompleted, meetingActionsTotal) ?? 0, weight: 6 }
      : null,
  ]);
  const quality = weightedAverage([
    qualityScore !== null ? { value: qualityScore, weight: 8 } : null,
    disciplineScore !== null ? { value: disciplineScore, weight: 4 } : null,
  ]);
  const groups: Array<ScoreGroup | null> = [
    execution !== null ? { value: execution, weight: 40 } : null,
    business !== null ? { value: business, weight: 25 } : null,
    coordination !== null ? { value: coordination, weight: 20 } : null,
    quality !== null ? { value: quality, weight: 15 } : null,
  ];
  const availableGroups = groups.filter((item): item is ScoreGroup => Boolean(item));
  const availableWeight = availableGroups.reduce((sum, item) => sum + item.weight, 0);
  const coverageEligible = (eventCount ?? 0) >= 3 || weeksWithScore >= 4 || metrics.validTasks >= 5;
  const eligible = coverageEligible && availableGroups.length >= 2 && availableWeight >= 80;
  const score = eligible ? weightedAverage(availableGroups) : null;
  const missingSources = [
    business === null ? "B2 – Code HĐ" : null,
    quality === null || efficiencyScore === null ? "Sheet Điểm làm việc" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    score: score === null ? null : Math.round(score * 10) / 10,
    eligible,
    coverageEligible,
    availableWeight,
    groupScores: { execution, business, coordination, quality },
    missingSources: [...new Set(missingSources)],
  };
}

function honorHighlight(score: number | null) {
  if (score === null) return null;
  if (score >= 90) return "Xuất sắc";
  if (score >= 85) return "Nổi bật";
  if (score >= 75) return "Tốt";
  if (score >= 65) return "Đạt";
  return "Cần cải thiện";
}

function detailAuditForUser(rows: HonorTaskAudit[], source: HonorTask[], userId: string) {
  const taskById = new Map(source.map((task) => [task.id, task]));
  return rows.filter((row) => {
    const task = taskById.get(row.id);
    return task ? participant(task, userId) : row.ownerId === userId;
  });
}

export function buildHonorRankings(options: {
  profiles: HonorProfile[];
  tasks: HonorTask[];
  period: HonorPeriod;
  detailsUserId?: string | null;
  externalMetrics?: Map<string, HonorExternalMetrics>;
}) {
  const audit = auditHonorTasks(options.tasks, options.period);
  const externalMetrics = options.externalMetrics ?? new Map<string, HonorExternalMetrics>();
  const teamEvents = [...externalMetrics.values()].reduce((sum, item) => sum + (finiteNumber(item.eventCount) ?? 0), 0);
  const teamSigned = [...externalMetrics.values()].reduce((sum, item) => sum + (finiteNumber(item.signedEvents) ?? 0), 0);
  const teamConversionRate = teamEvents > 0 ? teamSigned / teamEvents : null;
  const audits = audit.contributingTasks.map(taskAudit);
  const missingSourcesByUser = new Map<string, string[]>();
  const sortMetaByUser = new Map<string, {
    business: number | null;
    execution: number | null;
    quality: number | null;
    eventCount: number;
  }>();
  const today = dateKey(new Date());
  const metricsAsOf = today < options.period.end ? today : options.period.end;

  const rankings: HonorRanking[] = options.profiles.map((profile) => {
    const metrics = computeHonorTaskMetrics(audit.contributingTasks, profile.id, metricsAsOf);
    const external = externalMetrics.get(profile.id);
    const calculation = computeHonorScore(
      metrics,
      audit.contributingTasks,
      profile.id,
      external,
      teamConversionRate,
    );
    missingSourcesByUser.set(profile.id, calculation.missingSources);
    sortMetaByUser.set(profile.id, {
      business: calculation.groupScores.business,
      execution: calculation.groupScores.execution,
      quality: calculation.groupScores.quality,
      eventCount: finiteNumber(external?.eventCount) ?? 0,
    });
    const missingReason = !metrics.validTasks
      ? "Chưa đủ dữ liệu: không có task hợp lệ trong kỳ."
      : calculation.missingSources.length
        ? `Chưa đủ dữ liệu: thiếu ${calculation.missingSources.join(" và ")}.`
        : !calculation.coverageEligible
          ? "Chưa đủ dữ liệu: chưa đạt ngưỡng 3 sự kiện, 4 tuần hoặc 5 task."
          : "Chưa đủ dữ liệu để áp dụng đầy đủ công thức Vinh danh.";
    const ranking: HonorRanking = {
      userId: profile.id,
      fullName: profile.fullName,
      rank: null,
      score: calculation.score,
      metrics,
      highlight: honorHighlight(calculation.score),
      reason: calculation.score === null
        ? missingReason
        : `Đủ dữ liệu theo công thức ${HONOR_FORMULA_VERSION}.`,
    };
    if (options.detailsUserId === profile.id) {
      ranking.contributingTasks = detailAuditForUser(audits, audit.contributingTasks, profile.id);
      ranking.excludedTasks = detailAuditForUser(audit.excludedTasks, options.tasks, profile.id);
    }
    return ranking;
  });

  rankings.sort((left, right) => {
    if (left.score === null && right.score !== null) return 1;
    if (left.score !== null && right.score === null) return -1;
    if (left.score !== right.score) return (right.score ?? -1) - (left.score ?? -1);
    const leftSort = sortMetaByUser.get(left.userId);
    const rightSort = sortMetaByUser.get(right.userId);
    if (leftSort?.business !== rightSort?.business) return (rightSort?.business ?? -1) - (leftSort?.business ?? -1);
    if (leftSort?.execution !== rightSort?.execution) return (rightSort?.execution ?? -1) - (leftSort?.execution ?? -1);
    if (leftSort?.quality !== rightSort?.quality) return (rightSort?.quality ?? -1) - (leftSort?.quality ?? -1);
    if (leftSort?.eventCount !== rightSort?.eventCount) return (rightSort?.eventCount ?? 0) - (leftSort?.eventCount ?? 0);
    return left.fullName.localeCompare(right.fullName, "vi");
  });
  let rank = 0;
  for (const item of rankings) {
    if (item.score === null) continue;
    item.rank = ++rank;
  }
  const insufficient: HonorInsufficient[] = rankings
    .filter((item) => item.score === null)
    .map((item) => ({
      userId: item.userId,
      fullName: item.fullName,
      reason: item.reason,
      missingSources: missingSourcesByUser.get(item.userId) ?? [],
    }));
  return { rankings, insufficient, audit };
}
