/** URL context is applied once per navigation, never on a workspace refresh.
 * This lets an explicit picker update local context while router.replace is
 * still pending without a response for the old URL reverting that selection.
 */
export function reconcileCampaignNavigation(previousKey: string, profileId: string, pathname: string, search: string, visibleCampaignIds: readonly string[]) {
  const key = `${profileId}:${pathname}?${search}`;
  if (key === previousKey) return { key, selection: undefined };
  const query = new URLSearchParams(search).get("campaign");
  const candidate = pathname.match(/^\/marketing\/campaigns\/([^/]+)$/)?.[1] || query;
  return { key, selection: candidate && visibleCampaignIds.includes(candidate) ? candidate : undefined };
}
