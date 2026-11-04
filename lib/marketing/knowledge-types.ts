import type { ContentLine } from "@/lib/marketing/types";

export type SourceKind = "member_brief" | "official_website" | "approved_history" | "public_reference";
export type ResearchMode = "auto" | "internal_only" | "deep_research";
export type ClaimType = "fact" | "hypothesis" | "missing_verification";
export type FactCategory = "general" | "course" | "offer" | "scholarship" | "event" | "people";
export type EvidenceRef = { fact_id: string; fact_version: number; source_id: string; source_version: number };
export type KnowledgeSource = {
  id: string; team_id: string; title: string; kind: SourceKind; url: string | null;
  excerpt: string; author: string | null; published_at: string | null; collected_at: string;
  status: "pending" | "approved" | "revoked"; creator_id: string;
  reviewer_id: string | null; reviewed_at: string | null; version: number;
  created_at: string; updated_at: string;
};
export type KnowledgeFact = {
  id: string; team_id: string; source_id: string; claim: string; claim_type: ClaimType;
  category: FactCategory; valid_until: string | null; status: "pending" | "verified" | "disputed";
  creator_id: string; reviewer_id: string | null; reviewed_at: string | null;
  version: number; created_at: string; updated_at: string;
};
export type ResearchRun = {
  id: string; campaign_id: string; team_id: string; mode: ResearchMode; query: string;
  strategy: "internal" | "internal_fallback" | "external_unavailable";
  status: "completed" | "not_configured"; evidence: EvidenceRef[]; warnings: string[];
  creator_id: string; created_at: string;
};
export type MarketingIdea = {
  id: string; campaign_id: string; team_id: string; title: string; objective: string;
  hook: string; caption: string; content_line: ContentLine; rationale: string;
  evidence: EvidenceRef[]; source_run_id: string | null; origin: "manual" | "rule_based";
  planned_for: string | null; status: "proposed" | "selected" | "dismissed";
  content_id: string | null; creator_id: string; version: number;
  created_at: string; updated_at: string;
};
export type DnaScope = "master" | "team" | "post";
export type DnaPayload = { voice: string; hooks: string; cta: string; visual_notes: string; hard_rules: string[] };
export type DnaProfile = {
  id: string; scope: DnaScope; team_id: string | null; content_id: string | null;
  payload: DnaPayload; version: number; creator_id: string;
  approved_by: string; approved_at: string; created_at: string; updated_at: string;
};
export type DnaProposal = {
  id: string; scope: DnaScope; team_id: string | null; content_id: string | null;
  base_version: number; previous: DnaPayload | null; proposed: DnaPayload; reason: string;
  status: "pending" | "applied" | "rejected"; creator_id: string; reviewer_id: string | null;
  reviewed_at: string | null; version: number; created_at: string; updated_at: string;
};
export type DnaVersion = {
  id: string; profile_id: string; scope: DnaScope; team_id: string | null;
  content_id: string | null; version: number; payload: DnaPayload;
  proposal_id: string; actor_id: string; created_at: string;
};
export type KnowledgeWorkspace = {
  sources: KnowledgeSource[]; facts: KnowledgeFact[]; runs: ResearchRun[]; ideas: MarketingIdea[];
  dnaProfiles: DnaProfile[]; dnaProposals: DnaProposal[]; dnaVersions: DnaVersion[];
  capabilities: { internal_research: "available"; external_research: "not_configured"; ai_generation: "not_configured" };
};
export type SourceInput = Pick<KnowledgeSource, "team_id" | "title" | "kind" | "url" | "excerpt" | "author" | "published_at">;
export type FactInput = Pick<KnowledgeFact, "source_id" | "claim" | "claim_type" | "category" | "valid_until">;
export type IdeaInput = Pick<MarketingIdea, "campaign_id" | "title" | "objective" | "hook" | "caption" | "content_line" | "rationale" | "planned_for"> & { fact_ids: string[] };
export type KnowledgeCommand =
  | ({ action: "create_source" } & SourceInput)
  | { action: "review_source"; id: string; expected_version: number; decision: "approve" | "revoke"; reason: string }
  | ({ action: "create_fact" } & FactInput)
  | { action: "review_fact"; id: string; expected_version: number; decision: "verify" | "dispute"; reason: string }
  | { action: "run_research"; campaign_id: string; mode: ResearchMode; query: string }
  | { action: "generate_internal_ideas"; run_id: string; content_line: ContentLine }
  | ({ action: "create_idea" } & IdeaInput)
  | ({ action: "update_idea"; id: string; expected_version: number } & Omit<IdeaInput, "campaign_id">)
  | { action: "select_idea" | "dismiss_idea"; id: string; expected_version: number }
  | { action: "propose_dna"; scope: DnaScope; team_id: string | null; content_id: string | null; base_version: number; proposed: DnaPayload; reason: string }
  | { action: "apply_dna"; id: string; expected_version: number; confirmed: true }
  | { action: "reject_dna"; id: string; expected_version: number; reason: string };
