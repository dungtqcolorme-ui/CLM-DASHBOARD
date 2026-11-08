import { MarketingError, parseMarketingCommand, utcToVietnamLocal, vietnamLocalToUtc } from "@/lib/marketing/domain";
import { inputDate } from "@/lib/marketing/input";
import type { MarketingCampaign, MarketingCommand, MarketingContent } from "./types";

export function canMoveCalendarContent(item: MarketingContent, campaign: MarketingCampaign | undefined, canWrite: boolean) {
  return canWrite && Boolean(campaign && campaign.id === item.campaign_id && campaign.team_id === item.team_id
    && ["draft", "active"].includes(campaign.status)) && ["draft", "changes_requested"].includes(item.publishing_status);
}

export function calendarDropTime(previousUtc: string | null, targetDay: string): string {
  return `${inputDate(targetDay)}T${previousUtc ? utcToVietnamLocal(previousUtc).slice(11) : "09:00"}`;
}

export function calendarScheduleCommand(item: MarketingContent, localTime: string): MarketingCommand {
  if (!["draft", "changes_requested"].includes(item.publishing_status)) {
    throw new MarketingError("Chỉ đổi giờ đề xuất của bản nháp hoặc nội dung cần chỉnh sửa.", 409, "content_locked");
  }
  const proposed = vietnamLocalToUtc(localTime);
  if (!proposed) throw new MarketingError("Chọn giờ đăng đề xuất trước khi lưu.");
  return parseMarketingCommand({
    action: "update_content", id: item.id, expected_version: item.version,
    title: item.title, caption: item.caption, content_line: item.content_line, assignee_id: item.assignee_id,
    production_status: item.production_status, production_due_at: item.production_due_at,
    review_due_at: item.review_due_at, proposed_publish_at: proposed,
  });
}
