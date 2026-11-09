export const notificationLabels = {
  review_requested: "Bài cần duyệt",
  changes_requested: "Yêu cầu chỉnh sửa",
  approved: "Bài đã duyệt",
  published: "Bài đã đăng",
  publish_failed: "Xuất bản gặp lỗi",
  critical_incident: "Sự cố xuất bản cần xử lý",
  emergency_hold: "Campaign tạm dừng khẩn cấp",
} as const;

export type MarketingNotification = {
  id: string;
  team_id: string;
  campaign_id: string;
  content_id: string | null;
  content_version: number | null;
  subject: string;
  kind: keyof typeof notificationLabels;
  created_at: string;
  read_at: string | null;
};

export type MarketingNotificationInbox = {
  items: MarketingNotification[];
  truncated: boolean;
  revision: { title: string; caption: string } | null;
};
