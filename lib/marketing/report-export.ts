import "server-only";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "node:path";
import {existsSync} from "node:fs";
import {metricLabel} from "@/lib/marketing/report-domain";
import type {MarketingReport} from "@/lib/marketing/report-types";
type Row=[string,string,number|string,string];
function rows(report:MarketingReport):Row[]{const p=report.metrics.production,o=report.metrics.organic;return [
 ["Sản xuất","Nội dung được tạo",p.planned,"bài"],["Sản xuất","Sẵn sàng",p.ready,"bài"],["Sản xuất","Đã qua review",p.reviewed===null?metricLabel(null):p.reviewed,"mốc review"],["Sản xuất","Đã xuất bản có receipt",p.published,"bài"],
 ["Sản xuất","Đúng hạn (mẫu có hạn)",p.on_time===null?metricLabel(null):p.on_time+"/"+p.on_time_denominator,"bài/mẫu"],["Sản xuất","Thời gian review trung bình",p.review_hours===null?metricLabel(null):p.review_hours,"giờ; mẫu "+p.review_sample_size],
 ["Organic","Bài đủ điều kiện",o.eligible_posts,"bài; cửa sổ 7d"],["Organic","Paid bị loại",o.excluded_paid,"bài"],["Organic","Chưa xác minh Organic",o.unknown_posts,"bài"],
 ...(["reach","views","reactions","comments","shares","clicks","engagement_rate"]as const).map(key=>["Organic",key==="engagement_rate"?"Engagement rate":key,o[key]===null?metricLabel(null):o[key]!,key==="engagement_rate"?"%":"theo định nghĩa nguồn"]as Row),
 ["Organic","Tử số engagement",o.numerator===null?metricLabel(null):o.numerator,"reactions + comments + shares"],["Organic","Mẫu số engagement",o.denominator===null?metricLabel(null):o.denominator,"reach cùng mẫu"],
 ];}
