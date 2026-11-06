import { metricLabel } from "@/lib/marketing/report-domain";
import type { ReportMetrics } from "@/lib/marketing/report-types";
import { dateTime, Panel } from "../components";

function Rows({ values }: { values: [string, number | null][] }) {
  return <dl className="mk-definition">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{metricLabel(value)}</dd></div>)}</dl>;
}

const coverage = {
  unavailable: "Chưa có quan sát Organic đủ điều kiện",
  partial: "Mẫu quan sát có chỉ số còn thiếu",
  complete_observed_sample: "Đủ chỉ số trong mẫu quan sát",
};
const eligibility = { organic: "Organic đủ điều kiện", paid: "Paid / Boosted bị loại", unknown: "Chưa xác định · không tính vào Organic" };
const definitions: Record<string, string> = { reach: "Tiếp cận", views: "Lượt xem", reactions: "Cảm xúc", comments: "Bình luận", shares: "Chia sẻ", clicks: "Lượt nhấp", engagement_rate: "Tỷ lệ tương tác" };

export function ReportMetricsView({ metrics }: { metrics: ReportMetrics }) {
  const { production, organic } = metrics;
  return <>
    <p><strong>Chốt báo cáo</strong> {dateTime(metrics.as_of)} · {metrics.period_start} → {metrics.period_end} · giờ Việt Nam</p>
    <div className="mk-phase-work">
      <Panel title="Tiến độ sản xuất thực tế">
        <Rows values={[
          ["Nội dung lên kế hoạch", production.planned], ["Sẵn sàng", production.ready],
          ["Đã được duyệt", production.reviewed], ["Đã xác minh đăng", production.published],
          ["Đúng hạn", production.on_time], ["Số mốc dùng tính đúng hạn", production.on_time_denominator],
          ["Giờ chờ duyệt trung bình", production.review_hours], ["Số mẫu tính giờ duyệt", production.review_sample_size],
        ]} />
        <p>Bắt đầu theo dõi mốc sản xuất {dateTime(metrics.coverage.production_tracking_started_at)}.</p>
        <p className="mk-muted">Số kế hoạch và sẵn sàng tính theo kỳ tạo nội dung. Duyệt và đúng hạn tính theo kỳ của mốc đầu tiên. Số đăng tính từ lần cập nhật công việc đã xác minh.</p>
        {!!metrics.coverage.warnings.length && <ul>{metrics.coverage.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </Panel>
      <Panel title="Hiệu quả Partnership Organic">
        <p>{coverage[metrics.coverage.organic as keyof typeof coverage] ?? metrics.coverage.organic}</p>
        <Rows values={[
          ["Bài đủ điều kiện", organic.eligible_posts], ["Paid / Boosted bị loại", organic.excluded_paid], ["Chưa xác định", organic.unknown_posts],
          ["Tiếp cận", organic.reach], ["Lượt xem", organic.views], ["Cảm xúc", organic.reactions], ["Bình luận", organic.comments],
          ["Chia sẻ", organic.shares], ["Lượt nhấp", organic.clicks],
          ["Tử số tương tác", organic.numerator], ["Mẫu số tương tác", organic.denominator],
        ]} />
        <p>Tỷ lệ tương tác <strong>{organic.engagement_rate === null ? metricLabel(null) : new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2 }).format(organic.engagement_rate / 100)}</strong></p>
        {Object.keys(organic.definitions).length > 0 && <details>
          <summary>Định nghĩa chỉ số Organic</summary>
          <dl className="mk-definition">{Object.entries(organic.definitions).map(([key, value]) => <div key={key}><dt>{definitions[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>
        </details>}
      </Panel>
    </div>
    <Panel title="Bằng chứng nguồn Organic">
      <p>Mẫu quan sát 7 ngày được chọn tại thời điểm chốt báo cáo. Thời điểm thu thập thuộc từng nguồn.</p>
      {!organic.observations.length && <p>Chưa có dữ liệu.</p>}
      <div className="mk-phase-list">{organic.observations.map((source) => <details key={source.id} className="mk-phase-card">
        <summary>{eligibility[source.eligibility]} · {source.post_id}</summary>
        <dl className="mk-definition">
          <div><dt>Thu thập nguồn</dt><dd><time dateTime={source.fetched_at} title={source.fetched_at}>{dateTime(source.fetched_at)}</time></dd></div>
          <div><dt>ID quan sát</dt><dd>{source.id}</dd></div>
          <div><dt>ID kết nối / Trang</dt><dd>{source.connection_id} / {source.page_id}</dd></div>
          <div><dt>Tham chiếu nguồn</dt><dd>{source.source_reference}</dd></div>
          {Object.entries(source.definitions).map(([key, value]) => <div key={key}><dt>{definitions[key] ?? key}</dt><dd>{value}</dd></div>)}
        </dl>
      </details>)}</div>
    </Panel>
  </>;
}
