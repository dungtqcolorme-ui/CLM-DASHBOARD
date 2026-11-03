/* Real private HTML, isolated data/network. No production credentials or writes. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {workspacesFixture} from '../tests/fixtures/workspaces.mjs';

const root=process.cwd(),art=resolve('tmp/workspaces');await mkdir(art,{recursive:true});
const runtime=createRequire(process.env.CLM_QA_RUNTIME||'/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=runtime('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.CLM_QA_BROWSER||'chrome'});
const baseline=execFileSync('git',['show','38da3a834d6109d963dc466119abe9b3e8dcbf41:dashboard/clm-dashboard-private-34.html'],{encoding:'utf8',maxBuffer:16000000});
const current=await readFile('dashboard/clm-dashboard-private-34.html','utf8');
const stats={errors:[],screenshots:[],parity:[],geometry:[],interactions:[]};
const routes=['truyenthong','anpham','hocbong','phoihop'];
async function open(source){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await context.addInitScript(()=>{window.__qaAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.__qaAnimations.push({className:String(this.className),frames,options});return animate.call(this,frames,options);};});
 const page=await context.newPage();page.on('pageerror',e=>stats.errors.push(e.message));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!=='http://workspaces.test')return route.fulfill({body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source.replace(/\nclmBoot\(\);\s*\n/,'\n')});
  if(u.pathname.startsWith('/creative-os/')||u.pathname==='/colorme-logo.png'){
   try{return route.fulfill({contentType:{'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(u.pathname)],body:await readFile(resolve(root,'public','.'+u.pathname))});}catch{return route.fulfill({status:404,body:''});}
  }
  return route.fulfill({contentType:'application/json',body:'{}'});
 });
 await page.goto('http://workspaces.test');await page.evaluate(workspacesFixture);
 return {context,page};
}
async function go(page,route){await page.evaluate(`go(${JSON.stringify(route)});`);await page.waitForFunction(()=>!document.querySelector('.content .sk')&&document.querySelector('.content h2'));}
async function shot(page,name){await page.bringToFront();await page.mouse.move(0,0);const path=resolve(art,name+'.png');await page.screenshot({path,fullPage:false,animations:'disabled'});stats.screenshots.push(path);}
async function signature(page){return page.locator('.content').evaluate(root=>{
 const clean=s=>s?.replace(/\s+/g,' ').trim()||'';
 return {
  metrics:[...root.querySelectorAll('.compact-metric,.metric-card')].map(e=>clean(e.textContent)).sort(),
  tables:[...root.querySelectorAll('table')].map(t=>({heads:[...t.querySelectorAll('th')].map(e=>clean(e.textContent)),rows:[...t.querySelectorAll('tbody tr')].map(r=>[...r.children].map(e=>clean(e.textContent)))})).sort((a,b)=>a.heads.join().localeCompare(b.heads.join())),
  controls:[...root.querySelectorAll('button,input,select,textarea,a,summary,[onclick]')].map(e=>JSON.stringify({tag:e.tagName,text:e.matches('input,select,textarea')?'':clean(e.textContent),handler:['onclick','onchange','oninput','onkeyup','ondrop','ondragstart'].map(a=>e.getAttribute(a)),href:e.getAttribute('href'),disabled:e.hasAttribute('disabled'),value:e.matches('input,select,textarea')?e.value:undefined,options:e.tagName==='SELECT'?[...e.options].map(o=>[o.value,o.textContent,o.selected]):undefined})).sort(),
  chartText:[...root.querySelectorAll('.dash-panel-body svg text,.mini-bar')].map(e=>clean(e.textContent)||e.getAttribute('title')).sort(),
  tasks:[...root.querySelectorAll('[data-record-id]')].map(e=>e.dataset.recordId).sort(),
 };
});}
async function parity(oldPage,newPage,label){assert.deepEqual(await signature(newPage),await signature(oldPage),`Functional presentation parity: ${label}`);stats.parity.push(label);}
async function compareAction(oldPage,newPage,action,label){await action(oldPage);await action(newPage);await parity(oldPage,newPage,label);stats.interactions.push(label);}
async function dialogParity(oldPage,newPage,action,label){
 await action(oldPage);await action(newPage);
 const fields=page=>page.locator('#modal-root').evaluate(root=>[...root.querySelectorAll('input,select,textarea,button,a,[onclick]')].map(e=>({tag:e.tagName,id:e.id,type:e.getAttribute('type'),text:e.matches('input,select,textarea')?'':e.textContent.replace(/\s+/g,' ').trim(),value:e.matches('input,select,textarea')?e.value:undefined,disabled:e.hasAttribute('disabled'),handler:['onclick','onchange','oninput'].map(a=>e.getAttribute(a)),options:e.tagName==='SELECT'?[...e.options].map(o=>[o.value,o.selected]):undefined})));
 assert.deepEqual(await fields(newPage),await fields(oldPage),label+' modal fields/actions changed');
 assert.ok(await newPage.locator('#modal-root .modal').count(),label+' did not open');stats.interactions.push(label);
 for(const page of [oldPage,newPage])await page.keyboard.press('Escape');
}
try{
 const old=await open(baseline);
 if(!process.argv.includes('--quick'))for(const route of routes){
  await go(old.page,route);
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,800]]){
   await old.page.setViewportSize({width,height});await shot(old.page,`before-${route}-${width}`);
   stats.geometry.push(await old.page.locator('.content').evaluate((el,arg)=>{const child=el.firstElementChild;return {phase:'before',route:arg,viewport:innerWidth,content:el.getBoundingClientRect().toJSON(),page:child.getBoundingClientRect().toJSON(),width:getComputedStyle(child).width,maxWidth:getComputedStyle(child).maxWidth,display:getComputedStyle(el).display,transform:getComputedStyle(child).transform,zoom:getComputedStyle(child).zoom};},route));
  }
 }
 if(!process.argv.includes('--quick'))await writeFile(resolve(art,'before-audit.json'),JSON.stringify(stats,null,2));
 if(process.argv.includes('--baseline-only')){console.log(JSON.stringify({beforeScreenshots:stats.screenshots.length,errors:stats.errors,geometry:stats.geometry.map(g=>({route:g.route,viewport:g.viewport,content:g.content.width,page:g.page.width,maxWidth:g.maxWidth}))}));process.exitCode=stats.errors.length?1:0;}
 else{
  const now=await open(current);
  // Test the new presentation contract before styling: this must fail on baseline.
  for(const route of routes){await go(old.page,route);await go(now.page,route);assert.equal(await now.page.locator('.cos-workspace').count(),1,`Missing scoped workspace for ${route}`);await parity(old.page,now.page,route);}
  // Original functional helpers/renderers must remain byte-identical.
  for(const name of ['renderTruyenThong','renderAnPham','renderHocBong','renderPhoiHop','clmBaseRenderPhoiHop','renderTongQuan','workItems','filteredWorkItems','workCanEdit','workCanUpdateStatus','saveUnifiedWork','confirmDuplicateTask','confirmTaskMove','v3ScholarExpiry','selectedInventorySnapshot','setInventoryCourse','metricCard','donut','lineChart'])assert.equal(await now.page.evaluate(`${name}.toString()`),await old.page.evaluate(`${name}.toString()`),`${name} business function changed`);
  await go(old.page,'truyenthong');await go(now.page,'truyenthong');
  for(const [label,value] of [['Lọc theo khóa','K144'],['Lọc theo thời gian','2026-11'],['Lọc theo PIC','Nhân sự 01']])await compareAction(old.page,now.page,p=>p.getByLabel(label,{exact:true}).selectOption(value),'media '+label);
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:/Xóa lọc/}).click(),'media reset');
  for(const index of [0,1])await compareAction(old.page,now.page,p=>p.locator('.media-pager').nth(index).getByRole('button',{name:'Sau',exact:true}).click(),'media pager '+index);
  await go(old.page,'anpham');await go(now.page,'anpham');
  await compareAction(old.page,now.page,p=>p.getByLabel('Lọc tồn kho ấn phẩm theo khóa').selectOption('K143'),'inventory course');
  await go(old.page,'hocbong');await go(now.page,'hocbong');
  await compareAction(old.page,now.page,p=>p.locator('.scholar-toolbar select').nth(1).selectOption('50%'),'scholar tier');
  await compareAction(old.page,now.page,p=>p.locator('.scholar-toolbar select').nth(1).selectOption(''),'scholar all tiers');
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:'Sau →',exact:true}).click(),'scholar next page');
  await compareAction(old.page,now.page,async p=>{await p.getByRole('textbox',{name:'Tìm học bổng theo tên, email hoặc số điện thoại'}).fill('Người nhận 03');await p.waitForTimeout(450);},'scholar search');
  for(const p of [old.page,now.page]){await p.evaluate(workspacesFixture);await go(p,'hocbong');}
  for(const value of ['Hết hạn','Chưa xác định',''])await compareAction(old.page,now.page,p=>p.locator('.scholar-toolbar select').nth(2).selectOption(value),'scholar expiry '+value);
  for(const value of ['2025','2026'])await compareAction(old.page,now.page,p=>p.locator('.scholar-toolbar select').nth(0).selectOption(value),'scholar year '+value);
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:'3 tháng gần nhất',exact:true}).click(),'scholar recent toggle');
  for(const p of [old.page,now.page]){await p.evaluate(workspacesFixture);await go(p,'truyenthong');}
  await compareAction(old.page,now.page,p=>p.evaluate("DB.media.performance.forEach(row=>{row.metrics={reach:0,hasReach:false,engagement:0,hasEngagement:false,award:0,hasAward:false};});render();"),'media conditional missing columns');
  assert.equal(await now.page.locator('.metric-card').count(),3,'Do not invent missing metrics');
  for(const p of [old.page,now.page]){await p.evaluate(workspacesFixture);await go(p,'phoihop');}
  for(const view of ['Tháng','Danh sách','Tuần'])await compareAction(old.page,now.page,p=>p.locator('.hub-view-switch').getByRole('button',{name:view,exact:true}).click(),'task view '+view);
  // PAGES retains the base task renderer: its later shift-filter wrapper is
  // dormant in the approved build. Preserve that UI; test the existing state
  // logic without introducing a new visible control.
  assert.equal(await now.page.getByLabel('Lọc theo ca').count(),await old.page.getByLabel('Lọc theo ca').count());
  for(const value of ['morning','all'])await compareAction(old.page,now.page,p=>p.evaluate(`taskHubState().shift=${JSON.stringify(value)};render();`),'task existing shift state '+value);
  for(const [index,value] of [[0,'coordination'],[0,'all'],[1,'Đang thực hiện'],[1,'all'],[2,'qa-b'],[2,''],[3,'7d'],[3,'all']])await compareAction(old.page,now.page,p=>p.locator('.hub-toolbar select').nth(index).selectOption(value),'task filter '+index+' '+value);
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:'7 ngày sau',exact:true}).click(),'task next week');
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:'7 ngày trước',exact:true}).click(),'task previous week');
  await compareAction(old.page,now.page,p=>p.getByRole('button',{name:'Tạo công việc',exact:true}).click(),'task create dialog');
  assert.equal(await now.page.locator('#modal-root input').count(),await old.page.locator('#modal-root input').count());
  for(const p of [old.page,now.page])await p.keyboard.press('Escape');
  for(const title of ['Nhân bản task','Đổi ngày task'])await dialogParity(old.page,now.page,async p=>{
   await p.locator('[data-record-id="task-qa-0"] .task-card-menu summary').click();
   await p.locator('[data-record-id="task-qa-0"] .task-card-actions').getByRole('button',{name:title,exact:true}).click();
  },title);
  await dialogParity(old.page,now.page,p=>p.locator('[data-record-id="task-qa-0"]').click(),'task detail');
  for(const action of ['Sửa','Cập nhật trạng thái'])await dialogParity(old.page,now.page,async p=>{
   await p.locator('[data-record-id="task-qa-0"]').click();
   await p.locator('#modal-root').getByRole('button',{name:action,exact:true}).click();
  },'task '+action);
  await dialogParity(old.page,now.page,p=>p.locator('.meeting-hub-card').first().click(),'meeting detail');
  await dialogParity(old.page,now.page,p=>p.getByRole('button',{name:'Tạo cuộc họp',exact:true}).click(),'meeting create');
  for(const role of ['Staff','Viewer','Leader','Admin'])await compareAction(old.page,now.page,p=>p.evaluate(`session.role=${JSON.stringify(role)};session.prId='qa-b';render();`),'task role '+role);
  for(const p of [old.page,now.page])await p.evaluate(workspacesFixture);
  for(const route of routes){
   for(const p of [old.page,now.page])await go(p,route);
   const clear={truyenthong:"DB.media.plan=[{course:'K144',pic:'QA'}];DB.media.performance=[{course:'K144',pic:'QA',metrics:{}}];ui.media.course='K999';",anpham:'DB.courseInventory={};DB.apiInventory={};',hocbong:'DB.apiScholarships=[];',phoihop:'DB.tasks=[];DB.meetings=[];'}[route];
   await compareAction(old.page,now.page,p=>p.evaluate(clear+'render();'),route+' empty state');
  }
  // Overview stays exactly the same before and after the new module loads.
  await old.page.setViewportSize({width:1440,height:900});await now.page.setViewportSize({width:1440,height:900});
  for(const p of [old.page,now.page]){await p.evaluate(workspacesFixture);await go(p,'doingoai');await p.locator('.cos-mascot svg [data-layer]').first().waitFor({state:'attached'});}
  await parity(old.page,now.page,'overview after returning from four workspaces');
  // Equal fresh viewport history avoids comparing an SVG background raster
  // cached through four prior viewport sizes with one first painted at1440.
  const overviewOld=await open(baseline),overviewNow=await open(current);
  for(const p of [overviewOld.page,overviewNow.page]){await go(p,'doingoai');await p.locator('.cos-mascot svg [data-layer]').first().waitFor({state:'attached'});await p.waitForLoadState('networkidle');}
  const overviewPaint=[];
  const overviewImage=async p=>{
   await p.bringToFront();await p.mouse.move(0,0);await p.evaluate('window.scrollTo(0,0)');
   await p.waitForFunction(()=>document.fonts.status==='loaded'&&document.querySelector('.cos-companion')?.dataset.presence==='1'&&document.querySelector('.cos-companion')?.dataset.paused==='true'&&!document.getAnimations().length);
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   let previous=await p.screenshot({animations:'disabled'}),stable=null;
   for(let attempt=0;attempt<3;attempt++){const next=await p.screenshot({animations:'disabled'});if(previous.equals(next)){stable=next;break;}previous=next;}
   assert.ok(stable,'Overview paint did not settle within four captures');
   overviewPaint.push(await p.evaluate(()=>{
    const properties=['display','position','width','height','overflow','visibility','opacity','transform','filter','clip-path','mask-image','font-family','font-size','font-weight','line-height','letter-spacing','color','background','border','border-radius','box-shadow','fill','stroke','stroke-width','content'];
    const style=(element,pseudo)=>{const s=getComputedStyle(element,pseudo);return Object.fromEntries(properties.map(name=>[name,s.getPropertyValue(name)]));};
    return {bodyClass:document.body.className,bodyWorkspace:document.body.dataset.cosWorkspace,html:document.querySelector('#app').outerHTML,tree:[document.body,...document.querySelectorAll('#app,#app *')].map(element=>({tag:element.tagName,class:element.getAttribute('class'),rect:Object.fromEntries(Object.entries(element.getBoundingClientRect().toJSON()).map(([key,value])=>[key,Math.round(value*1000)/1000])),style:style(element),before:style(element,'::before'),after:style(element,'::after')}))};
   }));return stable;
  };
  const oldImage=await overviewImage(overviewOld.page),newImage=await overviewImage(overviewNow.page);
  assert.deepEqual(overviewPaint[1],overviewPaint[0],'Approved overview/shell DOM, computed styles, pseudo-elements or geometry changed');
  for(const asset of ['tokens.css','creative-os.css','creative-os.js','mascot-controller.js','coloro.svg','studio-canvas.svg'])assert.equal(await readFile('public/creative-os/'+asset,'utf8'),execFileSync('git',['show','38da3a8:public/creative-os/'+asset],{encoding:'utf8'}),'Approved overview asset changed: '+asset);
  await writeFile(resolve(art,'overview-baseline.png'),oldImage);await writeFile(resolve(art,'overview-protected.png'),newImage);
  await writeFile(resolve(art,'overview-debug.json'),JSON.stringify(await Promise.all([old.page,now.page].map(p=>p.evaluate(()=>({scrollX,scrollY,focus:document.activeElement?.outerHTML.slice(0,180),workspace:document.body.dataset.cosWorkspace,overview:document.querySelector('.cos-overview').getBoundingClientRect().toJSON()})))),null,2));
  // Chrome's rasterizer can differ by one RGB level at a handful of SVG/text
  // edge pixels even with identical DOM, styles and geometry. Do not mask the
  // mascot or allow any meaningful visual/layout difference.
  const sharp=runtime('sharp'),a=await sharp(oldImage).raw().toBuffer({resolveWithObject:true}),b=await sharp(newImage).raw().toBuffer();
  assert.equal(a.data.length,b.length);let differentPixels=0,maxDelta=0;
  for(let index=0;index<a.data.length;index+=a.info.channels){let differs=false;for(let channel=0;channel<a.info.channels;channel++){const delta=Math.abs(a.data[index+channel]-b[index+channel]);if(delta)differs=true;maxDelta=Math.max(maxDelta,delta);}if(differs)differentPixels++;}
  stats.overview={domIdentical:true,computedStylesAndGeometryIdentical:true,approvedAssetsIdentical:true,differentPixels,maxDelta,pixels:a.info.width*a.info.height};
  await writeFile(resolve(art,'overview-paint.json'),JSON.stringify({overviewPaint,raster:stats.overview},null,2));
  // Evidence-sized bound: observed 103/1,296,000 one-level edge differences.
  assert.ok(differentPixels<=128&&maxDelta<=1,`Approved overview screenshot changed: ${JSON.stringify(stats.overview)}`);
  await overviewOld.context.close();await overviewNow.context.close();
  for(const route of routes){await now.page.evaluate(workspacesFixture);await go(now.page,route);for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,800],[1024,768],[768,1000],[390,844]]){
   await now.page.setViewportSize({width,height});
   const geometry=await now.page.locator('.cos-workspace').evaluate(e=>({width:innerWidth,scroll:document.documentElement.scrollWidth,page:e.getBoundingClientRect().toJSON(),content:e.parentElement.getBoundingClientRect().toJSON(),title:e.querySelector('h2').getBoundingClientRect().toJSON(),zoom:getComputedStyle(e).zoom}));
   assert.ok(geometry.scroll<=width+1,`${route} page overflow at ${width}`);assert.equal(geometry.zoom,'1');
   assert.ok(geometry.page.width>=geometry.content.width-50,`${route} shrinks instead of using workspace width`);
   stats.geometry.push({phase:'after',route,...geometry});await shot(now.page,`after-${route}-${width}`);
  }}
  // Below-fold data is inspected separately from viewport screenshots.
  await now.page.setViewportSize({width:1440,height:900});
  for(const route of routes){await now.page.evaluate(workspacesFixture);await go(now.page,route);
   const selector=route==='phoihop'?'.meeting-hub-section':route==='hocbong'?'.cw-data-panel':'.cw-data-panel';
   const panels=await now.page.locator(selector).all();
   for(let i=0;i<panels.length;i++){await panels[i].evaluate(e=>e.scrollIntoView({block:'start'}));await now.page.evaluate('window.scrollBy(0,-92)');await shot(now.page,`detail-${route}-${i}`);}
   if(route==='phoihop'){
    await now.page.locator('.hub-view-switch').getByRole('button',{name:'Tháng',exact:true}).click();await now.page.locator('.cw-calendar').evaluate(e=>e.scrollIntoView({block:'start'}));await now.page.evaluate('window.scrollBy(0,-92)');await shot(now.page,'detail-task-month');
    await now.page.locator('.hub-view-switch').getByRole('button',{name:'Danh sách',exact:true}).click();await now.page.locator('.hub-list-card').evaluate(e=>e.scrollIntoView({block:'start'}));await now.page.evaluate('window.scrollBy(0,-92)');await shot(now.page,'detail-task-list');
   }
  }
  await now.page.emulateMedia({reducedMotion:'no-preference'});await go(now.page,'doingoai');await go(now.page,'anpham');
  await now.page.waitForFunction(()=>document.body.dataset.cosWorkspace==='inventory');
  await now.page.getByLabel('Lọc tồn kho ấn phẩm theo khóa').selectOption('K143');await now.page.waitForTimeout(250);
  const motion=await now.page.evaluate(()=>({records:window.__qaAnimations.filter(r=>r.className.includes('cw-')||r.className.includes('cm-value')),transform:getComputedStyle(document.querySelector('.content')).transform,values:[...document.querySelectorAll('.cm-value')].map(e=>e.textContent)}));
  assert.ok(motion.records.some(r=>r.className.includes('cw-inventory-analytics')),'Normal chart entry motion was not exercised');assert.equal(motion.transform,'none');stats.motion=motion;
  await now.page.emulateMedia({reducedMotion:'reduce'});assert.equal(await now.page.locator('.cw-primary-metric').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.deepEqual(stats.errors,[]);await writeFile(resolve(art,'qa-results.json'),JSON.stringify(stats,null,2));console.log(JSON.stringify({parity:stats.parity,interactions:stats.interactions,screenshots:stats.screenshots.length,errors:stats.errors,overview:stats.overview,normalMotion:true}));
 }
}finally{await browser.close();}
