import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeWorkspace } from "@/lib/marketing/knowledge-types";
import { isEvidenceCurrent } from "@/lib/marketing/knowledge-domain";
import { readMarketingRows } from "@/lib/marketing/server";

export const KNOWLEDGE_CAPABILITIES: KnowledgeWorkspace["capabilities"] = {
  internal_research: "available", external_research: "not_configured", ai_generation: "not_configured",
};

export async function readKnowledgeWorkspace(client: SupabaseClient): Promise<KnowledgeWorkspace> {
  const [sources, facts, runs, ideas, dnaProfiles, dnaProposals, dnaVersions] = await Promise.all([
    readMarketingRows(client, "marketing_sources", "*", 500),
    readMarketingRows(client, "marketing_facts", "*", 2000),
    readMarketingRows(client, "marketing_research_runs", "*", 500),
    readMarketingRows(client, "marketing_ideas", "*", 2000),
    readMarketingRows(client, "marketing_dna_profiles", "*", 500),
    readMarketingRows(client, "marketing_dna_proposals", "*", 1000),
    readMarketingRows(client, "marketing_dna_versions", "*", 2000),
  ]);
  const workspace = { sources, facts, runs, ideas, dnaProfiles, dnaProposals, dnaVersions, capabilities: KNOWLEDGE_CAPABILITIES } as unknown as KnowledgeWorkspace;
  // The database retains audit/history. The runtime read surface never serves
  // revoked source excerpts or treats a cached generated quote as fresh evidence.
  const readableSources = new Set(workspace.sources.filter((source) => source.status !== "revoked").map((source) => source.id));
  const clock = Date.now();
  return {
    ...workspace,
    sources: workspace.sources.map((source) => source.status === "revoked" ? { ...source, excerpt: "" } : source),
    facts: workspace.facts.map((fact) => !readableSources.has(fact.source_id) ? { ...fact, claim: "" } : fact),
    runs: workspace.runs.map((run) => run.evidence.some((ref) => !isEvidenceCurrent(ref, workspace.facts, workspace.sources, clock))
      ? { ...run, warnings: [...run.warnings, "Có dẫn chứng đã thay đổi, hết hạn hoặc bị thu hồi. Không tái sử dụng kết quả cũ."] } : run),
    ideas: workspace.ideas.map((idea) => idea.origin === "rule_based" && idea.evidence.some((ref) => !isEvidenceCurrent(ref, workspace.facts, workspace.sources, clock))
      ? { ...idea, title: "Ý tưởng cần kiểm tra lại dẫn chứng", objective: "", hook: "", caption: "", rationale: "Dẫn chứng đã thay đổi, hết hạn hoặc bị thu hồi. Cần kiểm tra lại trước khi triển khai." } : idea),
  };
}
