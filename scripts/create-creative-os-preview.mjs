/* Produce a review-only HTML that opens with file://, without a web server,
   private session, live API access, network fonts or external assets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {creativeOsFixture} from '../tests/fixtures/creative-os.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const inline=source=>source.replace(/<\/script/gi,'<\\/script');
const [source,tokens,css,controller,adapter,svg,art,logo]=await Promise.all([
  read('dashboard/clm-dashboard-private-34.html'),read('public/creative-os/tokens.css'),
  read('public/creative-os/creative-os.css'),read('public/creative-os/mascot-controller.js'),
  read('public/creative-os/creative-os.js'),read('public/creative-os/coloro.svg'),read('public/creative-os/studio-canvas.svg'),
  readFile(new URL('../public/colorme-logo.png',import.meta.url)),
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
${creativeOsFixture}
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
`;
if(!/\nclmBoot\(\);\s*\n/.test(source))throw new Error('Dashboard bootstrap changed; review the preview generator.');
let html=source
  .replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g,'')
  .replace('<title>ColorME PR Sponsorship</title>','<title>ColorME Creative OS — Bản xem trước</title>')
  .replace('<meta charset="UTF-8">','<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src data:; base-uri \'none\'; form-action \'none\'">')
  .replace('<link rel="stylesheet" href="/creative-os/tokens.css">',()=>`<style>${tokens}</style>`)
  .replace('<link rel="stylesheet" href="/creative-os/creative-os.css">',()=>`<style>${css.replaceAll('/creative-os/studio-canvas.svg',studio)}</style>`)
  .replace('<script src="/creative-os/mascot-controller.js"></script>',()=>`<script>${inline(controller)}</script>`)
  .replace('<script src="/creative-os/creative-os.js"></script>',()=>`<script>${inline(adapter.replaceAll('/creative-os/coloro.svg',mascot))}</script>`)
  .replace(/\nclmBoot\(\);\s*\n/,()=>`\n${inline(boot)}\n`)
  .replace('<body>','<body><div class="cos-preview-banner" role="note"><strong>BẢN XEM TRƯỚC</strong><span>Dữ liệu minh họa · Không kết nối hệ thống thật</span></div>');
html=html.replace('</head>','<style>body{padding-top:40px}.sidebar{top:40px}.header{top:40px}.cos-preview-banner{position:fixed;inset:0 0 auto;z-index:9999;height:40px;display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 12px;background:#25251f;color:#fff;font:12px system-ui}.cos-preview-banner strong{font-size:10px;letter-spacing:1px}.cos-preview-banner span{font-size:11px}@media(max-width:500px){.cos-preview-banner{gap:4px;flex-direction:column}.cos-preview-banner span{font-size:10px}}</style></head>');
const directory=new URL('../preview/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('creative-os.html',directory),html);
await writeFile(new URL('creative-os-v2.html',directory),html);
console.log('Created preview/creative-os.html and creative-os-v2.html — self-contained offline review, synthetic data only');
