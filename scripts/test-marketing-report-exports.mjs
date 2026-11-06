/** Local synthetic binary-export QA; no provider, production database or real metrics. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import ExcelJS from 'exceljs';
import {routeLoader} from '../tests/helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
const out=resolve('tmp/marketing/export-qa');await mkdir(out,{recursive:true});
const {exportReportPdf,exportReportXlsx}=routeLoader({})('lib/marketing/report-export.ts');
const report={id,team_id:id,campaign_id:null,kind:'weekly',title:'DỮ LIỆU MINH HỌA · KIỂM THỬ EXPORT',period_start:'2026-11-02',period_end:'2026-11-08',narrative:'Báo cáo kiểm thử tiếng Việt: sinh viên học kỹ năng thiết kế, sáng tạo và trách nhiệm. Đây là dữ liệu minh họa trong môi trường local.',metrics_hash:'a'.repeat(64),creator_id:id,version:1,created_at:'2026-11-05T00:00:00Z',updated_at:'2026-11-05T00:00:00Z',metrics:{as_of:'2026-11-05T00:00:00Z',period_start:'2026-11-02',period_end:'2026-11-08',production:{planned:3,ready:1,reviewed:null,published:0,on_time:null,on_time_denominator:0,review_hours:null,review_sample_size:0},organic:{eligible_posts:0,excluded_paid:0,unknown_posts:0,reach:null,views:null,reactions:null,comments:null,shares:null,clicks:null,engagement_rate:null,numerator:null,denominator:null,definitions:{reach:'Số người tiếp cận Organic được nguồn xác minh'},references:[],observations:[]},coverage:{production_tracking_started_at:'2026-11-05T00:00:00Z',production:'Tiến độ minh họa; lịch sử duyệt chưa đủ.',organic:'Chưa kết nối nguồn được xác minh',warnings:['Không suy luận hiệu quả Organic từ tiến độ sản xuất.']}}};
const pdf=await exportReportPdf(report,'internal');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');await writeFile(resolve(out,'normal.pdf'),pdf);
const long={...report,narrative:(report.narrative+'\n').repeat(60)};const large=await exportReportPdf(long,'internal');await writeFile(resolve(out,'long.pdf'),large);
const xlsx=await exportReportXlsx(long,'internal');const wb=new ExcelJS.Workbook();await wb.xlsx.load(xlsx);assert.equal(wb.getWorksheet('Tổng quan').getCell('B7').value,long.narrative);await writeFile(resolve(out,'long.xlsx'),xlsx);
console.log(JSON.stringify({fixture:'Synthetic local export QA only',normalPdfBytes:pdf.length,longPdfBytes:large.length,xlsxBytes:xlsx.length,output:out}));
