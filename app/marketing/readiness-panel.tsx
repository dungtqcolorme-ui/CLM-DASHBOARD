"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { readMarketingReadiness } from "@/lib/marketing/readiness";
import { Panel } from "./components";

type Readiness = Awaited<ReturnType<typeof readMarketingReadiness>>;
const labels = {
  meta: "Meta · Chưa có bộ kết nối đã xác minh",
  publisher: "Lịch đăng · Chưa có worker hoạt động",
  drive: "Google Drive · Chưa có OAuth riêng",
  agent: "AI Agent · Chưa có nhà cung cấp",
  render: "Video · Chưa có worker render",
};

export function ReadinessPanel() {
  const [result, setResult] = useState<Readiness>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setPending(true);
    setError("");
    setResult(undefined);
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");
      const response = await fetch("/api/marketing/readiness", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể kiểm tra cấu hình.");
      setResult(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không thể kiểm tra cấu hình.");
    } finally {
      setPending(false);
    }
  }

  return <Panel title="Trạng thái triển khai · Admin">
    <p className="mk-muted">Đối chiếu deployment, migration và các mục cấu hình cần thiết cho tích hợp.</p>
    <button disabled={pending} onClick={() => void check()}>{pending ? "Đang kiểm tra…" : "Kiểm tra trạng thái"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" className="mk-stack">
      <p>{result.schema === "current" ? "Đã nhận diện migration Marketing" : "Cần kiểm tra migration Marketing"} · {result.expectedMigration}</p>
      <p className="mk-muted">
        Môi trường {result.deployment?.environment ?? "chưa xác định"}
        {" · "}Commit {result.deployment?.revision ?? "chưa xác định"}
        {" · "}Supabase {result.deployment?.databaseProjectRef ?? "chưa xác định"}
      </p>
      {result.liveMetaRequested && <p className="mk-notice">Đã đặt cờ Meta live. Bộ kết nối đã xác minh vẫn cần được cấu hình.</p>}
      <ul>{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <li key={key}>
        {labels[key]}
        {result.integrations[key].missingSettings.length > 0 && <small> · Thiếu {result.integrations[key].missingSettings.join(", ")}</small>}
      </li>)}</ul>
    </div>}
  </Panel>;
}
