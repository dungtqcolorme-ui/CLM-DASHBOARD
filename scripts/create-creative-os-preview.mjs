/* Produce a review-only HTML that opens with file://, without a web server,
   private session, live API access, network fonts or external assets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {creativeOsFixture} from '../tests/fixtures/creative-os.mjs';
import {workspacesFixture} from '../tests/fixtures/workspaces.mjs';

const focused=process.argv.includes('--workspaces');

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const inline=source=>source.replace(/<\/script/gi,'<\\/script');
const [source,tokens,css,controller,adapter,svg,art,logo,workspaceCss,workspaceJs,motion,loadingCss]=await Promise.all([
  read('dashboard/clm-dashboard-private-34.html'),read('public/creative-os/tokens.css'),
  read('public/creative-os/creative-os.css'),read('public/creative-os/mascot-controller.js'),
  read('public/creative-os/creative-os.js'),read('public/creative-os/coloro.svg'),read('public/creative-os/studio-canvas.svg'),
  readFile(new URL('../public/colorme-logo.png',import.meta.url)),
  read('public/creative-os/workspaces.css'),read('public/creative-os/workspaces.js'),read('public/creative-os/vendor/motion-14.9.0.js'),read('public/creative-os/coloro-loading.css'),
]);
const mascot='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg).replace(/'/g,'%27');
const studio='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(art).replace(/'/g,'%27');
const logoUrl='data:image/png;base64,'+logo.toString('base64');
const boot=String.raw`
// This adapter exists only in the generated offline preview, never in the app.
const previewNativeFetch=window.fetch.bind(window);
window.fetch=async function(input,options){
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith('data:'))return previewNativeFetch(input,options);
  if(url.startsWith('/api/'))return new Response(JSON.stringify({courses:[],rankings:[],audit:[],documents:[],error:'Bản xem trước ngoại tuyến'}),{headers:{'Content-Type':'application/json'}});
  throw new Error('Bản xem trước không kết nối nguồn dữ liệu thật.');
};
clmBrandLogoUrl=${JSON.stringify(logoUrl)};
${focused?workspacesFixture:creativeOsFixture}
save=()=>Promise.resolve();
flushDBSave=()=>Promise.resolve();
refreshDash=()=>toast('Bản xem trước ngoại tuyến','Số liệu minh họa; mở ứng dụng để làm việc với dữ liệu thật.','info');
syncFromSheet=async()=>refreshDash();
scheduleBackgroundSheetSync=()=>{};
clmParentMessage=()=>toast('Bản xem trước ngoại tuyến','Thao tác này cần phiên đăng nhập trong ứng dụng.','info');
clmRpc=async function(action){
  if(['load-work-items','load-mentor-trainees','load-mentor-daily-tasks','list-users','list-documents','get-honors','load-performance-scores'].includes(action))return {users:[],documents:[],tasks:[],meetings:[],notifications:[],people:[],trainees:[],rankings:[],audit:[],courses:[]};
  throw new Error('Bản xem trước chỉ phục vụ xem giao diện; không lưu dữ liệu thật.');
};
document.documentElement.dataset.clmReady='1';
${focused?"go('truyenthong');":''}
`;
if(!/\nclmBoot\(\);\s*\n/.test(source))throw new Error('Dashboard bootstrap changed; review the preview generator.');
let html=source
  .replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g,'')
  .replace('<title>ColorME PR Sponsorship</title>','<title>ColorME Creative OS — Bản xem trước</title>')
  .replace('<meta charset="UTF-8">','<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src data:; base-uri \'none\'; form-action \'none\'">')
  .replace('<link rel="stylesheet" href="/creative-os/coloro-loading.css">',()=>`<style>${loadingCss}</style>`)
  .replace('<link rel="stylesheet" href="/creative-os/tokens.css">',()=>`<style>${tokens}</style>`)
  .replace('<link rel="stylesheet" href="/creative-os/creative-os.css">',()=>`<style>${css.replaceAll('/creative-os/studio-canvas.svg',studio)}</style>`)
  .replace('<link rel="stylesheet" href="/creative-os/workspaces.css">',()=>`<style>${workspaceCss.replaceAll('/creative-os/coloro.svg',mascot)}</style>`)
  .replace('<script src="/creative-os/mascot-controller.js"></script>',()=>`<script>${inline(controller)}</script>`)
  .replace('<script src="/creative-os/creative-os.js"></script>',()=>`<script>${inline(adapter.replaceAll('/creative-os/coloro.svg',mascot))}</script>`)
  .replace('<script src="/creative-os/vendor/motion-14.9.0.js"></script>',()=>`<script>${inline(motion)}</script>`)
  .replace('<script src="/creative-os/workspaces.js"></script>',()=>`<script>${inline(motion)}</script><script>${inline(workspaceJs)}</script>`)
  .replace(/\nclmBoot\(\);\s*\n/,()=>`\n${inline(boot)}\n`)
  .replace('<body>','<body><div class="cos-preview-banner" role="note"><strong>BẢN XEM TRƯỚC</strong><span>Dữ liệu minh họa · Không kết nối hệ thống thật</span></div>');
if(focused)html=html.replace('<span>Dữ liệu minh họa · Không kết nối hệ thống thật</span>','<span>Dữ liệu minh họa</span><nav aria-label="Chọn tab để review">'+[['truyenthong','Truyền thông'],['anpham','Ấn phẩm & Kho'],['hocbong','Học bổng'],['phoihop','Task hàng ngày']].map(([route,name])=>`<button onclick="go('${route}')">${name}</button>`).join('')+'</nav>');
html=html.replace('</head>','<style>body{padding-top:40px}.sidebar{top:40px}.header{top:40px}.cos-preview-banner{position:fixed;inset:0 0 auto;z-index:9999;height:40px;display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 12px;background:#25251f;color:#fff;font:12px system-ui}.cos-preview-banner strong{font-size:10px;letter-spacing:1px}.cos-preview-banner span{font-size:11px}@media(max-width:500px){.cos-preview-banner{gap:4px;flex-direction:column}.cos-preview-banner span{font-size:10px}}</style></head>');
const directory=new URL('../preview/',import.meta.url);
await mkdir(directory,{recursive:true});
if(focused){
 html=html.replace('</head>','<style>.cos-preview-banner nav{display:flex;gap:6px}.cos-preview-banner nav button{border:1px solid #686864;background:transparent;color:#fff;font:11px system-ui;border-radius:99px;padding:4px 10px;cursor:pointer}@media(max-width:700px){.cos-preview-banner{height:80px;flex-wrap:wrap;gap:4px}.cos-preview-banner nav{width:100%;justify-content:center;gap:3px}.cos-preview-banner nav button{padding:4px 6px;font-size:10px}body{padding-top:80px}.sidebar,.header{top:80px}}</style></head>');
 await writeFile(new URL('creative-os-four-tabs.html',directory),html);
 console.log('Created preview/creative-os-four-tabs.html — isolated four-tab review; existing overview preview files unchanged');
}else{
 await writeFile(new URL('creative-os.html',directory),html);
 await writeFile(new URL('creative-os-v2.html',directory),html);
 console.log('Created preview/creative-os.html and creative-os-v2.html — self-contained offline review, synthetic data only');
}
