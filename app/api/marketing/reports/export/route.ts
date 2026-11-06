import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { parseReportExportQuery } from "@/lib/marketing/report-domain";
import { readExportReport } from "@/lib/marketing/report-server";
import { exportReportPdf, exportReportXlsx } from "@/lib/marketing/report-export";
import { databaseError, marketingErrorResponse } from "@/lib/marketing/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    const { id, version, audience, format } = parseReportExportQuery(new URL(request.url).searchParams);
    const { error } = await client.rpc("marketing_reserve_report_export");
    if (error) databaseError(error);
    // Authorize the exact report after the budget request, under current RLS.
    const report = await readExportReport(client, id, version, audience);

    const bytes = format === "pdf" ? await exportReportPdf(report, audience) : await exportReportXlsx(report, audience);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename=report-${id}-v${version}-${audience}.${format}`,
    } });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
