import assert from "node:assert/strict";
import test from "node:test";
import {
  auditHonorTasks,
  buildHonorRankings,
  computeHonorTaskMetrics,
  resolveHonorPeriod,
} from "../lib/honors.ts";
import {
  buildHonorExternalMetricsFromState,
  normalizeHonorPersonName,
} from "../lib/honorSources.ts";

const period = resolveHonorPeriod({
  periodType: "custom",
  start: "2026-08-01",
  end: "2026-08-31",
});

function task(overrides = {}) {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Task",
    ownerId: overrides.ownerId ?? "user-1",
    collaboratorIds: overrides.collaboratorIds ?? [],
    kind: overrides.kind ?? "personal",
    status: overrides.status ?? "Mới tạo",
    deadline: overrides.deadline ?? "2026-08-10",
    taskDate: overrides.taskDate ?? null,
    completedAt: overrides.completedAt ?? null,
    originalTaskId: overrides.originalTaskId ?? "",
    rescheduledFromTaskId: overrides.rescheduledFromTaskId ?? "",
    rescheduledToTaskId: overrides.rescheduledToTaskId ?? "",
    createdAt: overrides.createdAt ?? "2026-08-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-08-01T00:00:00Z",
    deletedAt: overrides.deletedAt ?? null,
    rawPayload: overrides.rawPayload ?? {},
  };
}

test("resolveHonorPeriod uses Vietnam calendar boundaries", () => {
  assert.deepEqual(
    resolveHonorPeriod({ periodType: "week", start: "2026-08-06" }),
    {
      type: "week",
      start: "2026-08-03",
      end: "2026-08-09",
      label: "Tuần 03/08/2026 – 09/08/2026",
      timezone: "Asia/Ho_Chi_Minh",
    },
  );
  assert.equal(resolveHonorPeriod({ periodType: "month", start: "2028-02-10" }).end, "2028-02-29");
  assert.throws(() => resolveHonorPeriod({ periodType: "year" }), /Loại kỳ/);
});

test("audit excludes deleted, demo, meeting and rescheduled tasks and deduplicates a chain", () => {
  const result = auditHonorTasks([
    task({ id: "root", deadline: "2026-08-04" }),
    task({ id: "copy", originalTaskId: "root", deadline: "2026-08-05", createdAt: "2026-08-05T00:00:00Z" }),
    task({ id: "deleted", deletedAt: "2026-08-05T01:00:00Z" }),
    task({ id: "demo", rawPayload: { isDemo: true } }),
    task({ id: "meeting", kind: "meeting" }),
    task({ id: "delayed", status: "Đã lùi hạn", rescheduledToTaskId: "replacement" }),
    task({ id: "outside", deadline: "2026-09-01" }),
  ], period);

  assert.deepEqual(result.contributingTasks.map((item) => item.id), ["copy"]);
  assert.deepEqual(
    new Set(result.excludedTasks.map((item) => item.reasonCode)),
    new Set(["duplicate_chain", "soft_deleted", "demo_data", "meeting_not_task", "rescheduled_source", "outside_period"]),
  );
  assert.equal(result.excludedTasks.find((item) => item.id === "root")?.selectedTaskId, "copy");
});

test("audit uses canonical taskDate before deadline and retains missing-date reasons", () => {
  const result = auditHonorTasks([
    task({ id: "task-date-inside", taskDate: "2026-08-12", deadline: "2026-09-01" }),
    task({ id: "task-date-outside", taskDate: "2026-09-01", deadline: "2026-08-12" }),
    task({ id: "missing-date", taskDate: null, deadline: "", rawPayload: {} }),
  ], period);

  assert.deepEqual(result.contributingTasks.map((item) => item.id), ["task-date-inside"]);
  assert.equal(
    result.excludedTasks.find((item) => item.id === "task-date-outside")?.reasonCode,
    "outside_period",
  );
  assert.equal(
    result.excludedTasks.find((item) => item.id === "missing-date")?.reasonCode,
    "missing_task_date",
  );
});

test("task metrics count late completion and pending past deadline as overdue", () => {
  const rows = [
    task({ id: "on-time", status: "Hoàn thành", deadline: "2026-08-10", completedAt: "2026-08-10T10:00:00Z" }),
    task({ id: "late", status: "Hoàn thành", deadline: "2026-08-10", completedAt: "2026-08-12T10:00:00Z" }),
    task({ id: "pending", kind: "coordination", collaboratorIds: ["user-2"], deadline: "2026-08-09" }),
  ];
  const metrics = computeHonorTaskMetrics(rows, "user-1", "2026-08-31");
  assert.equal(metrics.validTasks, 3);
  assert.equal(metrics.completedTasks, 2);
  assert.equal(metrics.onTimeTasks, 1);
  assert.equal(metrics.overdueTasks, 2);
  assert.equal(metrics.collaborationTasks, 1);
  assert.equal(metrics.onTimeRate, 50);
});

test("old completed tasks without a completion timestamp are not fabricated as late", () => {
  const metrics = computeHonorTaskMetrics([
    task({ id: "legacy-complete", status: "Hoàn thành", completedAt: null }),
  ], "user-1", "2026-08-31");
  assert.equal(metrics.completedTasks, 1);
  assert.equal(metrics.onTimeRate, null);
  assert.equal(metrics.overdueTasks, 0);
});

