import assert from 'node:assert/strict';

/** Receipt fixture: local service-role gateway, with no Meta transport. */
export async function testCalendarPublication({ page, db, base, actors, team, campaign, shot, mainCommand, command, serviceCommand, report }) {
  const [admin, representative] = actors;
  const proposed = new Date(Date.now() - 86400000).toISOString();
  const slot = new Date(Date.now() + 86400000).toISOString();
  const slotVietnam = new Date(Date.parse(slot) + 7 * 3600000).toISOString();
  const title = 'Calendar QA · đối chiếu biên nhận';
  const thumbnailRequests=[];
  const trackThumbnail=request=>{if(new URL(request.url()).searchParams.get('variant')==='thumbnail')thumbnailRequests.push(request.url());};
  page.on('request',trackThumbnail);
  await page.goto(`${base}/marketing/assets?campaign=${campaign.id}`);
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1080;c.height=1080;const x=c.getContext('2d');x.fillStyle='#136943';x.fillRect(0,0,1080,1080);return c.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('File ảnh',{exact:true}).setInputFiles({name:'calendar-qa.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByLabel('Tiêu đề ảnh',{exact:true}).fill('Ảnh Calendar QA');
  await page.getByLabel('Tác giả ảnh',{exact:true}).fill('Tác giả fixture');
  await page.getByLabel('Nguồn và bằng chứng quyền',{exact:true}).fill('Canvas tự tạo cho kiểm thử local.');
  await page.getByRole('button',{name:'Upload ảnh chờ duyệt',exact:true}).click();
  await page.getByText('Đã upload ảnh. Cần người duyệt quyền.',{exact:true}).waitFor();
  const asset=(await db.query("select * from marketing_assets where title='Ảnh Calendar QA'")).rows[0];
  await mainCommand(page,admin,{action:'review_asset',id:asset.id,expected_version:asset.version,rights:'approved',reason:'Nguồn fixture tự tạo đã đối chiếu.',allowed_channels:['facebook'],valid_until:null},'/api/marketing/creative');
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
    connection_id:connection.id, mode:'photo_dump', design_id:null, final_asset_ids:[asset.id], scheduled_for:slot,
  });
  await command(page, admin, { action:'approve_and_schedule', id:candidate.id, expected_version:candidate.version, expected_hash:candidate.payload_hash, confirmed:true });
  const job = (await db.query('select id from public.marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0];

  await page.goto(`${base}/marketing/calendar?campaign=${campaign.id}`);
  await page.getByRole('button',{name:'Danh sách',exact:true}).click();
  const row = page.getByRole('row').filter({ has:page.getByRole('button',{name:title,exact:true}) });
  await row.getByText('Đã duyệt · Hàng đợi nội bộ',{exact:true}).waitFor();
  assert.equal(await row.getByText('Meta xác nhận lên lịch',{exact:true}).count(),0);
  assert.equal(thumbnailRequests.length,0);

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
  assert.equal(await drawer.getByLabel('Giờ đề xuất mới · giờ Việt Nam',{exact:true}).count(),0);
  assert.equal(await chip.getAttribute('draggable'),'false');
  assert.equal(await drawer.getByRole('img',{name:'Ảnh trong bản duyệt · 1 / 1'}).count(),0);
  await page.clock.install();
  await drawer.getByRole('button',{name:'Xem ảnh trong bản duyệt',exact:true}).click();
  const image=drawer.getByRole('img',{name:'Ảnh trong bản duyệt · 1 / 1'});
  await image.waitFor();
  await page.waitForFunction(()=>document.querySelector('img[alt="Ảnh trong bản duyệt · 1 / 1"]')?.naturalWidth===1080);
  await shot(page,'calendar-confirmed-schedule');
  await page.clock.fastForward(31000);
  await image.waitFor({state:'detached'});
  await drawer.getByText('Ảnh xem trước đã hết hạn. Tải lại để kiểm tra quyền hiện tại.',{exact:true}).waitFor();
  await page.clock.setSystemTime(new Date());
  await drawer.getByRole('button',{name:'Tải lại ảnh xem trước',exact:true}).click();
  await image.waitFor();
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  await drawer.waitFor({ state:'hidden' });
  const toggle=page.getByRole('checkbox',{name:'Ảnh thu nhỏ từ bản duyệt',exact:true});
  await toggle.check();await chip.scrollIntoViewIfNeeded();
  const thumbnail=chip.locator('.mk-calendar-thumbnail img');await thumbnail.waitFor();
  await thumbnail.evaluate(image=>image.decode());
  assert.deepEqual(await thumbnail.evaluate(image=>[image.naturalWidth,image.naturalHeight]),[90,90]);
  const countBeforeExpiry=thumbnailRequests.length;
  await shot(page,'calendar-thumbnails');
  await page.clock.fastForward(31000);await thumbnail.waitFor({state:'detached'});
  await chip.getByText('Ảnh hết hạn',{exact:true}).waitFor();
  assert.equal(thumbnailRequests.length,countBeforeExpiry);
  await page.clock.setSystemTime(new Date());

  await serviceCommand({ action:'reconcile_job', id:job.id, expected_version:scheduled.version,
    outcome:'published', remote_id:remoteId,
    receipt:{state:'published',verified:true,remote_id:remoteId,observed_at:observed,response_reference:'calendar-fixture'},
  });
  await page.getByRole('button',{name:'Làm mới trạng thái',exact:true}).click();
  await chip.getByText('Meta xác nhận đã đăng',{exact:true}).waitFor();
  await chip.click();
  await drawer.getByText('Biên nhận chưa có giờ đăng thực tế.',{exact:true}).waitFor();
  const current=(await db.query('select version from marketing_assets where id=$1',[asset.id])).rows[0];
  await mainCommand(page,admin,{action:'review_asset',id:asset.id,expected_version:current.version,rights:'revoked',reason:'Kiểm thử quyền ảnh Calendar bị thu hồi.',allowed_channels:[],valid_until:null},'/api/marketing/creative');
  await drawer.getByRole('button',{name:'Xem ảnh trong bản duyệt',exact:true}).click();
  await drawer.getByText('Quyền sử dụng ảnh đã hết hạn hoặc bị thu hồi.',{exact:true}).waitFor();
  assert.equal(await drawer.getByRole('img').count(),0);
  assert.match(await drawer.getByRole('link',{name:'Mở trong Studio'}).getAttribute('href'),new RegExp(content.id));
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  await toggle.uncheck();await toggle.check();await chip.scrollIntoViewIfNeeded();
  await chip.getByText('Ảnh không khả dụng',{exact:true}).waitFor();
  assert.equal(await chip.locator('.mk-calendar-thumbnail img').count(),0);
  await page.getByRole('heading',{name:'Content Calendar',exact:true}).waitFor();
  await toggle.uncheck();page.off('request',trackThumbnail);
  const notices = (await db.query(
    "select kind,content_version from marketing_notifications where content_id=$1 and recipient_id=$2 and kind in ('approved','published') order by kind",
    [content.id, representative.id],
  )).rows;
  assert.deepEqual(notices, [
    { kind: 'approved', content_version: reviewing.version },
    { kind: 'published', content_version: reviewing.version },
  ]);
  report.checks.push('Calendar separates proposed and approved Vietnam slots, recognizes only verified remote receipts, and leaves actual publish time unknown when absent');
  report.checks.push('Calendar loads sealed private PNG on demand, expires its object URL after 30s, reloads with current rights and blocks revoked images without losing the workspace');
  report.checks.push('Calendar thumbnails are opt-in, lazy private WebP pixels at 90x90, expire without auto-refetch and reject revoked media while keeping the Calendar usable');
  return content.id;
}
