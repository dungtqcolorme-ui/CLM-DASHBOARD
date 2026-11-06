import assert from 'node:assert/strict';

export async function testKpiRevisionWorkflow({ page, db, base, actors, team, cmd, context, shot, report }) {
  const [admin, representative, leader, viewer] = actors;
  const baseline = [{ name: 'Bài đăng', target: 10, unit: 'bài' }];
  let campaign = await cmd(page, admin, {
    action:'create_campaign', team_id:team.id, name:'Campaign KPI minh họa', kind:'always_on',
    objective:'Kiểm thử revision KPI', audience:'', message:'', start_date:null, end_date:null,
  });
  campaign = await cmd(page, admin, {
    action:'update_plan', id:campaign.id, expected_version:campaign.version,
    content_mix:campaign.content_mix, plan:'', kpi_draft:baseline,
  });
  campaign = await cmd(page, admin, { action:'submit_activation', id:campaign.id, expected_version:campaign.version });
  campaign = await cmd(page, admin, { action:'activate_campaign', id:campaign.id, expected_version:campaign.version });
  const url = `${base}/marketing/campaigns/${campaign.id}?tab=insights`;
  const rep = await context(representative);
  try {
    await rep.page.goto(url);
    await rep.page.getByRole('button', { name:'Soạn đề xuất KPI' }).click();
    await rep.page.getByLabel('Mục tiêu KPI đề xuất 1').fill('12');
    await rep.page.getByLabel('Lý do điều chỉnh KPI').fill('Điều chỉnh sản lượng trong dữ liệu minh họa');
    await rep.page.getByRole('button', { name:'Lưu đề xuất KPI' }).click();
    await rep.page.getByRole('heading', { name:'Đề xuất KPI · v1' }).waitFor();
    assert.equal(await rep.page.getByRole('button', { name:'Xác nhận KPI v1' }).count(), 0);
  } finally { await rep.ctx.close(); }

  const review = await context(leader);
  try {
    await review.page.goto(url);
    const proposal = review.page.getByRole('region', { name:'Đề xuất KPI đang chờ' });
    await proposal.getByText('10 bài', { exact:true }).waitFor();
    await proposal.getByText('12 bài', { exact:true }).waitFor();
    const confirm = proposal.getByRole('button', { name:'Xác nhận KPI v1' });
    assert.equal(await confirm.isDisabled(), true);
    await shot(review.page, 'campaign-kpi-review');
    await proposal.getByRole('checkbox').check();
    await confirm.click();
    await review.page.getByRole('heading', { name:'KPI chính thức · v2' }).waitFor();
    await review.page.getByText('KPI gốc tại thời điểm kích hoạt', { exact:true }).click();
    await review.page.getByText('10 bài', { exact:true }).waitFor();
    await review.page.getByText('Lịch sử xác nhận KPI (1)', { exact:true }).click();
    await review.page.getByText('Điều chỉnh sản lượng trong dữ liệu minh họa', { exact:true }).waitFor();
  } finally { await review.ctx.close(); }

  const current = (await db.query('select version,official_kpis,effective_kpi_revision,pending_kpi_revision from public.marketing_campaigns where id=$1', [campaign.id])).rows[0];
  assert.equal(current.version, campaign.version);
  assert.deepEqual(current.official_kpis, baseline);
  assert.equal(current.effective_kpi_revision.targets[0].target, 12);
  assert.equal(current.effective_kpi_revision.confirmed_by, leader.id);
  assert.equal(current.pending_kpi_revision, null);

  const reader = await context(viewer, { width:390, height:844 });
  try {
    await reader.page.goto(url);
    await reader.page.getByRole('heading', { name:'KPI chính thức · v2' }).waitFor();
    assert.equal(await reader.page.getByRole('button', { name:'Soạn đề xuất KPI' }).count(), 0);
    assert.ok(await reader.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await reader.ctx.close(); }
  report.checks.push('Representative proposes KPI targets, Leader reviews and confirms, Viewer reads, and the activation baseline and publishing campaign version remain intact');
}
