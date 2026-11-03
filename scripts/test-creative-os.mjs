/* Isolated UI QA: serves the real private document to a fake origin in an
   intercepted browser context. No live state, authentication, or API writes. */
import assert from 'node:assert/strict';
import {creativeOsFixture as fixture} from '../tests/fixtures/creative-os.mjs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve, extname} from 'node:path';

const root = process.cwd();
const artifactDir = resolve(root, 'tmp/creative-os');
await mkdir(artifactDir, {recursive:true});
// Prefer an explicitly configured/local QA dependency; do not alter the app lockfile.
let playwright;
try {playwright = await import('playwright');} catch {
  const runtime = process.env.CLM_QA_RUNTIME || '/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json';
  playwright = createRequire(runtime)('playwright');
}
const browser = await playwright.chromium.launch({headless:true, channel:process.env.CLM_QA_BROWSER || 'chrome'});
const results = {roleRoutes:[], screenshots:[], parity:[], errors:[], blockedRequests:0};
const currentSource = await readFile('dashboard/clm-dashboard-private-34.html','utf8');
const oldSource = execFileSync('git',['show','HEAD:dashboard/clm-dashboard-private-34.html'],{encoding:'utf8',maxBuffer:16*1024*1024});
const prepare = source => source.replace(/\nclmBoot\(\);\s*\n/,'\n');

