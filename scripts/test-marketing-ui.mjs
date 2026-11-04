/** Browser → real Marketing API handlers → disposable PostgreSQL/RLS.
 * Identity provider is a synthetic fixture. All external requests are blocked.
 * Requires a local Next server (CLM_MARKETING_QA_URL, default :3104), existing
 * Playwright and test-only MARKETING_PGLITE_MODULE; never uses a remote database.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {routeLoader} from '../tests/helpers/load-route.mjs';
import {creativeOsFixture} from '../tests/fixtures/creative-os.mjs';

const base=process.env.CLM_MARKETING_QA_URL||'http://localhost:3104';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const root=process.cwd(), out=resolve(root,'tmp/marketing');await mkdir(out,{recursive:true});
const {PGlite}=await import(pathToFileURL(process.env.MARKETING_PGLITE_MODULE||'/private/tmp/clm-marketing-db-runtime/node_modules/@electric-sql/pglite/dist/index.js').href);
const playwright=createRequire(process.env.CLM_QA_RUNTIME||'/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table public.profiles(id uuid primary key,email text,status text,full_name text);
create table public.user_roles(user_id uuid references public.profiles(id),role text,primary key(user_id,role));`);
await db.exec(await readFile('supabase/migrations/20261104000100_marketing_foundation.sql','utf8'));
const actors=['Admin','PR Representative','PR Leader','Viewer'].map((role,i)=>({id:`${i+1}1111111-1111-4111-8111-111111111111`,email:`qa-${i}@example.test`,fullName:`Kiểm thử ${role}`,status:'active',roles:[role],createdAt:'2026-11-04T00:00:00Z',updatedAt:'2026-11-04T00:00:00Z'}));
for(const actor of actors){await db.query('insert into profiles values($1,$2,$3,$4)',[actor.id,actor.email,actor.status,actor.fullName]);await db.query('insert into user_roles values($1,$2)',[actor.id,actor.roles[0]]);}
const expiresAt=Math.floor(Date.now()/1000)+86400;
const tokenFor=actor=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor.id,role:'authenticated',aud:'authenticated',exp:expiresAt})).toString('base64url')+'.fixture';
const tokens=new Map(actors.map(actor=>[tokenFor(actor),actor]));
async function asActor(actor,sql,args=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);return tx.query(sql,args);});}
function clientFor(actor){return {
 from(table){assert.match(table,/^marketing_[a-z_]+$/);let columns='*',order=[],start=0,end=499;const q={select(value){columns=value;return q;},order(key,options){assert.match(key,/^[a-z_]+$/);order.push('"'+key+'" '+(options?.ascending===false?'desc':'asc'));return q;},range(from,to){start=from;end=to;return q;},then(resolve,reject){return (async()=>{try{assert.match(columns,/^[a-z_,*]+$/);const result=await asActor(actor,`select ${columns} from public.${table} order by ${order.join(',')} limit $1 offset $2`,[end-start+1,start]);const count=await asActor(actor,`select count(*)::int as total from public.${table}`);return {data:result.rows,error:null,count:count.rows[0].total};}catch(error){return {data:null,error};}})().then(resolve,reject);}};return q;},
 async rpc(name,args){assert.equal(name,'marketing_command');try{const result=await asActor(actor,'select public.marketing_command($1::jsonb) as value',[JSON.stringify(args.p_command)]);return {data:result.rows[0].value,error:null};}catch(error){return {data:null,error};}}
};}
const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{const actor=tokens.get(request.headers.get('authorization')?.replace(/^Bearer /,''));if(!actor)throw Object.assign(new Error('Fixture identity missing'),{status:401});return {profile:actor,client:clientFor(actor)};}}});
const api=load('app/api/marketing/route.ts');
const env=await readFile('.env.local','utf8');const supabaseUrl=env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert.ok(supabaseUrl,'Public Supabase URL is required for the client SDK storage key');const storageKey=`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const browser=await playwright.chromium.launch({headless:true,channel:process.env.CLM_QA_BROWSER||'chrome'});
const report={checks:[],screenshots:[],errors:[],externalBlocked:0,commands:[],legacyShellLoads:0};
let lastPage;let stage='initializing';
let planGate=null;
const checkpoint=value=>{stage=value;console.log('QA:',value);};
const watchdog=setInterval(()=>console.log('QA pending:',stage),15000);watchdog.unref();
async function context(actor,viewport={width:1440,height:1000}){
 const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});
 if(actor)await ctx.addInitScript(({key,token,actor})=>localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'fixture-only',token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user:{id:actor.id,email:actor.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:actor.createdAt}})),{key:storageKey,token:tokenFor(actor),actor});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base){report.externalBlocked++;return route.abort();}
  if(url.pathname==='/api/marketing'){
   if(req.method()==='POST')report.commands.push(JSON.parse(req.postData()||'{}').action);
   if(req.method()==='POST'&&planGate&&JSON.parse(req.postData()||'{}').action==='update_plan'){const gate=planGate;planGate=null;gate.started.resolve();await gate.release.promise;}
   const response=await api[req.method()](new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}: {})}));
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.pathname==='/api/auth/profile')return route.fulfill({json:{profile:actor}});
  if(url.pathname==='/api/dashboard/session')return route.fulfill({json:{ok:true}});
  if(url.pathname==='/api/dashboard/state')return route.fulfill({json:{events:[],notifications:[],users:[]}});
  if(url.pathname==='/api/dashboard/shell'){
   report.legacyShellLoads++;
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-clm-ready="1"><input id="legacy-unsaved" aria-label="Dữ liệu đang nhập"><button id="open-marketing" onclick="parent.postMessage({type:\'clm-marketing-open\',path:\'/marketing\'},location.origin)">Marketing</button><script>window.go=function(p){document.body.dataset.legacyPage=p};parent.postMessage({type:"clm-dashboard-ready"},location.origin)</script></html>'});
  }
  return route.continue();
 });
 const page=await ctx.newPage();lastPage=page;page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));return {ctx,page};
}
async function shot(page,name){const path=resolve(out,name+'.png');await page.evaluate(()=>{window.scrollTo(0,0);if(document.getElementById('mk-qa-label'))return;const label=document.createElement('div');label.id='mk-qa-label';label.textContent='DỮ LIỆU MINH HỌA · KIỂM THỬ LOCAL · KHÔNG KẾT NỐI PRODUCTION';label.style.cssText='position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#242328;color:white;border-radius:5px;padding:7px 10px;font:10px Arial;max-width:90vw;pointer-events:none';document.body.append(label);});await page.screenshot({path,fullPage:true,animations:'disabled'});report.screenshots.push(path);}
async function cmd(page,actor,command){const result=await page.evaluate(async ({token,command})=>{const r=await fetch('/api/marketing',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command)});return {status:r.status,body:await r.json()};},{token:tokenFor(actor),command});assert.equal(result.status,200,JSON.stringify(result.body));return result.body.result;}
async function deadline(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deferred QA request did not arrive')),12000);})]);}finally{clearTimeout(timer);}}
try{
 checkpoint('signed-out deep link');
 const signedOut=await context(null);await signedOut.page.goto(base+'/marketing/studio');await signedOut.page.getByRole('link',{name:'Đăng nhập Dashboard'}).waitFor();report.checks.push('Deep link requires existing ColorME sign-in');await signedOut.ctx.close();
 const admin=await context(actors[0]),p=admin.page;
 checkpoint('team setup');
 await p.goto(base+'/marketing');await p.getByLabel('Tên team mới').fill('Partnership · dữ liệu kiểm thử');await p.getByRole('button',{name:'Tạo team',exact:true}).click();await p.getByText('Đã tạo team Marketing.').waitFor();
 const team=(await db.query('select id from marketing_teams')).rows[0];for(const actor of actors.slice(1))await cmd(p,actors[0],{action:'set_member',team_id:team.id,user_id:actor.id,enabled:true});
 report.checks.push('Admin creates real persisted team and memberships');
 checkpoint('create campaign');
 await p.getByRole('link',{name:'Campaigns',exact:true}).click();await p.getByRole('button',{name:'+ Tạo Campaign',exact:true}).click();await p.getByLabel('Tên Campaign',{exact:true}).fill('Sharing · chiến dịch kiểm thử');await p.getByLabel('Mục tiêu',{exact:true}).fill('Kiểm chứng luồng nội dung có lưu PostgreSQL');await p.getByRole('button',{name:'Lưu Campaign',exact:true}).click();await p.getByRole('heading',{name:'Sharing · chiến dịch kiểm thử',exact:true}).waitFor();
 const campaign=(await db.query('select * from marketing_campaigns')).rows[0];
 await p.getByRole('button',{name:'Content Plan',exact:true}).click();await p.getByLabel('Kế hoạch chung').fill('Dữ liệu kiểm thử: kế hoạch có version.');await p.getByText(/^Đã lưu v\d+$/).waitFor();
 assert.equal((await db.query('select plan from marketing_campaigns')).rows[0].plan,'Dữ liệu kiểm thử: kế hoạch có version.');
 checkpoint('delayed autosave remount conflict');
 const gate={started:Promise.withResolvers(),release:Promise.withResolvers()};planGate=gate;
 await p.getByLabel('Kế hoạch chung').fill('Dữ liệu kiểm thử: lưu A');await deadline(gate.started.promise);
 await p.getByRole('button',{name:'Overview',exact:true}).click();await p.getByRole('button',{name:'Content Plan',exact:true}).click();
 await p.getByLabel('Kế hoạch chung').fill('Dữ liệu kiểm thử: giữ bản B mới');gate.release.resolve();
 await p.getByText('Phát hiện phiên bản mới. Thay đổi của bạn được giữ.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Overview',exact:true}).click();await p.getByRole('button',{name:'Content Plan',exact:true}).click();assert.equal(await p.getByLabel('Kế hoạch chung').inputValue(),'Dữ liệu kiểm thử: giữ bản B mới');
 await p.getByText('Phát hiện phiên bản mới. Thay đổi của bạn được giữ.',{exact:true}).waitFor();await shot(p,'plan-conflict');
 await p.getByRole('button',{name:'Lấy phiên bản mới',exact:true}).click();await p.getByRole('button',{name:/Dùng phiên bản máy chủ v/}).click();
 report.checks.push('Delayed autosave across remount cannot delete newer draft; conflict recovery explicit');
 await p.getByRole('button',{name:'Overview',exact:true}).click();await p.getByRole('button',{name:'Gửi yêu cầu kích hoạt',exact:true}).click();await p.getByRole('button',{name:'Kích hoạt & xác nhận KPI',exact:true}).waitFor();await p.getByRole('button',{name:'Kích hoạt & xác nhận KPI',exact:true}).click();await p.getByRole('button',{name:'Tạm dừng',exact:true}).waitFor();
 report.checks.push('Campaign draft → pending → active; shared plan autosaves and versions');
 checkpoint('create caption');
 await p.getByRole('link',{name:'Creative Studio',exact:true}).click();await p.getByLabel('Tên nội dung',{exact:true}).fill('Caption kiểm thử PostgreSQL');await p.getByRole('textbox',{name:/^Caption/}).fill('Nội dung kiểm thử, không xuất bản.');
 await p.getByLabel('Giờ đăng đề xuất · giờ Việt Nam').fill('2026-11-04T00:30');await p.getByRole('button',{name:'Tạo bản nháp',exact:true}).click();await p.waitForURL(/content=/,{timeout:12000});await p.getByRole('button',{name:'Gửi duyệt',exact:true}).waitFor();
 const content=(await db.query('select * from marketing_content_items')).rows[0];assert.equal(new Date(content.proposed_publish_at).toISOString(),'2026-11-03T17:30:00.000Z');
 await p.getByRole('button',{name:'Gửi duyệt',exact:true}).click();await p.getByText('Đang chờ duyệt',{exact:true}).first().waitFor();report.checks.push('Caption persisted; UTC conversion; separate production/review state; no schedule');
 checkpoint('explicit Campaign context survives save refresh');
 const second=await cmd(p,actors[0],{action:'create_campaign',team_id:team.id,name:'Campaign B · dữ liệu kiểm thử',kind:'always_on',objective:'Kiểm thử context',audience:'',message:'',start_date:null,end_date:null});
 await p.goto(base+`/marketing/studio?new=1&campaign=${campaign.id}`);await p.getByLabel('Campaign hiện tại').selectOption(second.id);await p.waitForURL(new RegExp('campaign='+second.id));
 await p.getByLabel('Tên nội dung',{exact:true}).fill('Caption Campaign B');await p.getByRole('textbox',{name:/^Caption/}).fill('Bản nháp theo Campaign B, không xuất bản.');await p.getByRole('button',{name:'Tạo bản nháp',exact:true}).click();await p.waitForURL(/content=/);await p.getByRole('button',{name:'Gửi duyệt',exact:true}).waitFor();assert.equal(await p.getByLabel('Campaign hiện tại').inputValue(),second.id);
 await p.getByLabel('Campaign hiện tại').selectOption(campaign.id);await p.waitForURL(url=>url.searchParams.get('campaign')===campaign.id&&!url.searchParams.has('content'));await p.getByRole('button',{name:'Tạo bản nháp',exact:true}).waitFor();
 report.checks.push('Explicit Campaign switch survives refresh/create and clears incompatible open content');
 checkpoint('eight routes');
 const titles={overview:'Marketing Overview',campaigns:'Campaigns',agent:'AI Agent & Ideas',studio:'Creative Studio',calendar:'Content Calendar',assets:'Asset & Template Library',intelligence:'Intelligence & Reports',approvals:'Approval Inbox'};
 for(const [path,name] of [['','overview'],['/campaigns','campaigns'],['/agent','agent'],['/studio','studio'],['/calendar','calendar'],['/assets','assets'],['/intelligence','intelligence'],['/approvals','approvals']]){
  await p.goto(base+'/marketing'+path);await p.getByRole('heading',{name:titles[name],exact:true}).waitFor();await p.locator('[aria-current="page"]').first().waitFor();await shot(p,name+'-desktop');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No desktop overflow '+name);
 }
 report.checks.push('All eight real routes/deep links/empty states load without fake metrics');
 await p.getByRole('link',{name:'Campaigns',exact:true}).click();await p.getByRole('heading',{name:'Campaigns',exact:true}).waitFor();await p.goBack();await p.getByRole('heading',{name:'Approval Inbox',exact:true}).waitFor();await p.goForward();await p.getByRole('heading',{name:'Campaigns',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'Campaigns',exact:true}).getAttribute('aria-current'),'page');report.checks.push('Browser back/forward restores child route and active navigation');
 await p.getByRole('button',{name:'Marketing',exact:true}).click();assert.equal(await p.locator('#marketing-subnav').isVisible(),false);await p.getByRole('button',{name:'Marketing',exact:true}).press('Enter');assert.equal(await p.locator('#marketing-subnav').isVisible(),true);
 await p.setViewportSize({width:390,height:844});for(const path of ['/marketing','/marketing/calendar','/marketing/studio','/marketing/approvals']){await p.goto(base+path);await p.getByRole('heading',{name:titles[path==='/marketing'?'overview':path.split('/').pop()],exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile overflow '+path);await shot(p,path.split('/').pop()+'-mobile');}
 report.checks.push('Keyboard disclosure, reduced motion, mobile 390px without page overflow');
 const viewer=await context(actors[3]);await viewer.page.goto(base+'/marketing/campaigns');await viewer.page.getByText('Chế độ chỉ xem · Quyền chỉnh sửa do vai trò và phạm vi team quyết định.').waitFor();assert.equal(await viewer.page.getByRole('button',{name:'+ Tạo Campaign'}).count(),0);await viewer.ctx.close();
 const rep=await context(actors[1]);await rep.page.goto(base+'/marketing/campaigns/'+campaign.id);await rep.page.locator('#marketing-main h1').waitFor();assert.equal(await rep.page.getByRole('button',{name:'Tạm dừng',exact:true}).count(),0);await rep.ctx.close();report.checks.push('Viewer write controls absent; Representative activation controls absent');
 // Persistent host fixture verifies actual app route/iframe lifecycle, not legacy business logic.
 const host=await context(actors[0]);await host.page.goto(base+'/');const frame=host.page.frameLocator('iframe.private-dashboard-frame');await frame.getByLabel('Dữ liệu đang nhập').fill('Giữ nguyên form chưa lưu');await frame.locator('#open-marketing').click();await host.page.getByRole('heading',{name:'Marketing Overview',exact:true}).waitFor();await host.page.getByRole('link',{name:'Đối ngoại',exact:true}).click();await frame.getByLabel('Dữ liệu đang nhập').waitFor();assert.equal(await frame.getByLabel('Dữ liệu đang nhập').inputValue(),'Giữ nguyên form chưa lưu');assert.equal(report.legacyShellLoads,1);await host.ctx.close();report.checks.push('Legacy iframe and unsaved input survive Marketing roundtrip, one shell load');
 // Actual legacy document: disclosure integration, original module ordering and collapsed/mobile behavior.
 const legacyCtx=await browser.newContext({viewport:{width:1440,height:1000}}),legacy=await legacyCtx.newPage();
 const baseRevision=(await readFile('docs/marketing/BASE_REVISION','utf8')).trim();assert.match(baseRevision,/^[0-9a-f]{40}$/);
 let legacySource=execFileSync('git',['show',baseRevision+':dashboard/clm-dashboard-private-34.html'],{encoding:'utf8',maxBuffer:16*1024*1024});
 await legacyCtx.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://marketing-legacy.test')return route.fulfill({body:''});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:legacySource.replace(/\nclmBoot\(\);\s*\n/,'\n')});if(url.pathname.startsWith('/creative-os/')||url.pathname.startsWith('/marketing/')||url.pathname==='/colorme-logo.png'){const path=resolve(root,'public','.'+url.pathname);assert.ok(path.startsWith(resolve(root,'public')+'/'));return route.fulfill({contentType:{'.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'}[extname(path)],body:await readFile(path)});}return route.fulfill({json:{}});});
 await legacy.goto('http://marketing-legacy.test');await legacy.evaluate(creativeOsFixture);await shot(legacy,'legacy-sidebar-before');
 legacySource=await readFile('dashboard/clm-dashboard-private-34.html','utf8');await legacy.reload();await legacy.evaluate(creativeOsFixture);const toggle=legacy.getByRole('button',{name:'Marketing',exact:true});await toggle.waitFor();await toggle.press('Enter');assert.equal(await legacy.locator('.clm-marketing-link:visible').count(),8);assert.equal(await toggle.getAttribute('aria-expanded'),'true');await shot(legacy,'legacy-sidebar-after');await legacy.evaluate('ui.collapsed=true;render()');await legacy.getByRole('button',{name:'Marketing',exact:true}).click();assert.equal(await legacy.locator('.sidebar.collapsed').count(),0);assert.equal(await legacy.locator('.clm-marketing-link:visible').count(),8);await legacyCtx.close();report.checks.push('Actual legacy sidebar has one Marketing parent and eight keyboard/collapse-safe links');
 assert.deepEqual(report.errors,[]);assert.equal((await db.query("select count(*)::int n from marketing_content_items where publishing_status in ('approved','scheduled','published')")).rows[0].n,0);
 await admin.ctx.close();console.log(JSON.stringify(report,null,2));
}catch(error){report.failureUrl=lastPage?.url();report.errors.push(error.stack||String(error));console.error('Failure URL:',report.failureUrl,error);if(lastPage&&!lastPage.isClosed())await shot(lastPage,'failure').catch(()=>{});throw error;}finally{clearInterval(watchdog);await writeFile(resolve(out,'qa-report.json'),JSON.stringify(report,null,2));await browser.close();await db.close();}
