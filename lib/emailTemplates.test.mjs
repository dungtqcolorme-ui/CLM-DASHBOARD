import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyReportTemplate,
  meetingReminderTemplate,
} from "./emailTemplates.ts";

test("Google Meet reminder has a text body, safe HTML, and the configured timing", () => {
  const template = meetingReminderTemplate({
    recipientName: "Dũng <script>alert(1)</script>",
    title: "Họp tuần",
    startsAt: "2026-08-06T10:00:00+07:00",
    endsAt: "2026-08-06T10:30:00+07:00",
    meetingType: "google_meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    creatorName: "Leader",
    notes: "Tổng kết & kế hoạch",
    reminderMinutes: 15,
  });

  assert.match(template.subject, /sau 15 phút$/);
  assert.match(template.text, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(template.html, /Tham gia cuộc họp/);
  assert.doesNotMatch(template.html, /<script>/);
});

test("in-person reminder shows the venue and never renders a Meet CTA", () => {
  const template = meetingReminderTemplate({
    recipientName: "Dũng",
    title: "Họp trực tiếp",
    startsAt: "2026-08-06T10:00:00+07:00",
    endsAt: "2026-08-06T10:30:00+07:00",
    meetingType: "in_person",
    meetingLink: "https://meet.google.com/should-not-render",
    location: "Phòng họp 2",
    creatorName: "Leader",
  });

  assert.match(template.text, /Địa điểm: Phòng họp 2/);
  assert.doesNotMatch(template.text, /should-not-render/);
  assert.doesNotMatch(template.html, /Tham gia cuộc họp/);
});

test("empty Daily Report remains readable and never leaks null-like values", () => {
  const template = dailyReportTemplate({
    reportDate: "2026-08-06",
    recipientName: "Leader",
    tasks: [],
    meetings: [],
    tomorrowMeetings: [],
    timezone: "Asia/Ho_Chi_Minh",
  });

  assert.match(template.text, /Không có công việc phát sinh trong ngày\./);
  assert.doesNotMatch(template.text, /undefined|null|NaN/);
});

test("team Daily Report groups tasks by employee", () => {
  const template = dailyReportTemplate({
    reportDate: "2026-08-06",
    recipientName: "PR Leader",
    groupByPerson: true,
    tasks: [
      {
        ownerId: "one",
        ownerName: "Qu. Dũng",
        title: "Task A",
        status: "Hoàn thành",
        deadline: "2026-08-06",
        completedAt: "2026-08-06T09:00:00+07:00",
      },
      {
        ownerId: "two",
        ownerName: "Thành Đạt",
        title: "Task B",
        status: "Đang thực hiện",
        deadline: "2026-08-06",
      },
    ],
    meetings: [],
    tomorrowMeetings: [],
    timezone: "Asia/Ho_Chi_Minh",
  });

  assert.match(template.text, /Qu\. Dũng:\n\s+- Task A/);
  assert.match(template.text, /Thành Đạt:\n\s+- Task B/);
});

test("Daily Report counts incomplete tasks from earlier deadlines as overdue", () => {
  const template = dailyReportTemplate({
    reportDate: "2026-08-06",
    recipientName: "PR Leader",
    tasks: [
      {
        ownerId: "one",
        ownerName: "Qu. Dũng",
        title: "Hoàn thiện hồ sơ tài trợ",
        status: "Đang thực hiện",
        deadline: "2026-08-05",
      },
    ],
    meetings: [],
    tomorrowMeetings: [],
    timezone: "Asia/Ho_Chi_Minh",
  });

  assert.match(template.text, /- Quá hạn: 1/);
  assert.match(template.text, /- Quá hạn: Hoàn thiện hồ sơ tài trợ/);
});
