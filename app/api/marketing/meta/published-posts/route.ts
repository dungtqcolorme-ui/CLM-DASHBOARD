import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { MetaPageError, readMetaPagePosts } from "@/lib/marketing/meta-page.mjs";
import { marketingErrorResponse, marketingResponse } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const { profile } = await getDashboardRequestIdentity(request);
    if (!profile.roles.includes("Admin")) {
      throw new MarketingError("Chỉ Admin được kiểm tra bài đã đăng trên Meta.", 403, "forbidden");
    }
    const cursor = new URL(request.url).searchParams.get("after") ?? undefined;
    return marketingResponse(await readMetaPagePosts(process.env, cursor));
  } catch (error) {
    return marketingErrorResponse(error instanceof MetaPageError
      ? new MarketingError(error.message, error.status, error.code)
      : error);
  }
}
