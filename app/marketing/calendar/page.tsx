"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { calendarDay, calendarEntries, type CalendarEntry, type CalendarEvidence, type CalendarState } from "@/lib/marketing/calendar-domain";
import { Badge, Empty, Field, PageHeader, Panel, dateTime, lines, localDateTime } from "../components";
import { useMarketing } from "../workspace";
import { useOperation, usePhaseFive } from "../video/use-phase-five";
import { CalendarMediaPreview, type CalendarMediaAccess } from "./media-preview";
import { calendarDropTime, canMoveCalendarContent } from "@/lib/marketing/calendar-schedule";
import { CalendarScheduleForm } from "./schedule-form";

const dayMs = 86_400_000;
const modes = [["month", "Tháng"], ["week", "Tuần"], ["list", "Danh sách"]] as const;
type Mode = typeof modes[number][0];
const weekdays = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const stateLabels: Record<CalendarState, string> = {
  draft: "Bản nháp", in_review: "Đang chờ duyệt", changes_requested: "Cần chỉnh sửa",
  internal_queue: "Đã duyệt · Hàng đợi nội bộ", dispatching: "Đang gửi · Chờ biên nhận",
  remote_scheduled: "Meta xác nhận lên lịch", published_verified: "Meta xác nhận đã đăng",
  unknown: "Chưa rõ kết quả đăng", cancel_pending: "Đang đối soát việc hủy",
  awaiting_evidence: "Chờ dữ liệu xác minh", failed: "Xuất bản lỗi", cancelled: "Đã hủy",
};
const attention = new Set<CalendarState>(["unknown", "cancel_pending", "awaiting_evidence", "failed"]);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const slotLabel = (slot: CalendarEntry["slot"]) => slot?.kind === "approved" ? "Theo giờ đã duyệt" : "Giờ đề xuất";

export default function CalendarPage() {
  const { data, phaseFiveAccessVersion } = useMarketing();
  return <Calendar key={`${data.profile.id}:${phaseFiveAccessVersion}`} />;
}

