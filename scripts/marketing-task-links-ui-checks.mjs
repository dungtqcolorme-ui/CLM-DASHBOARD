import assert from 'node:assert/strict';

export async function testTaskLinksWorkflow({ page, db, base, actors, campaign, mainCommand, context, shot, report }) {
  const [admin, representative, , viewer] = actors;
  const taskId = 'T-marketing-link-ui';
  await db.query('insert into public.tasks(id,title,owner_id,created_by,deadline,status) values($1,$2,$3,$4,$5,$6)',
    [taskId,'Task minh họa trong module hiện có',representative.id,admin.id,'2026-11-20','Đang thực hiện']);
  const taskBefore = (await db.query('select to_jsonb(t) as value from public.tasks t where id=$1',[taskId])).rows[0].value;
  const item = await mainCommand(page, representative, {
    action:'create_content',campaign_id:campaign.id,title:'Nội dung có Task liên kết',caption:'Dữ liệu minh họa liên kết Task',
    content_line:'Sharing',assignee_id:representative.id,production_status:'writing',production_due_at:null,review_due_at:null,proposed_publish_at:null,
  });
  const url = `${base}/marketing/studio?content=${item.id}&campaign=${campaign.id}`;
  await page.goto(url);
  const panel = page.locator('.mk-panel').filter({has:page.getByRole('heading',{name:'Task của nội dung',exact:true})});
  await panel.getByText('Chưa liên kết Task.',{exact:true}).waitFor();
  assert.equal(await panel.getByRole('link',{name:'Tạo Task trong Task hàng ngày'}).getAttribute('href'),'/?legacy=phoihop');
  async function link() {
    await panel.getByLabel('Mã Task có sẵn').fill(taskId);
    await panel.getByRole('button',{name:'Kiểm tra Task',exact:true}).click();
    await panel.getByRole('region',{name:'Task đã kiểm tra'}).getByRole('heading',{name:taskBefore.title}).waitFor();
    await panel.getByRole('button',{name:'Liên kết Task này',exact:true}).click();
    await panel.getByText('Đã liên kết Task.',{exact:true}).waitFor();
    await panel.getByRole('article').getByRole('heading',{name:taskBefore.title}).waitFor();
  }
  await link();
  const linked = (await db.query('select * from public.marketing_task_links where content_id=$1',[item.id])).rows[0];
  assert.equal(linked.task_id,taskId);
  assert.deepEqual((await db.query('select to_jsonb(t) as value from public.tasks t where id=$1',[taskId])).rows[0].value,taskBefore);
  assert.equal((await db.query('select version from public.marketing_content_items where id=$1',[item.id])).rows[0].version,item.version);
  await shot(page,'marketing-linked-task');
  // Simulate a legacy Task change; Marketing reads it and does not transition the content.
  await db.query("update public.tasks set status='Hoàn thành',version=version+1 where id=$1",[taskId]);
  await panel.getByRole('button',{name:'Làm mới Task liên kết',exact:true}).click();
  await panel.getByRole('article').getByText(new RegExp(taskId+' · Hoàn thành')).waitFor();
  assert.equal((await db.query('select publishing_status from public.marketing_content_items where id=$1',[item.id])).rows[0].publishing_status,'draft');
  await panel.getByText('Gỡ liên kết Task',{exact:true}).click();
  await panel.getByLabel('Lý do gỡ '+taskId).fill('Gỡ liên kết trong kiểm thử');
  await panel.getByRole('button',{name:'Xác nhận gỡ liên kết',exact:true}).click();
  await panel.getByText('Đã gỡ liên kết Task.',{exact:true}).waitFor();
  await panel.getByText('Chưa liên kết Task.',{exact:true}).waitFor();
  await link();
  assert.equal((await db.query('select count(*)::int n from public.marketing_task_link_events where link_id=$1',[linked.id])).rows[0].n,3);
  await db.query('update public.tasks set deleted_at=now() where id=$1',[taskId]);
  await panel.getByRole('button',{name:'Làm mới Task liên kết',exact:true}).click();
  await panel.getByRole('heading',{name:'Task không còn khả dụng',exact:true}).waitFor();

  const readOnly = await context(viewer,{width:390,height:844});
  try {
    await readOnly.page.goto(url);
    const viewPanel = readOnly.page.locator('.mk-panel').filter({has:readOnly.page.getByRole('heading',{name:'Task của nội dung',exact:true})});
    await viewPanel.getByRole('heading',{name:'Task không còn khả dụng',exact:true}).waitFor();
    assert.equal(await viewPanel.getByRole('textbox').count(),0);
    assert.equal(await viewPanel.getByText('Gỡ liên kết Task',{exact:true}).count(),0);
    assert.ok(await readOnly.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  } finally { await readOnly.ctx.close(); }
  report.checks.push('Explicit Task links preserve legacy data and content versions, track completion independently, retain removal history, handle deleted tasks and stay read-only for Viewer');
}
