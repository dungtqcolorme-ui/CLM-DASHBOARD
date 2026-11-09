"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { notificationLabels, type MarketingNotificationInbox } from "@/lib/marketing/notification-types";
import { Panel, dateTime } from "../components";
import { usePhaseFive, useOperation } from "../video/use-phase-five";
import { useMarketing } from "../workspace";

export function MarketingNotifications() {
  const { data, selected, phaseFiveAccessVersion } = useMarketing();
  const id = useSearchParams().get("notice") || "";
  return <NotificationPanel key={[data.profile.id, selected, phaseFiveAccessVersion, id].join(":")} id={id} />;
}

function NotificationPanel({ id }: { id: string }) {
  const { data, selected, phaseFiveAccessVersion, href } = useMarketing();
  const params = new URLSearchParams();
  if (selected) params.set("campaign_id", selected);
  if (id) params.set("id", id);
  const inbox = usePhaseFive<MarketingNotificationInbox>("notifications", data.profile.id, phaseFiveAccessVersion, params.toString());
  const operation = useOperation();
  const retry = inbox.retry;

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [retry]);

  const items = inbox.error ? [] : inbox.data?.items ?? [];
  return <Panel title="Thông báo của tôi" action={<button onClick={retry}>Tải lại thông báo</button>}>
    {id && <p><Link href={href("/marketing/approvals")}>Về tất cả thông báo</Link></p>}
    {inbox.error && <p className="mk-notice" role="alert">{inbox.error}</p>}
    {!inbox.error && !inbox.data && <p role="status">Đang tải thông báo…</p>}
    {inbox.data && !inbox.error && items.length === 0 && <p>Chưa có thông báo trong phạm vi này.</p>}
    {inbox.data?.truncated && !inbox.error && <p className="mk-muted">Đang hiển thị 100 thông báo gần nhất.</p>}
    {operation.notice && <p role="status">{operation.notice}</p>}
    <div className="mk-stack mk-notification-list" role="region" aria-label="Danh sách thông báo" tabIndex={items.length > 2 ? 0 : undefined}>
      {items.map((item) => {
        const content = data.contentItems.find((row) => row.id === item.content_id);
        const revision = id === item.id ? inbox.data?.revision : null;
        const detailParams = new URLSearchParams({ campaign: item.campaign_id, notice: item.id });
        return <article className="mk-notification" key={item.id}>
          <h3>{notificationLabels[item.kind]}</h3>
          <p>{revision?.title ?? item.subject} {item.content_version !== null && <span>· Nội dung v{item.content_version}</span>}</p>
          <p className="mk-muted">{dateTime(item.created_at)} · {item.read_at ? "Đã đọc" : "Chưa đọc"}</p>
          {revision &&
            <p className="mk-preserve">{revision.caption || "Chưa có caption trong phiên bản này."}</p>}
          {id === item.id && item.content_version !== null && !revision &&
            <p className="mk-muted">Phiên bản này chưa có trong lịch sử đang tải.</p>}
          <div className="mk-actions">
            {id !== item.id && <Link className="mk-button" href={href("/marketing/approvals?" + detailParams)}>Xem sự kiện</Link>}
            {content && <Link className="mk-button" href={href("/marketing/studio?content=" + content.id + "&campaign=" + content.campaign_id)}>Mở bài hiện tại</Link>}
            {!item.read_at && <button disabled={operation.pending} onClick={() => void operation.run(async () => {
              const result = await inbox.command<{ read_at: string }>({ id: item.id });
              inbox.setData((current) => current && ({
                ...current, items: current.items.map((row) => row.id === item.id ? { ...row, read_at: result.read_at } : row),
              }));
              inbox.retry();
            })}>Đánh dấu đã đọc</button>}
          </div>
        </article>;
      })}
    </div>
  </Panel>;
}
