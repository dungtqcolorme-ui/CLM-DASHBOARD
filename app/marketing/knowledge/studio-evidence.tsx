"use client";
import Link from "next/link";
import { isEvidenceCurrent } from "@/lib/marketing/knowledge-domain";
import { useMarketing } from "../workspace";
import { Evidence, KnowledgeState } from "./shared";
import { useKnowledge } from "./use-knowledge";

export function SelectedIdeaEvidence({ contentId, campaignId }: { contentId?: string; campaignId?: string }) {
  const { href } = useMarketing();
  const agentHref = href(`/marketing/agent${campaignId ? `?campaign=${campaignId}` : ""}`);
  return <div className="mk-knowledge"><p className="mk-muted">AI và nghiên cứu bên ngoài chưa cấu hình. Nghiên cứu nội bộ và đề xuất theo quy tắc đã có trong Agent & Ideas.</p>{contentId ? <ContentIdeaEvidence contentId={contentId} /> : <p>Chọn một ý tưởng để lưu dẫn chứng cùng bản nháp nội dung.</p>}<Link className="mk-button" href={agentHref}>Mở Agent & Ideas</Link></div>;
}

function ContentIdeaEvidence({ contentId }: { contentId: string }) {
  const controller = useKnowledge(); const { data } = useMarketing();
  const idea = controller.data?.ideas.find((entry) => entry.content_id === contentId);
  const stale = !!idea?.evidence.some((ref) => !isEvidenceCurrent(ref, controller.data!.facts, controller.data!.sources, controller.now));
  return <KnowledgeState controller={controller}>{controller.data && (idea ? <div><h3>Ý tưởng gốc</h3><p>{stale && idea.origin === "rule_based" ? "Dẫn chứng của ý tưởng đã thay đổi" : idea.title}</p><p className="mk-k-meta">{idea.origin === "rule_based" ? "Đề xuất theo quy tắc nội bộ · không phải AI" : "Ý tưởng thủ công"}</p><p>Campaign: {data.campaigns.find((campaign) => campaign.id === idea.campaign_id)?.name || "Không khả dụng"}</p>{!stale && idea.rationale && <p>Lý do đề xuất: {idea.rationale}</p>}{stale && <p role="status" className="mk-notice">Dẫn chứng không còn hiện hành hoặc nguồn đã thu hồi. Bản nháp vẫn được giữ và cần người có quyền kiểm tra lại. Caption không tự thay đổi; thông tin này không cấp quyền duyệt hoặc xuất bản.</p>}<Evidence refs={idea.evidence} data={controller.data} />{idea.evidence.map((ref) => { if (!isEvidenceCurrent(ref, controller.data!.facts, controller.data!.sources, controller.now)) return null; const source = controller.data!.sources.find((entry) => entry.id === ref.source_id); return source?.url ? <p key={ref.fact_id}><a href={source.url} target="_blank" rel="noopener noreferrer">Nguồn: {source.title}</a></p> : null; })}<p className="mk-muted">Chỉ đọc · Dẫn chứng được kiểm tra theo trạng thái, phiên bản và thời hạn hiện tại.</p></div> : <p className="mk-muted">Bản nháp này không có liên kết với ý tưởng đã chọn trong phạm vi truy cập hiện tại. Bạn có thể kiểm tra nguồn trong Agent & Ideas.</p>)}</KnowledgeState>;
}
