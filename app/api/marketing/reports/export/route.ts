import {getDashboardRequestIdentity} from "@/lib/dashboardSession";
import {parseReportExportQuery} from "@/lib/marketing/report-domain";
import {readExportReport} from "@/lib/marketing/report-server";
import {exportReportPdf,exportReportXlsx} from "@/lib/marketing/report-export";
import {marketingErrorResponse} from "@/lib/marketing/server";
export const runtime="nodejs";
export async function GET(request:Request){try{const {client}=await getDashboardRequestIdentity(request);const query=parseReportExportQuery(new URL(request.url).searchParams);const report=await readExportReport(client,query.id,query.version,query.audience);const bytes=query.format==="pdf"?await exportReportPdf(report,query.audience):await exportReportXlsx(report,query.audience);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":query.format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Disposition":"attachment; filename=report-"+query.id+"-v"+query.version+"-"+query.audience+"."+query.format}});}catch(e){return marketingErrorResponse(e);}}
