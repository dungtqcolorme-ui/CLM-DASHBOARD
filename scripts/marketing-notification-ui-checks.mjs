import assert from 'node:assert/strict';

export async function testMarketingNotifications({ page, db, base, actors, campaign, mainCommand, context, tokenFor, shot, report }) {
  const [admin, representative, , viewer] = actors;
  const title = 'Thông báo QA · lưu phiên bản';
  const caption = 'Caption gốc đã gửi duyệt.';
  const fields = {
    title, caption, content_line: 'Sharing', assignee_id: viewer.id,
    production_status: 'writing', production_due_at: null, review_due_at: null, proposed_publish_at: null,
  };
  const url = base + '/marketing/approvals?campaign=' + campaign.id;
  const panel = (target) => target.locator('.mk-panel:visible').filter({
    has: target.getByRole('heading', { name: 'Thông báo của tôi', exact: true }),
  });
  await page.goto(url);
  await panel(page).getByRole('button', { name: 'Tải lại thông báo' }).waitFor();
  const draft = await mainCommand(page, representative, { action: 'create_content', campaign_id: campaign.id, ...fields });
  const submitted = await mainCommand(page, representative, { action: 'submit_review', id: draft.id, expected_version: draft.version });
  const adminNotice = (await db.query(
    "select id from marketing_notifications where recipient_id=$1 and content_id=$2 and kind='review_requested'",
    [admin.id, draft.id],
  )).rows[0];
  await panel(page).getByRole('button', { name: 'Tải lại thông báo' }).click();
  const article = panel(page).getByRole('article').filter({ hasText: title });
  await article.getByRole('link', { name: 'Xem sự kiện' }).click();
  await page.waitForURL((current) => current.searchParams.get('notice') === adminNotice.id);
  await article.getByText(caption, { exact: true }).waitFor();
  await article.getByRole('button', { name: 'Đánh dấu đã đọc' }).click();
  await article.getByText(/· Đã đọc$/).waitFor();
  const read = (await db.query('select read_at from marketing_notifications where id=$1', [adminNotice.id])).rows[0];
  assert.ok(read.read_at);
  assert.equal((await db.query('select publishing_status from marketing_content_items where id=$1', [draft.id])).rows[0].publishing_status, 'in_review');

  const requested = await mainCommand(page, admin, {
    action: 'request_changes', id: draft.id, expected_version: submitted.version, reason: 'Fixture cần làm rõ.',
  });
  await mainCommand(page, representative, {
    action: 'update_content', id: draft.id, expected_version: requested.version, ...fields, caption: 'Caption phiên bản mới.',
  });
  await page.reload();
  await article.getByText(caption, { exact: true }).waitFor();
  assert.equal(await article.getByText('Caption phiên bản mới.', { exact: true }).count(), 0);
  await shot(page, 'marketing-notification-version');

  const other = await context(viewer, { width: 390, height: 844 });
  try {
    await other.page.goto(url + '&notice=' + adminNotice.id);
    await panel(other.page).getByText('Chưa có thông báo trong phạm vi này.', { exact: true }).waitFor();
    const status = await other.page.evaluate(async ({ id, token }) => {
      const response = await fetch('/api/marketing/notifications', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return response.status;
    }, { id: adminNotice.id, token: tokenFor(viewer) });
    assert.equal(status, 404);
    await panel(other.page).getByRole('link', { name: 'Về tất cả thông báo' }).click();
    const assigned = panel(other.page).getByRole('article').filter({ hasText: title });
    await assigned.getByRole('heading', { name: 'Yêu cầu chỉnh sửa', exact: true }).waitFor();
    await assigned.getByRole('button', { name: 'Đánh dấu đã đọc' }).click();
    await assigned.getByText(/· Đã đọc$/).waitFor();
    assert.ok(await other.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await other.ctx.close(); }

  report.checks.push('Notification recipients match review and assignment roles, deep link keeps the historical caption, read receipts are recipient-only and never advance approval');
}
