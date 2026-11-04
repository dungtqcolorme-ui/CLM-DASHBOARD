/* Component quality and chart invariants; isolated fixtures, no live writes. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {workspacesFixture} from '../tests/fixtures/workspaces.mjs';
const {chromium}=createRequire(process.env.CLM_QA_RUNTIME||'/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const baseline='50b3af1',out=resolve('tmp/workspace-components');await mkdir(out,{recursive:true});
const errors=[],results=[],captures=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});
async function open(old=false,motion='reduce'){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:motion});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.componentAnimations=[];const run=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.componentAnimations.push({className:String(this.className),frames,options});return run.call(this,frames,options);};});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='http://components.test')return route.fulfill({body:''});
  const path=url.pathname==='/'?'dashboard/clm-dashboard-private-34.html':'public'+url.pathname;
  try{const body=old?execFileSync('git',['show',baseline+':'+path],{maxBuffer:16000000}):await readFile(path);return route.fulfill({body:url.pathname==='/'?body.toString().replace(/\nclmBoot\(\);\s*\n/,'\n'):body,contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(path)]});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('http://components.test');await page.evaluate(workspacesFixture);return {page,context};
}
async function go(p,route){await p.evaluate(route=>go(route),route);await p.locator('.cos-workspace').waitFor();await p.waitForFunction(()=>!!document.body.dataset.cosWorkspace);}
async function geometry(p){return p.locator('.cos-workspace').evaluate(root=>({
 titles:[...root.querySelectorAll('svg title,.mini-bar[title]')].map(n=>n.getAttribute('title')||n.textContent),
 marks:[...root.querySelectorAll('.dash-panel-body svg circle,.dash-panel-body svg path,.dash-panel-body svg rect,.dash-panel-body svg line')].map(n=>({tag:n.tagName,geometry:['d','cx','cy','r','x','y','x1','y1','x2','y2','width','height','stroke-dasharray','stroke-dashoffset','transform'].map(k=>n.getAttribute(k))})),
 bars:[...root.querySelectorAll('.mini-bar')].map(n=>n.style.height),
 tables:[...root.querySelectorAll('table')].map(t=>t.textContent.replace(/\s+/g,' ').trim()),
}));}
try{
 const old=await open(true),now=await open();
 for(const route of ['truyenthong','anpham','hocbong','phoihop']){
  await go(old.page,route);await go(now.page,route);assert.deepEqual(await geometry(now.page),await geometry(old.page),route+' chart geometry/title/table data changed');
  const cards=await now.page.locator('.cw-metric-region').evaluate(root=>[...root.querySelectorAll('.metric-card,.compact-metric')].map(n=>({bg:getComputedStyle(n).backgroundColor,width:n.getBoundingClientRect().width,label:n.querySelector('.cm-label,.metric-label').textContent,padding:getComputedStyle(n).padding})));
  assert.ok(new Set(cards.map(x=>x.bg)).size>=3,route+' needs distinct primary/secondary/supporting card surfaces');
  if(route!=='phoihop'){
   const legendParity=await now.page.locator('.cos-workspace').evaluate(root=>{
    const errors=[];root.querySelectorAll('.cw-chart-panel').forEach(panel=>{
     const bars=[...panel.querySelectorAll('.mini-bar')],legend=[...panel.querySelectorAll('.legend-dot')];
     legend.forEach((dot,index)=>{if(bars[index]&&getComputedStyle(dot).backgroundColor!==getComputedStyle(bars[index]).backgroundColor)errors.push('bar legend mismatch');});
     const arcs=[...panel.querySelectorAll('circle[stroke-dasharray]')].map(n=>getComputedStyle(n).stroke);
     panel.querySelectorAll('.status-row').forEach(row=>{if(Number(row.querySelector('strong').textContent.replace(/[^0-9.-]/g,''))>0&&!arcs.includes(getComputedStyle(row.querySelector('span')).backgroundColor))errors.push('donut legend mismatch');});
    });return errors;
   });assert.deepEqual(legendParity,[],route+' series and legends disagree');
   assert.ok(await now.page.locator('.cw-chart-svg').count(),route+' charts not restyled');
   const markColors=await now.page.locator('.cw-chart-svg circle[stroke],.mini-bar').evaluateAll(ns=>ns.map(n=>n.getAttribute('stroke')||getComputedStyle(n).backgroundColor));
   assert.ok(!markColors.some(c=>['#16A34A','#E11B22','#2563EB'].includes(c)),route+' retains legacy saturated chart colors');
   const text=await now.page.locator('.cw-chart-svg text').first().evaluate(n=>({fill:getComputedStyle(n).fill,font:parseFloat(getComputedStyle(n).fontSize)}));
   assert.ok(text.font>=12&&text.fill!=='rgb(156, 163, 175)',route+' chart axes need readable typography');
   const tip=now.page.locator('[data-cw-tip]').first();
   if(await tip.count()){const original=await tip.getAttribute('data-cw-tip');await tip.scrollIntoViewIfNeeded();
    const box=await tip.boundingBox();await tip.hover();try{await now.page.locator('.cw-chart-tooltip').waitFor({state:'visible',timeout:2500});}catch(error){console.log(await now.page.evaluate(({x,y})=>({tip:document.querySelector('[data-cw-tip]')?.outerHTML,hit:document.elementFromPoint(x,y)?.outerHTML,tooltip:document.querySelector('.cw-chart-tooltip')?.outerHTML,scrollY}),{x:box.x+box.width/2,y:box.y+box.height/2}));await now.page.screenshot({path:resolve(out,'tooltip-failure.png')});throw error;}assert.equal(await now.page.locator('.cw-chart-tooltip').textContent(),original);
    await now.page.mouse.move(0,0);await now.page.locator('.cw-chart-tooltip').waitFor({state:'hidden'});
   }
  }
  if(route==='phoihop')await now.page.locator('.hub-view-switch').getByRole('button',{name:'Danh sách',exact:true}).click();
  const table=now.page.locator('.tbl').last();
  const appearance=await table.evaluate(t=>({font:parseFloat(getComputedStyle(t.querySelector('td')).fontSize),padding:parseFloat(getComputedStyle(t.querySelector('td')).paddingTop),sticky:getComputedStyle(t.querySelector('th')).position}));
  assert.ok(appearance.font>=13&&appearance.padding>=16,route+' table readability');assert.equal(appearance.sticky,'sticky',route+' sticky header');
  const sticky=await now.page.locator('.cw-table-scroll').evaluateAll(wrappers=>{
   const wrapper=wrappers.find(n=>n.scrollHeight>n.clientHeight+100);if(!wrapper)return null;
   wrapper.scrollTop=180;const header=wrapper.querySelector('th').getBoundingClientRect(),frame=wrapper.getBoundingClientRect();wrapper.scrollTop=0;return Math.abs(header.top-frame.top);
  });if(sticky!=null)assert.ok(sticky<=3,route+' local table header did not stick');
  assert.equal(await now.page.locator('.cos-workspace').evaluate(root=>root.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,route+' reduced motion still running');results.push(route);
 }
 const animated=await open(false,'no-preference');
 assert.equal(await animated.page.evaluate(()=>typeof window.Motion?.animate),'function','Official Motion runtime unavailable');
 await animated.page.evaluate(()=>{window.motionCalls=[];const run=Motion.animate;Motion.animate=(target,frames,options)=>{window.motionCalls.push({className:target.getAttribute('class')||String(target.className),frames,options});return run(target,frames,options);};});
 await go(animated.page,'anpham');await animated.page.waitForTimeout(650);
 assert.ok(await animated.page.evaluate(()=>motionCalls.some(c=>c.className.includes('cw-chart-svg')||c.className.includes('mini-bar'))),'Chart entrance does not use Motion');
 await animated.page.evaluate(()=>window.motionCalls=[]);
 await animated.page.getByLabel('Lọc tồn kho ấn phẩm theo khóa').selectOption('K143');await animated.page.waitForTimeout(450);
 assert.ok(await animated.page.evaluate(()=>motionCalls.some(c=>c.className.includes('mini-bar')||c.className.includes('cw-stock-chart'))),'Changed chart data is not animated');
 await animated.page.evaluate(()=>window.motionCalls=[]);await animated.page.evaluate('render()');await animated.page.waitForTimeout(350);
 assert.equal(await animated.page.evaluate(()=>motionCalls.filter(c=>c.className.includes('cw-chart-svg')||c.className.includes('mini-bar')).length),0,'Unchanged render replayed chart animation');
 await go(animated.page,'phoihop');await animated.page.waitForTimeout(500);
 await animated.page.evaluate(()=>window.motionCalls=[]);await animated.page.getByRole('button',{name:'7 ngày sau',exact:true}).click();await animated.page.waitForTimeout(300);
 assert.ok(await animated.page.evaluate(()=>motionCalls.some(c=>c.className.includes('cw-calendar'))),'Week navigation has no Motion feedback');
 await animated.page.getByRole('button',{name:'7 ngày trước',exact:true}).click();await animated.page.waitForTimeout(300);await animated.page.evaluate(()=>window.motionCalls=[]);
 await animated.page.evaluate(()=>{const id=document.querySelector('.hub-task-card[data-record-id]').dataset.recordId,t=DB.tasks.find(t=>String(t.id)===id);t.status='Hoàn thành';t.xong=true;render();});await animated.page.waitForTimeout(300);
 assert.ok(await animated.page.evaluate(()=>motionCalls.some(c=>c.className.includes('hub-task-card'))),'Changed task status has no Motion feedback');
 await animated.page.getByRole('button',{name:'Tạo công việc',exact:true}).click();await animated.page.waitForTimeout(300);
 assert.ok(await animated.page.evaluate(()=>motionCalls.some(c=>c.className.includes('cw-workspace-dialog'))),'Modal entry does not use Motion');await animated.page.keyboard.press('Escape');
 await animated.page.emulateMedia({reducedMotion:'reduce'});await go(animated.page,'anpham');await animated.page.waitForTimeout(30);assert.equal(await animated.page.locator('.cos-workspace').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Reduced motion must cancel/skip Motion');
 // Capture exact requested viewports for before/after component comparison.
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,800]])for(const route of results){
  for(const [phase,tab] of [['before',old],['after',now]]){await tab.page.setViewportSize({width,height});await tab.page.evaluate(workspacesFixture);await go(tab.page,route);await tab.page.mouse.move(0,0);const path=resolve(out,`${phase}-${route}-${width}.png`);await tab.page.screenshot({path,animations:'disabled'});captures.push(path);}
 }
 // Detailed component views supplement the top-of-page matrix.
 await now.page.setViewportSize({width:1440,height:900});
 for(const route of results){await now.page.evaluate(workspacesFixture);await go(now.page,route);
  const selector=route==='truyenthong'?'.cw-media-analytics':route==='anpham'?'.cw-inventory-analytics':route==='hocbong'?'.cw-scholar-analytics':'.meeting-hub-section';
  const path=resolve(out,`components-${route}.png`);await now.page.locator(selector).screenshot({path,animations:'disabled'});captures.push(path);
  if(route==='phoihop'){await now.page.locator('.hub-view-switch').getByRole('button',{name:'Danh sách',exact:true}).click();const list=resolve(out,'components-task-table.png');await now.page.locator('.hub-list-card').evaluate(e=>e.scrollIntoView({block:'start'}));await now.page.evaluate('window.scrollBy(0,-92)');await now.page.mouse.move(0,0);await now.page.screenshot({path:list,animations:'disabled'});captures.push(list);}
  else{const table=resolve(out,`table-${route}.png`);await now.page.locator('.cw-data-panel').first().evaluate(e=>e.scrollIntoView({block:'start'}));await now.page.evaluate('window.scrollBy(0,-92)');await now.page.mouse.move(0,0);await now.page.screenshot({path:table,animations:'disabled'});captures.push(table);}
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({routes:results,captures,errors,motion:true,chartGeometryIdentical:true},null,2));console.log(JSON.stringify({routes:results,screenshots:captures.length,errors,motion:true,chartGeometryIdentical:true}));
}finally{await browser.close();}
