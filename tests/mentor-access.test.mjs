import assert from "node:assert/strict";
import test from "node:test";
import {
  MentorAccessError,
  normalizeMentorShift,
  parseMentorTaskFilters,
  resolveAllowedTraineeIds,
  resolveMentorDateRange,
  toMentorDailyTask,
} from "../lib/mentorAccess.ts";

const mentorId = "11111111-1111-4111-8111-111111111111";
const assignedId = "22222222-2222-4222-8222-222222222222";
const outsideId = "33333333-3333-4333-8333-333333333333";

test("Mentor can only resolve assigned Trainees while Admin can resolve every Trainee", () => {
  assert.deepEqual(resolveAllowedTraineeIds({
    role: "PR Leader",
    assignedTraineeIds: [assignedId],
    allTraineeIds: [assignedId, outsideId],
  }), [assignedId]);
  assert.throws(() => resolveAllowedTraineeIds({
    role: "PR Leader",
    assignedTraineeIds: [assignedId],
    requestedTraineeId: outsideId,
  }), (error) => error instanceof MentorAccessError && error.status === 403);
  assert.deepEqual(resolveAllowedTraineeIds({
    role: "Admin",
    assignedTraineeIds: [],
    allTraineeIds: [assignedId, outsideId],
    requestedTraineeId: outsideId,
  }), [outsideId]);
});

test("ordinary roles cannot use the Mentor tracking scope", () => {
  for (const role of ["PR Representative", "Viewer"]) {
    assert.throws(() => resolveAllowedTraineeIds({
      role,
      assignedTraineeIds: [assignedId],
    }), (error) => error instanceof MentorAccessError && error.status === 403);
  }
});

test("day, week, month and custom date filters use deterministic calendar boundaries", () => {
  assert.deepEqual(resolveMentorDateRange("day", "2026-09-05"), {
    from: "2026-09-05",
    to: "2026-09-05",
  });
  assert.deepEqual(resolveMentorDateRange("week", "2026-09-05"), {
    from: "2026-08-31",
    to: "2026-09-06",
  });
  assert.deepEqual(resolveMentorDateRange("month", "2028-02-05"), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
  assert.deepEqual(resolveMentorDateRange("custom", "2026-09-05", "2026-09-01", "2026-09-30"), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
});

test("filter parser rejects an out-of-scope format before a database query", () => {
  const params = new URLSearchParams({
    period: "week",
    date: "2026-09-05",
    traineeId: mentorId,
    status: "Đang thực hiện",
    shift: "morning",
  });
  const filters = parseMentorTaskFilters(params);
  assert.equal(filters.from, "2026-08-31");
  assert.equal(filters.to, "2026-09-06");
  assert.equal(filters.shift, "morning");
  assert.throws(
    () => parseMentorTaskFilters(new URLSearchParams({ traineeId: "not-a-uuid" })),
    MentorAccessError,
  );
});

test("task DTO exposes only tracking fields and preserves unassigned legacy shifts", () => {
  const dto = toMentorDailyTask({
    id: "T-1",
    title: "Theo dõi đối tác",
    description: "Ghi chú",
    owner_id: assignedId,
    task_date: "2026-09-05",
    deadline: "2026-09-05",
    status: "Đang thực hiện",
    proof_url: "https://example.com/proof",
    updated_at: "2026-09-05T01:00:00Z",
    kind: "personal",
    raw_payload: { progress: 72.34, privateToken: "must-not-leak" },
  }, "Trainee A");
  assert.equal(dto.shift, "unassigned");
  assert.equal(dto.shiftLabel, "Chưa phân ca");
  assert.equal(dto.progress, 72.3);
  assert.equal("raw_payload" in dto, false);
  assert.equal("privateToken" in dto, false);
  assert.equal(normalizeMentorShift("Ca chiều"), "afternoon");
});
