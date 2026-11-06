"use client";

import { useState } from "react";
import type { KpiDraft, KpiRevisionProposal, MarketingCampaign } from "@/lib/marketing/types";
import { dateTime, Field, Panel } from "./components";
import { MarketingError, useMarketing } from "./workspace";

function Targets({ values }: { values: KpiDraft[] }) {
  if (!values.length) return <p className="mk-muted">Chưa đặt mục tiêu KPI.</p>;
  return <ul className="mk-kpi-list">{values.map((target, index) => <li key={index}>
    <span>{target.name}</span>
    <strong>{target.target === null ? "Chưa đặt" : `${target.target.toLocaleString("vi-VN")} ${target.unit}`}</strong>
  </li>)}</ul>;
}

export function OfficialKpis({ campaign, showRevision = false }: { campaign: MarketingCampaign; showRevision?: boolean }) {
  const { data, admin, manager, canWrite } = useMarketing();
  const [editing, setEditing] = useState(false);
  const effective = campaign.effective_kpi_revision;
  const proposal = campaign.pending_kpi_revision;
  const current = effective?.targets ?? campaign.official_kpis;
  const hasScope = admin || data.memberships.some((member) => member.team_id === campaign.team_id && member.user_id === data.profile.id);
  const version = campaign.kpi_revision_version;
  const editable = showRevision && campaign.status === "active" && version !== undefined && hasScope;
  const confirmedHistory = showRevision ? data.revisions.filter((entry) => entry.entity_type === "campaign_kpi"
    && entry.campaign_id === campaign.id && entry.action === "confirm_kpi_revision") : [];

  return <Panel title={effective ? `KPI chính thức · v${effective.version}` : "KPI chính thức · mốc kích hoạt"}>
    {current ? <>
      <p className="mk-muted">Xác nhận {dateTime(effective?.confirmed_at ?? campaign.activated_at)} · {effective?.confirmed_by ?? campaign.activated_by}</p>
      <Targets values={current} />
    </> : <p className="mk-muted">Leader hoặc Admin xác nhận KPI nháp khi kích hoạt Campaign.</p>}
    {effective && <details className="mk-details"><summary>KPI gốc tại thời điểm kích hoạt</summary><Targets values={campaign.official_kpis ?? []} /></details>}
    <p className="mk-muted">Actual Organic đang chờ dữ liệu xác minh.</p>
    {showRevision && proposal && <section className="mk-stack" aria-label="Đề xuất KPI đang chờ">
      <h3>Đề xuất KPI · v{proposal.version}</h3>
      <p>{proposal.reason}</p>
      <p className="mk-muted">Người đề xuất {proposal.proposed_by} · {dateTime(proposal.proposed_at)}</p>
      <div className="mk-columns">
        <div><h4>Mục tiêu đang áp dụng</h4><Targets values={proposal.previous_targets} /></div>
        <div><h4>Mục tiêu đề xuất</h4><Targets values={proposal.targets} /></div>
      </div>
      {editable && manager && <ConfirmProposal key={proposal.version} campaignId={campaign.id} proposal={proposal} />}
    </section>}
    {editable && canWrite && current && <>
      <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {editing ? "Đóng biểu mẫu" : "Soạn đề xuất KPI"}
      </button>
      {editing && <ProposalForm key={`${campaign.id}-${data.profile.id}`} campaignId={campaign.id}
        revisionVersion={version} current={current} hasProposal={Boolean(proposal)} onSaved={() => setEditing(false)} />}
    </>}
    {showRevision && campaign.status === "active" && version === undefined && <p className="mk-muted">Admin cần áp dụng migration KPI để mở luồng điều chỉnh.</p>}
    {confirmedHistory.length > 0 && <details className="mk-details"><summary>Lịch sử xác nhận KPI ({confirmedHistory.length})</summary>
      <ol>{[...confirmedHistory].sort((a, b) => b.version - a.version).map((entry) => <li key={entry.id}>
        <p>v{entry.version} · {dateTime(entry.created_at)} · {entry.actor_id}</p>
        <p>{typeof entry.snapshot.reason === "string" ? entry.snapshot.reason : ""}</p>
        {Array.isArray(entry.snapshot.targets) && <Targets values={entry.snapshot.targets as KpiDraft[]} />}
      </li>)}</ol>
    </details>}
  </Panel>;
}

