"use client";

import { useEffect, useState, type FormEvent } from "react";
import { parseReportCommand } from "@/lib/marketing/report-domain";
import type { MarketingInsight, MarketingReport, ReportCommand, ReportShareApproval, ReportWorkspace } from "@/lib/marketing/report-types";
import { dateTime, Field, Panel } from "../components";
import { useMarketing } from "../workspace";
import { useOperation, usePhaseFive, useVersionedDraft } from "../video/use-phase-five";
import { phaseFiveCanWriteTeam } from "../video/access-scope";
import { ReportMetricsView } from "./metrics";
import { exactApproval, narrativeDigest, periodEnd } from "./report-model";
import "../video/phase-five.css";

type ReportsAPI = ReturnType<typeof usePhaseFive<ReportWorkspace>>;
type ReportDraft = Pick<MarketingReport, "title" | "narrative" | "version">;

function BuildReport({ api, saved }: { api: ReportsAPI; saved: (report: MarketingReport) => void }) {
  const { data, selected } = useMarketing();
  const teams = data.teams.filter((team) => phaseFiveCanWriteTeam(data, team.id));
  const campaign = data.campaigns.find((entry) => entry.id === selected && phaseFiveCanWriteTeam(data, entry.team_id));
  const [teamId, setTeamId] = useState(campaign?.team_id ?? teams[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(campaign?.id ?? "");
  const [kind, setKind] = useState<MarketingReport["kind"]>("weekly");
  const [start, setStart] = useState("");
  const op = useOperation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = new FormData(event.currentTarget).get("title");
    void op.run(async () => {
      if (!start || (kind === "monthly" && !start.endsWith("-01"))) throw Error("Báo cáo tháng phải bắt đầu vào ngày đầu tháng.");
      saved(await api.command<MarketingReport>(parseReportCommand({
        action: "build_report", team_id: teamId, campaign_id: campaignId || null,
        kind, title, period_start: start, period_end: periodEnd(kind, start),
      })));
    }, "Đã chốt báo cáo.");
  }
  return <Panel title="Chốt báo cáo tuần hoặc tháng">
    <form className="mk-form" onSubmit={submit}>
      <fieldset disabled={op.pending}>
        <div className="mk-form-grid">
          <Field label="Tên báo cáo"><input name="title" required maxLength={180} /></Field>
          <Field label="Team báo cáo"><select value={teamId} required onChange={(e) => { setTeamId(e.target.value); setCampaignId(""); }}><option value="">Chọn team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
          <Field label="Campaign báo cáo"><select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Toàn team</option>{data.campaigns.filter((entry) => entry.team_id === teamId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
          <Field label="Kỳ báo cáo"><select value={kind} onChange={(e) => setKind(e.target.value as MarketingReport["kind"])}><option value="weekly">Tuần · 7 ngày</option><option value="monthly">Tháng · trọn tháng</option></select></Field>
          <Field label="Ngày bắt đầu báo cáo"><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Ngày kết thúc báo cáo"><input type="date" readOnly value={periodEnd(kind, start)} /></Field>
        </div>
        <p className="mk-muted">Kỳ tính theo giờ Việt Nam. Chỉ số được chốt từ dữ liệu đã lưu và quan sát nguồn có bằng chứng.</p>
        <button type="submit" className="mk-primary">Chốt báo cáo</button>
      </fieldset>
    </form>
    {op.notice && <p role="status">{op.notice}</p>}
  </Panel>;
}

function ReportShare({ report, approvals, api, approvable, update }: {
  report: MarketingReport; approvals: ReportShareApproval[]; api: ReportsAPI; approvable: boolean; update: (approval: ReportShareApproval) => void;
}) {
  const [hash, setHash] = useState("");
  const op = useOperation();
  useEffect(() => {
    let current = true;
    void narrativeDigest(report.narrative).then((value) => { if (current) setHash(value); }).catch(() => {});
    return () => { current = false; };
  }, [report.narrative]);
  const approval = hash ? exactApproval(report, hash, approvals) : undefined;
  function download(audience: "internal" | "external", format: "pdf" | "xlsx") {
    void op.run(async () => {
      const assertCurrent = api.capture();
      const params = new URLSearchParams({ id: report.id, version: String(report.version), audience, format });
      const response = await api.request("/api/marketing/reports/export?" + params);
      const blob = await response.blob();
      assertCurrent();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "report-" + report.id + "-v" + report.version + "-" + audience + "." + format;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }, "Đã tải bản " + format.toUpperCase() + " của v" + report.version + ".");
  }
  return <Panel title="Duyệt chia sẻ và tải tệp">
    <p><strong>{report.title} · v{report.version}</strong> · {report.period_start} → {report.period_end}</p>
    <p>{approval ? "Đã duyệt chia sẻ bên ngoài v" + report.version : "Chưa duyệt chia sẻ bên ngoài v" + report.version}</p>
    {approval && <p>Duyệt lúc {dateTime(approval.created_at)} · {approval.reason}</p>}
    <div className="mk-actions">
      <button type="button" disabled={op.pending} onClick={() => download("internal", "pdf")}>Tải PDF nội bộ</button>
      <button type="button" disabled={op.pending} onClick={() => download("internal", "xlsx")}>Tải XLSX nội bộ</button>
      <button type="button" disabled={op.pending || !approval} onClick={() => download("external", "pdf")}>Tải PDF chia sẻ</button>
      <button type="button" disabled={op.pending || !approval} onClick={() => download("external", "xlsx")}>Tải XLSX chia sẻ</button>
    </div>
    {approvable && !approval && <details>
      <summary>Xem và duyệt phiên bản chia sẻ</summary>
      <dl className="mk-definition">
        <div><dt>Mã kiểm tra số liệu</dt><dd><code>{report.metrics_hash}</code></dd></div>
        <div><dt>Mã kiểm tra diễn giải</dt><dd><code>{hash || "Đang tính…"}</code></dd></div>
        <div><dt>Diễn giải sẽ chia sẻ</dt><dd className="mk-report-narrative">{report.narrative || "Chưa có diễn giải."}</dd></div>
      </dl>
      <form className="mk-form" onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void op.run(async () => {
          const next = await api.command<ReportShareApproval>(parseReportCommand({
            action: "approve_report_share", id: report.id, expected_version: report.version, reason: form.get("reason"), confirmed: form.get("confirmed") === "on",
          }));
          update(next);
        }, "Đã duyệt đúng phiên bản.");
      }}>
        <fieldset disabled={op.pending || !hash}>
          <Field label="Lý do duyệt chia sẻ"><textarea name="reason" required maxLength={2000} /></Field>
          <label><input type="checkbox" name="confirmed" required /> Tôi đã xem số liệu và diễn giải của phiên bản này.</label>
          <button type="submit">Duyệt chia sẻ v{report.version}</button>
        </fieldset>
      </form>
    </details>}
    {op.notice && <p role="status">{op.notice}</p>}
    {op.conflict && <button type="button" onClick={api.retry}>Tải lại phiên bản báo cáo</button>}
  </Panel>;
}

const feedbackLabels = { proposed: "Đề xuất", accepted: "Chấp nhận", rejected: "Từ chối", in_progress: "Đang xử lý", completed: "Hoàn thành" };

function Insight({ insight, api, writable, update }: {
  insight: MarketingInsight; api: ReportsAPI; writable: boolean; update: (insight: MarketingInsight) => void;
}) {
  const op = useOperation();
  const evidence = Array.isArray(insight.evidence.content_ids) ? insight.evidence.content_ids.filter((id): id is string => typeof id === "string") : [];
  const { data, href } = useMarketing();
  return <article className="mk-phase-card">
    <h3>{insight.kind === "production_gap" ? "Nội dung kế hoạch chưa sẵn sàng" : insight.title}</h3>
    <p>{insight.kind === "production_gap" ? "Xem các nội dung có bằng chứng dưới đây và ghi quyết định theo dõi." : insight.recommendation}</p>
    <p>{feedbackLabels[insight.status]}{insight.reason && " · " + insight.reason}</p>
    {typeof insight.evidence.as_of === "string" && <p>Chốt bằng chứng {dateTime(insight.evidence.as_of)}.</p>}
    {!!evidence.length && <ul>{evidence.map((id) => <li key={id}><a href={href("/marketing/studio?content=" + encodeURIComponent(id))}>{data.contentItems.find((item) => item.id === id)?.title ?? id}</a></li>)}</ul>}
    <p className="mk-muted">Phản hồi chỉ được lưu trên insight. Áp dụng vào Campaign, Plan hoặc DNA cần thao tác riêng.</p>
    {writable && <form className="mk-form" onSubmit={(e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      void op.run(async () => {
        update(await api.command<MarketingInsight>(parseReportCommand({ action: "feedback_insight", id: insight.id, expected_version: insight.version, status: form.get("status"), reason: form.get("reason") })));
      }, "Đã lưu phản hồi.");
    }}>
      <fieldset disabled={op.pending}>
        <Field label="Trạng thái phản hồi"><select name="status" defaultValue={insight.status}>{Object.entries(feedbackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Lý do phản hồi"><textarea name="reason" required maxLength={2000} defaultValue={insight.reason} /></Field>
        <button type="submit">Lưu phản hồi</button>
      </fieldset>
    </form>}
    {op.notice && <p role="status">{op.notice}</p>}
    {op.conflict && <button type="button" onClick={api.retry}>Tải lại phản hồi</button>}
  </article>;
}

function ActiveReport({ report, api, workspace, userId, accessVersion, save, approve, updateInsight }: {
  report: MarketingReport; api: ReportsAPI; workspace: ReportWorkspace; userId: string; accessVersion: number;
  save: (report: MarketingReport) => void; approve: (approval: ReportShareApproval) => void; updateInsight: (insight: MarketingInsight) => void;
}) {
  const { data, canWrite, manager } = useMarketing();
  const writable = canWrite && phaseFiveCanWriteTeam(data, report.team_id);
  const [cachedDraft, setDraft] = useVersionedDraft<ReportDraft>(userId + "/reports/" + report.id, accessVersion);
  const draft = writable ? cachedDraft : null;
  const [version, setVersion] = useState(0);
  const op = useOperation();
  const versions = workspace.versions.filter((entry) => entry.report_id === report.id && entry.version < report.version).sort((a, b) => b.version - a.version);
  const selected = versions.find((entry) => entry.version === version)?.snapshot ?? report;
  const editing = selected.version === report.version;
  const current = draft ?? report;
  const conflict = !!draft && (op.conflict || draft.version !== report.version);
  const scope = data.campaigns.find((campaign) => campaign.id === report.campaign_id)?.name ?? "Toàn team";

  function edit(values: Partial<ReportDraft>) {
    setDraft({ version: current.version, title: current.title, narrative: current.narrative, ...values });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void op.run(async () => {
      const command: ReportCommand = { action: "edit_report", id: report.id, expected_version: current.version, title: current.title, narrative: current.narrative };
      save(await api.command<MarketingReport>(parseReportCommand(command)));
      setDraft(null);
    }, "Đã lưu diễn giải.");
  }
  return <>
    <Panel title={selected.title + " · v" + selected.version}>
      <p>{data.teams.find((team) => team.id === report.team_id)?.name} · {scope} · {report.kind === "weekly" ? "Tuần" : "Tháng"}</p>
      <Field label="Lịch sử báo cáo"><select value={selected.version === report.version ? 0 : selected.version} onChange={(e) => setVersion(Number(e.target.value))}>
        <option value={0}>Phiên bản hiện tại · v{report.version}</option>
        {versions.map((entry) => <option key={entry.id} value={entry.version}>v{entry.version} · {dateTime(entry.created_at)}</option>)}
      </select></Field>
    </Panel>
    <ReportMetricsView metrics={selected.metrics} />
    <Panel title="Diễn giải báo cáo">
      {editing && writable ? <form className="mk-form" onSubmit={submit}>
        <fieldset disabled={op.pending}>
          <Field label="Tiêu đề báo cáo"><input value={current.title} maxLength={180} required onChange={(e) => edit({ title: e.target.value })} /></Field>
          <Field label="Nội dung diễn giải"><textarea value={current.narrative} rows={5} maxLength={12000} onChange={(e) => edit({ narrative: e.target.value })} /></Field>
          <div className="mk-actions"><button type="submit" className="mk-primary" disabled={!draft || conflict}>Lưu diễn giải</button>
            {draft && !conflict && <button type="button" onClick={() => setDraft(null)}>Bỏ bản nháp diễn giải</button>}</div>
        </fieldset>
      </form> : <p className="mk-report-narrative">{selected.narrative || "Chưa có diễn giải."}</p>}
      {draft && editing && <p className="mk-muted">Bản nháp từ v{draft.version}. Tệp tải dùng phiên bản đã lưu.</p>}
      {conflict && <div className="mk-notice" role="alert">
        <p>Thay đổi được giữ từ v{draft.version}. Bản lưu đang tải là v{report.version}.</p>
        <div className="mk-actions">
          <button type="button" onClick={api.retry}>Tải báo cáo máy chủ</button>
          <button type="button" disabled={draft.version === report.version || op.pending} onClick={() => void op.run(async () => { setDraft(null); })}>Bỏ bản nháp và dùng v{report.version}</button>
          <button type="button" disabled={draft.version === report.version || op.pending} onClick={() => void op.run(async () => {
            setDraft({ ...draft, version: report.version });
          })}>Giữ diễn giải nháp trên v{report.version}</button>
        </div>
      </div>}
      {op.notice && <p role="status">{op.notice}</p>}
    </Panel>
    <ReportShare key={selected.id + "/" + selected.version} report={selected} approvals={workspace.shareApprovals} api={api} approvable={manager && writable && editing && !draft} update={approve} />
    {editing && <Panel title="Insight dựa trên bằng chứng">
      {!workspace.insights.some((insight) => insight.report_id === report.id) && <p>Chưa có insight cho báo cáo này.</p>}
      <div className="mk-phase-list">{workspace.insights.filter((insight) => insight.report_id === report.id).map((insight) => <Insight key={insight.id + "/" + insight.version} insight={insight} api={api} writable={writable} update={updateInsight} />)}</div>
    </Panel>}
  </>;
}

function replace<T extends { id: string }>(rows: T[], row: T) {
  return rows.some((entry) => entry.id === row.id) ? rows.map((entry) => entry.id === row.id ? row : entry) : [row, ...rows];
}

export default function ReportsWorkspace({ userId, accessVersion }: { userId: string; accessVersion: number }) {
  const { data, canWrite, selected, select } = useMarketing();
  const api = usePhaseFive<ReportWorkspace>("reports", userId, accessVersion);
  const [id, setId] = useState("");
  const workspace = api.data;
  if (!workspace) return <p role="status">{api.error || "Đang tải báo cáo…"} {api.error && <button type="button" onClick={api.retry}>Thử tải lại báo cáo</button>}</p>;

  const visible = workspace.reports.filter((entry) => !selected || entry.campaign_id === selected);
  const report = visible.find((entry) => entry.id === id) ?? visible[0];
  function save(next: MarketingReport) {
    api.setData((previous) => previous && { ...previous, reports: replace(previous.reports, next) });
    setId(next.id);
    api.retry();
  }
  return <div className="mk-phase mk-stack">
    <Panel title="Trạng thái nguồn và trợ lý">
      <p>Đồng bộ Organic tự động · NotConfigured</p>
      <p>Diễn giải AI · NotConfigured</p>
    </Panel>
    {api.error && <p role="alert">{api.error}</p>}
    {canWrite && data.teams.some((team) => phaseFiveCanWriteTeam(data, team.id)) && <BuildReport key={selected} api={api} saved={(next) => { save(next); select(next.campaign_id ?? ""); }} />}
    <Panel title="Báo cáo đã lưu">
      {report ? <Field label="Chọn báo cáo"><select value={report.id} onChange={(e) => setId(e.target.value)}>
        {visible.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.period_start} · v{entry.version}</option>)}
      </select></Field> : <p>Chưa có báo cáo trong phạm vi này.</p>}
    </Panel>
    {report && <ActiveReport key={report.id} report={report} workspace={workspace} api={api} userId={userId} accessVersion={accessVersion} save={save}
      approve={(next) => api.setData((previous) => previous && { ...previous, shareApprovals: replace(previous.shareApprovals, next) })}
      updateInsight={(next) => api.setData((previous) => previous && { ...previous, insights: replace(previous.insights, next) })} />}
  </div>;
}
