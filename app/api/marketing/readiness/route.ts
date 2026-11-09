import { dashboardSupabaseUrl, getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { readMarketingReadiness } from "@/lib/marketing/readiness";
import { marketingErrorResponse, marketingResponse } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const { profile, client } = await getDashboardRequestIdentity(request);
    if (!profile.roles.includes("Admin")) {
      throw new MarketingError("Chỉ Admin được xem chẩn đoán Marketing.", 403, "forbidden");
    }
    return marketingResponse(await readMarketingReadiness(client, process.env, dashboardSupabaseUrl()));
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
