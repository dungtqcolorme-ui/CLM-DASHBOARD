"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CampaignRows, Field, PageHeader, Panel, labels } from "../components";
import { useMarketing } from "../workspace";
import { CampaignForm } from "../campaign-form";

export default function CampaignsPage() {
  const { data, selected, canWrite, href } = useMarketing(); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [kind, setKind] = useState(""); const [team, setTeam] = useState(""); const [create, setCreate] = useState(false);
  // The create deep link is external browser navigation state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCreate(new URLSearchParams(window.location.search).get("create") === "1"); }, []);
  const campaigns = data.campaigns.filter((c) => (!selected || c.id === selected) && c.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")) && (!status || c.status === status) && (!kind || c.kind === kind) && (!team || c.team_id === team));
  return <><PageHeader title="Campaigns" description="Một nơi để thống nhất mục tiêu, Content Plan và công việc của từng chiến dịch." action={canWrite && <button className="mk-primary" aria-expanded={create} aria-controls="campaign-create" onClick={() => setCreate(!create)}>{create ? "Đóng biểu mẫu" : "+ Tạo Campaign"}</button>} />{create && canWrite && <div id="campaign-create"><CampaignForm onCancel={() => setCreate(false)} /></div>}
  {selected && <p className="mk-muted">Đang dùng Campaign context đã chọn. Chọn “Tất cả Campaign” ở đầu trang để xem toàn bộ.</p>}<Panel title={`${campaigns.length} Campaign`} action={<span className="mk-muted">Danh sách</span>}><div className="mk-filters"><Field label="Tìm Campaign"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên Campaign…" /></Field><Field label="Trạng thái"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{["draft", "pending_activation", "active", "paused", "emergency_hold", "completed", "archived"].map((s) => <option key={s} value={s}>{labels[s]}</option>)}</select></Field><Field label="Loại"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả loại</option><option value="seasonal">Theo mùa</option><option value="always_on">Duy trì liên tục</option></select></Field><Field label="Team"><select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Tất cả team</option>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div><CampaignRows campaigns={campaigns} /></Panel><p className="mk-muted">Board và Timeline sẽ được bổ sung ở phase tiếp theo. <Link href={href("/marketing/calendar")}>Xem lịch nội dung hiện tại →</Link></p></>;
}
