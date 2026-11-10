"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Badge, ContentEditor, ContentRows, Empty, PageHeader, Panel, RevisionHistory } from "../components";
import { useMarketing } from "../workspace";
import { CandidatePreparation } from "../publishing/panels";
import { SelectedIdeaEvidence } from "../knowledge/studio-evidence";
import { StudioWorkspace } from "./assistant";

const Workbench = dynamic(() => import("../creative/workbench"), { loading: () => <p role="status">Đang mở Workbench…</p> });
const TaskLinks = dynamic(() => import("../task-links"), { loading: () => <p role="status">Đang mở liên kết Task…</p> });
const VideoWorkbench = dynamic(() => import("../video/workbench"), { loading: () => <p role="status">Đang mở Video Studio…</p> });

export default function StudioPage() {
  return <Suspense fallback={<p role="status">Đang mở Studio…</p>}><Studio /></Suspense>;
}

function Studio() {
  const { data, selected, canWrite, href } = useMarketing();
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("content");
  const item = data.contentItems.find((entry) => entry.id === id);
  const campaign = data.campaigns.find((entry) => entry.id === (item?.campaign_id || selected));
  const scopeKey = item?.id || selected || "new";

  return <>
    <PageHeader title="Creative Studio" description="Viết caption, chỉnh thiết kế ảnh nhiều trang và chuẩn bị nội dung để gửi duyệt."
      action={item && <Link className="mk-button" href={href("/marketing/studio?new=1")}>+ Nội dung mới</Link>} />
    {id && !item ? <Empty title="Nội dung không có trong phạm vi truy cập">
      Kiểm tra Campaign và quyền thành viên team trước khi mở nội dung.
    </Empty> : <>
      <div className="mk-studio-bar">
        <strong>{item?.title || "Bản nháp mới"}</strong>
        <span>{campaign?.name || "Chọn Campaign trong biểu mẫu"}</span>
        {item && <><Badge status={item.production_status} /><Badge status={item.publishing_status} /><span>v{item.version}</span></>}
      </div>
      <StudioWorkspace profileId={data.profile.id} scopeKey={scopeKey} saved={Boolean(item)}
        evidence={<SelectedIdeaEvidence key={scopeKey} contentId={item?.id} campaignId={campaign?.id} />}>
        <Panel title={item ? "Caption & kế hoạch sản xuất" : "Tạo bản nháp nội dung"}>
          {!canWrite && !item ? <Empty title="Chế độ chỉ xem">
            Chọn nội dung hiện có bên dưới để xem caption và các mốc thời gian.
          </Empty> : <ContentEditor key={scopeKey} item={item} campaignId={selected} onSaved={(savedId) => {
            if (!item) router.replace(href(`/marketing/studio?content=${savedId}`));
          }} />}
        </Panel>
        {item && <Workbench key={item.id} item={item} />}
        <details className="mk-details">
          <summary>Preview caption đã lưu</summary>
          <div className="mk-preview"><strong>ColorME Partnership</strong><small>Bản nháp · chưa đăng</small>
            <p>{item?.caption || "Caption đã lưu sẽ xuất hiện tại đây."}</p>
          </div>
        </details>
        {item && <RevisionHistory revisions={data.revisions.filter((entry) => entry.entity_type === "content" && entry.entity_id === item.id)} />}
      </StudioWorkspace>
      {item && <>
        <TaskLinks key={"tasks/" + item.id} item={item} />
        <VideoWorkbench key={"video/" + item.id} item={item} />
        <CandidatePreparation key={"publishing/" + item.id} item={item} />
        <details className="mk-details"><summary>Phạm vi nội dung</summary>
          <p className="mk-muted">Creator giữ nguyên sau khi tạo. Người phụ trách có thể đổi trong team.</p>
          <small>Creator <code>{item.creator_id}</code></small>
          <p className="mk-muted">Facebook Partnership · chưa xác minh kết nối tài khoản.</p>
        </details>
      </>}
    </>}
    <Panel title="Nội dung trong phạm vi hiện tại">
      <ContentRows items={data.contentItems.filter((entry) => !selected || entry.campaign_id === selected)} />
    </Panel>
  </>;
}
