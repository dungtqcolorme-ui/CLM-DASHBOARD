import type { OrganicObservation } from "./report-types";

export const organicMetricLabels = {
  reach: "Tiếp cận",
  views: "Lượt xem",
  reactions: "Cảm xúc",
  comments: "Bình luận",
  shares: "Chia sẻ",
  clicks: "Lượt nhấp",
} as const;
export type OrganicMetric = keyof typeof organicMetricLabels;

function subMillisecond(value: string) {
  const fraction = value.match(/\.(\d{4,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
  return fraction ? Number(fraction.padEnd(6, "0").slice(3)) : 0;
}

function latestFirst(a: string, b: string) {
  return Date.parse(b) - Date.parse(a) || subMillisecond(b) - subMillisecond(a);
}

function order(a: OrganicObservation, b: OrganicObservation) {
  return latestFirst(a.fetched_at, b.fetched_at)
    || latestFirst(a.created_at, b.created_at)
    || b.id.localeCompare(a.id);
}

export function latestOrganicForComparison(rows: OrganicObservation[], campaignId: string) {
  const seen = new Set<string>();
  return [...rows].sort(order).filter((row) => {
    const key = [row.team_id, row.connection_id, row.page_id, row.post_id, row.window].join("/");
    if (seen.has(key)) return false;
    seen.add(key);
    return row.eligibility === "organic" && row.campaign_id !== null &&
      (!campaignId || row.campaign_id === campaignId);
  });
}

export function matchedOrganicPeers(anchor: OrganicObservation, rows: OrganicObservation[], metric: OrganicMetric) {
  const definition = anchor.definitions[metric];
  if (anchor.eligibility !== "organic" || anchor.campaign_id === null || anchor[metric] === null || !definition?.trim()) return [];
  return rows.filter((row) => row.post_id !== anchor.post_id
    && row.eligibility === "organic" && row[metric] !== null && row.definitions[metric] === definition
    && row.team_id === anchor.team_id && row.campaign_id === anchor.campaign_id
    && row.connection_id === anchor.connection_id && row.page_id === anchor.page_id
    && row.content_line === anchor.content_line && row.format === anchor.format && row.window === anchor.window);
}
