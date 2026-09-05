export const DEFAULT_EMAIL_TIMEZONE = "Asia/Ho_Chi_Minh";

type MeetingReminderInput = {
  recipientName: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  meetingType: "google_meet" | "in_person";
  meetingLink?: string;
  location?: string;
  creatorName: string;
  notes?: string;
  timezone?: string;
  reminderMinutes?: number;
};

export type DailyReportTask = {
  ownerId?: string;
  ownerName?: string;
  title: string;
  status: string;
  deadline: string;
  completedAt?: string | null;
  delayed?: boolean;
};

export type DailyReportMeeting = {
  title: string;
  startsAt: string;
  meetingType: "google_meet" | "in_person";
};

export type DailyReportInput = {
  reportDate: string;
  recipientName: string;
  tasks: DailyReportTask[];
  meetings: DailyReportMeeting[];
  tomorrowMeetings: DailyReportMeeting[];
  timezone?: string;
  groupByPerson?: boolean;
};

function safe(value: unknown, fallback = "Không có") {
  const text = String(value ?? "").replace(/\u0000/g, "").trim();
  return text && text !== "undefined" && text !== "null" && text !== "NaN" ? text : fallback;
}

function escapeHtml(value: unknown) {
  return safe(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function dateFormatter(timezone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function timeFormatter(timezone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function asDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function reportDateLabel(value: string, timezone: string) {
  const date = asDate(`${value}T12:00:00+07:00`) ?? asDate(value);
  return date ? dateFormatter(timezone).format(date) : safe(value);
}

export function meetingReminderTemplate(input: MeetingReminderInput) {
  const timezone = input.timezone || DEFAULT_EMAIL_TIMEZONE;
  const start = asDate(input.startsAt);
  const end = input.endsAt ? asDate(input.endsAt) : null;
  const date = start ? dateFormatter(timezone).format(start) : "Không xác định";
  const startTime = start ? timeFormatter(timezone).format(start) : "Không xác định";
  const endTime = end ? timeFormatter(timezone).format(end) : "Không xác định";
  const title = safe(input.title, "Cuộc họp");
  const recipient = safe(input.recipientName, "bạn");
  const creator = safe(input.creatorName, "Không xác định");
  const notes = safe(input.notes, "Không có ghi chú");
  const isMeet = input.meetingType === "google_meet";
  const joinUrl = isMeet ? safeUrl(input.meetingLink) : "";
  const venue = isMeet ? "Google Meet" : safe(input.location, "Chưa cập nhật địa điểm");
  const reminderMinutes = Number.isInteger(input.reminderMinutes) && Number(input.reminderMinutes) > 0
    ? Number(input.reminderMinutes)
    : 15;
  const subject = `[PR Dashboard] Cuộc họp “${title}” sẽ bắt đầu sau ${reminderMinutes} phút`;
  const details = [
    `Xin chào ${recipient},`,
    "",
    `Cuộc họp “${title}” sắp bắt đầu.`,
    `Ngày họp: ${date}`,
    `Thời gian: ${startTime} – ${endTime}`,
    `Hình thức: ${isMeet ? "Google Meet" : "Trực tiếp"}`,
    `${isMeet ? "Link tham gia" : "Địa điểm"}: ${isMeet ? (joinUrl || "Chưa cập nhật link") : venue}`,
    `Người tạo: ${creator}`,
    `Ghi chú: ${notes}`,
    "",
    "Email này được gửi tự động từ CLM Dashboard.",
  ];
  const actionHtml = isMeet && joinUrl
    ? `<p><a href="${escapeHtml(joinUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#e11b22;color:#fff;text-decoration:none;font-weight:700">Tham gia cuộc họp</a></p>`
    : "";
  const html = `<!doctype html><html lang="vi"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><p>Xin chào ${escapeHtml(recipient)},</p><p>Cuộc họp <strong>“${escapeHtml(title)}”</strong> sắp bắt đầu.</p><ul><li>Ngày họp: ${escapeHtml(date)}</li><li>Thời gian: ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</li><li>Hình thức: ${isMeet ? "Google Meet" : "Trực tiếp"}</li><li>${isMeet ? "Link tham gia" : "Địa điểm"}: ${isMeet && joinUrl ? `<a href="${escapeHtml(joinUrl)}">${escapeHtml(joinUrl)}</a>` : escapeHtml(venue)}</li><li>Người tạo: ${escapeHtml(creator)}</li><li>Ghi chú: ${escapeHtml(notes)}</li></ul>${actionHtml}<p style="color:#6b7280">Email này được gửi tự động từ CLM Dashboard.</p></body></html>`;
  return { subject, text: details.join("\n"), html };
}

function taskLine(task: DailyReportTask, timezone: string) {
  if (task.completedAt) {
    const completed = asDate(task.completedAt);
    const late = Boolean(completed && /^\d{4}-\d{2}-\d{2}$/.test(task.deadline)
      && dateKey(completed, timezone) > task.deadline);
    return `- ${safe(task.title, "Task không tên")} – ${late ? "Hoàn thành trễ hạn" : "Hoàn thành"}${completed ? ` lúc ${timeFormatter(timezone).format(completed)}` : ""}`;
  }
  return `- ${safe(task.title, "Task không tên")} – ${safe(task.status, "Chưa hoàn thành")} – Deadline ${safe(task.deadline)}`;
}

function meetingLine(meeting: DailyReportMeeting, timezone: string) {
  const start = asDate(meeting.startsAt);
  return `- ${start ? timeFormatter(timezone).format(start) : "--:--"} – ${safe(meeting.title, "Cuộc họp")} – ${meeting.meetingType === "google_meet" ? "Google Meet" : "Trực tiếp"}`;
}

function section(title: string, lines: string[]) {
  return [title, ...(lines.length ? lines : ["- Không có"]), ""].join("\n");
}

function taskSection(title: string, tasks: DailyReportTask[], timezone: string, groupByPerson: boolean) {
  if (!tasks.length) return section(title, []);
  if (!groupByPerson) return section(title, tasks.map((task) => taskLine(task, timezone)));
  const groups = new Map<string, DailyReportTask[]>();
  for (const task of tasks) {
    const owner = safe(task.ownerName, "Chưa xác định nhân sự");
    groups.set(owner, [...(groups.get(owner) ?? []), task]);
  }
  const lines: string[] = [];
  for (const [owner, ownerTasks] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "vi"))) {
    lines.push(`${owner}:`, ...ownerTasks.map((task) => `  ${taskLine(task, timezone)}`));
  }
  return section(title, lines);
}

export function dailyReportTemplate(input: DailyReportInput) {
  const timezone = input.timezone || DEFAULT_EMAIL_TIMEZONE;
  const completed = input.tasks.filter((task) => task.status === "Hoàn thành" || Boolean(task.completedAt));
  const incomplete = input.tasks.filter((task) => !completed.includes(task) && task.status !== "Đã lùi hạn");
  const delayed = input.tasks.filter((task) => task.delayed || task.status === "Đã lùi hạn");
  const overdue = incomplete.filter((task) => /^\d{4}-\d{2}-\d{2}$/.test(task.deadline) && task.deadline < input.reportDate);
  const denominator = completed.length + incomplete.length;
  const completionRate = denominator ? Math.round((completed.length / denominator) * 100) : 0;
  const dateLabel = reportDateLabel(input.reportDate, timezone);
  const recipientName = safe(input.recipientName, "Nhân sự");
  const noActivity = input.tasks.length === 0 && input.meetings.length === 0;
  const attention = [
    ...overdue.map((task) => `- Quá hạn: ${safe(task.title, "Task không tên")}`),
    ...delayed.map((task) => `- Đã lùi deadline: ${safe(task.title, "Task không tên")}`),
    ...input.tomorrowMeetings.map((meeting) => `- Cuộc họp ngày mai: ${meetingLine(meeting, timezone).slice(2)}`),
  ];
  const text = [
    `DAILY REPORT – ${dateLabel}`,
    "",
    `Nhân sự/Người nhận: ${recipientName}`,
    "",
    "1. Tổng quan",
    `- Tổng số task trong ngày: ${denominator}`,
    `- Đã hoàn thành: ${completed.length}`,
    `- Chưa hoàn thành: ${incomplete.length}`,
    `- Quá hạn: ${overdue.length}`,
    `- Được lùi deadline: ${delayed.length}`,
    "",
    taskSection("2. Task đã hoàn thành", completed, timezone, Boolean(input.groupByPerson)).trimEnd(),
    "",
    taskSection("3. Task chưa hoàn thành", incomplete, timezone, Boolean(input.groupByPerson)).trimEnd(),
    "",
    section("4. Cuộc họp trong ngày", input.meetings.map((meeting) => meetingLine(meeting, timezone))).trimEnd(),
    "",
    section("5. Công việc cần chú ý", attention).trimEnd(),
    "",
    "6. Tổng kết",
    `- Tỷ lệ hoàn thành trong ngày: ${completionRate}%`,
    `- Ghi chú: ${noActivity ? "Không có công việc phát sinh trong ngày." : "Dữ liệu được tổng hợp tự động từ CLM Dashboard."}`,
  ].join("\n");
  return {
    subject: `[PR Dashboard] Daily Report ngày ${dateLabel}`,
    text,
  };
}

export function testEmailTemplate(recipientName: string) {
  return {
    subject: "[PR Dashboard] Kiểm tra kết nối Gmail",
    text: [
      `Xin chào ${safe(recipientName, "bạn")},`,
      "",
      "Đây là email kiểm tra được gửi từ backend CLM Dashboard.",
      "Nếu bạn nhận được email này, kết nối Gmail API đang hoạt động.",
      "",
      "Email này không chứa dữ liệu công việc.",
    ].join("\n"),
  };
}
