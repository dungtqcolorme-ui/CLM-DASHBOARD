"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Badge, Capability, ContentEditor, ContentRows, Empty, PageHeader, Panel, RevisionHistory } from "../components";
import { useMarketing } from "../workspace";
import { SelectedIdeaEvidence } from "../knowledge/studio-evidence";

export default function StudioPage() { return <Suspense fallback={<p role="status">Đang mở Studio…</p>}><Studio /></Suspense>; }
function Studio() {
  const { data, selected, canWrite, href } = useMarketing(); const search = useSearchParams(); const router = useRouter();
  const id = search.get("content"); const item = data.contentItems.find((i) => i.id === id); const campaign = data.campaigns.find((c) => c.id === (item?.campaign_id || selected));
  return <><PageHeader title="Creative Studio" description="Không gian viết caption và chuẩn bị nội dung. Phase 1 hỗ trợ bản nháp văn bản và luồng gửi duyệt thật." action={item && <Link className="mk-button" href={href("/marketing/studio?new=1")}>+ Nội dung mới</Link>} />
  {id && !item ? <Empty title="Nội dung không có trong phạm vi truy cập">Kiểm tra Campaign và quyền thành viên team trước khi mở nội dung.</Empty> : <>
  <div className="mk-studio-bar"><strong>{item?.title || "Bản nháp mới"}</strong><span>{campaign?.name || "Chọn Campaign trong biểu mẫu"}</span>{item && <><Badge status={item.production_status} /><Badge status={item.publishing_status} /><span>v{item.version}</span></>}</div>
  <div className="mk-studio"><aside className="mk-stack"><Panel title="AI & Evidence"><SelectedIdeaEvidence key={item?.id || selected || "new"} contentId={item?.id} campaignId={campaign?.id} /></Panel>{item && <Panel title="Phạm vi nội dung"><p className="mk-muted">Creator giữ nguyên sau khi tạo. Người phụ trách có thể đổi trong team.</p><small>Creator: <code>{item.creator_id}</code></small><p className="mk-muted">Facebook Partnership · chưa xác minh kết nối tài khoản.</p></Panel>}</aside>
  <div className="mk-stack"><Panel title={item ? "Caption & kế hoạch sản xuất" : "Tạo bản nháp nội dung"}>{!canWrite && !item ? <Empty title="Chế độ chỉ xem">Chọn nội dung hiện có bên dưới để xem caption và các mốc thời gian.</Empty> : <ContentEditor key={item?.id || selected || "new"} item={item} campaignId={selected} onSaved={(savedId) => { if (!item) router.replace(href(`/marketing/studio?content=${savedId}`)); }} />}</Panel>{item && <RevisionHistory revisions={data.revisions.filter((r) => r.entity_type === "content" && r.entity_id === item.id)} />}</div>
  <aside className="mk-stack"><Panel title="Preview caption đã lưu"><div className="mk-preview"><strong>ColorME Partnership</strong><small>Bản nháp · chưa đăng</small><p>{item?.caption || "Caption đã lưu sẽ xuất hiện tại đây. Không có media giả trong bản xem trước."}</p></div></Panel><Panel title="Assets & Layers"><Capability name="drive" /><p className="mk-muted">Canvas, layer chỉnh sửa và carousel chưa triển khai. Không có ảnh/video AI hoặc quyền xuất bản trong Phase 1.</p></Panel></aside></div></>}
  <Panel title="Nội dung trong phạm vi hiện tại"><ContentRows items={data.contentItems.filter((i) => !selected || i.campaign_id === selected)} /></Panel></>;
}