test("rankings do not invent a score when B2 and work-score sources are missing", () => {
  const result = buildHonorRankings({
    profiles: [{ id: "user-1", fullName: "Nhân sự A" }],
    tasks: [task({ id: "one", status: "Hoàn thành", completedAt: "2026-08-09T01:00:00Z" })],
    period,
    detailsUserId: "user-1",
  });
  assert.equal(result.rankings[0].score, null);
  assert.equal(result.rankings[0].rank, null);
  assert.match(result.rankings[0].reason, /Chưa đủ dữ liệu/);
  assert.equal(result.rankings[0].contributingTasks?.length, 1);
});

test("legacy formula remains 100 when all real source components are 100", () => {
  const tasks = Array.from({ length: 5 }, (_, index) => task({
    id: `complete-${index}`,
    kind: "coordination",
    collaboratorIds: ["user-2"],
    deadline: `2026-08-${String(index + 10).padStart(2, "0")}`,
    status: "Hoàn thành",
    completedAt: `2026-08-${String(index + 10).padStart(2, "0")}T01:00:00Z`,
  }));
  const result = buildHonorRankings({
    profiles: [{ id: "user-1", fullName: "Nhân sự A" }],
    tasks,
    period,
    externalMetrics: new Map([["user-1", {
      workScore: 100,
      efficiencyScore: 100,
      qualityScore: 100,
      disciplineScore: 100,
      eventCount: 5,
      signedEvents: 5,
      weeksWithScore: 4,
      meetingActionsTotal: 1,
      meetingActionsCompleted: 1,
    }]]),
  });
  assert.equal(result.rankings[0].score, 100);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[0].highlight, "Xuất sắc");
});

test("B1/B2 source metrics use profile UUIDs, period dates, and stable-code deduplication", () => {
  const profileId = "11111111-1111-4111-8111-111111111111";
  const source = buildHonorExternalMetricsFromState({
    profiles: [{ id: profileId, fullName: "Nhân sự A", email: "a@example.com" }],
    period,
    stateUpdatedAt: "2026-08-31T12:00:00Z",
    state: {
      meta: { source: "Google Sheet trực tiếp" },
      contractSourceVersion: "b2-code-owner-v1",
      staff: [{ id: "PR_A", ten: "Nhân sự A", email: "a@example.com" }],
      contractSourceB1: [{ ma: "B1-K140-001" }, { ma: "B1-K140-002" }],
      contractSourceB2: [
        { ma: "HD-01", pr: "PR_A", signed: true },
        { contractCode: " HD-01 ", pr: "PR_A", signed: true },
        { ma: "HD-NO-DATE", pr: "PR_A", signed: true },
      ],
      events: [
        { ma: "B1-K140-001", pr: "PR_A", source: "B1", taoNgay: "2026-08-02" },
        { ma: "HD-01", pr: "PR_A", source: "B2", taoNgay: "2026-08-03" },
        { ma: "B1-K140-002", pr: "PR_A", source: "B1", taoNgay: "2026-09-01" },
        { ma: "HD-NO-DATE", pr: "PR_A", source: "B2", taoNgay: "" },
      ],
    },
  });

  assert.deepEqual(source.externalMetrics.get(profileId), {
    eventCount: 2,
    signedEvents: 1,
  });
  assert.equal(source.sources.b2CodeHd.status, "available");
  assert.equal(source.sources.b2CodeHd.matchedRows, 2);
  assert.match(source.sources.b2CodeHd.reason, /bỏ 1 mã/);
  assert.equal(source.sources.workScoreSheet.status, "unavailable");
  assert.match(source.sources.workScoreSheet.reason, /chưa có ngày/);
});

test("current Qu. Dũng maps to the Supabase profile without merging historical Q. Dũng", () => {
  const profileId = "22222222-2222-4222-8222-222222222222";
  const source = buildHonorExternalMetricsFromState({
    profiles: [{ id: profileId, fullName: "Trần Quang Dũng" }],
    period,
    state: {
      meta: { source: "Google Sheet trực tiếp" },
      contractSourceVersion: "b2-code-owner-v1",
      staff: [
        { id: "PR_QD", ten: "Qu. Dũng" },
        { id: "PR_OLD_QD", ten: "Q. Dũng" },
      ],
      contractSourceB2: [{ ma: "HD-QU", pr: "PR_QD", signed: true }],
      events: [
        { ma: "HD-QU", pr: "PR_QD", source: "B2", taoNgay: "2026-08-03" },
        { ma: "B1-OLD", pr: "PR_OLD_QD", source: "B1", taoNgay: "2026-08-04" },
      ],
    },
  });

  assert.equal(normalizeHonorPersonName("Trần Quang Dũng"), "qudung");
  assert.notEqual(normalizeHonorPersonName("Q. Dũng"), "qudung");
  assert.deepEqual(source.externalMetrics.get(profileId), {
    eventCount: 1,
    signedEvents: 1,
  });
});

test("state without verified live B2 provenance is not treated as score data", () => {
  const source = buildHonorExternalMetricsFromState({
    profiles: [{ id: "user-1", fullName: "Nhân sự A" }],
    period,
    state: {
      meta: { source: "Dữ liệu minh họa" },
      contractSourceB2: [{ ma: "FAKE-01", pr: "user-1", signed: true }],
      events: [{ ma: "FAKE-01", pr: "user-1", source: "B2", taoNgay: "2026-08-03" }],
    },
  });
  assert.equal(source.externalMetrics.size, 0);
  assert.equal(source.sources.b2CodeHd.status, "unavailable");
});