const stamp=(report:MarketingReport,audience:"internal"|"external")=>audience==="internal"?"NỘI BỘ - không thay thế bản duyệt chia sẻ":"BẢN ĐÃ DUYỆT CHIA SẺ - phiên bản "+report.version;
export async function exportReportPdf(report:MarketingReport,audience:"internal"|"external"):Promise<Buffer>{
 const font=path.join(process.cwd(),"public/marketing/fonts/NotoSans-Regular.ttf");
 return new Promise((resolve,reject)=>{const doc=new PDFDocument({size:"A4",margin:48,bufferPages:true,font,info:{Title:report.title,Author:"ColorME Partnership",Subject:stamp(report,audience)}});const chunks:Buffer[]=[];doc.on("data",(v:Buffer)=>chunks.push(v));doc.on("error",reject);doc.on("end",()=>resolve(Buffer.concat(chunks)));
  try{const logo=path.join(process.cwd(),"public/colorme-logo.png");if(existsSync(logo))doc.image(logo,48,42,{fit:[68,32]});doc.fontSize(10).fillColor("#667085").text("ColorME Partnership · Marketing",128,48);doc.moveDown(2);doc.fontSize(20).fillColor("#222326").text(report.title,48,98);doc.moveDown(0.5);doc.fontSize(9).fillColor("#8a1d2a").text(stamp(report,audience));doc.fillColor("#50545c").text("Kỳ: "+report.period_start+" đến "+report.period_end+" · v"+report.version);doc.text("Chốt báo cáo: "+new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date(report.metrics.as_of))+" · giờ Việt Nam");doc.moveDown();
   let section="";for(const [group,label,value,unit]of rows(report)){if(group!==section){section=group;doc.moveDown(0.5).fontSize(13).fillColor("#222326").text(group);doc.moveDown(0.4);}doc.fontSize(10).fillColor("#222326").text(label+": "+(typeof value==="number"?metricLabel(value):value)+" · "+unit,{lineGap:3});}
   doc.moveDown(0.5).fontSize(13).text("Nhận định nội bộ");doc.moveDown(0.4).fontSize(10).text(report.narrative||"Chưa có nhận định. AI chưa cấu hình.",{lineGap:4});doc.moveDown(0.5).fontSize(13).text("Nguồn và giới hạn");doc.fontSize(9).fillColor("#50545c").text(report.metrics.coverage.production).text("Organic: "+report.metrics.coverage.organic);
   doc.text("Bắt đầu ghi nhận mốc sản xuất UTC: "+report.metrics.coverage.production_tracking_started_at);for(const warning of report.metrics.coverage.warnings)doc.text("- "+warning);for(const [key,value]of Object.entries(report.metrics.organic.definitions))doc.text(key+": "+value);doc.text("Tham chiếu: "+(report.metrics.organic.references.join(", ")||"Chưa có nguồn Organic được xác minh."));doc.moveDown().fontSize(13).fillColor("#222326").text("Quan sát nguồn đã chốt");doc.fontSize(9).fillColor("#50545c").text("Thời điểm thu thập dưới đây là độ mới của nguồn, khác thời điểm chốt báo cáo.");
   if(!report.metrics.organic.observations.length)doc.text("Chưa có quan sát nguồn cho kỳ này.");
   for(const observation of report.metrics.organic.observations){doc.moveDown(0.6).text("ID quan sát: "+observation.id).text("Thu thập nguồn UTC: "+observation.fetched_at).text("Tham chiếu nguồn: "+observation.source_reference).text("Điều kiện: "+observation.eligibility+" · cửa sổ "+observation.window).text("Kết nối: "+observation.connection_id+" · Page: "+observation.page_id+" · Bài: "+observation.post_id);for(const [key,value]of Object.entries(observation.definitions))doc.text("Định nghĩa nguồn "+key+": "+value);}
   doc.text("Không suy luận nhân quả hoặc baseline Organic từ số liệu sản xuất.");
   const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(8).fillColor("#667085").text("ColorME · "+(i+1)+"/"+range.count+" · "+(audience==="internal"?"NỘI BỘ":"ĐÃ DUYỆT"),48,doc.page.height-32,{width:doc.page.width-96,align:"right",lineBreak:false});doc.page.margins.bottom=bottom;}doc.end();
  }catch(error){reject(error);doc.end();}
 });
}
export async function exportReportXlsx(report:MarketingReport,audience:"internal"|"external"):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();wb.creator="ColorME Partnership";wb.created=new Date(report.created_at);wb.modified=new Date(report.updated_at);
 const summary=wb.addWorksheet("Tổng quan");summary.addRows([[stamp(report,audience)],["Báo cáo",report.title],["Phiên bản",report.version],["Bắt đầu",report.period_start],["Kết thúc",report.period_end],["Chốt báo cáo UTC",report.metrics.as_of],["Nhận định",report.narrative]]);
 const metrics=wb.addWorksheet("Chỉ số");metrics.addRow(["Nhóm","Chỉ số","Giá trị","Đơn vị / mẫu"]);metrics.addRows(rows(report));
 const notes=wb.addWorksheet("Nguồn và giới hạn");notes.addRows([["Bắt đầu ghi nhận mốc UTC",report.metrics.coverage.production_tracking_started_at],["Phạm vi sản xuất",report.metrics.coverage.production],["Phạm vi Organic",report.metrics.coverage.organic],...report.metrics.coverage.warnings.map(w=>["Lưu ý",w]),...Object.entries(report.metrics.organic.definitions),["Tham chiếu",(report.metrics.organic.references.join(", ")||"Chưa có dữ liệu được xác minh")]]);
 const evidence=wb.addWorksheet("Quan sát nguồn");evidence.addRow(["Quan sát đã chốt","Giá trị nguồn / thời điểm thu thập UTC"]);evidence.addRow(["Lưu ý","Thời điểm thu thập nguồn khác thời điểm chốt báo cáo. Paid và unknown là mẫu bị loại, không được cộng vào Organic."]);
 if(!report.metrics.organic.observations.length)evidence.addRow(["Quan sát","Chưa có quan sát nguồn cho kỳ này."]);
 for(const observation of report.metrics.organic.observations)evidence.addRows([["ID quan sát",observation.id],["Thu thập nguồn UTC",observation.fetched_at],["Tham chiếu nguồn",observation.source_reference],["Điều kiện",observation.eligibility],["Cửa sổ",observation.window],["Kết nối",observation.connection_id],["Page",observation.page_id],["Bài",observation.post_id],...Object.entries(observation.definitions).map(([key,value])=>["Định nghĩa nguồn "+key,value]),[]]);
 for(const sheet of wb.worksheets){sheet.views=[{state:"frozen",ySplit:1}];sheet.columns=[{width:25},{width:60},{width:25},{width:48}];sheet.eachRow((row,i)=>{row.font={name:"Arial",size:11,color:{argb:"FF222326"}};row.alignment={vertical:"top",wrapText:true};if(i===1){row.font={...row.font,bold:true,color:{argb:"FFFFFFFF"}};row.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF343842"}};}row.height=i===7&&sheet===summary?100:32;});sheet.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};}
 evidence.columns=[{width:30},{width:100}];evidence.eachRow(row=>{row.height=Math.max(32,Math.ceil(String(row.getCell(2).value??"").length/90)*16+8);});
 return Buffer.from(await wb.xlsx.writeBuffer());
}
