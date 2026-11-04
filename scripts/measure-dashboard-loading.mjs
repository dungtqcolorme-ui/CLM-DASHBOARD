/* Controlled real production-build benchmark. Synthetic auth/data only; no live API writes. */
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import {gzipSync} from 'node:zlib';import {extname} from 'node:path';
import {workspacesFixture} from '../tests/fixtures/workspaces.mjs';
process.loadEnvFile('.env.local');
const phase=process.argv[2]||'before',base='http://127.0.0.1:3200',out='tmp/loading-hotfix';await mkdir(out,{recursive:true});
const {chromium}=createRequire(process.env.CLM_QA_RUNTIME||'/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const source=phase==='before'?execFileSync('git',['show','bceb3a1:dashboard/clm-dashboard-private-34.html'],{encoding:'utf8',maxBuffer:16000000}):await readFile('dashboard/clm-dashboard-private-34.html','utf8');
const profile={id:'qa',email:'qa@example.test',fullName:'Nhóm sáng tạo',status:'active',roles:['Admin'],activeRole:'Admin',dashboardRole:'Admin',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const user={id:'qa',email:profile.email,app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'};
const jwt=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:'qa',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'qa-only'].join('.');
const session={access_token:jwt,refresh_token:'qa-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
let state,runRequests=[],shellDelay=160,stateDelay=240,profileDelay=160,sessionError=false,stateError=false,slowSessionRole='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,base),path=url.pathname,start=performance.now();
 const entry={path,start};runRequests.push(entry);
 const send=(body,type='application/json',status=200,cache='no-store')=>{let bytes=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));res.statusCode=status;res.setHeader('Content-Type',type);res.setHeader('Cache-Control',cache);if(bytes.length>1024&&req.headers['accept-encoding']?.includes('gzip')){bytes=gzipSync(bytes);res.setHeader('Content-Encoding','gzip');}entry.bytes=bytes.length;entry.end=performance.now();res.end(bytes);};
 try{
  if(path==='/fixture')return send(source.replace(/\nclmBoot\(\);\s*\n/,'\n'),'text/html');
  if(path==='/auth/v1/token')return send(session);
  if(path==='/auth/v1/user')return send(user);
  if(path==='/auth/v1/logout')return send({});
  if(path==='/api/auth/profile'||path==='/api/account/profile'){await delay(profileDelay);return send({profile});}
  if(path==='/api/dashboard/session'){const role=req.headers['x-clm-active-role']||'Admin';entry.role=role;await delay(slowSessionRole===role?600:160);res.setHeader('Set-Cookie','clm-qa-role='+role+'; Path=/api/dashboard; HttpOnly; SameSite=Lax');return send(sessionError?{error:'Phiên kiểm thử bị từ chối'}:{ok:true},'application/json',sessionError?403:200);}
  if(path==='/api/dashboard/shell'){await delay(shellDelay);return send(source.replace('</head>',`<script>window.__CLM_BOOTSTRAP_PROFILE__=${JSON.stringify({...profile,activeRole:(req.headers.cookie||'').includes('clm-qa-role=Viewer')?'Viewer':'Admin',dashboardRole:(req.headers.cookie||'').includes('clm-qa-role=Viewer')?'Viewer':'Admin'})};</script></head>`),'text/html');}
  if(path==='/api/dashboard/state'){await delay(stateDelay);res.setHeader('X-CLM-State-Format','json');return send(stateError?{error:'Nguồn dữ liệu kiểm thử chưa sẵn sàng'}:state,'application/json',stateError?503:200);}
  if(path.startsWith('/api/'))return send({users:[],tasks:[],meetings:[],notifications:[],people:[],trainees:[],rankings:[],courses:[],documents:[]});
  if(path.startsWith('/creative-os/')||path==='/colorme-logo.png'){const body=phase==='before'?execFileSync('git',['show','bceb3a1:public'+path],{maxBuffer:16000000}):await readFile('public'+path);return send(body,{'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(path)],200,'public,max-age=3600');}
  const response=await fetch('http://127.0.0.1:3100'+req.url);let bytes=Buffer.from(await response.arrayBuffer());
  const type=response.headers.get('content-type')||'';if(type.includes('javascript'))bytes=Buffer.from(bytes.toString().replaceAll(process.env.NEXT_PUBLIC_SUPABASE_URL,base));
  return send(bytes,type,response.status,response.headers.get('cache-control')||'no-store');
 }catch(error){return send({error:error.message},'application/json',500);}
});await new Promise(r=>server.listen(3200,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const fixture=await browser.newPage();await fixture.goto(base+'/fixture');await fixture.evaluate(workspacesFixture);
 state=await fixture.evaluate(()=>{const examples=DB.events;DB.events=Array.from({length:3015},(_,i)=>({...structuredClone(examples[i%examples.length]),ma:'QA-'+i,pr:'qa',status:i<421?'Hoàn thành':i<432?'Đang xử lý':'Từ chối',ten:'Sự kiện kiểm thử '+i,schoolId:'qa-school-'+i%14}));return DB;});await fixture.close();
 await writeFile(out+'/state-fixture.json',JSON.stringify(state));
 const samples=[];
 async function context(signed=true){const c=await browser.newContext({viewport:{width:1440,height:900}});if(signed)await c.addInitScript(session=>{if(location.origin==='http://127.0.0.1:3200')localStorage.setItem('sb-127-auth-token',JSON.stringify(session));},session);
  await c.addInitScript(()=>{window.__qaPerf={long:[],lcp:0,usable:0};new PerformanceObserver(list=>window.__qaPerf.long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});new PerformanceObserver(list=>window.__qaPerf.lcp=list.getEntries().at(-1).startTime).observe({type:'largest-contentful-paint',buffered:true});new MutationObserver(()=>{const overlay=document.querySelector('.dashboard-loading[data-state=success]');if(overlay)window.__qaPerf.success={frameReady:!!document.querySelector('.private-dashboard-frame.is-ready'),pointerEvents:getComputedStyle(overlay).pointerEvents};if(!window.__qaPerf.usable&&document.querySelector('.private-dashboard-frame.is-ready'))window.__qaPerf.usable=performance.now();}).observe(document,{subtree:true,attributes:true,childList:true});});return c;}
 async function measure(page,name,login=false){
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['*docs.google.com*','*fonts.googleapis.com*','*fonts.gstatic.com*','*supabase.co*']});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:1000000,uploadThroughput:1000000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});runRequests=[];
  const navClock=performance.now();await page.goto(base,{waitUntil:'domcontentloaded'});
  if(login){await page.getByLabel('Email',{exact:true}).fill('qa@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('qa-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
  await page.locator('.private-dashboard-frame.is-ready').waitFor({timeout:30000});const readySnapshot=await page.evaluate(()=>{const f=document.querySelector('iframe');return {mainNow:performance.now(),className:f.className,dataset:{...f.contentDocument.documentElement.dataset},overview:!!f.contentDocument.querySelector('.cos-overview')};});const frame=page.frames().find(f=>f.url().includes('/api/dashboard/shell'));
  await frame.locator('.cos-overview').waitFor();const wallUsable=performance.now()-navClock;
  const numbers=await page.evaluate(()=>({usable:window.__qaPerf.usable,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:window.__qaPerf.lcp,mainLong:window.__qaPerf.long,tbt:window.__qaPerf.long.reduce((s,e)=>s+Math.max(0,e.duration-50),0),mainResources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,start:e.startTime,duration:e.duration,transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize})),navigation:performance.getEntriesByType('navigation')[0]?.toJSON()}));
  const child=await frame.evaluate(()=>({long:window.__qaPerf.long,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:window.__qaPerf.lcp,resources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,start:e.startTime,duration:e.duration,transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize})),render:window.__clmPerf}));
  const clocks=await frame.evaluate(()=>({origin:performance.timeOrigin,now:performance.now(),parentNow:parent.performance.now(),parentOrigin:parent.performance.timeOrigin}));numbers.clocks=clocks;const main=await cdp.send('Performance.getMetrics'),metrics=Object.fromEntries(main.metrics.map(m=>[m.name,m.value]));
  const atReady=runRequests.map(r=>({...r,start:r.start-runRequests[0].start,end:r.end-runRequests[0].start}));
  const navStart=performance.now();await frame.getByRole('button',{name:'Truyền thông',exact:true}).click();await frame.locator('.cw-media').waitFor();const tabSwitch=performance.now()-navStart;
  await page.screenshot({path:out+`/${phase}-${name}.png`});samples.push({name,...numbers,readySnapshot,observerUsable:numbers.usable,usable:wallUsable,scriptMs:metrics.ScriptDuration*1000,taskMs:metrics.TaskDuration*1000,tabSwitch,requests:atReady,child});
  await cdp.detach();
 }
 for(let n=0;n<3;n++){const c=await context();const p=await c.newPage();await measure(p,'cold-'+n);await measure(p,'warm-'+n);await c.close();}
 const c=await context(false);await measure(await c.newPage(),'login',true);await c.close();
 async function blockExternal(page){const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['*docs.google.com*','*fonts.googleapis.com*','*fonts.gstatic.com*','*supabase.co*']});}
 const behavior=[];
 if(phase==='after'){
  profileDelay=900;stateDelay=900;
  const c=await context(),page=await c.newPage();await blockExternal(page);await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.coloro-loader[data-state=checking]').first().waitFor();await page.screenshot({path:out+'/loading-checking.png'});
  await page.locator('.dashboard-loading[data-state=loading]').waitFor();await page.screenshot({path:out+'/loading-dashboard.png'});
  const busy=await page.evaluate(()=>({ready:!!document.querySelector('.private-dashboard-frame.is-ready'),text:document.querySelector('.loading-content h1').textContent,animated:document.querySelector('.coloro-loader').getAnimations({subtree:true}).some(a=>a.playState==='running')}));
  if(busy.ready||!busy.animated)throw new Error('Loading must animate while real data is pending, without marking the frame ready.');behavior.push({case:'checking/loading',...busy});
  await page.locator('.private-dashboard-frame.is-ready').waitFor();await page.waitForFunction(()=>!document.querySelector('.dashboard-loading'));
  const celebration=await page.evaluate(()=>window.__qaPerf.success);if(!celebration?.frameReady||celebration.pointerEvents!=='none')throw new Error('Success effect blocks dashboard readiness/input');behavior.push({case:'nonblocking success',...celebration});
  behavior.push({case:'unmounted',mascotAnimations:await page.locator('.secure-app').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.target?.closest?.('.dashboard-loading')).length)});await c.close();
  profileDelay=160;stateDelay=240;stateError=true;
  const errorContext=await context(),ep=await errorContext.newPage();await blockExternal(ep);await ep.goto(base);await ep.getByText('Nguồn dữ liệu kiểm thử chưa sẵn sàng',{exact:true}).waitFor();await ep.screenshot({path:out+'/loading-error.png'});
  stateError=false;await ep.getByRole('button',{name:'Thử lại',exact:true}).click();await ep.locator('.private-dashboard-frame.is-ready').waitFor();await ep.waitForFunction(()=>!document.querySelector('.dashboard-loading'));behavior.push({case:'real-error/retry',ready:true});
  const requestsBeforeReload=runRequests.filter(r=>r.path==='/api/dashboard/state').length,ef=ep.frames().find(f=>f.url().includes('/api/dashboard/shell'));
  await Promise.all([ef.waitForNavigation({waitUntil:'domcontentloaded'}),ef.evaluate(()=>location.reload())]);await ef.locator('.cos-overview').waitFor();
  if(runRequests.filter(r=>r.path==='/api/dashboard/state').length!==requestsBeforeReload+1)throw new Error('Frame reload reused stale data');behavior.push({case:'frame reload freshness',freshStateRequest:true});await errorContext.close();
  stateDelay=900;const reduced=await context(),rp=await reduced.newPage();await blockExternal(rp);await rp.emulateMedia({reducedMotion:'reduce'});await rp.goto(base);await rp.locator('.dashboard-loading[data-state=loading]').waitFor();const animations=await rp.locator('.coloro-loader').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);if(animations)throw new Error('Reduced-motion loader still animates');if(await rp.locator('.coloro-loader [data-layer=BODY]').evaluate(n=>getComputedStyle(n).transform)==='none')throw new Error('Reduced motion removed authored Coloro geometry');await rp.screenshot({path:out+'/loading-reduced.png'});behavior.push({case:'reduced-motion',animations});await reduced.close();
  stateDelay=240;profile.roles=['Admin','Viewer'];slowSessionRole='Admin';runRequests=[];
  const multi=await context(),mp=await multi.newPage();await blockExternal(mp);await mp.goto(base);await mp.locator('.role-grid button').first().waitFor();
  await mp.evaluate(()=>{const buttons=document.querySelectorAll('.role-grid button');buttons[0].click();buttons[1].click();});
  await mp.locator('.private-dashboard-frame.is-ready').waitFor();const src=await mp.locator('iframe').getAttribute('src');await mp.waitForTimeout(700);
  const stateRequests=runRequests.filter(r=>r.path==='/api/dashboard/state').length;
  if(stateRequests!==1||await mp.locator('iframe').getAttribute('src')!==src)throw new Error('Stale session completion started a second bootstrap');
  behavior.push({case:'out-of-order role sessions',stateRequests,latestFramePreserved:true});await multi.close();profile.roles=['Admin'];slowSessionRole='';

 }
 const totals=samples.map(s=>({name:s.name,usable:Math.round(s.usable),fcp:Math.round(s.fcp||0),lcp:Math.round(s.lcp),tbt:Math.round(s.tbt),scriptMs:Math.round(s.scriptMs),taskMs:Math.round(s.taskMs),tabSwitch:Math.round(s.tabSwitch),criticalRequests:s.requests.filter(r=>/^\/api\/(auth\/profile|dashboard\/(session|shell|state))$/.test(r.path)).map(r=>({path:r.path,start:Math.round(r.start),end:Math.round(r.end),bytes:r.bytes})),mainJS:s.mainResources.filter(r=>r.path.endsWith('.js')).reduce((a,r)=>a+r.decoded,0),iframeTbt:s.child.long.reduce((a,e)=>a+Math.max(0,e.duration-50),0),frameRenderMs:s.child.render.lastFullRenderMs,frameJS:s.child.resources.filter(r=>r.path.endsWith('.js')).reduce((a,r)=>a+r.decoded,0)}));
 await writeFile(out+`/${phase}-performance.json`,JSON.stringify({conditions:{build:'Next production',fixtureEvents:state.events.length,latencyMs:80,bandwidthBytesPerSecond:1000000,cpuThrottle:2,apiDelays:{profile:160,session:160,shell:shellDelay,state:stateDelay},network:'Synthetic auth/data; external fonts/Sheets blocked; native browser cache enabled'},samples,totals,behavior},null,2));console.log(JSON.stringify(totals));
}finally{await browser.close();await new Promise(r=>server.close(r));}
