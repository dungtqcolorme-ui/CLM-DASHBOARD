import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  recordLastSeenForAppLoad,
  shouldRecordLastSeen,
} from "../lib/lastSeen.ts";
import {
  buildProfileNameMap,
  resolveProfileName,
} from "../lib/profileNames.ts";

test("last seen is tracked only for actual management roles", () => {
  assert.equal(shouldRecordLastSeen(["Admin"]), true);
  assert.equal(shouldRecordLastSeen(["PR Leader"]), true);
  assert.equal(shouldRecordLastSeen(["Mentor"]), false);
  assert.equal(shouldRecordLastSeen(["PR Representative"]), false);
  assert.equal(shouldRecordLastSeen(["Viewer"]), false);
  assert.equal(shouldRecordLastSeen(["Trainee"]), false);
});

test("one app-load event performs exactly one durable last-seen write", async () => {
  const calls = [];
  const result = await recordLastSeenForAppLoad({
    userId: "11111111-1111-4111-8111-111111111111",
    roles: ["PR Leader"],
    now: new Date("2026-09-05T08:30:00+07:00"),
    write: async (userId, seenAt) => {
      calls.push({ userId, seenAt });
      return seenAt;
    },
  });

  assert.equal(result, "2026-09-05T01:30:00.000Z");
  assert.deepEqual(calls, [{
    userId: "11111111-1111-4111-8111-111111111111",
    seenAt: "2026-09-05T01:30:00.000Z",
  }]);
});

test("ordinary user app loads do not write last seen", async () => {
  let writes = 0;
  const result = await recordLastSeenForAppLoad({
    userId: "22222222-2222-4222-8222-222222222222",
    roles: ["PR Representative"],
    write: async () => {
      writes += 1;
      return "unexpected";
    },
  });

  assert.equal(result, null);
  assert.equal(writes, 0);
});

test("profile name resolution follows the current name by immutable user ID", () => {
  const names = buildProfileNameMap([
    { id: "user-1", full_name: "Tên mới" },
    { id: "user-2", full_name: "  Người thứ hai  " },
  ]);

  assert.equal(resolveProfileName(names, "user-1", "Tên cũ"), "Tên mới");
  assert.equal(resolveProfileName(names, "missing", "Tên lịch sử"), "Tên lịch sử");
  assert.equal(resolveProfileName(names, "missing", ""), "Người dùng");
});

test("dashboard session is the single app-load boundary and admin list uses durable activity", async () => {
  const [sessionRoute, adminRoute, migration] = await Promise.all([
    readFile(new URL("../app/api/dashboard/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260905000200_profile_last_seen.sql", import.meta.url), "utf8"),
  ]);

  assert.match(sessionRoute, /recordLastSeenForAppLoad/);
  assert.match(sessionRoute, /roles: \[identity\.activeRole\]/);
  assert.match(sessionRoute, /x-clm-app-load/);
  assert.match(sessionRoute, /previousLoadId/);
  assert.match(sessionRoute, /update\(\{ last_seen_at: seenAt \}\)/);
  assert.match(adminRoute, /last_seen_at/);
  assert.doesNotMatch(adminRoute, /auth\.admin\.listUsers/);
  assert.match(migration, /add column if not exists last_seen_at timestamptz/);
  assert.match(migration, /new\.updated_at = old\.updated_at/);
});
