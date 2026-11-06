import {inflateSync} from 'node:zlib';import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import {createHash} from 'node:crypto';import {routeLoader} from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
const report=()=>({id,team_id:id,campaign_id:null,kind:'weekly',title:'Báo cáo sinh viên – kỹ năng thiết kế',period_start:'2026-11-02',period_end:'2026-11-08',narrative:'Nội dung tiếng Việt: sáng tạo, trách nhiệm, sinh viên.\n=HYPERLINK("https://evil.test","x")',metrics_hash:'a'.repeat(64),creator_id:id,version:2,created_at:'2026-11-05T00:00:00Z',updated_at:'2026-11-05T00:00:00Z',metrics:{as_of:'2026-11-05T00:00:00Z',period_start:'2026-11-02',period_end:'2026-11-08',production:{planned:3,ready:1,reviewed:null,published:0,on_time:null,on_time_denominator:0,review_hours:null,review_sample_size:0},organic:{eligible_posts:0,excluded_paid:0,unknown_posts:0,reach:null,views:null,reactions:null,comments:null,shares:null,clicks:null,engagement_rate:null,numerator:null,denominator:null,definitions:{reach:'Unique organic people'},references:[],observations:[]},coverage:{production_tracking_started_at:'2026-11-05T00:00:00Z',production:'Actual in-app data',organic:'Chưa có nguồn được xác minh',warnings:['Không thể suy luận Organic từ tiến độ sản xuất.']}}});
let exp={};try{exp=routeLoader({})('lib/marketing/report-export.ts');}catch(e){if(e.code!=='ENOENT')throw e;}
test('PDF export is real binary with embedded Vietnamese font and Unicode mapping',async()=>{assert.equal(typeof exp.exportReportPdf,'function');const bytes=await exp.exportReportPdf(report(),'internal');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const text=bytes.toString('latin1');assert.match(text,/\/FontFile2/);assert.match(text,/\/ToUnicode/);assert.ok(bytes.length>5000);});
test('XLSX export readback retains null labels/numeric zero and writes user narrative as literal text without formulas/hyperlinks',async()=>{assert.equal(typeof exp.exportReportXlsx,'function');const r=report(),bytes=await exp.exportReportXlsx(r,'internal');assert.equal(bytes.subarray(0,2).toString(),'PK');const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);const values=[];wb.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);assert.notEqual(cell.type,ExcelJS.ValueType.Hyperlink);values.push(cell.value);})));assert.ok(values.includes('Chưa có dữ liệu'));assert.ok(values.includes(0));assert.ok(values.includes(r.narrative));assert.ok(values.some(x=>typeof x==='string'&&x.includes('NỘI BỘ')));});
function fixture(approved, budgetError = null, revokeOnReserve = false) {
  const r = report();
  let hasAccess = true;
  const client = {
    async rpc(name) {
      assert.equal(name, 'marketing_reserve_report_export');
      if (revokeOnReserve) hasAccess = false;
      return { error: budgetError };
    },
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        maybeSingle() { return query; },
        then(resolve) {
          const approval = approved ? {
            report_id: id, report_version: 2, metrics_hash: r.metrics_hash,
            narrative_hash: createHash('sha256').update(r.narrative).digest('hex'),
          } : null;
          const row = table === 'marketing_report_versions' ? { report_id: id, version: 2, snapshot: r } : approval;
          const data = hasAccess && row && filters.every(([key, value]) => row[key] === value) ? row : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return routeLoader({ '@/lib/dashboardSession': {
    getDashboardRequestIdentity: async (request) => {
      if (request.headers.get('authorization') !== 'Bearer valid') throw Object.assign(Error('private'), { status: 401 });
      return { profile: { id, roles: ['PR Representative'] }, client };
    },
  } })('app/api/marketing/reports/export/route.ts');
}
test('Report export endpoint verifies identity, exact audience/version approval and does not cache private bytes',async()=>{const route=fixture(false);assert.equal(typeof route.GET,'function');const query='?id='+id+'&version=2&audience=internal&format=pdf';assert.equal((await route.GET(new Request('https://clm.example/api/marketing/reports/export'+query))).status,401);const request=(q)=>new Request('https://clm.example/api/marketing/reports/export'+q,{headers:{Authorization:'Bearer valid'}});const internal=await route.GET(request(query));assert.equal(internal.status,200);assert.equal(internal.headers.get('content-type'),'application/pdf');assert.match(internal.headers.get('cache-control'),/no-store/);assert.equal((await route.GET(request(query.replace('internal','external')))).status,403);assert.equal((await fixture(true).GET(request(query.replace('internal','external')))).status,200);});

// Read the single embedded-font PDFKit text streams through their actual ToUnicode map.
// Empty shaping-glyph mappings are valid and contribute no text.
function pdfText(bytes){
 const streams=[];for(const match of bytes.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){try{streams.push(inflateSync(Buffer.from(match[1],'latin1')).toString('latin1'));}catch{/* Font/image or uncompressed stream is irrelevant to this readback. */}}
 const mapping=new Map();for(const stream of streams.filter(x=>x.includes('beginbfrange')))for(const range of stream.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*\[([^\]]*)\]/gi)){let glyph=parseInt(range[1],16);for(const entry of range[3].matchAll(/<([0-9a-f\s]*)>/gi)){const hex=entry[1].replace(/\s/g,'');let text='';for(let i=0;i<hex.length;i+=4)text+=String.fromCharCode(parseInt(hex.slice(i,i+4),16));mapping.set(glyph++,text);}}
 return streams.filter(x=>x.includes(' TJ')||x.includes(' Tj')).map(stream=>[...stream.matchAll(/<([0-9a-f]+)>/gi)].map(match=>{let text='';for(let i=0;i<match[1].length;i+=4)text+=mapping.get(parseInt(match[1].slice(i,i+4),16))??'';return text;}).join('')).join('\n');
}
test('PDF and XLSX readback distinguish unknown historical reviews, snapshot time and immutable source freshness/definitions',async()=>{
 const r=report();r.metrics.organic.observations=[{id:'22222222-2222-4222-8222-222222222222',connection_id:id,page_id:'page123',post_id:'post456',window:'7d',eligibility:'organic',source_reference:'fixture:october:7d',fetched_at:'2026-10-08T00:00:00Z',definitions:{reach:'Provider measured people in first seven days',comments:'Provider total comments in first seven days'}}];
 const bytes=await exp.exportReportPdf(r,'internal'),text=pdfText(bytes);
 for(const value of ['Đã qua review: Chưa có dữ liệu','Chốt báo cáo:',r.metrics.organic.observations[0].id,r.metrics.organic.observations[0].fetched_at,r.metrics.organic.observations[0].source_reference,r.metrics.organic.observations[0].definitions.reach])assert.ok(text.includes(value),`PDF readback missing ${value}`);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exp.exportReportXlsx(r,'internal'));
 const metricRows=[];wb.getWorksheet('Chỉ số').eachRow(row=>metricRows.push(row.values));assert.equal(metricRows.find(row=>row[2]==='Đã qua review')[3],'Chưa có dữ liệu');
 const evidence=[];wb.getWorksheet('Quan sát nguồn').eachRow(row=>row.eachCell(cell=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);assert.notEqual(cell.type,ExcelJS.ValueType.Hyperlink);evidence.push(cell.value);}));
 for(const value of [r.metrics.organic.observations[0].id,r.metrics.organic.observations[0].fetched_at,r.metrics.organic.observations[0].source_reference,r.metrics.organic.observations[0].definitions.reach])assert.ok(evidence.includes(value));
 const summary=[];wb.getWorksheet('Tổng quan').eachRow(row=>summary.push(row.values));assert.ok(summary.some(row=>row[1]==='Chốt báo cáo UTC'&&row[2]===r.metrics.as_of));
});

test('Report export respects the actor budget before generating bytes', async () => {
  const route=fixture(true,{code:'P0429',message:'private counter'});
  const response=await route.GET(new Request('https://clm.example/api/marketing/reports/export?id='+id+'&version=2&audience=external&format=pdf',{headers:{Authorization:'Bearer valid'}}));
  assert.equal(response.status,429);
  assert.match(response.headers.get('content-type'),/application\/json/);
  const body=await response.json();
  assert.equal(body.code,'rate_limited');
  assert.doesNotMatch(JSON.stringify(body),/private counter/);
});

test('Report export re-evaluates scoped access after the budget reservation', async () => {
  const route = fixture(true, null, true);
  const response = await route.GET(new Request('https://clm.example/api/marketing/reports/export?id='+id+'&version=2&audience=internal&format=xlsx', {
    headers: { Authorization: 'Bearer valid' },
  }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'not_found');
});
