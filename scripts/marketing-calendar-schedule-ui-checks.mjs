import assert from 'node:assert/strict';

/** Exercises the existing authenticated command against disposable SQL/RLS; no Meta calls. */
export async function testCalendarReschedule({page,db,base,actors,campaign,context,mainCommand,report,shot}) {
  const [admin,representative,,viewer]=actors;
  let content=await mainCommand(page,representative,{action:'create_content',campaign_id:campaign.id,title:'Calendar QA · đổi giờ đề xuất',caption:'Caption trước khi đổi lịch.',content_line:'Sharing',assignee_id:representative.id,production_status:'designing',production_due_at:'2026-11-08T05:00:00.000Z',review_due_at:'2026-11-09T05:00:00.000Z',proposed_publish_at:'2026-11-09T17:30:00.000Z'});
  const reviewing=await mainCommand(page,representative,{action:'submit_review',id:content.id,expected_version:content.version});
  content=await mainCommand(page,admin,{action:'request_changes',id:content.id,expected_version:reviewing.version,reason:'Đề nghị sắp xếp lại giờ đăng trong bản nháp.'});
  await page.goto(`${base}/marketing/calendar?campaign=${campaign.id}`);
  await page.getByLabel('Ngày đang xem').fill('2026-11-10');
  const chip=page.getByRole('button').filter({has:page.getByText(content.title,{exact:true})});
  assert.equal(await chip.getAttribute('draggable'),'true');
  await chip.dragTo(page.locator('.mk-calendar-day').filter({has:page.locator('time[datetime="2026-11-12"]')}));
  const drawer=page.getByRole('dialog');
  const input=drawer.getByLabel('Giờ đề xuất mới · giờ Việt Nam',{exact:true});
  await input.waitFor();assert.equal(await input.inputValue(),'2026-11-12T00:30');
  assert.equal((await db.query('select version from marketing_content_items where id=$1',[content.id])).rows[0].version,content.version);
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  assert.equal((await db.query('select version from marketing_content_items where id=$1',[content.id])).rows[0].version,content.version);
  const foreignDrag=await page.evaluateHandle(id=>{const transfer=new DataTransfer();transfer.setData('application/x-colorme-calendar',id);return transfer;},content.id);
  await page.locator('.mk-calendar-day').filter({has:page.locator('time[datetime="2026-11-12"]')}).dispatchEvent('drop',{dataTransfer:foreignDrag});
  assert.equal(await drawer.isVisible(),false);await foreignDrag.dispose();
  await chip.dragTo(page.locator('.mk-calendar-day').filter({has:page.locator('time[datetime="2026-11-12"]')}));
  await drawer.getByRole('button',{name:'Lưu giờ đề xuất',exact:true}).click();
  await drawer.getByText('Đã lưu giờ đề xuất. Nội dung ở trạng thái Bản nháp.',{exact:true}).waitFor();
  let saved=(await db.query('select * from marketing_content_items where id=$1',[content.id])).rows[0];
  assert.equal(new Date(saved.proposed_publish_at).toISOString(),'2026-11-11T17:30:00.000Z');
  assert.equal(saved.creator_id,representative.id);assert.equal(saved.caption,content.caption);assert.equal(saved.production_status,content.production_status);
  assert.equal(new Date(saved.production_due_at).toISOString(),'2026-11-08T05:00:00.000Z');assert.equal(new Date(saved.review_due_at).toISOString(),'2026-11-09T05:00:00.000Z');
  assert.equal(saved.publishing_status,'draft');assert.equal(saved.version,content.version+1);
  await input.fill('2026-11-13T08:15');
  // Another writer commits a caption while the dialog still holds the old version.
  const concurrent=await mainCommand(page,representative,{action:'update_content',id:saved.id,expected_version:saved.version,title:saved.title,caption:'Caption do đồng nghiệp vừa sửa.',content_line:saved.content_line,assignee_id:saved.assignee_id,production_status:saved.production_status,production_due_at:new Date(saved.production_due_at).toISOString(),review_due_at:new Date(saved.review_due_at).toISOString(),proposed_publish_at:new Date(saved.proposed_publish_at).toISOString()});
  await drawer.getByRole('button',{name:'Lưu giờ đề xuất',exact:true}).click();
  await drawer.getByText('Phát hiện phiên bản mới. Thay đổi của bạn được giữ.',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'2026-11-13T08:15');
  await drawer.getByRole('button',{name:`Dùng nội dung hiện tại v${concurrent.version}`,exact:true}).click();
  await drawer.getByRole('button',{name:'Lưu giờ đề xuất',exact:true}).click();
  await drawer.getByText('Đã lưu giờ đề xuất. Nội dung ở trạng thái Bản nháp.',{exact:true}).waitFor();
  saved=(await db.query('select * from marketing_content_items where id=$1',[content.id])).rows[0];
  assert.equal(saved.caption,'Caption do đồng nghiệp vừa sửa.');assert.equal(new Date(saved.proposed_publish_at).toISOString(),'2026-11-13T01:15:00.000Z');
  await shot(page,'calendar-reschedule');
  await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  // Rapid close/reopen must ignore the old native close event. Keyboard users need no drag.
  await chip.focus();await page.keyboard.press('Enter');await input.fill('2026-11-14T09:00');
  await drawer.getByRole('button',{name:'Lưu giờ đề xuất',exact:true}).click();
  await drawer.getByText('Đã lưu giờ đề xuất. Nội dung ở trạng thái Bản nháp.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shot(page,'calendar-reschedule-mobile');
  await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
  await page.setViewportSize({width:1440,height:1000});
  await mainCommand(page,admin,{action:'pause_campaign',id:campaign.id,expected_version:(await db.query('select version from marketing_campaigns where id=$1',[campaign.id])).rows[0].version});
  await page.getByRole('button',{name:'Làm mới trạng thái',exact:true}).click();
  await page.waitForFunction(title=>Array.from(document.querySelectorAll('.mk-calendar-item')).find(el=>el.textContent.includes(title))?.draggable===false,content.title);
  await chip.click();assert.equal(await input.count(),0);await drawer.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  await mainCommand(page,admin,{action:'resume_campaign',id:campaign.id,expected_version:(await db.query('select version from marketing_campaigns where id=$1',[campaign.id])).rows[0].version});
  const readOnly=await context(viewer,{width:390,height:844});
  try{
    await readOnly.page.goto(`${base}/marketing/calendar?campaign=${campaign.id}`);
    await readOnly.page.getByRole('button',{name:'Danh sách',exact:true}).click();
    await readOnly.page.getByRole('button',{name:content.title,exact:true}).click();
    assert.equal(await readOnly.page.getByLabel('Giờ đề xuất mới · giờ Việt Nam',{exact:true}).count(),0);
    assert.ok(await readOnly.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }finally{await readOnly.ctx.close();}
  report.checks.push('Calendar draft drag only proposes a Vietnam time; cancel is read-only, explicit save preserves production/creator, stale edits require rebase and retain a concurrent caption; keyboard, paused Campaign and Viewer guards hold');
}
