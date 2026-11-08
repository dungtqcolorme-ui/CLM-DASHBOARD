"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketingContent } from "@/lib/marketing/types";
import type { MarketingTaskLink, TaskLinkWorkspace, TaskLookup } from "@/lib/marketing/task-links-domain";
import { Field, Panel } from "./components";
import { useMarketing } from "./workspace";
import { useOperation, usePhaseFive } from "./video/use-phase-five";

export default function TaskLinks({ item }: { item: MarketingContent }) {
  const { data, phaseFiveAccessVersion } = useMarketing();
  return <TaskLinkPanel key={`${data.profile.id}:${phaseFiveAccessVersion}:${item.id}`} item={item} />;
}

function TaskLinkPanel({ item }: { item: MarketingContent }) {
  const workspace = useMarketing();
  const control = usePhaseFive<TaskLinkWorkspace>("tasks", workspace.data.profile.id, workspace.phaseFiveAccessVersion, "content_id=" + item.id);
  const operation = useOperation();
  const [taskId, setTaskId] = useState("");
  const [lookup, setLookup] = useState<TaskLookup | null>(null);
  const campaign = workspace.data.campaigns.find((row) => row.id === item.campaign_id);
  const writable = campaign?.status !== "archived" && workspace.canWrite && (workspace.admin || workspace.data.memberships.some((member) => member.team_id === item.team_id && member.user_id === workspace.data.profile.id));

  function inspectTask() {
    const id = taskId.trim();
    setLookup(null);
    void operation.run(async () => {
      const assertCurrent = control.capture();
      const response = await control.request(`/api/marketing/tasks?content_id=${item.id}&task_id=${encodeURIComponent(id)}`);
      const body = await response.json();
      assertCurrent();
      setLookup(body.lookup);
    });
  }
  function linkTask() {
    if (!lookup || lookup.task.id !== taskId.trim()) return;
    void operation.run(async () => {
      await control.command({ action: "link_task", content_id: item.id, task_id: lookup.task.id, expected_link_version: lookup.expected_link_version });
      setLookup(null);
      setTaskId("");
      await control.refresh();
    }, "Đã liên kết Task.");
  }
  const links = control.data?.links ?? [];
  return <Panel title="Task của nội dung" action={writable && <Link className="mk-button" href="/?legacy=phoihop" target={workspace.embedded ? "_top" : undefined}>
    Tạo Task trong Task hàng ngày
  </Link>}>
    <p className="mk-muted">Gắn mã Task đang có vào nội dung. Trạng thái Task và bước duyệt nội dung được theo dõi riêng.</p>
    {control.error && <p className="mk-notice" role="alert">{control.error} <button onClick={control.retry}>Thử tải Task</button></p>}
    {!control.data && !control.error && <p role="status">Đang tải liên kết Task…</p>}
    {control.data && !links.length && <p className="mk-muted">Chưa liên kết Task.</p>}
    <div className="mk-stack">{links.map((link) => <article key={link.id} className="mk-task-link">
      <h3>{link.task?.title ?? "Task không còn khả dụng"}</h3>
      <p><code>{link.task_id}</code> · {link.task?.status ?? "Kiểm tra lại trong Task hàng ngày"}</p>
      {link.task && <p className="mk-muted">Hạn {link.task.deadline} · Người phụ trách {link.task.owner_id}</p>}
      {writable && <RemoveLink link={link} pending={operation.pending} remove={(reason) => {
        void operation.run(async () => {
          await control.command({ action: "unlink_task", id: link.id, expected_version: link.version, reason });
          await control.refresh();
        }, "Đã gỡ liên kết Task.");
      }} />}
    </article>)}</div>
    {writable && control.data && <form className="mk-form" onSubmit={(event) => { event.preventDefault(); inspectTask(); }}>
      <Field label="Mã Task có sẵn"><input required maxLength={120} pattern="[A-Za-z0-9:_-]+" value={taskId} disabled={operation.pending} onChange={(event) => { setTaskId(event.target.value); setLookup(null); }} /></Field>
      <div className="mk-actions"><button disabled={operation.pending || !taskId.trim()}>Kiểm tra Task</button>
        <button type="button" onClick={control.retry}>Làm mới Task liên kết</button></div>
      {lookup && lookup.task.id === taskId.trim() && <section className="mk-notice" aria-label="Task đã kiểm tra">
        <h3>{lookup.task.title}</h3>
        <p>{lookup.task.status} · Hạn {lookup.task.deadline}</p>
        <button className="mk-button mk-primary" type="button" disabled={operation.pending || links.some((link) => link.task_id === lookup.task.id)} onClick={linkTask}>Liên kết Task này</button>
      </section>}
    </form>}
    {operation.notice && <p role="status">{operation.notice}</p>}
    {operation.conflict && <button onClick={control.retry}>Tải lại liên kết</button>}
  </Panel>;
}

function RemoveLink({ link, pending, remove }: { link: MarketingTaskLink; pending: boolean; remove: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <details className="mk-details"><summary>Gỡ liên kết Task</summary>
    <Field label={`Lý do gỡ ${link.task_id}`}><input maxLength={2000} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} /></Field>
    <button disabled={pending || !reason.trim()} onClick={() => remove(reason)}>Xác nhận gỡ liên kết</button>
  </details>;
}
