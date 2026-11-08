"use client";

import { useState } from "react";
import { canMoveCalendarContent, calendarScheduleCommand } from "@/lib/marketing/calendar-schedule";
import { MarketingError, utcToVietnamLocal } from "@/lib/marketing/domain";
import type { MarketingContent } from "@/lib/marketing/types";
import { Field, dateTime } from "../components";
import { useMarketing } from "../workspace";
import { useOperation } from "../video/use-phase-five";
import type { CalendarMediaAccess } from "./media-preview";

export function CalendarScheduleForm({ item, initialTime, access }: {
  item: MarketingContent; initialTime?: string; access: CalendarMediaAccess;
}) {
  const { data, canWrite, refresh } = useMarketing();
  const [base, setBase] = useState(item);
  const [localTime, setLocalTime] = useState(() => initialTime ?? utcToVietnamLocal(item.proposed_publish_at));
  const [adopted, setAdopted] = useState(false);
  const operation = useOperation();
  const campaign = data.campaigns.find((row) => row.id === item.campaign_id);
  if (!canWrite) return null;
  if (!canMoveCalendarContent(item, campaign, canWrite)) return <p className="mk-muted">
    Chỉ đổi giờ đề xuất của bản nháp/cần chỉnh sửa trong Campaign Bản nháp/Đang hoạt động. Với bài đã duyệt hoặc lên lịch, mở Approval Inbox để hủy/đối soát lịch cũ và gửi duyệt lại.
  </p>;
  const stale = item.version > base.version;
  const changed = localTime !== utcToVietnamLocal(base.proposed_publish_at);
  return <form className="mk-form mk-calendar-reschedule" aria-label="Đổi giờ đề xuất" onSubmit={(event) => {
    event.preventDefault();
    if (operation.pending || stale || !changed || !localTime) return;
    const assertCurrent = access.capture();
    void operation.run(async () => {
      try {
        const command = calendarScheduleCommand(base, localTime);
        const response = await access.request("/api/marketing", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
        });
        const saved = (await response.json()).result as MarketingContent;
        assertCurrent();
        setBase(saved);
        setAdopted(false);
        // A committed time change stays successful if only the follow-up read fails.
        try { await refresh(); } catch { /* Workspace exposes its retry control. */ }
        assertCurrent();
      } catch (error) {
        if (error instanceof MarketingError && error.status === 409) {
          try { await refresh(); } catch { /* The proposal remains available for retry. */ }
          assertCurrent();
        }
        throw error;
      }
    }, "Đã lưu giờ đề xuất. Nội dung ở trạng thái Bản nháp.");
  }}>
    <h3>Đổi giờ đề xuất</h3>
    <p className="mk-muted">Giờ hiện tại: {dateTime(item.proposed_publish_at)} · phiên bản đang sửa v{base.version}. Lưu chỉ thay đổi kế hoạch trong ứng dụng.</p>
    <Field label="Giờ đề xuất mới · giờ Việt Nam"><input type="datetime-local" required value={localTime} disabled={operation.pending}
      onChange={(event) => setLocalTime(event.target.value)} /></Field>
    {stale && <p className="mk-notice">Nội dung đã có v{item.version}. Giữ giờ vừa nhập và lấy nội dung hiện tại trước khi lưu.</p>}
    {adopted && <p className="mk-muted" role="status">Đã lấy nội dung hiện tại. Kiểm tra caption và giờ đề xuất trước khi lưu lại.</p>}
    <div className="mk-actions">
      <button className="mk-primary" type="submit" disabled={operation.pending || stale || !changed || !localTime}>
        {operation.pending ? "Đang lưu giờ đề xuất…" : "Lưu giờ đề xuất"}
      </button>
      {stale && <button type="button" disabled={operation.pending} onClick={() => { setBase(item); setAdopted(true); }}>
        Dùng nội dung hiện tại v{item.version}
      </button>}
    </div>
    {operation.notice && <p className="mk-notice" role="status">{operation.notice}</p>}
  </form>;
}
