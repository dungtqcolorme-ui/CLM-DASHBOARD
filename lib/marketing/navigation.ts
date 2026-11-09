export const MARKETING_NAV = [
  { href: "/marketing", label: "Marketing Overview", icon: "overview" },
  { href: "/marketing/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/marketing/agent", label: "AI Agent & Ideas", icon: "agent" },
  { href: "/marketing/studio", label: "Creative Studio", icon: "studio" },
  { href: "/marketing/calendar", label: "Content Calendar", icon: "calendar" },
  { href: "/marketing/assets", label: "Asset & Template Library", icon: "assets" },
  { href: "/marketing/intelligence", label: "Intelligence & Reports", icon: "intelligence" },
  { href: "/marketing/approvals", label: "Approval Inbox", icon: "approvals" },
] as const;

const dashboardPages = ["doingoai", "truyenthong", "anpham", "hocbong", "baocao", "phoihop", "tailieu", "taikhoan"];

export function dashboardPage(value: unknown): string | null {
  return typeof value === "string" && dashboardPages.includes(value) ? value : null;
}

export function isMarketingPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000 || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  const rawPath = value.split(/[?#]/)[0];
  if (rawPath !== "/marketing" && !rawPath.startsWith("/marketing/")) return false;
  // No encoded separators/dot segments: a return destination must remain within Marketing.
  if (/%(?:2e|2f|5c|00)/i.test(rawPath) || rawPath.split("/").some((part) => part === "." || part === "..")) return false;
  try {
    const url = new URL(value, "https://clm.invalid");
    return url.origin === "https://clm.invalid" && url.pathname === rawPath;
  } catch { return false; }
}

export function isMarketingActive(pathname: string, href: string) {
  const path = pathname.split(/[?#]/)[0];
  return href === "/marketing" ? path === href : path === href || path.startsWith(`${href}/`);
}
