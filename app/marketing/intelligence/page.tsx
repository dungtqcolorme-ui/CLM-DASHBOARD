"use client";

import { PageHeader } from "../components";
import { useMarketing } from "../workspace";
import ReportsWorkspace from "../reports/workspace";

export default function IntelligencePage() {
  const { data, phaseFiveAccessVersion } = useMarketing();
  return <>
    <PageHeader title="Intelligence & Reports" description="Phân biệt tiến độ sản xuất trong ứng dụng và kết quả Organic được xác minh từ Partnership Page." />
    <ReportsWorkspace key={phaseFiveAccessVersion} userId={data.profile.id} accessVersion={phaseFiveAccessVersion} />
  </>;
}
