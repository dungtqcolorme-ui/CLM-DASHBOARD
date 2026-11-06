import test from "node:test";
import assert from "node:assert/strict";
import { routeLoader } from "./helpers/load-route.mjs";

const load = routeLoader({});
const { activeClips, clipEnd, sourceTime, splitCaptions, splitClip, swapClips } = load("app/marketing/video/timeline-model.ts");
const { exactApproval, periodEnd, narrativeDigest } = load("app/marketing/reports/report-model.ts");

const clip = {
  id: "clip", source_id: "source", start: 2.25, in_point: 5.75, out_point: 9.25,
  track: 0, fade_in: 1, fade_out: 1.25, transition: "dissolve", transition_duration: 1, locked: false,
};

test("Split at timeline time keeps exact source mapping and total span", () => {
  const time = 3;
  const [left, right] = splitClip(clip, time, "second");
  assert.equal(sourceTime(clip, time), 6.5);
  assert.equal(clipEnd(left), right.start);
  assert.equal(left.out_point, right.in_point);
  assert.equal(clipEnd(right), clipEnd(clip));
  assert.equal(sourceTime(right, time + 1), sourceTime(clip, time + 1));
  assert.deepEqual(activeClips([left, right], time).map(({ id }) => id), ["second"]);
  assert.throws(() => splitClip({ ...clip, locked: true }, time, "second"), /chưa khóa/);
});

test("Split captions do not inherit verification and preserve unrelated captions", () => {
  const caption = { id: "caption", source_id: "source", start: 2.5, end: 3.5, manually_verified: true, locked: false };
  const unrelated = { ...caption, id: "other", source_id: "other" };
  const [left, right, untouched] = splitCaptions({ captions: [caption, unrelated] }, clip, 3, () => "new");
  assert.deepEqual([left.id, left.end, right.id, right.start], ["caption", 3, "new", 3]);
  assert.ok(!left.manually_verified && !right.manually_verified);
  assert.equal(untouched, unrelated);
  assert.throws(() => splitCaptions({ captions: [{ ...caption, locked: true }] }, clip, 3, () => "new"), /Mở khóa phụ đề/);
});

test("Reordering leaves contiguous unequal clips within the original time range", () => {
  const short = { ...clip, id: "short", start: clipEnd(clip), in_point: 0, out_point: 1 };
  const [first, second] = swapClips([clip, short], 0, 1);
  assert.equal(first.id, "short");
  assert.equal(first.start, clip.start);
  assert.equal(second.start, clipEnd(first));
  assert.equal(clipEnd(second), clipEnd(short));
  assert.throws(() => swapClips([clip, { ...short, locked: true }], 0, 1), /Mở khóa/);
});

test("An approved snapshot matches the exact report, version, metrics and UTF-8 narrative", async () => {
  const report = { id: "report", version: 2, metrics_hash: "metrics", narrative: "Diễn giải có dấu" };
  const hash = await narrativeDigest(report.narrative);
  const approval = { report_id: report.id, report_version: 2, metrics_hash: "metrics", narrative_hash: hash };
  assert.equal(exactApproval(report, hash, [approval]), approval);
  assert.equal(exactApproval({ ...report, version: 3 }, hash, [approval]), undefined);
  assert.equal(exactApproval({ ...report, metrics_hash: "changed" }, hash, [approval]), undefined);
  assert.equal(exactApproval(report, await narrativeDigest("Diễn giải mới"), [approval]), undefined);
  assert.equal(periodEnd("weekly", "2026-12-29"), "2027-01-04");
  assert.equal(periodEnd("monthly", "2028-02-01"), "2028-02-29");
});

test("The media cutoff is independent of renewal and clamps to the earlier of signed or rights expiry", () => {
  const { previewDeadlines } = load("app/marketing/video/timeline-model.ts");
  assert.deepEqual(previewDeadlines(1000, 2000, 100000, 60, Infinity), { refresh: 49000, cutoff: 61000 });
  assert.deepEqual(previewDeadlines(1000, 2000, 100000, 60, 104000), { refresh: null, cutoff: 6000 });
  assert.equal(previewDeadlines(1000, 62000, 100000, 60, Infinity), null);
  assert.equal(previewDeadlines(1000, 2000, 104000, 60, 104000), null);
});

test("A same-user write role or membership downgrade invalidates the scope key", () => {
  const { phaseFiveScope, phaseFiveCanWriteTeam } = load("app/marketing/video/access-scope.ts");
  const member = { team_id: "a", user_id: "person" };
  const foreign = { team_id: "b", user_id: "other" };
  const data = { profile: { id: "person", roles: ["PR Representative"] }, memberships: [member, foreign] };
  assert.equal(phaseFiveCanWriteTeam(data, "a"), true);
  assert.equal(phaseFiveCanWriteTeam(data, "b"), false);
  assert.equal(phaseFiveScope(data), phaseFiveScope({ ...data, memberships: [foreign, member] }));
  const viewer = { ...data, profile: { ...data.profile, roles: ["Viewer"] } };
  const removed = { ...data, memberships: [foreign] };
  for (const access of [viewer, removed]) {
    assert.notEqual(phaseFiveScope(data), phaseFiveScope(access));
    assert.equal(phaseFiveCanWriteTeam(access, "a"), false);
  }
});

test("An off-page downgrade followed by restoration cannot resurrect a prior draft or request", () => {
  const { createPhaseFiveDraftCache } = load("app/marketing/video/draft-access.ts");
  const cache = createPhaseFiveDraftCache();
  const writer = cache.observe("person/reporter/team");
  cache.write("person/report", { version: 1, narrative: "Unsaved" });
  assert.equal(cache.observe("person/reporter/team"), writer);
  assert.equal(cache.read("person/report").narrative, "Unsaved");
  cache.observe("person/viewer/team");
  const restored = cache.observe("person/reporter/team");
  assert.ok(restored > writer);
  assert.equal(cache.isCurrent(writer), false);
  assert.equal(cache.read("person/report"), null);
});
