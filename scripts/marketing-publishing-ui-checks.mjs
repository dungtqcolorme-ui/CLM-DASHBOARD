import assert from 'node:assert/strict';
/** Disposable fixture only: no provider requests or production credentials. */
export async function testPublishingWorkflow({page:p,db,base,actors,team,campaign,shot,command,mainCommand,serviceCommand,context,report}){
 const content=await mainCommand(p,actors[1],{action:'create_content',campaign_id:campaign.id,title:'Publishing QA · văn bản đã kiểm tra',caption:'Caption chính xác của bản duyệt nội bộ. Không gửi Meta.',content_line:'Sharing',assignee_id:null,production_status:'not_started',production_due_at:null,review_due_at:null,proposed_publish_at:null});
 await mainCommand(p,actors[1],{action:'submit_review',id:content.id,expected_version:content.version});
 const connection=await serviceCommand({action:'save_connection',actor_id:actors[0].id,team_id:team.id,page_id:'987654321',page_name:'Page kiểm thử nội bộ',graph_version:'fixture-only',capabilities:{read_posts:true,read_comments:false,organic_metrics:false,upload_media:true,publish:true,schedule:true,cancel:true},verified_at:new Date().toISOString(),expires_at:null,credential_ciphertext:'fixture-not-a-real-secret',verification_reference:'isolated-browser-fixture'});
 await p.goto(base+`/marketing/studio?content=${content.id}&campaign=${campaign.id}`);
 await p.getByLabel('Kết nối Page đã xác minh').selectOption(connection.id);
 const scheduled=new Date(Date.now()+86400000);const vietnam=new Date(scheduled.getTime()+7*3600000).toISOString().slice(0,16);
 await p.getByLabel('Giờ đăng Việt Nam').fill(vietnam);
 await p.getByRole('button',{name:'Tạo bản duyệt niêm phong',exact:true}).click();
 await p.getByText('Đã niêm phong bản duyệt. Mở Approval Inbox để kiểm tra.',{exact:true}).waitFor();
 const candidate=(await db.query('select * from marketing_publication_candidates where content_id=$1',[content.id])).rows[0];assert.equal(candidate.status,'sealed');assert.equal(candidate.snapshot.content.creator_id,actors[1].id);assert.equal(candidate.creator_id,actors[0].id);assert.equal(candidate.snapshot.content.caption,content.caption);
 const approval={action:'approve_and_schedule',id:candidate.id,expected_version:candidate.version,expected_hash:candidate.payload_hash,confirmed:true};
 await assert.rejects(()=>command(p,actors[1],approval));
 await p.goto(base+`/marketing/approvals?campaign=${campaign.id}`);
 const panel=p.locator('.mk-panel').filter({has:p.getByRole('heading',{name:`${content.title} · Đã niêm phong`,exact:true})});
 await panel.getByRole('button',{name:'Duyệt & Lên lịch',exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'Duyệt & Lên lịch',exact:true}).isDisabled(),true);
 await panel.getByRole('checkbox').check();await shot(p,'phase4-sealed-review');await panel.getByRole('button',{name:'Duyệt & Lên lịch',exact:true}).click();
 await p.getByRole('heading',{name:'Hàng đợi nội bộ',exact:true}).waitFor();
 assert.equal((await db.query('select count(*)::int n from marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0].n,1);
 try{await command(p,actors[0],approval);}catch{/* Stale duplicate remains rejected. */}
 assert.equal((await db.query('select count(*)::int n from marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0].n,1);
 await shot(p,'phase4-internal-queue');
 let current=(await db.query('select * from marketing_campaigns where id=$1',[campaign.id])).rows[0];await mainCommand(p,actors[0],{action:'emergency_hold',id:campaign.id,expected_version:current.version,reason:'QA dừng khẩn cấp trước khi gửi'});
 assert.equal((await db.query('select status from marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0].status,'cancelled');
 current=(await db.query('select * from marketing_campaigns where id=$1',[campaign.id])).rows[0];await mainCommand(p,actors[0],{action:'resume_campaign',id:campaign.id,expected_version:current.version});assert.equal((await db.query('select status from marketing_publishing_jobs where candidate_id=$1',[candidate.id])).rows[0].status,'cancelled');
 const incidents=(await db.query("select * from marketing_publishing_incidents where campaign_id=$1 and status='open'",[campaign.id])).rows;
 for(const incident of incidents){await command(p,actors[0],{action:'acknowledge_incident',id:incident.id,expected_version:incident.version,reason:'Đã ghi nhận trong kiểm thử'});assert.equal((await db.query('select status from marketing_publishing_incidents where id=$1',[incident.id])).rows[0].status,'acknowledged');}
 const mobile=await context(actors[3],{width:390,height:844});await mobile.page.goto(base+`/marketing/approvals?campaign=${campaign.id}`);await mobile.page.getByRole('heading',{name:'Approval Inbox',exact:true}).waitFor();assert.equal(await mobile.page.getByRole('button',{name:'Yêu cầu hủy job',exact:true}).count(),0);await shot(mobile.page,'phase4-mobile-readonly');await mobile.ctx.close();
 // Regression: a sealed candidate whose connection changed must retain Foundation correction.
 const recovery=await mainCommand(p,actors[1],{action:'create_content',campaign_id:campaign.id,title:'Publishing QA · sửa sau thu hồi kết nối',caption:'Bản duyệt cần trả về chỉnh sửa khi kết nối hết hiệu lực.',content_line:'Sharing',assignee_id:null,production_status:'not_started',production_due_at:null,review_due_at:null,proposed_publish_at:null});
 const reviewing=await mainCommand(p,actors[1],{action:'submit_review',id:recovery.id,expected_version:recovery.version});
 const stale=await command(p,actors[0],{action:'request_candidate',content_id:recovery.id,expected_content_version:reviewing.version,connection_id:connection.id,mode:'text',design_id:null,final_asset_ids:[],scheduled_for:new Date(Date.now()+86400000).toISOString()});
 assert.equal(stale.status,'sealed');
 await serviceCommand({action:'revoke_connection',actor_id:actors[0].id,id:connection.id,expected_version:connection.version,reason:'QA thu hồi kết nối sau niêm phong'});
 await assert.rejects(()=>command(p,actors[0],{action:'approve_and_schedule',id:stale.id,expected_version:stale.version,expected_hash:stale.payload_hash,confirmed:true}));
 await p.goto(base+`/marketing/approvals?campaign=${campaign.id}`);
 const recoveryPanel=p.locator('.mk-panel').filter({has:p.getByRole('heading',{name:recovery.title,exact:true})});
 await recoveryPanel.getByLabel('Nội dung cần chỉnh sửa',{exact:true}).fill('Kết nối đã thu hồi; cần sửa và tạo bản duyệt mới.');
 await recoveryPanel.getByRole('button',{name:'Yêu cầu chỉnh sửa',exact:true}).click();
 await recoveryPanel.waitFor({state:'detached'});
 const corrected=(await db.query('select * from marketing_content_items where id=$1',[recovery.id])).rows[0];
 assert.equal(corrected.publishing_status,'changes_requested');assert.ok(corrected.version>stale.content_version);
 const immutable=(await db.query('select * from marketing_publication_candidates where id=$1',[stale.id])).rows[0];assert.equal(immutable.payload_hash,stale.payload_hash);assert.deepEqual(immutable.snapshot,stale.snapshot);
 await assert.rejects(()=>command(p,actors[0],{action:'approve_and_schedule',id:stale.id,expected_version:stale.version,expected_hash:stale.payload_hash,confirmed:true}));
 assert.equal((await db.query('select count(*)::int n from marketing_publishing_jobs where candidate_id=$1',[stale.id])).rows[0].n,0);
 await p.goto(base+`/marketing/studio?content=${recovery.id}&campaign=${campaign.id}`);
 await p.getByRole('heading',{name:'Creative Studio',exact:true}).waitFor();
 assert.equal(await p.getByRole('textbox',{name:/^Caption/}).isEditable(),true);
 await shot(p,'phase4-stale-candidate-correction');
 report.checks.push('Phase4 recovery: service revokes a sealed candidate connection; Foundation request-changes stays visible, succeeds through GUI, bumps content version and restores editable Studio without mutating snapshot or creating a job.');
 report.checks.push('Phase4 actual service fixture seals exact caption; immutable original creator cannot approve; different creator confirmation queues one job; duplicate approval does not duplicate; hold cancels and resume never resurrects; scoped incidents remain acknowledged; mobile Viewer read only.');
}
