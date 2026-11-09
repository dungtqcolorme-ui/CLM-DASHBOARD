"use client";

import { useState } from "react";
import { latestOrganicForComparison, matchedOrganicPeers, organicMetricLabels, type OrganicMetric } from "@/lib/marketing/organic-comparison";
import { metricLabel } from "@/lib/marketing/report-domain";
import type { OrganicObservation } from "@/lib/marketing/report-types";
import { Field, Panel, dateTime } from "../components";
import { useMarketing } from "../workspace";

export function OrganicComparison({ observations, campaignId }: { observations: OrganicObservation[]; campaignId: string }) {
  const { data } = useMarketing();
  const [id, setId] = useState("");
  const [metric, setMetric] = useState<OrganicMetric>("reach");
  const candidates = latestOrganicForComparison(observations, campaignId);
  const anchor = candidates.find((row) => row.id === id) ?? candidates[0];
  const peers = anchor ? matchedOrganicPeers(anchor, candidates, metric) : [];
  const campaign = data.campaigns.find((row) => row.id === anchor?.campaign_id);

  return <Panel title="So sánh Organic cùng nhóm">
    <p className="mk-muted">Đối chiếu các bài cùng Campaign, Page, tuyến, định dạng, cửa sổ đo và định nghĩa chỉ số. Kết quả mô tả mẫu quan sát.</p>
    {!anchor ? <p>Chưa có quan sát Organic gắn Campaign để đối chiếu.</p> : <>
      <div className="mk-form-grid">
        <Field label="Bài tham chiếu Organic">
          <select value={anchor.id} onChange={(event) => setId(event.target.value)}>
            {candidates.map((row) => <option key={row.id} value={row.id}>{row.post_id} · {row.window} · {dateTime(row.fetched_at)}</option>)}
          </select>
        </Field>
        <Field label="Chỉ số đối chiếu Organic">
          <select value={metric} onChange={(event) => setMetric(event.target.value as OrganicMetric)}>
            {Object.entries(organicMetricLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>
      <p>{campaign?.name} · {anchor.content_line} · {anchor.format} · {anchor.window}</p>
      {campaign?.objective && <p className="mk-muted">Mục tiêu Campaign hiện tại · {campaign.objective}</p>}
      <p>Bài tham chiếu {anchor.post_id} · {organicMetricLabels[metric]} {metricLabel(anchor[metric])}</p>
      <p className="mk-muted">Nguồn {anchor.source_reference} · {dateTime(anchor.fetched_at)}</p>
      {anchor.definitions[metric] && <p className="mk-muted">{anchor.definitions[metric]}</p>}
      {peers.length === 0 ? <p>Chưa đủ bài có dữ liệu cùng định nghĩa để đối chiếu.</p> : <>
        <p>{peers.length} bài đối chiếu{peers.length > 10 ? " · Hiển thị 10 quan sát mới nhất" : ""}</p>
        <div className="mk-table-wrap">
          <table className="mk-table">
            <thead><tr><th>Bài</th><th>{organicMetricLabels[metric]}</th><th>Nguồn quan sát</th></tr></thead>
            <tbody>{peers.slice(0, 10).map((row) => <tr key={row.id}>
              <td>{row.post_id}</td><td>{metricLabel(row[metric])}</td>
              <td>{row.source_reference}<small>{dateTime(row.fetched_at)}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </>}
  </Panel>;
}
