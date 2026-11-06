import assert from 'node:assert/strict';

/** Receipt fixture: local service-role gateway, with no Meta transport. */
export async function testCalendarPublication({ page, db, base, actors, team, campaign, shot, mainCommand, command, serviceCommand, report }) {
  const [admin, representative] = actors;
  const proposed = new Date(Date.now() - 86400000).toISOString();
  const slot = new Date(Date.now() + 86400000).toISOString();
  const slotVietnam = new Date(Date.parse(slot) + 7 * 3600000).toISOString();
  const title = 'Calendar QA · đối chiếu biên nhận';
  const content = await mainCommand(page, representative, {
    action:'create_content', campaign_id:campaign.id, title, caption:'Biên nhận tổng hợp chỉ dùng trong bộ kiểm thử local.',
    content_line:'Sharing', assignee_id:representative.id, production_status:'ready',
    production_due_at:null, review_due_at:null, proposed_publish_at:proposed,
  });
  const reviewing = await mainCommand(page, representative, { action:'submit_review', id:content.id, expected_version:content.version });
  const connection = await serviceCommand({
    action:'save_connection', actor_id:admin.id, team_id:team.id, page_id:'987654329', page_name:'Page kiểm thử lịch',
    graph_version:'fixture-only', capabilities:{read_posts:true,read_comments:false,organic_metrics:false,upload_media:true,publish:true,schedule:true,cancel:true},
    verified_at:new Date().toISOString(), expires_at:null, credential_ciphertext:'fixture-calendar-only', verification_reference:'fixture-calendar-only',
  });
  const candidate = await command(page, admin, {
    action:'request_candidate', content_id:content.id, expected_content_version:reviewing.version,
    connection_id:connection.id, mode:'text', design_id:null, final_asset_ids:[], scheduled_for:slot,
  });
  await command(page, admin, { action:'approve_and_schedule', id:candidate.id, expected_version:candidate.version, expected_hash:candidate.payload_hash, confirmed:true });
  const job = (await db.query('select id from public.marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0];

  await page.goto(`${base}/marketing/calendar?campaign=${campaign.id}`);
  await page.getByRole('button',{name:'Danh sách',exact:true}).click();
  const row = page.getByRole('row').filter({ has:page.getByRole('button',{name:title,exact:true}) });
  await row.getByText('Đã duyệt · Hàng đợi nội bộ',{exact:true}).waitFor();
  assert.equal(await row.getByText('Meta xác nhận lên lịch',{exact:true}).count(),0);

  // Advance this disposable queue entry to its due state, then restore the immutable approved slot.
  await db.query("update public.marketing_publishing_jobs set scheduled_for=now()-interval '1 minute', next_attempt_at=now()-interval '1 minute' where id=$1",[job.id]);
  const leased = await serviceCommand({ action:'claim_job', worker_id:'calendar-fixture', lease_seconds:60 });
  assert.equal(leased.id,job.id);
  await serviceCommand({ action:'begin_dispatch', id:job.id, lease_id:leased.lease_id });
  await db.query('update public.marketing_publishing_jobs set scheduled_for=$2::timestamptz where id=$1',[job.id,slot]);
  const remoteId = '987654329_123';
  const observed = new Date().toISOString();
  const scheduled = await serviceCommand({ action:'complete_job', id:job.id, lease_id:leased.lease_id,
    outcome:'remote_scheduled', remote_id:remoteId, error:null,
    receipt:{state:'remote_scheduled',verified:true,remote_id:remoteId,observed_at:observed,response_reference:'calendar-fixture'},
  });
  assert.equal(scheduled.status,'remote_scheduled');
  await page.getByRole('button',{name:'Làm mới trạng thái',exact:true}).click();
  await row.getByText('Meta xác nhận lên lịch',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:/^Người phụ trách/}).selectOption(representative.id);
  await page.getByRole('combobox',{name:/^Kênh/}).selectOption('facebook');
  await row.waitFor();
  await page.getByRole('button',{name:'Tuần',exact:true}).click();
  await page.getByLabel('Ngày đang xem').fill(slotVietnam.slice(0,10));
  const chip = page.getByRole('button').filter({ hasText:title });
  await chip.getByText(`${slotVietnam.slice(11,16)} · Theo giờ đã duyệt`,{exact:true}).waitFor();
  assert.equal(await chip.locator('xpath=..').locator('time').getAttribute('datetime'),slotVietnam.slice(0,10));
  await chip.click();
  const drawer = page.getByRole('dialog');
  await drawer.getByText('Facebook · Page kiểm thử lịch',{exact:true}).waitFor();
  await drawer.getByText('Lần ghi nhận biên nhận',{exact:true}).waitFor();
  await shot(page,'calendar-confirmed-schedule');
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  await drawer.waitFor({ state:'hidden' });

  await serviceCommand({ action:'reconcile_job', id:job.id, expected_version:scheduled.version,
    outcome:'published', remote_id:remoteId,
    receipt:{state:'published',verified:true,remote_id:remoteId,observed_at:observed,response_reference:'calendar-fixture'},
  });
  await page.getByRole('button',{name:'Làm mới trạng thái',exact:true}).click();
  await chip.getByText('Meta xác nhận đã đăng',{exact:true}).waitFor();
  await chip.click();
  await drawer.getByText('Biên nhận chưa có giờ đăng thực tế.',{exact:true}).waitFor();
  assert.match(await drawer.getByRole('link',{name:'Mở trong Studio'}).getAttribute('href'),new RegExp(content.id));
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  report.checks.push('Calendar separates proposed and approved Vietnam slots, recognizes only verified remote receipts, and leaves actual publish time unknown when absent');
  return content.id;
}
