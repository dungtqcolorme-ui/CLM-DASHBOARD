import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

let playwright;
try {playwright=await import('playwright');} catch {
  playwright=createRequire(process.env.CLM_QA_RUNTIME || '/Users/chandung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
}
const browser=await playwright.chromium.launch({headless:true,channel:process.env.CLM_QA_BROWSER || 'chrome'});
try {
  const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  await page.goto(pathToFileURL(resolve('dashboard/clm-dashboard-private-34.html')).href);
  assert.match(await page.locator('#root').innerText(),/Cần mở qua ứng dụng/,'Opening private source directly must explain its required app session instead of spinning');
  const preview=resolve('preview/creative-os-v2.html');
  const html=await readFile(preview,'utf8');
  assert.equal(html,await readFile('preview/creative-os.html','utf8'),'Versioned and canonical previews must match');
  assert.equal(/<(?:link[^>]+href|script[^>]+src)=["']\//i.test(html),false,'Preview must inline its assets');
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if (/^https?:/i.test(request.url())) network.push(request.url());});
  await page.goto(pathToFileURL(preview).href);
  await page.locator('.cos-overview .cm-value').first().waitFor();
  assert.equal(await page.locator('.cos-preview-banner').count(),1);
  const logo=await page.locator('.cos-wordmark img').evaluate(image=>({
    width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,
    ratio:image.naturalWidth/image.naturalHeight,fit:getComputedStyle(image).objectFit,
    radius:getComputedStyle(image).borderRadius,
  }));
  assert.ok(Math.abs(logo.width/logo.height-logo.ratio)<.001,`Original ColorME proportions must survive flex layout: ${JSON.stringify(logo)}`);
  assert.equal(logo.fit,'contain','The entire original logo must remain visible');
  assert.equal(logo.radius,'0px','Do not crop the original artwork corners');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate('ui.collapsed=false;render();');
    const marks=await page.locator('img.clm-brand-img').evaluateAll(images=>images.map(image=>({
      width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,
      ratio:image.naturalWidth/image.naturalHeight,fit:getComputedStyle(image).objectFit,
      radius:getComputedStyle(image).borderRadius,
    })));
    for(const mark of marks){
      assert.ok(Math.abs(mark.width/mark.height-mark.ratio)<.001,`Sidebar/header logo distorted at ${width}px: ${JSON.stringify(mark)}`);
      assert.equal(mark.fit,'contain');assert.equal(mark.radius,'0px');
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate('ui.collapsed=true;render();');
  assert.equal(await page.locator('.cos-overview .cm-value').first().textContent(),'4');
  await page.locator('.page-actions select').selectOption('K141');
  assert.equal(await page.locator('.cos-overview .cm-value').first().textContent(),'2');
  await page.locator('.cos-mascot svg [data-layer="BODY"]').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Làm mới',exact:true}).click();
  await page.getByText('Bản xem trước ngoại tuyến',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  assert.deepEqual(network,[],'Offline preview must not request external resources or APIs');
  await page.screenshot({path:'tmp/creative-os/standalone-preview.png',fullPage:true,animations:'disabled'});
  console.log('PASS: private file explanation; standalone HTML offline boot, inlined assets, mascot, filter, refresh; no network or browser exceptions');
} finally {await browser.close();}