function ConfirmProposal({ campaignId, proposal }: { campaignId: string; proposal: KpiRevisionProposal }) {
  const { command, refresh } = useMarketing();
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!confirmed || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await command({ action: "confirm_kpi_revision", id: campaignId, expected_kpi_version: proposal.version, confirmed: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xác nhận KPI.");
      if (error instanceof MarketingError && error.status === 409) await refresh().catch(() => {});
    } finally { setSaving(false); }
  }

  return <form className="mk-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <label className="mk-kpi-confirm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>Tôi đã đối chiếu mục tiêu cũ và mục tiêu đề xuất.</span>
    </label>
    <button className="mk-button mk-primary" disabled={!confirmed || saving}>Xác nhận KPI v{proposal.version}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}

function ProposalForm({ campaignId, revisionVersion, current, hasProposal, onSaved }: {
  campaignId: string; revisionVersion: number; current: KpiDraft[]; hasProposal: boolean; onSaved: () => void;
}) {
  const { command, refresh } = useMarketing();
  const [baseVersion, setBaseVersion] = useState(revisionVersion);
  const [targets, setTargets] = useState(current);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const stale = baseVersion !== revisionVersion;

  function update(index: number, changes: Partial<KpiDraft>) {
    setTargets((rows) => rows.map((row, i) => i === index ? { ...row, ...changes } : row));
  }
  async function submit() {
    if (stale || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await command({ action: "propose_kpi_revision", id: campaignId, expected_kpi_version: baseVersion, reason, targets });
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu đề xuất.");
      if (error instanceof MarketingError && error.status === 409) await refresh().catch(() => {});
    } finally { setSaving(false); }
  }

  return <form className="mk-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    {hasProposal && <p className="mk-notice">Lưu sẽ thay đề xuất đang chờ. Mục tiêu chính thức chỉ đổi sau khi xác nhận.</p>}
    {stale && <div className="mk-notice" role="alert">
      <p>KPI đã có phiên bản mới. Nội dung bạn đang nhập vẫn được giữ.</p>
      <button type="button" onClick={() => { setBaseVersion(revisionVersion); setMessage(""); }}>Dùng v{revisionVersion} làm mốc</button>
    </div>}
    <fieldset disabled={saving}>
      {targets.map((target, index) => <div className="mk-kpi-input" key={index}>
        <Field label={`Tên KPI đề xuất ${index + 1}`}><input required maxLength={120} value={target.name} onChange={(event) => update(index, { name: event.target.value })} /></Field>
        <Field label={`Mục tiêu KPI đề xuất ${index + 1}`}><input type="number" min={0} max={1e12} step="any" value={target.target ?? ""} onChange={(event) => update(index, { target: event.target.value === "" ? null : event.target.valueAsNumber })} /></Field>
        <Field label={`Đơn vị KPI đề xuất ${index + 1}`}><input required maxLength={40} value={target.unit} onChange={(event) => update(index, { unit: event.target.value })} /></Field>
        <button type="button" aria-label={`Xóa KPI đề xuất ${index + 1}`} onClick={() => setTargets(targets.filter((_, i) => i !== index))}>Xóa</button>
      </div>)}
      <button type="button" disabled={targets.length >= 12} onClick={() => setTargets([...targets, { name: "", target: null, unit: "" }])}>Thêm KPI đề xuất</button>
      <Field label="Lý do điều chỉnh KPI"><textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    </fieldset>
    <button className="mk-button mk-primary" disabled={stale || saving || !reason.trim()}>Lưu đề xuất KPI</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
