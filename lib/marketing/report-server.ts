import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {databaseError,readMarketingRows} from "@/lib/marketing/server";
import {MarketingError} from "@/lib/marketing/domain";
import type {MarketingReport,ReportShareApproval,ReportWorkspace} from "@/lib/marketing/report-types";
export async function readReportWorkspace(client:SupabaseClient):Promise<ReportWorkspace>{const [reports,versions,shareApprovals,observations,insights]=await Promise.all([readMarketingRows(client,"marketing_reports","*",500),readMarketingRows(client,"marketing_report_versions","*",2000),readMarketingRows(client,"marketing_report_share_approvals","*",1000),readMarketingRows(client,"marketing_organic_observations","*",3000),readMarketingRows(client,"marketing_insights","*",1000)]);return {reports,versions,shareApprovals,observations,insights,capabilities:{organic_sync:"not_configured",ai_narrative:"not_configured"}} as unknown as ReportWorkspace;}
export async function readExportReport(client:SupabaseClient,id:string,version:number,audience:"internal"|"external"):Promise<MarketingReport>{
 const {data,error}=await client.from("marketing_report_versions").select("*").eq("report_id",id).eq("version",version).maybeSingle();if(error)databaseError(error);
 if(!data?.snapshot)throw new MarketingError("Phiên bản báo cáo không có trong phạm vi truy cập.",404,"not_found");const report=data.snapshot as MarketingReport;
 if(report.id!==id||report.version!==version)throw new MarketingError("Phiên bản lưu không khớp.",409,"conflict");
 if(audience==="external"){const {data:approval,error:approvalError}=await client.from("marketing_report_share_approvals").select("*").eq("report_id",id).eq("report_version",version).maybeSingle();if(approvalError)databaseError(approvalError);const a=approval as ReportShareApproval|null;const narrativeHash=createHash("sha256").update(report.narrative,"utf8").digest("hex");if(!a||a.metrics_hash!==report.metrics_hash||a.narrative_hash!==narrativeHash)throw new MarketingError("Phiên bản này chưa được Leader/Admin duyệt chia sẻ bên ngoài.",403,"share_not_approved");}
 return report;
}
