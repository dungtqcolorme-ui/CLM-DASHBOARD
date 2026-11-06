import type { AuthProfile } from "@/lib/authTypes";

export type CampaignStatus = "draft" | "pending_activation" | "active" | "paused" | "emergency_hold" | "completed" | "archived";
export type ContentLine = "ColorMAP" | "Sharing" | "Meme" | "InsideME";
export type ContentMix = Record<ContentLine, number>;
export type ProductionStatus = "not_started" | "writing" | "designing" | "editing" | "ready";
export type PublishingStatus = "draft" | "in_review" | "changes_requested" | "approved" | "scheduled" | "published" | "failed" | "cancelled";
export type KpiDraft = { name: string; target: number | null; unit: string };
export type KpiRevisionProposal = {
  version: number;
  targets: KpiDraft[];
  previous_targets: KpiDraft[];
  reason: string;
  proposed_by: string;
  proposed_at: string;
};
export type KpiRevision = KpiRevisionProposal & {
  proposal_version: number;
  confirmed_by: string;
  confirmed_at: string;
};
export type MarketingTeam = { id: string; name: string; creator_id: string; created_at: string };
export type MarketingMembership = { team_id: string; user_id: string; created_at: string };
export type MarketingCampaign = {
  id: string; team_id: string; name: string; kind: "seasonal" | "always_on";
  status: CampaignStatus; objective: string; audience: string; message: string;
  start_date: string | null; end_date: string | null; creator_id: string;
  content_mix: ContentMix; plan: string; kpi_draft: KpiDraft[];
  official_kpis: KpiDraft[] | null; activated_by: string | null;
  kpi_revision_version?: number;
  pending_kpi_revision?: KpiRevisionProposal | null;
  effective_kpi_revision?: KpiRevision | null;
  activated_at: string | null; hold_reason: string | null;
  version: number; created_at: string; updated_at: string;
};
export type MarketingContent = {
  id: string; campaign_id: string; team_id: string; creator_id: string;
  assignee_id: string | null; title: string; caption: string; content_line: ContentLine;
  production_status: ProductionStatus; publishing_status: PublishingStatus;
  production_due_at: string | null; review_due_at: string | null;
  proposed_publish_at: string | null; version: number; created_at: string; updated_at: string;
};
export type MarketingRevision = {
  id: string; team_id: string; campaign_id: string; entity_type: "campaign" | "content" | "campaign_kpi";
  entity_id: string; version: number; action: string; actor_id: string;
  snapshot: Record<string, unknown>; created_at: string;
};
export type MarketingCapability = { status: "not_connected" | "not_configured"; label: string; detail: string };
export type MarketingWorkspace = {
  profile: AuthProfile; teams: MarketingTeam[]; memberships: MarketingMembership[];
  campaigns: MarketingCampaign[]; contentItems: MarketingContent[]; revisions: MarketingRevision[];
  capabilities: Record<"meta" | "drive" | "agent" | "render", MarketingCapability>;
};
export type CampaignInput = Pick<MarketingCampaign, "team_id" | "name" | "kind" | "objective" | "audience" | "message" | "start_date" | "end_date">;
export type ContentInput = Pick<MarketingContent, "campaign_id" | "title" | "caption" | "content_line" | "assignee_id" | "production_status" | "production_due_at" | "review_due_at" | "proposed_publish_at">;
export type MarketingCommand =
  | { action: "create_team"; name: string }
  | { action: "set_member"; team_id: string; user_id: string; enabled: boolean }
  | ({ action: "create_campaign" } & CampaignInput)
  | ({ action: "update_campaign"; id: string; expected_version: number } & Omit<CampaignInput, "team_id">)
  | { action: "update_plan"; id: string; expected_version: number; content_mix: ContentMix; plan: string; kpi_draft: KpiDraft[] }
  | { action: "propose_kpi_revision"; id: string; expected_kpi_version: number; reason: string; targets: KpiDraft[] }
  | { action: "confirm_kpi_revision"; id: string; expected_kpi_version: number; confirmed: true }
  | { action: "submit_activation" | "activate_campaign" | "pause_campaign" | "resume_campaign" | "complete_campaign" | "archive_campaign"; id: string; expected_version: number }
  | { action: "emergency_hold"; id: string; expected_version: number; reason: string }
  | ({ action: "create_content" } & ContentInput)
  | ({ action: "update_content"; id: string; expected_version: number } & Omit<ContentInput, "campaign_id">)
  | { action: "submit_review" | "request_changes"; id: string; expected_version: number; reason?: string };
