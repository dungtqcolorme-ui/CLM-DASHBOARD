import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function testVideoReportsWorkflow({ page, db, base, actors, team, campaign, shot, commandVideo, commandReports, mainCommand, serviceCommand, reportIngest, context, report, footagePath }) {
  const admin = actors[0];
  const item = await mainCommand(page, admin, {
    action: "create_content", campaign_id: campaign.id, title: "Video minh họa Phase 5", caption: "Dữ liệu minh họa",
    content_line: "Sharing", assignee_id: null, production_status: "editing", production_due_at: null, review_due_at: null, proposed_publish_at: null,
  });
  const studio = base + "/marketing/studio?content=" + item.id;
  const intelligence = base + "/marketing/intelligence";
  const button = (p, name) => p.getByRole("button", { name, exact: true });
  async function openStudio(p) {
    await p.goto(studio);
    await button(p, "Mở Video Studio").click();
    await p.getByRole("heading", { name: "Nguồn video và âm thanh" }).waitFor();
  }
  async function fillSeek(p, value) {
    await p.getByRole("slider", { name: "Đầu phát" }).fill(String(value));
  }
  await openStudio(page);
  await page.getByLabel("Tệp nguồn").setInputFiles(footagePath);
  await page.getByLabel("Tên nguồn", { exact: true }).fill("Footage minh họa");
  await page.getByLabel("Tác giả nguồn").fill("QA nội bộ");
  await page.getByLabel("Xuất xứ nguồn").fill("Dữ liệu minh họa tổng hợp, chỉ dùng trong kiểm thử local");
  await button(page, "Tải nguồn riêng tư").click();
  await page.getByText("Đã tải nguồn riêng tư.", { exact: true }).waitFor();
  const source = (await db.query("select * from marketing_video_sources where title=$1", ["Footage minh họa"])).rows[0];
  assert.equal(source.status, "ready");
  const object = (await db.query("select metadata from storage.objects where bucket_id=$1 and name=$2", ["marketing-footage", source.storage_path])).rows[0];
  assert.equal(object.metadata.mimetype, "video/mp4");
  assert.ok(object.metadata.size > 0);
  await page.getByText("Duyệt quyền sử dụng", { exact: true }).click();
  await page.getByLabel("Quyết định quyền").selectOption("approved");
  await page.getByLabel("Hết hạn quyền (giờ Việt Nam)").fill("2099-12-01T12:00");
  await page.getByLabel("Facebook", { exact: true }).check();
  await page.getByLabel("Lý do duyệt quyền").fill("Quyền dùng footage minh họa trên Facebook");
  await button(page, "Lưu duyệt quyền").click();
  await page.locator("p").filter({ hasText: /^Quyền dùng footage minh họa trên Facebook$/ }).waitFor();
  const rights = (await db.query("select rights, allowed_channels from marketing_video_sources where id=$1", [source.id])).rows[0];
  assert.deepEqual(rights, { rights: "approved", allowed_channels: ["facebook"] });
  await button(page, "Xem nguồn").click();
  const nativeSource = page.locator('video[aria-label="Xem nguồn riêng tư"]');
  await nativeSource.waitFor();
  await page.waitForFunction(() => document.querySelector('video[aria-label="Xem nguồn riêng tư"]')?.readyState >= 2);
  assert.ok(await nativeSource.evaluate((media) => media.videoWidth > 0 && media.duration >= 2.5));
  await button(page, "Đóng xem nguồn").click();
  await nativeSource.waitFor({ state: "detached" });
  await button(page, "Tạo timeline").click();
  await page.getByLabel("Nguồn cho clip").selectOption(source.id);
  await button(page, "Thêm clip").click();
  await page.getByLabel("Điểm vào nguồn (s)").fill("0.5");
  await page.getByLabel("Điểm ra nguồn (s)").fill("2.5");
  const timelineMedia = page.locator('video[aria-label="Video trên timeline"]');
  await timelineMedia.waitFor();
  await fillSeek(page, 0.75);
  await page.waitForFunction(() => {
    const media = document.querySelector('video[aria-label="Video trên timeline"]');
    return media?.readyState >= 2 && Math.abs(media.currentTime - 1.25) < 0.1;
  });
  await button(page, "Phát timeline").click();
  await page.waitForFunction(() => {
    const media = document.querySelector('video[aria-label="Video trên timeline"]');
    return media && !media.paused && media.currentTime > 1.3;
  });
  await button(page, "Tạm dừng timeline").click();
  await fillSeek(page, 1);
  await button(page, "Tách tại đầu phát").click();
  await button(page, "Thêm phụ đề cho clip đã chọn").click();
  await page.getByLabel("Nội dung phụ đề").fill("Phụ đề minh họa");
  await page.getByLabel("Đã đối chiếu với lời nói thật").check();
  await button(page, "Khóa clip").click();
  assert.ok(await page.getByLabel("Điểm vào nguồn (s)").isDisabled());
  await button(page, "Lưu timeline").click();
  await page.getByText("Đã lưu timeline.", { exact: true }).waitFor();
  const project = (await db.query("select * from marketing_video_projects where content_id=$1 and is_default", [item.id])).rows[0];
  assert.equal(project.version, 2);
  assert.deepEqual(project.timeline.clips.map(({ start, in_point, out_point, locked }) => [start, in_point, out_point, locked]), [[0, 0.5, 1.5, true], [1, 1.5, 2.5, false]]);
  assert.equal(project.timeline.captions[0].manually_verified, true);
  await openStudio(page);
  await page.getByRole("button", { name: /Footage minh họa.*Đã khóa/ }).waitFor();
  const v1 = await page.getByLabel("Lịch sử timeline").locator("option").filter({ hasText: /^v1 ·/ }).getAttribute("value");
  await page.getByLabel("Lịch sử timeline").selectOption(v1);
  await page.getByText(/Đang xem lịch sử v1/).waitFor();
  await page.getByLabel("Lịch sử timeline").selectOption("");
  await button(page, "Ghi yêu cầu render").click();
  await page.getByText("Render v2 · NotConfigured", { exact: true }).waitFor();
  const job = (await db.query("select status,progress,output_asset_id from marketing_video_render_jobs where project_id=$1", [project.id])).rows[0];
  assert.deepEqual(job, { status: "not_configured", progress: null, output_asset_id: null });
  await button(page, "Tạo biến thể tỷ lệ").click();
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((input) => input.value.includes("· Biến thể")));
  await page.getByLabel("Tỷ lệ khung").selectOption("1080x1920");
  await button(page, "Lưu timeline").click();
  await page.getByText("Đã lưu timeline.", { exact: true }).waitFor();
  const variant = (await db.query("select * from marketing_video_projects where parent_project_id=$1", [project.id])).rows[0];
  assert.equal(variant.timeline.height, 1920);

  await page.getByLabel("Tên timeline").fill("Bản nháp cần bỏ");
  await button(page, "Bỏ bản nháp timeline").click();
  assert.equal(await page.getByLabel("Tên timeline").inputValue(), variant.title);
  await page.getByLabel("Tên timeline").fill("Bản nháp giữ qua điều hướng");
  await page.getByRole("link", { name: "Intelligence & Reports", exact: true }).click();
  await page.getByRole("heading", { name: "Báo cáo đã lưu" }).waitFor();
  await page.goBack();
  const studioOpener = button(page, "Mở Video Studio");
  await studioOpener.or(page.getByLabel("Timeline / biến thể")).waitFor();
  if (await studioOpener.isVisible()) await studioOpener.click();
  await page.getByLabel("Timeline / biến thể").selectOption(variant.id);
  assert.equal(await page.getByLabel("Tên timeline").inputValue(), "Bản nháp giữ qua điều hướng");
  await commandVideo(page, admin, { action: "save_video_project", id: variant.id, expected_version: variant.version, title: "Biến thể do đồng đội cập nhật", timeline: variant.timeline });
  await button(page, "Lưu timeline").click();
  await page.getByText("Phát hiện phiên bản mới. Thay đổi của bạn được giữ.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Tên timeline").inputValue(), "Bản nháp giữ qua điều hướng");
  await button(page, "Tải timeline máy chủ").click();
  await button(page, "Bỏ bản nháp và dùng v3").click();
  assert.equal(await page.getByLabel("Tên timeline").inputValue(), "Biến thể do đồng đội cập nhật");
  await shot(page, "video-timeline-phase5");
  report.checks.push("Phase 5 native playback used private Storage bytes with a source-time seek. Rights, trim, split, caption, lock, version history, draft conflict, variant and render NotConfigured persisted through API and SQL.");

  const vietnamDate = (time) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(time));
  const now = Date.now();
  async function build(p, title, start, kind = "weekly") {
    await p.getByLabel("Tên báo cáo", { exact: true }).fill(title);
    await p.getByLabel("Team báo cáo").selectOption(team.id);
    await p.getByLabel("Campaign báo cáo").selectOption(campaign.id);
    await p.getByLabel("Kỳ báo cáo").selectOption(kind);
    await p.getByLabel("Ngày bắt đầu báo cáo").fill(start);
    await button(p, "Chốt báo cáo").click();
    await p.getByRole("heading", { name: title + " · v1", exact: true }).waitFor();
    return (await db.query("select * from marketing_reports where title=$1", [title])).rows[0];
  }
  await page.goto(intelligence);
  const weekly = await build(page, "Báo cáo tuần minh họa", vietnamDate(now));
  assert.ok(weekly.metrics.production.planned > 0);
  assert.equal(weekly.metrics.organic.reach, null);
  await page.getByRole("heading", { name: "Nội dung kế hoạch chưa sẵn sàng" }).waitFor();
  await page.getByLabel("Trạng thái phản hồi").selectOption("accepted");
  await page.getByLabel("Lý do phản hồi").fill("Theo dõi nội dung minh họa");
  await button(page, "Lưu phản hồi").click();
  await page.getByText("Chấp nhận · Theo dõi nội dung minh họa", { exact: true }).waitFor();
  assert.equal((await db.query("select status from marketing_insights where report_id=$1", [weekly.id])).rows[0].status, "accepted");

  const representative = await context(actors[1]);
  await representative.page.goto(intelligence);
  await representative.page.getByLabel("Chọn báo cáo").selectOption(weekly.id);
  await representative.page.getByLabel("Nội dung diễn giải").fill("Đã rà soát chỉ số và phạm vi chia sẻ.");
  await button(representative.page, "Lưu diễn giải").click();
  await representative.page.getByText("Đã lưu diễn giải.", { exact: true }).waitFor();
  assert.equal(await representative.page.getByText("Xem và duyệt phiên bản chia sẻ", { exact: true }).count(), 0);
  await representative.ctx.close();

  const leader = await context(actors[2]);
  const lead = leader.page;
  await lead.goto(intelligence);
  await lead.getByLabel("Chọn báo cáo").selectOption(weekly.id);
  await lead.getByLabel("Nội dung diễn giải").fill("Diễn giải cần bỏ");
  await button(lead, "Bỏ bản nháp diễn giải").click();
  assert.equal(await lead.getByLabel("Nội dung diễn giải").inputValue(), "Đã rà soát chỉ số và phạm vi chia sẻ.");
  await lead.getByText("Xem và duyệt phiên bản chia sẻ", { exact: true }).click();
  await lead.getByLabel("Lý do duyệt chia sẻ").fill("Đã đối chiếu v2 minh họa");
  await lead.getByLabel("Tôi đã xem số liệu và diễn giải của phiên bản này.").check();
  await button(lead, "Duyệt chia sẻ v2").click();
  await lead.getByText("Đã duyệt chia sẻ bên ngoài v2", { exact: true }).waitFor();
  const approval = (await db.query("select * from marketing_report_share_approvals where report_id=$1", [weekly.id])).rows[0];
  assert.equal(approval.approver_id, actors[2].id);
  assert.equal(approval.report_version, 2);
  assert.equal(approval.metrics_hash, weekly.metrics_hash);
  assert.match(approval.narrative_hash, /^[a-f0-9]{64}$/);
  async function download(p, format, audience, version) {
    const label = "Tải " + format.toUpperCase() + (audience === "external" ? " chia sẻ" : " nội bộ");
    const [file] = await Promise.all([p.waitForEvent("download"), button(p, label).click()]);
    assert.equal(file.suggestedFilename(), "report-" + weekly.id + "-v" + version + "-" + audience + "." + format);
    const bytes = await readFile(await file.path());
    assert.equal(bytes.subarray(0, 4).toString("hex"), format === "pdf" ? "25504446" : "504b0304");
  }
  await download(lead, "pdf", "external", 2);
  await download(lead, "xlsx", "external", 2);
  await lead.getByLabel("Nội dung diễn giải").fill("Bản nháp đụng phiên bản hiện tại.");
  await commandReports(lead, admin, { action: "edit_report", id: weekly.id, expected_version: 2, title: weekly.title, narrative: "Diễn giải v3 của đồng đội." });
  await button(lead, "Lưu diễn giải").click();
  await lead.getByText("Phát hiện phiên bản mới. Thay đổi của bạn được giữ.", { exact: true }).waitFor();
  assert.equal(await lead.getByLabel("Nội dung diễn giải").inputValue(), "Bản nháp đụng phiên bản hiện tại.");
  await button(lead, "Tải báo cáo máy chủ").click();
  await button(lead, "Bỏ bản nháp và dùng v3").click();
  await lead.getByText("Chưa duyệt chia sẻ bên ngoài v3", { exact: true }).waitFor();
  assert.ok(await button(lead, "Tải PDF chia sẻ").isDisabled());
  await download(lead, "pdf", "internal", 3);
  await lead.getByLabel("Lịch sử báo cáo").selectOption("2");
  await lead.getByText("Đã duyệt chia sẻ bên ngoài v2", { exact: true }).waitFor();
  await download(lead, "pdf", "external", 2);
  await leader.ctx.close();

  const connection = await serviceCommand({
    action: "save_connection", actor_id: admin.id, team_id: team.id, page_id: "987654322", page_name: "Mẫu Organic minh họa",
    graph_version: "fixture-only", capabilities: { read_posts: true, read_comments: false, organic_metrics: true, upload_media: false, publish: false, schedule: false, cancel: false },
    verified_at: new Date().toISOString(), expires_at: null, credential_ciphertext: "fixture-not-a-real-secret", verification_reference: "isolated-browser-fixture",
  });
  const earlier = new Date(now);
  earlier.setUTCDate(1);
  earlier.setUTCMonth(earlier.getUTCMonth() - 1);
  const month = earlier.toISOString().slice(0, 7);
  const observed = await reportIngest({
    team_id: team.id, campaign_id: campaign.id, connection_id: connection.id, page_id: connection.page_id, post_id: "phase5-fixture-organic",
    content_line: "Sharing", format: "text", window: "7d", eligibility: "organic",
    reach: 100, views: null, reactions: 0, comments: 0, shares: 5, clicks: 0,
    definitions: { reach: "people", views: "views", reactions: "reactions", comments: "comments", shares: "shares", clicks: "clicks" },
    source_reference: "Nguồn minh họa cho QA", published_at: month + "-02T00:00:00Z", fetched_at: month + "-10T00:00:00Z",
  });
  await page.goto(intelligence);
  const monthly = await build(page, "Báo cáo tháng minh họa", month + "-01", "monthly");
  assert.equal(monthly.metrics.organic.engagement_rate, 5);
  await page.getByText("5%", { exact: true }).waitFor();
  await page.getByText("Organic đủ điều kiện · phase5-fixture-organic", { exact: true }).click();
  await page.getByText(observed.id, { exact: true }).waitFor();
  await page.getByText("Thu thập nguồn", { exact: true }).waitFor();
  await shot(page, "reports-organic-phase5");

  const viewer = await context(actors[3], { width: 390, height: 844 });
  await viewer.page.goto(intelligence);
  await viewer.page.getByLabel("Chọn báo cáo").selectOption(monthly.id);
  assert.equal(await button(viewer.page, "Chốt báo cáo").count(), 0);
  assert.equal(await viewer.page.getByLabel("Nội dung diễn giải").count(), 0);
  assert.ok(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot(viewer.page, "reports-viewer-mobile-phase5");
  await openStudio(viewer.page);
  assert.equal(await button(viewer.page, "Tải nguồn riêng tư").count(), 0);
  assert.equal(await button(viewer.page, "Lưu timeline").count(), 0);
  assert.ok(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot(viewer.page, "video-viewer-mobile-phase5");
  await viewer.ctx.close();
  report.checks.push("Phase 5 weekly/monthly reports used frozen production and Organic data with source timestamps and null metrics. Evidence feedback, separate Leader approval, authenticated PDF/XLSX signatures, exact-version invalidation, history, conflict and mobile Viewer passed.");
}
