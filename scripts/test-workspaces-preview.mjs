import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=createRequire(process.env.CLM_QA_RUNTIME||'/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 const html=await readFile('preview/creative-os-four-tabs.html','utf8');
 assert.ok(html.includes('Dữ liệu minh họa'));assert.equal(/<(?:link[^>]+href|script[^>]+src)=["']\//i.test(html),false);
 await page.goto(pathToFileURL(resolve('preview/creative-os-four-tabs.html')).href);
 for(const [name,key] of [['Truyền thông','media'],['Ấn phẩm & Kho','inventory'],['Học bổng','scholar'],['Task hàng ngày','tasks']]){
  await page.getByRole('navigation',{name:'Chọn tab để review'}).getByRole('button',{name,exact:true}).click();
  await page.locator('.cos-workspace.cw-'+key).waitFor();
  assert.ok(await page.locator('.cos-workspace .metric-card,.cos-workspace .compact-metric').count());
 }
 await page.getByRole('button',{name:'ColorME — Tổng quan',exact:true}).click();await page.locator('.cos-overview').waitFor();
 assert.equal(await page.locator('.cos-workspace').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 console.log('PASS: self-contained four-tab preview works offline; original overview reachable; no network requests/runtime exceptions.');
}finally{await browser.close();}
