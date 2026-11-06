import type { MarketingWorkspace } from "@/lib/marketing/types";

type Access = Pick<MarketingWorkspace, "profile" | "memberships">;

export function phaseFiveScope(data: Access) {
  const roles = [...data.profile.roles].sort();
  const teams = data.memberships.filter((membership) => membership.user_id === data.profile.id).map((membership) => membership.team_id).sort();
  return JSON.stringify([data.profile.id, roles, teams]);
}

export function phaseFiveCanWriteTeam(data: Access, teamId: string) {
  const { roles } = data.profile;
  return roles.includes("Admin") || (roles.some((role) => role === "PR Leader" || role === "PR Representative")
    && data.memberships.some((membership) => membership.user_id === data.profile.id && membership.team_id === teamId));
}