function Calendar() {
  const { data, selected, href, refresh, phaseFiveAccessVersion, canWrite } = useMarketing();
  const remote = usePhaseFive<CalendarEvidence>("calendar", data.profile.id, phaseFiveAccessVersion);
  const reload = useOperation();
  const [mode, setMode] = useState<Mode>("month");
  const [line, setLine] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [channel, setChannel] = useState("");
  const [day, setDay] = useState(() => calendarDay(new Date().toISOString()));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ contentId: string; time: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragId = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = data.contentItems.filter((item) => !selected || item.campaign_id === selected);
  const ownerLabel = (id: string | null) => !id ? "Chưa phân công" : id === data.profile.id ? data.profile.fullName : id;
  const assignees = [...new Set(items.map((item) => item.assignee_id).filter((id): id is string => Boolean(id)))].sort();
  const rows = calendarEntries(items, remote.error ? null : remote.data).filter(({ item, state, publication }) =>
    (!line || item.content_line === line) && (!status || state === status)
    && (!assignee || (assignee === "unassigned" ? !item.assignee_id : item.assignee_id === assignee))
    && (!channel || Boolean(publication?.approval) === (channel === "facebook")));
  const detail = rows.find((row) => row.item.id === detailId) ?? null;
  useEffect(() => {
    if (detail && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!detail && dialog.current?.open) dialog.current.close();
  }, [detail]);

  const cursor = new Date(`${day}T00:00:00Z`);
  const first = mode === "week" ? cursor : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * dayMs;
  const dates = Array.from({ length: mode === "week" ? 7 : 42 }, (_, index) => new Date(start + index * dayMs));
  const byDay = new Map<string, CalendarEntry[]>();
  const sorted = [...rows].sort((a, b) => (a.slot?.at ?? "z").localeCompare(b.slot?.at ?? "z"));
  for (const row of sorted) {
    if (!row.slot) continue;
    const key = calendarDay(row.slot.at);
    const group = byDay.get(key);
    if (group) group.push(row);
    else byDay.set(key, [row]);
  }
  function navigate(amount: number) {
    const next = mode === "week" ? new Date(cursor.getTime() + amount * 7 * dayMs)
      : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + amount, 1));
    const value = dayKey(next);
    if (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) setDay(value);
  }
  const campaignName = (id: string) => data.campaigns.find((campaign) => campaign.id === id)?.name ?? "Campaign";
  const canMove = (row: CalendarEntry) => canMoveCalendarContent(row.item, data.campaigns.find((campaign) => campaign.id === row.item.campaign_id), canWrite);
  function open(id: string) { setProposal(null); setDetailId(id); }
  function close() { setDetailId(null); setProposal(null); }
  function endDrag() { dragId.current = null; setDragging(false); }

  return <>
    <PageHeader title="Content Calendar" description="Lịch theo giờ Việt Nam, từ giờ đề xuất đến bản duyệt và biên nhận Meta đã lưu." />
    <div className="mk-notice">Hàng đợi nội bộ chờ biên nhận từ Meta. Lịch đặt các mục đã duyệt theo khung giờ trong bản duyệt.</div>
    {remote.error && <div className="mk-notice" role="alert">Chưa tải được dữ liệu xuất bản. Đang hiển thị lịch đề xuất. <button onClick={remote.retry}>Thử lại</button></div>}
    {reload.notice && <p className="mk-notice" role="alert">{reload.notice}</p>}
    {!remote.data && !remote.error && <p className="mk-muted" role="status">Đang tải dữ liệu xuất bản…</p>}
    <Panel title="Lịch nội dung" action={<div className="mk-actions">
      <div className="mk-segment" aria-label="Chế độ lịch">{modes.map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div>
      <button disabled={reload.pending} onClick={() => void reload.run(async () => { await refresh(); remote.retry(); })}>Làm mới trạng thái</button>
    </div>}>
      <div className="mk-filters">
        <Field label="Tuyến bài"><select value={line} onChange={(event) => setLine(event.target.value)}><option value="">Tất cả tuyến bài</option>{lines.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Trạng thái xuất bản"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Người phụ trách"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          <option value="">Tất cả người phụ trách</option><option value="unassigned">Chưa phân công</option>
          {assignees.map((id) => <option key={id} value={id}>{ownerLabel(id)}</option>)}
        </select></Field>
        <Field label="Kênh"><select value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="">Tất cả kênh</option><option value="facebook">Facebook · có Page trong bản duyệt</option><option value="unassigned">Chưa có Page trong bản duyệt</option>
        </select></Field>
        {mode !== "list" && <Field label="Ngày đang xem"><input type="date" required value={day} onChange={(event) => {
          if (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(event.target.value)) setDay(event.target.value);
        }} /></Field>}
      </div>
      {canWrite && <p id="mk-calendar-reschedule-help" className="mk-muted">Kéo bài nháp/cần chỉnh sửa sang ngày khác để đề xuất giờ mới, rồi bấm lưu trong chi tiết. Bạn cũng có thể mở bài bằng bàn phím hoặc chạm để đổi giờ.</p>}
      {mode === "list" ? <CalendarList rows={sorted} campaignName={campaignName} ownerLabel={ownerLabel} open={open} /> : <>
        <div className="mk-calendar-toolbar">
          <button aria-label={mode === "month" ? "Tháng trước" : "Tuần trước"} onClick={() => navigate(-1)}>← Trước</button>
          <h3>{mode === "month" ? `Tháng ${cursor.getUTCMonth() + 1}/${cursor.getUTCFullYear()}` : `${dayKey(dates[0])} — ${dayKey(dates[6])}`}</h3>
          <button aria-label={mode === "month" ? "Tháng sau" : "Tuần sau"} onClick={() => navigate(1)}>Sau →</button>
        </div>
        <div className="mk-calendar-scroll"><div className={`mk-calendar-grid ${mode === "week" ? "mk-calendar-week" : ""}`}>
          {weekdays.map((label) => <div className="mk-weekday" key={label}>{label}</div>)}
          {dates.map((date) => {
            const key = dayKey(date);
            return <div key={key} className={`mk-calendar-day ${date.getUTCMonth() !== cursor.getUTCMonth() && mode === "month" ? "mk-outside-month" : ""}${dragging ? " mk-calendar-drop-target" : ""}`}
              onDragOver={(event) => { if (dragId.current && event.dataTransfer.types.includes("application/x-colorme-calendar")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
              onDrop={(event) => {
                const id = dragId.current;
                const row = rows.find((row) => row.item.id === id);
                if (!id || event.dataTransfer.getData("application/x-colorme-calendar") !== id || !row || !canMove(row)) { endDrag(); return; }
                event.preventDefault();
                setProposal({ contentId: id, time: calendarDropTime(row.item.proposed_publish_at, key) });
                setDetailId(id);
                endDrag();
              }}>
              <time dateTime={key}>{date.getUTCDate()}</time>
              {byDay.get(key)?.map((row) => <button key={row.item.id} className="mk-calendar-item" onClick={() => open(row.item.id)}
                draggable={canMove(row)} aria-describedby={canMove(row) ? "mk-calendar-reschedule-help" : undefined}
                onDragStart={(event) => {
                  if (!canMove(row)) { event.preventDefault(); return; }
                  dragId.current = row.item.id;
                  event.dataTransfer.setData("application/x-colorme-calendar", row.item.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(true);
                }} onDragEnd={endDrag}>
                <span>{localDateTime(row.slot!.at).slice(11)} · {slotLabel(row.slot)}</span>
                <strong>{row.item.title}</strong>
                <span>{campaignName(row.item.campaign_id)} · {row.item.content_line}</span>
                <CalendarStatus row={row} />
              </button>)}
            </div>;
          })}
        </div></div>
        {!dates.some((date) => byDay.has(dayKey(date))) && <Empty title="Chưa có nội dung trong khoảng này">Chuyển sang Danh sách để xem nội dung chưa đặt giờ.</Empty>}
      </>}
    </Panel>
    <dialog ref={dialog} className="mk-dialog" onCancel={(event) => { event.preventDefault(); close(); }} aria-label={detail ? `Chi tiết nội dung: ${detail.item.title}` : "Chi tiết nội dung"}>
      {detail && <Panel title={detail.item.title} action={<button onClick={close}>Đóng chi tiết</button>}>
        <CalendarDetails key={`${detail.item.id}:${proposal?.contentId === detail.item.id ? proposal.time : "detail"}`}
          row={detail} owner={ownerLabel(detail.item.assignee_id)} campaign={campaignName(detail.item.campaign_id)} access={remote}
          proposedTime={proposal?.contentId === detail.item.id ? proposal.time : undefined} />
        <div className="mk-actions">
          <Link className="mk-button mk-primary" href={href(`/marketing/studio?content=${detail.item.id}&campaign=${detail.item.campaign_id}`)}>Mở trong Studio</Link>
          <Link className="mk-button" href={href(`/marketing/approvals?campaign=${detail.item.campaign_id}`)}>Mở Approval Inbox</Link>
        </div>
      </Panel>}
    </dialog>
  </>;
}

function CalendarStatus({ row }: { row: CalendarEntry }) {
  return <span className={`mk-calendar-state${attention.has(row.state) ? " mk-calendar-attention" : ""}`}>
    {stateLabels[row.state]}{row.alerts.length ? ` · ${row.alerts.length} cảnh báo` : ""}
  </span>;
}

function CalendarList({ rows, campaignName, ownerLabel, open }: {
  rows: CalendarEntry[]; campaignName: (id: string) => string; ownerLabel: (id: string | null) => string; open: (id: string) => void;
}) {
  if (!rows.length) return <Empty title="Chưa có nội dung phù hợp">Thay đổi bộ lọc để xem lịch.</Empty>;
  return <div className="mk-table-wrap"><table className="mk-table">
    <thead><tr><th>Nội dung</th><th>Khung giờ · Việt Nam</th><th>Xuất bản</th><th>Người phụ trách</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.item.id}>
      <td><button onClick={() => open(row.item.id)}>{row.item.title}</button><small>{campaignName(row.item.campaign_id)} · {row.item.content_line}</small></td>
      <td>{row.slot ? <>{dateTime(row.slot.at)}<small>{slotLabel(row.slot)}</small></> : "Chưa đặt giờ"}</td>
      <td><CalendarStatus row={row} /></td><td>{ownerLabel(row.item.assignee_id)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function CalendarDetails({ row, owner, campaign, access, proposedTime }: { row: CalendarEntry; owner: string; campaign: string; access: CalendarMediaAccess; proposedTime?: string }) {
  const { item, publication, alerts } = row;
  const approval = publication?.approval;
  const activePublication = ["approved", "scheduled", "published"].includes(item.publishing_status);
  const meta = row.state === "remote_scheduled" || row.state === "published_verified" ? stateLabels[row.state] : "Chưa xác nhận trạng thái";
  return <>
    <div className="mk-actions"><Badge status={item.production_status} /><CalendarStatus row={row} /></div>
    <p className="mk-preserve">{item.caption || "Chưa có caption"}</p>
    <CalendarScheduleForm item={item} initialTime={proposedTime} access={access} />
    {activePublication && publication && approval && approval.finalAssets.length > 0 && <CalendarMediaPreview
      key={`${publication.id}:${approval.finalAssets.map((asset) => `${asset.id}:${asset.version}`).join(",")}`}
      jobId={publication.id} assets={approval.finalAssets} access={access} />}
    <dl className="mk-definition">
      <dt>Campaign · Tuyến bài</dt><dd>{campaign} · {item.content_line}</dd>
      <dt>Kênh / Page</dt><dd>{approval ? `Facebook · ${approval.pageName || "Page trong bản duyệt"}` : "Chưa có Page trong bản duyệt"}</dd>
      <dt>Giờ đề xuất</dt><dd>{dateTime(item.proposed_publish_at)}</dd>
      <dt>{activePublication ? "Giờ theo bản duyệt" : "Giờ trong bản duyệt trước"}</dt><dd>{dateTime(approval?.slot ?? null)}</dd>
      <dt>Trạng thái từ Meta</dt><dd>{meta}</dd>
      {publication?.observedAt && (row.state === "remote_scheduled" || row.state === "published_verified") && <><dt>Lần ghi nhận biên nhận</dt><dd>{dateTime(publication.observedAt)}</dd></>}
      <dt>Giờ đăng thực tế</dt><dd>{row.state === "published_verified" ? "Biên nhận chưa có giờ đăng thực tế." : "Chưa ghi nhận"}</dd>
      <dt>Bản duyệt</dt><dd>{approval ? `Nội dung v${approval.contentVersion} · ${dateTime(approval.at)} · ${approval.approverId}` : "Chưa có bản duyệt đã liên kết"}</dd>
      <dt>Người phụ trách</dt><dd>{owner}</dd>
      <dt>Hạn sản xuất</dt><dd>{dateTime(item.production_due_at)}</dd>
      <dt>Hạn gửi duyệt</dt><dd>{dateTime(item.review_due_at)}</dd>
    </dl>
    {alerts.length > 0 && <p className="mk-notice">{alerts.length} cảnh báo cần xử lý, gồm {alerts.filter((alert) => alert.status === "acknowledged").length} đã ghi nhận. Xem chi tiết trong Approval Inbox.</p>}
  </>;
}
