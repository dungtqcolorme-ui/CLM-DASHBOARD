import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { projectCalendarEvidence, type CalendarApprovalRow, type CalendarIncidentRow, type CalendarJobRow } from "@/lib/marketing/calendar-domain";
import { marketingErrorResponse, marketingResponse, readMarketingRows } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    const [jobs, approvals, incidents] = await Promise.all([
      readMarketingRows(client, "marketing_publishing_jobs", "id,team_id,campaign_id,content_id,candidate_id,approval_id,connection_id,status,scheduled_for,remote_id,receipt,created_at", 1000),
      readMarketingRows(client, "marketing_approval_snapshots", "id,team_id,content_id,approver_id,content_version,snapshot,created_at", 1000),
      readMarketingRows(client, "marketing_publishing_incidents", "id,team_id,campaign_id,content_id,job_id,severity,status,created_at", 1000),
    ]);
    return marketingResponse(projectCalendarEvidence(
      jobs as unknown as CalendarJobRow[], approvals as unknown as CalendarApprovalRow[], incidents as unknown as CalendarIncidentRow[],
    ));
  } catch (error) { return marketingErrorResponse(error); }
}
