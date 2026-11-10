import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
/** Uses only the caller's disposable database and intercepted API/Storage. */
export async function testCreativeWorkflow({page:p,db,base,actors,campaign,shot,studioCodexApi,tokenFor,command,mainCommand,report}) {
 const content=await mainCommand(p,actors[0],{action:'create_content',campaign_id:campaign.id,title:'Creative QA thủ công',caption:'Caption thủ công kiểm thử.',content_line:'Sharing',assignee_id:null,production_status:'not_started',production_due_at:null,review_due_at:null,proposed_publish_at:null});
 await p.goto(base+`/marketing/assets?campaign=${campaign.id}`);
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1080;c.height=1080;const x=c.getContext('2d');x.fillStyle='#136943';x.fillRect(0,0,1080,1080);return c.toDataURL('image/png').split(',')[1];});
 await p.getByLabel('File ảnh',{exact:true}).setInputFiles({name:'creative-qa.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await p.getByLabel('Tiêu đề ảnh',{exact:true}).fill('Ảnh Creative QA');await p.getByLabel('Tác giả ảnh',{exact:true}).fill('Tác giả fixture');await p.getByLabel('Nguồn và bằng chứng quyền',{exact:true}).fill('Canvas tự tạo cho kiểm thử disposable, không phải quyền production.');await p.getByRole('button',{name:'Upload ảnh chờ duyệt',exact:true}).click();await p.getByText('Đã upload ảnh. Cần người duyệt quyền.',{exact:true}).waitFor();
 let asset=(await db.query("select * from marketing_assets where title='Ảnh Creative QA'")).rows[0];assert.equal(asset.status,'ready');assert.equal(asset.rights,'needs_review');
 await p.getByLabel('Lý do review quyền ảnh',{exact:true}).fill('Đã đối chiếu nguồn fixture tự tạo.');await p.getByRole('button',{name:'Duyệt quyền Facebook',exact:true}).click();await p.getByText('Đã cập nhật quyền ảnh.',{exact:true}).waitFor();await shot(p,'phase3-assets');await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(p,'phase3-assets-mobile');await p.setViewportSize({width:1440,height:1000});
 await p.goto(base+`/marketing/studio?content=${content.id}&campaign=${campaign.id}`);await p.getByRole('button',{name:'Tạo thiết kế mặc định',exact:true}).click();await p.getByRole('button',{name:'Thêm text',exact:true}).waitFor();await p.getByRole('button',{name:'Thêm text',exact:true}).click();await p.getByRole('textbox',{name:/^Text layer/}).fill('Thiết kế thật');await p.getByRole('link',{name:'AI Agent & Ideas',exact:true}).click();await p.getByRole('heading',{name:'AI Agent & Ideas',exact:true}).waitFor();let failInitial=true;const transientRead=async route=>{if(failInitial&&route.request().method()==='GET')return route.fulfill({status:500,json:{error:'Transient creative QA read'}});return route.fallback();};await p.route('**/api/marketing/creative',transientRead);await p.goBack();await p.getByText('Transient creative QA read',{exact:true}).waitFor();failInitial=false;await p.getByRole('button',{name:'Lấy thiết kế hiện tại',exact:true}).click();await p.getByRole('button',{name:'1. text',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:/^Text layer/}).inputValue(),'Thiết kế thật');await p.unroute('**/api/marketing/creative',transientRead);report.checks.push('Initial creative 500 preserves unsaved scene through retry. Unsaved scene and original base survive client navigation without browser storage');await p.getByRole('button',{name:'Ảnh Creative QA · thêm ảnh',exact:true}).click();await p.getByRole('button',{name:'Thêm trang',exact:true}).click();
 const assistant=p.getByRole('complementary',{name:'Trợ lý Creative Studio'});
 const width=assistant.getByRole('slider',{name:'Độ rộng chat'});
 const priorWidth=(await assistant.boundingBox()).width;
 await width.press('End');
 assert.equal(await width.inputValue(),'376');
 assert.ok((await assistant.boundingBox()).width>priorWidth);
 await width.press('Home');
 assert.equal(await width.inputValue(),'248');
 const carousel=assistant.getByRole('button',{name:'Carousel',exact:true});
 await carousel.press('Enter');
 assert.match(await assistant.getByRole('log').innerText(),/trang đầu/);
 const mascot=assistant.locator('[data-coloro-visual]');
 assert.equal(await mascot.getAttribute('data-state'),'creative');
 assert.equal(await mascot.evaluate(el=>el.getAnimations({subtree:true}).length),0);
 await p.emulateMedia({reducedMotion:'no-preference'});
 const motion=await mascot.evaluate(el=>{
  const clone=el.cloneNode(true);
  clone.removeAttribute('data-coloro-paused');
  clone.insertAdjacentHTML('beforeend','<span class="coloro-progress"><i></i></span>');
  el.after(clone);
  try {
   return ['idle','thinking','loading','success','error','creative','celebration'].map(state=>{
    clone.dataset.state=state;
    return clone.getAnimations({subtree:true}).map(a=>a.effect.getTiming().iterations);
   });
  } finally {clone.remove();}
 });
 assert.ok(motion.every(iterations=>iterations.length>0&&iterations.every(Number.isFinite)));
 await p.emulateMedia({reducedMotion:'reduce'});
 const strip=p.getByRole('group',{name:'Các trang carousel'});
 assert.equal(await strip.locator('canvas').count(),2);
 await strip.getByRole('button',{name:/^Trang 2/}).press('Enter');
 assert.equal(await strip.getByRole('button',{name:/^Trang 2/}).getAttribute('aria-pressed'),'true');
 await p.waitForFunction(()=>{
  const canvas=document.querySelector('.cr-strip button[aria-label="Trang 1"] canvas');
  const pixel=canvas?.getContext('2d').getImageData(22,13,1,1).data;
  return pixel?.[0]===19&&pixel[1]===105&&pixel[2]===67;
 });
 const size=p.getByRole('combobox',{name:/^Kích thước canvas/});
 await size.selectOption('1920');
 const fit=await p.locator('.cr-canvas').evaluate(el=>({visible:el.clientHeight,extent:el.scrollHeight}));
 assert.ok(fit.extent<=fit.visible+1,'Fit should contain a 1080×1920 canvas vertically');
 await size.selectOption('1080');
 await strip.getByRole('button',{name:/^Trang 1/}).click();
 const search=p.getByRole('searchbox',{name:'Tìm ảnh trong phạm vi'});
 await search.fill('không có ảnh này');
 assert.equal(await p.getByRole('button',{name:'Ảnh Creative QA · thêm ảnh',exact:true}).count(),0);
 await search.clear();
 await p.getByRole('button',{name:'Ảnh Creative QA · thêm ảnh',exact:true}).waitFor();
 await p.locator('.cr-grid').scrollIntoViewIfNeeded();
 const assistantView=await assistant.boundingBox();
 assert.ok(assistantView.y>=0&&assistantView.y+assistantView.height<=1001,'Desktop assistant stays visible at the canvas');
 await shot(p,'studio-editor-after-desktop',false);
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>window.scrollTo(0,0));
 await p.waitForFunction(()=>document.querySelector('.mk-assistant-chat [data-coloro-visual]')?.dataset.coloroPaused==='true');
 const jump=p.getByRole('button',{name:'Đến trợ lý Studio',exact:true});
 await jump.press('Enter');
 await p.waitForFunction(()=>document.querySelector('.mk-assistant-chat [data-coloro-visual]')?.dataset.coloroPaused==='false');
 assert.ok(await assistant.evaluate(el=>el.ownerDocument.activeElement===el));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await shot(p,'studio-assistant-after-mobile',false);
 await p.setViewportSize({width:1440,height:1000});
 report.checks.push('Studio keyboard chat resizing, assistant and mobile focus, responsive overflow, carousel photo pixels on inactive page, portrait Fit, asset filtering, seven finite Coloro states, offscreen pause, and reduced motion');
 let releaseSave,saveArrived;const saveHeld=new Promise(r=>{releaseSave=r;}),saveSeen=new Promise(r=>{saveArrived=r;});const holdSave=async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='save_design'){saveArrived();await saveHeld;}return route.fallback();};await p.route('**/api/marketing/creative',holdSave);
 const beforeSave=JSON.parse(await p.locator('pre').last().textContent());await p.getByRole('button',{name:'Lưu thiết kế',exact:true}).click();await Promise.race([saveSeen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Creative save intercept did not arrive')),12000))]);
 await p.getByLabel('Canvas thiết kế: chọn layer từ danh sách; phím mũi tên di chuyển',{exact:true}).evaluate(el=>{el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71,clientX:100,clientY:100,bubbles:true}));el.dispatchEvent(new PointerEvent('pointermove',{pointerId:71,clientX:150,clientY:150,bubbles:true}));el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:71,bubbles:true}));});assert.deepEqual(JSON.parse(await p.locator('pre').last().textContent()),beforeSave);releaseSave();await p.getByText(/^Đã lưu thiết kế v/).waitFor();await p.unroute('**/api/marketing/creative',holdSave);assert.deepEqual(JSON.parse(await p.locator('pre').last().textContent()),beforeSave);report.checks.push('Deferred save blocks canvas keyboard/pointer mutation and retains the saved scene');
 const design=(await db.query('select * from marketing_designs where content_id=$1',[content.id])).rows[0];assert.equal(design.scene.pages.length,2);assert.equal(design.scene.pages[0].layers.length,2);await shot(p,'phase3-workbench');
 const downloads=[];p.on('download',d=>downloads.push(d));await p.getByRole('button',{name:'Xuất PNG tất cả trang',exact:true}).click();await p.getByText('Đã xuất PNG tất cả trang. Cần người kiểm tra; chưa phê duyệt xuất bản.',{exact:true}).waitFor();assert.equal(downloads.length,2);
 await mkdir(path.resolve('tmp/marketing'),{recursive:true});
 const pngFiles=[];
 for(let i=0;i<2;i++){
  const filename=path.resolve(`tmp/marketing/phase3-export-page-${i+1}.png`);await downloads[i].saveAs(filename);
  const bytes=await readFile(filename);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1080);pngFiles.push(bytes.toString('base64'));
 }
 // The 1080-square source is contained in the image layer at (80,80,500,240).
 // Its painted square spans x=210..450, y=80..320, above the text layer.
 const raster=await p.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,pixel:[...ctx.getImageData(330,200,1,1).data]};}finally{bitmap.close();}},pngFiles[0]);
 assert.deepEqual(raster,{width:1080,height:1080,pixel:[19,105,67,255]});
 report.checks.push('Both exported PNG files saved and validated: PNG signature/IHDR 1080×1080; first decoded raster contains uploaded #136943 photo pixel');

 await p.getByText('Lưu và áp dụng template',{exact:true}).click();await p.getByLabel('Tên template',{exact:true}).fill('Mẫu QA campaign');await p.getByRole('combobox',{name:/^Phạm vi template/}).selectOption('campaign');await p.getByRole('button',{name:'Lưu template từ thiết kế',exact:true}).click();await p.getByText('Đã lưu template từ thiết kế đã lưu.',{exact:true}).waitFor();assert.equal((await db.query("select * from marketing_templates where title='Mẫu QA campaign'")).rows[0].scope,'campaign');
 await p.getByRole('button',{name:'Gửi duyệt',exact:true}).click();
 await p.getByText('Đang chờ duyệt',{exact:true}).first().waitFor();
 let currentContent=(await db.query('select * from marketing_content_items where id=$1',[content.id])).rows[0];assert.equal(currentContent.publishing_status,'in_review');
 await mainCommand(p,actors[0],{action:'request_changes',id:content.id,expected_version:currentContent.version,reason:'Kiểm thử tiếp tục thiết kế sau clean caption submit.'});
 await p.reload();await p.getByRole('button',{name:'Thêm shape',exact:true}).waitFor();
 await p.getByRole('textbox',{name:/^Caption/}).fill('Caption dirty phải giữ nguyên');await p.getByRole('button',{name:'Thêm shape',exact:true}).click();await p.getByRole('button',{name:'Lưu thiết kế',exact:true}).click();await p.getByText(/^Đã lưu thiết kế v/).waitFor();assert.equal(await p.getByRole('textbox',{name:/^Caption/}).inputValue(),'Caption dirty phải giữ nguyên');await p.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await p.getByText('Phiên bản trên máy chủ đã thay đổi.',{exact:false}).waitFor();
 asset=(await db.query('select * from marketing_assets where id=$1',[asset.id])).rows[0];await command(p,actors[0],{action:'review_asset',id:asset.id,expected_version:asset.version,rights:'revoked',reason:'Kiểm thử thu hồi sau khi đã preview.',allowed_channels:[],valid_until:null});const downloadsBeforeRevokedExport=downloads.length;const sceneBeforeRevokedExport=await p.locator('pre').last().textContent();await p.getByRole('button',{name:'Xuất PNG tất cả trang',exact:true}).click();await p.getByText('Preflight chặn xuất: kiểm tra quyền ảnh.',{exact:true}).waitFor();await p.getByText(/Ảnh không khả dụng:.*hết hạn hoặc bị thu hồi/).waitFor();assert.equal(downloads.length,downloadsBeforeRevokedExport);assert.equal(await p.locator('pre').last().textContent(),sceneBeforeRevokedExport);report.checks.push('Revoked preview resource 403 preserves scene and export status; export blocks with no new downloads');
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(p,'phase3-workbench-mobile');await p.setViewportSize({width:1440,height:1000});
 report.checks.push('Phase3 actual upload/review, editable two-page canvas, PNG downloads, campaign template, dirty caption preservation/conflict and revocation export gate; Storage fixture only');


 const bridgeToken='a'.repeat(64);
 const threadId='12345678-1234-4234-8234-123456789abc';
 await db.query("insert into marketing_private.codex_relay(thread_id,token_digest) values($1,sha256(convert_to($2,'UTF8')))",[threadId,bridgeToken]);
 const relay=async (action,{token=bridgeToken,thread=threadId,id=null,lease=null,answer=null}={})=>
  db.transaction(async tx=>{
   await tx.exec('set local role anon');
   const response=await tx.query('select public.marketing_codex_relay_job($1,$2,$3,$4,$5,$6) as value',
    [action,token,thread,id,lease,answer]);
   return response.rows[0].value;
  });
 const userRequest=(actor,body)=>new Request(base+'/api/marketing/studio-codex',{
  method:'POST',headers:{Authorization:'Bearer '+tokenFor(actor),'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),...body}),
 });
 try {
  const panel=p.getByRole('complementary',{name:'Trợ lý Creative Studio'});
  await p.reload();
  await panel.getByText(/Hỏi trực tiếp chat ColorME Marketing trong Codex/).waitFor();
  const question='Câu hỏi minh họa qua cầu nối Studio.';
  await assert.rejects(relay('claim',{token:'b'.repeat(64)}),{code:'42501'});
  await assert.rejects(relay('claim',{thread:crypto.randomUUID()}),{code:'42501'});
  const submitted=p.waitForResponse(r=>r.url().endsWith('/api/marketing/studio-codex')&&r.request().method()==='POST');
  await panel.getByRole('textbox',{name:'Hỏi trợ lý Studio'}).fill(question);
  await panel.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();
  const response=await submitted;
  assert.equal(response.status(),202);
  const {id}=await response.json();
  assert.equal((await studioCodexApi.POST(userRequest(actors[0],{message:'Một câu hỏi đồng thời'}))).status,409);
  const viewer=await studioCodexApi.POST(userRequest(actors[3],{message:'Câu hỏi riêng của Viewer.'}));
  assert.equal(viewer.status,202);
  const viewerId=(await viewer.json()).id;
  const job=await relay('claim');
  assert.equal(job.id,id);
  assert.equal(job.threadId,threadId);
  assert.equal(job.prompt,question);
  assert.equal(await relay('claim'),null);
  const resumed=p.waitForResponse(r=>r.url().endsWith('/api/marketing/studio-codex')&&r.request().method()==='POST');
  await p.reload();
  assert.deepEqual(await (await resumed).json(),{id,state:'running'});
  assert.equal(await relay('claim'),null);
  assert.deepEqual(await relay('complete',{id,lease:crypto.randomUUID(),answer:'Sai'}),{accepted:false});
  assert.deepEqual(await relay('complete',{id,lease:job.lease,answer:'Phản hồi Codex minh họa'}),{accepted:true});
  const statusFor=(actor,id)=>studioCodexApi.GET(new Request(base+'/api/marketing/studio-codex?id='+id,{headers:{Authorization:'Bearer '+tokenFor(actor)}}));
  assert.equal((await statusFor(actors[3],id)).status,404);
  assert.equal((await statusFor(actors[0],viewerId)).status,404);
  const viewerJob=await relay('claim');
  assert.equal(viewerJob.id,viewerId);
  assert.deepEqual(await relay('complete',{id:viewerId,lease:viewerJob.lease,answer:'Phản hồi riêng của Viewer.'}),{accepted:true});
  assert.equal((await (await statusFor(actors[3],viewerId)).json()).answer,'Phản hồi riêng của Viewer.');
  await panel.getByRole('log').getByText(/Phản hồi Codex minh họa/).waitFor();
  await shot(p,'studio-codex-bridge');
  assert.equal((await db.query('select prompt from marketing_private.codex_jobs where id=$1',[id])).rows[0].prompt,null);
  report.checks.push('Studio shared pinned Codex thread accepts Admin and Viewer, processes FIFO one at a time, rejects wrong token and thread, isolates replies, preserves job on reload and erases processed prompt');
 } finally {
  await db.exec('delete from marketing_private.codex_relay');
 }
}