async function open(source, width=1440, height=1000) {
  const context = await browser.newContext({viewport:{width,height}});
  const page = await context.newPage();
  page.on('pageerror',error => results.errors.push(error.message));
  await context.route('**/*',async request => {
    const url = new URL(request.request().url());
    if (url.origin !== 'http://creative-os.test') {results.blockedRequests++;return request.fulfill({status:200,body:''});}
    if (url.pathname === '/') return request.fulfill({contentType:'text/html',body:prepare(source)});
    if (url.pathname.startsWith('/creative-os/') || url.pathname === '/colorme-logo.png') {
      const allowed = resolve(root, 'public', '.' + url.pathname);
      if (!allowed.startsWith(resolve(root,'public') + '/')) return request.abort();
      try {
        const type = {'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(allowed)];
        return request.fulfill({contentType:type,body:await readFile(allowed)});
      } catch {return request.fulfill({status:404,body:''});}
    }
    results.blockedRequests++;
    return request.fulfill({contentType:'application/json',body:JSON.stringify({error:'Isolated QA: no live API',courses:[],rankings:[],audit:[],documents:[]})});
  });
  await page.goto('http://creative-os.test/');
  await page.evaluate(fixture);
  await page.waitForTimeout(300);
  return {context,page};
}
async function snapshot(page, name) {
  await page.bringToFront();
  const path = resolve(artifactDir,name + '.png');
  await page.screenshot({path,fullPage:true,animations:'disabled'}); results.screenshots.push(path);
}
const metrics = page => page.locator('.compact-metric').allTextContents();
try {
  const baseline = await open(oldSource), current = await open(currentSource);
  await snapshot(baseline.page,'before-desktop');
  // Real old/new renderer comparison. These data include old/new course rules,
  // rejection, missing contracts, a real zero KPI and a missing KPI course.
  for (const course of ['', 'K141', 'K140', 'K139', 'K999']) {
    for (const target of [baseline.page,current.page]) await target.evaluate(`ui.overviewCourse=${JSON.stringify(course)};render();`);
    assert.deepEqual(await metrics(current.page),await metrics(baseline.page),`Overview metrics changed for ${course || 'all courses'}`);
    assert.deepEqual(await current.page.locator('.status-row').allTextContents(),await baseline.page.locator('.status-row').allTextContents());
    assert.deepEqual(await current.page.locator('.ring b').allTextContents(),await baseline.page.locator('.ring b').allTextContents(),'Redesigned gauge must retain the exact conversion rate');
    const heatValues=page=>page.locator('.heat td').evaluateAll(cells=>cells.map(cell=>({value:cell.textContent,title:cell.title})));
    assert.deepEqual(await heatValues(current.page),await heatValues(baseline.page),'Heatmap redesign must preserve each source count and tooltip');
    results.parity.push(course || 'all courses');
  }
  const helpers=['computeKPIs','authoritativeContractStats','canonicalB2Contracts','completionStats','eventHasCourse','schoolEventHeatmapData','globalSearch','canEditEvent','clmRpc'];
  for (const name of helpers) assert.equal(await current.page.evaluate(`${name}.toString()`),await baseline.page.evaluate(`${name}.toString()`),`${name} business logic changed`);
  await current.page.evaluate("ui.overviewCourse='';render();");
  await current.page.waitForTimeout(300);
  assert.equal(await current.page.locator('.cos-modular-grid').count(),1,'Reference-first overview needs a composed modular grid');
  assert.equal(await current.page.locator('.cos-overview .kpi-five').count(),0,'Five equal KPI cards must be replaced by structural hierarchy');
  assert.equal(await current.page.locator('.cos-primary .compact-metric').count(),1,'Output KPI must be the primary spotlight');
  const hierarchy=await current.page.evaluate(()=>({primary:document.querySelector('.cos-primary').getBoundingClientRect().toJSON(),summary:document.querySelector('.cos-summary').getBoundingClientRect().toJSON()}));
  assert.ok(hierarchy.primary.width>hierarchy.summary.width*1.25,'Primary canvas must dominate supporting cards');
  assert.ok(hierarchy.primary.height>hierarchy.summary.height*1.5,'Large/small card rhythm must be structural');
  assert.equal(await current.page.locator('.cos-primary .heatmap-panel').count(),1);
  assert.equal(await current.page.locator('.cos-conversion .cos-gauge').count(),1,'Conversion chart must use the redesigned geometry');
  results.shellGeometry=await current.page.locator('.sidebar').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),transform:getComputedStyle(el).transform,opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility,child:el.firstElementChild.getBoundingClientRect().toJSON(),html:el.outerHTML.slice(0,160)}));
  results.sidebarPaint=await current.page.evaluate(()=>({elements:document.elementsFromPoint(100,180).map(el=>[el.tagName,el.className]),children:[...document.querySelectorAll('.sidebar-head,.sidebar-head .name,.sidebar .nav,.sidebar .nav-item')].slice(0,6).map(el=>({class:el.className,rect:el.getBoundingClientRect().toJSON(),color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,transform:getComputedStyle(el).transform}))}));
  await writeFile(resolve(artifactDir,'qa-progress.json'),JSON.stringify(results,null,2));
  await snapshot(current.page,'overview-desktop');
  await current.page.screenshot({path:resolve(artifactDir,'overview-viewport.png'),fullPage:false});
  assert.equal(await current.page.locator('.cos-mascot svg [data-layer]').count(),17);
  assert.equal(await current.page.locator('main#cos-main').count(),1);
  assert.equal(await current.page.locator('.cos-skip').count(),1);
  // Actual native filter interaction and global search, preserving event identity.
  await current.page.locator('.page-actions select').selectOption('K141');
  assert.equal(await current.page.locator('.cm-value').first().textContent(),'2');
  await current.page.locator('.global-search input').fill('CME-K141-001');
  await current.page.locator('.global-search input').press('Enter');
  assert.equal(await current.page.evaluate('route.params.ma'),'CME-K141-001');
  await current.page.evaluate("go('doingoai');ui.overviewCourse='';render();");
  await current.page.locator('.cos-overview .page-hero').waitFor();
  await current.page.locator('.cos-overview h2').focus();
  await current.page.bringToFront();
  await current.page.evaluate('window.scrollTo(0,0)');
  await current.page.locator('.cos-companion[data-presence="1"]').waitFor();
  await current.page.waitForFunction(()=>window.CLMCreativeOS.controller.presence===1);
  const feedback=await current.page.evaluate("toast('Đã lưu thay đổi','Dữ liệu đã được xác nhận.','success');({state:CLMCreativeOS.controller.state,presence:CLMCreativeOS.controller.presence,hidden:document.hidden,active:document.activeElement.outerHTML.slice(0,200),modals:document.querySelectorAll('#modal-root .modal-bg').length,rect:document.querySelector('.cos-companion').getBoundingClientRect().toJSON()})");
  assert.equal(feedback.state,'SUCCESS',JSON.stringify(feedback));
  await snapshot(current.page,'success-state');
  await current.page.evaluate("toast('Không thể lưu','Vui lòng thử lại.','error');CLMCreativeOS.controller.dispatch('DATA_LOADING');");
  assert.equal(await current.page.evaluate('CLMCreativeOS.controller.state'),'OOPS');
  const reaction=await current.page.evaluate("new Promise(resolve=>{render();requestAnimationFrame(()=>resolve({state:CLMCreativeOS.controller.state,visual:document.querySelector('.cos-companion').dataset.state}));})");
  assert.equal(reaction.visual,reaction.state,'Re-render must preserve the current mascot feedback');
  // Form/critical dialog suppresses mascot. Escape restores actual modal focus.
  for (let n=0;n<3;n++) {
    await current.page.evaluate(`modal('<div class="modal-h"><h3 id="qa-dialog-title">Kiểm tra thao tác</h3></div><div class="modal-b"><label for="qa-input">Tên</label><input id="qa-input"><button onclick="closeModal()">Đóng</button></div>');`);
    await current.page.waitForTimeout(30);
    assert.equal(await current.page.evaluate('CLMCreativeOS.controller.presence'),0);
    await current.page.keyboard.press('Escape');
    assert.equal(await current.page.locator('#modal-root .modal-bg').count(),0);
  }
  await current.page.evaluate("go('hocbong')");
  // Wait for the real heavy route's completed frame, not the transient DOM
  // replacement before its scheduled accessibility callback.
  await current.page.waitForFunction(()=>{
    const heading=document.querySelector('main h2');
    return heading && heading===document.activeElement && !document.querySelector('main .sk');
  },{},{timeout:5000});
  await current.page.evaluate("go('doingoai')");
  await current.page.locator('.cos-overview .page-hero').waitFor();
  await current.page.evaluate("document.getElementById('toast-wrap').replaceChildren()");
  // Responsive screenshot/overflow with real rows and real SVG charts.
  for (const width of [1440,1024,768,390]) {
    await current.page.setViewportSize({width,height:1000});
    await current.page.evaluate("ui.collapsed=false;ui.mobileNav=false;render();");
    await current.page.waitForTimeout(300);
    const overflow=await current.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('#app *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,class:el.className?.baseVal||el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}));
    assert.ok(overflow.scroll<=width+1,`Page overflow at ${width}: ${JSON.stringify(overflow)}`);
    if(width<=820)assert.ok(await current.page.evaluate(()=>document.querySelector('.cos-source').getBoundingClientRect().top<document.querySelector('.cos-summary').getBoundingClientRect().top),'Mobile source warnings must appear before the data cards');
    await snapshot(current.page,`overview-${width}`);
  }
  await current.page.getByRole('button',{name:'Mở menu',exact:true}).click();
  assert.equal(await current.page.locator('.sidebar.mobile-open').count(),1);
  await snapshot(current.page,'sidebar-mobile');
  await current.page.keyboard.press('Escape');
  assert.equal(await current.page.locator('.sidebar.mobile-open').count(),0);
  await current.page.locator('.mobile-bottom-nav button[onclick="go(\'truyenthong\')"]').click();
  await current.page.waitForTimeout(100);
  assert.equal(await current.page.locator('.mobile-bottom-nav button.active').textContent(),'Truyền thông');
  assert.equal(await current.page.locator('.cos-companion').count(),0);
  // Empty and loading preserve explicit text and no invented completion estimate.
  await current.page.evaluate("DB.events=[];go('doingoai');render();");
  await current.page.waitForTimeout(100);
  assert.equal(await current.page.locator('.cos-empty-note').count(),1);
  await snapshot(current.page,'empty-state');
  await current.page.evaluate("_pendingHeavy=true;renderPageInPlace();");
  assert.equal(await current.page.locator('[aria-busy=true]').count(),1);
  await snapshot(current.page,'loading-state');
  await current.page.evaluate("_pendingHeavy=false;renderPageInPlace();");
  // Reduced-motion preferences are dynamic, including the cursor effect.
  await current.page.emulateMedia({reducedMotion:'reduce'});
  await current.page.mouse.move(300,200);
  assert.equal(await current.page.evaluate('CLMCreativeOS.controller.look.x'),0);
  assert.equal(await current.page.locator('.cos-mascot').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.ok(await current.page.locator('.cos-mascot svg').evaluate(svg=>{
    const frame=svg.getBoundingClientRect(),body=svg.querySelector('[data-layer="BODY"] path').getBoundingClientRect();
    return body.left>=frame.left-2 && body.right<=frame.right+2 && body.top>=frame.top-2 && body.bottom<=frame.bottom+2;
  }),'Reduced motion must preserve the official SVG layer transforms');
  await snapshot(current.page,'reduced-motion');
  // Four-role route matrix uses exact original NAV role lists. No newly exposed controls.
  await current.page.setViewportSize({width:1440,height:1000});
  for (const role of ['Admin','Leader','Staff','Viewer']) {
    await current.page.locator('.cos-overview .page-hero').waitFor();
    await current.page.evaluate(`session.role=${JSON.stringify(role)};ui.collapsed=false;render();`);
    const expected = await current.page.evaluate("NAV.filter(n=>n.id&&n.roles.includes(session.role)).map(n=>n.id)");
    const actual = await current.page.locator('.nav .nav-item').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('onclick').match(/go\('([^']+)'/)[1]));
    assert.deepEqual(actual,expected);
    assert.equal(await current.page.locator('.cos-top-nav button[data-page="phoihop"]').count(),role==='Viewer'?0:1,'New top navigation must preserve role scope');
    assert.equal(await current.page.locator('.cos-overview .btn-primary').count(),role==='Viewer'?0:1);
    for (const route of expected) {
      await current.page.evaluate(`go(${JSON.stringify(route)});`);
      await current.page.waitForFunction(()=>document.querySelector('main')?.textContent.trim().length>0,{},{timeout:4000});
      assert.ok((await current.page.locator('main').textContent()).trim().length>0,`${role}/${route} empty`);
      results.roleRoutes.push(`${role}/${route}`);
    }
    await current.page.evaluate("go('doingoai');");
    await current.page.locator('.cos-overview .page-hero').waitFor();
  }
  await current.page.evaluate("session.role='Admin';toggleSidebar();");
  await current.page.waitForTimeout(300);
  assert.equal(await current.page.locator('.sidebar.collapsed').count(),1);
  assert.equal(await current.page.getByRole('button',{name:'Đăng xuất',exact:true}).count(),1,'Collapsed logout must keep an accessible name');
  await snapshot(current.page,'sidebar-collapsed');
  results.renderMetrics=await current.page.evaluate('window.__clmPerf');
  assert.deepEqual(results.errors,[],'Browser exceptions occurred');
  await writeFile(resolve(artifactDir,'qa-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({parity:results.parity,roleRoutes:results.roleRoutes.length,screenshots:results.screenshots.length,errors:results.errors,renderMetrics:results.renderMetrics}));
  await baseline.context.close(); await current.context.close();
} catch (error) {
  await writeFile(resolve(artifactDir,'qa-failure.json'),JSON.stringify({...results,failure:error.message},null,2));
  throw error;
} finally {await browser.close();}
