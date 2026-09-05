import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDuplicateTaskRow,
  canCreateTaskForRole,
  canDuplicateTaskSource,
  normalizeTaskShift,
  taskShiftLabel,
  TaskManagementValidationError,
} from "../lib/taskManagement.ts";

const SOURCE = {
  id: "T-source",
  title: "Gọi đối tác",
  description: "Xác nhận quyền lợi",
  kind: "coordination",
  owner_id: "11111111-1111-4111-8111-111111111111",
  deadline: "2026-09-05",
  task_date: "2026-09-05",
  shift: "morning",
  related_meeting_id: "MT-01",
  created_by: "22222222-2222-4222-8222-222222222222",
  duplicate_root_task_id: "",
  raw_payload: {
    priority: "high",
    tags: ["đối tác"],
    proofUrl: "https://private.example/proof",
    comments: [{ text: "Không được sao chép" }],
    history: [{ action: "Hoàn thành" }],
    attachments: [{ path: "private/file.pdf" }],
    status: "Hoàn thành",
    xong: true,
    createdAt: "2026-09-01T01:00:00Z",
    updatedAt: "2026-09-05T01:00:00Z",
    version: 9,
  },
};

test("normalizes canonical and Vietnamese task shifts without breaking unassigned legacy tasks", () => {
  assert.equal(normalizeTaskShift("morning"), "morning");
  assert.equal(normalizeTaskShift("Ca sáng"), "morning");
  assert.equal(normalizeTaskShift("buổi chiều"), "afternoon");
  assert.equal(normalizeTaskShift(null), null);
  assert.equal(normalizeTaskShift("legacy-value", { strict: false }), null);
  assert.equal(taskShiftLabel(null), "Chưa phân ca");
  assert.equal(taskShiftLabel("afternoon"), "Ca chiều");
  assert.throws(
    () => normalizeTaskShift("night"),
    (error) => error instanceof TaskManagementValidationError && error.status === 400,
  );
});

test("only roles already authorized to create tasks may duplicate", () => {
  assert.equal(canCreateTaskForRole("Admin"), true);
  assert.equal(canCreateTaskForRole("PR Leader"), true);
  assert.equal(canCreateTaskForRole("PR Representative"), true);
  assert.equal(canCreateTaskForRole("Viewer"), false);
  assert.equal(canCreateTaskForRole(""), false);
  assert.equal(canDuplicateTaskSource({ role: "PR Representative", actorId: "owner", sourceCreatedBy: "owner" }), true);
  assert.equal(canDuplicateTaskSource({ role: "PR Representative", actorId: "other", sourceCreatedBy: "owner" }), false);
  assert.equal(canDuplicateTaskSource({ role: "PR Leader", actorId: "leader", sourceCreatedBy: "owner" }), true);
  assert.equal(canDuplicateTaskSource({ role: "Admin", actorId: "admin", sourceCreatedBy: "owner" }), true);
  assert.equal(canDuplicateTaskSource({ role: "Viewer", actorId: "owner", sourceCreatedBy: "owner" }), false);
});

test("duplicate copies planning fields and shift but resets task lifecycle and private task data", () => {
  const duplicated = buildDuplicateTaskRow(SOURCE, {
    id: "T-copy",
    actorId: "33333333-3333-4333-8333-333333333333",
  });

  assert.equal(duplicated.id, "T-copy");
  assert.equal(duplicated.title, SOURCE.title);
  assert.equal(duplicated.description, SOURCE.description);
  assert.equal(duplicated.owner_id, SOURCE.owner_id);
  assert.equal(duplicated.created_by, SOURCE.created_by);
  assert.equal(duplicated.kind, SOURCE.kind);
  assert.equal(duplicated.related_meeting_id, SOURCE.related_meeting_id);
  assert.equal(duplicated.shift, "morning");
  assert.equal(duplicated.status, "Mới tạo");
  assert.equal(duplicated.proof_url, "");
  assert.equal(duplicated.completion_confirmed, false);
  assert.equal(duplicated.completed_at, null);
  assert.equal(duplicated.completed_by, null);
  assert.equal(duplicated.original_task_id, "");
  assert.equal(duplicated.rescheduled_from_task_id, "");
  assert.equal(duplicated.rescheduled_to_task_id, "");
  assert.equal(duplicated.duplicated_from_task_id, SOURCE.id);
  assert.equal(duplicated.duplicate_root_task_id, SOURCE.id);
  assert.equal(duplicated.duplicated_by, "33333333-3333-4333-8333-333333333333");
  assert.equal(duplicated.raw_payload.priority, "high");
  assert.deepEqual(duplicated.raw_payload.tags, ["đối tác"]);
  assert.equal(duplicated.raw_payload.proofUrl, "");
  assert.equal("comments" in duplicated.raw_payload, false);
  assert.equal("history" in duplicated.raw_payload, false);
  assert.equal("attachments" in duplicated.raw_payload, false);
  assert.equal("createdAt" in duplicated.raw_payload, false);
  assert.equal("updatedAt" in duplicated.raw_payload, false);
  assert.equal("version" in duplicated.raw_payload, false);
});

test("duplicate supports a new work date and retains a stable duplicate root", () => {
  const duplicated = buildDuplicateTaskRow({
    ...SOURCE,
    id: "T-copy-1",
    duplicate_root_task_id: "T-original",
    shift: null,
    raw_payload: { shift: "Ca chiều" },
  }, {
    id: "T-copy-2",
    actorId: "33333333-3333-4333-8333-333333333333",
    taskDate: "2026-09-08",
  });

  assert.equal(duplicated.deadline, "2026-09-08");
  assert.equal(duplicated.task_date, "2026-09-08");
  assert.equal(duplicated.raw_payload.taskDate, "2026-09-08");
  assert.equal(duplicated.shift, "afternoon");
  assert.equal(duplicated.raw_payload.shiftLabel, "Ca chiều");
  assert.equal(duplicated.duplicated_from_task_id, "T-copy-1");
  assert.equal(duplicated.duplicate_root_task_id, "T-original");
});
