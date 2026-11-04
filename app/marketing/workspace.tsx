"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { MarketingCommand, MarketingWorkspace } from "@/lib/marketing/types";
import { MARKETING_NAV, isMarketingActive } from "@/lib/marketing/navigation";
import { reconcileCampaignNavigation } from "./campaign-context";

const legacy = [["doingoai", "Đối ngoại"], ["truyenthong", "Truyền thông"], ["anpham", "Ấn phẩm"], ["hocbong", "Học bổng"], ["baocao", "Hiệu suất"], ["phoihop", "Task hàng ngày"], ["tailieu", "Tài liệu"]];
export class MarketingError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type WorkspaceContext = {
  data: MarketingWorkspace; refresh: () => Promise<void>;
  command: <T = Record<string, unknown>>(command: MarketingCommand) => Promise<T>;
  selected: string; select: (id: string) => void; embedded: boolean;
  canWrite: boolean; manager: boolean; admin: boolean; href: (path: string) => string;
};
const Context = createContext<WorkspaceContext | null>(null);
export function useMarketing() { const ctx = useContext(Context); if (!ctx) throw new Error("Marketing workspace unavailable"); return ctx; }

export function MarketingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const search = useSearchParams().toString();
  const synchronizedNavigation = useRef("");
  const [data, setData] = useState<MarketingWorkspace | null>(null);
  const [error, setError] = useState(""); const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true); const [embedded, setEmbedded] = useState(true);
  const [selected, setSelected] = useState(""); const [open, setOpen] = useState(true); const [mobile, setMobile] = useState(false);
  const authGeneration = useRef(0);
  const invalidate = useCallback((message: string, status: number) => { authGeneration.current += 1; setData(null); setError(message); setUnauthorized(status === 401); setLoading(false); }, []);
  const refresh = useCallback(async () => {
    const generation = authGeneration.current;
    const { data: auth } = await getSupabaseClient().auth.getSession();
    if (!auth.session) { invalidate("Đăng nhập bằng tài khoản ColorME để mở Marketing.", 401); throw new MarketingError("Đăng nhập bằng tài khoản ColorME để mở Marketing.", 401); }
    const response = await fetch("/api/marketing", { headers: { Authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (generation !== authGeneration.current) return;
    if (!response.ok) { if ([401, 403].includes(response.status)) invalidate(body.error || "Quyền truy cập đã thay đổi.", response.status); throw new MarketingError(body.error || "Không thể tải không gian Marketing.", response.status); }
    setData(body); setError(""); setUnauthorized(false);
  }, [invalidate]);
  const load = useCallback(async () => { setLoading(true); try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Không thể tải dữ liệu."); setUnauthorized(e instanceof MarketingError && e.status === 401); } finally { setLoading(false); } }, [refresh]);
  // Browser frame and storage state are unavailable during server rendering.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get("embedded") === "1" || window.parent !== window);
    try { setSelected(sessionStorage.getItem("clm-marketing-campaign") || ""); } catch { /* Storage may be unavailable in private contexts. */ }
    void load();
    let unsubscribe: (() => void) | undefined;
    try { const { data: listener } = getSupabaseClient().auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") invalidate("Phiên đăng nhập đã kết thúc.", 401); }); unsubscribe = () => listener.subscription.unsubscribe(); } catch { /* load reports environment configuration failures. */ }
    return () => unsubscribe?.();
  }, [load, invalidate]);
  useEffect(() => { setOpen(true); setMobile(false); }, [pathname]);
  const select = useCallback((id: string) => { setSelected(id); try { sessionStorage.setItem("clm-marketing-campaign", id); } catch { /* Selection remains available in memory. */ } }, []);
  useEffect(() => {
    if (!data) return;
    const next = reconcileCampaignNavigation(synchronizedNavigation.current, data.profile.id, pathname, search, data.campaigns.map((c) => c.id));
    synchronizedNavigation.current = next.key;
    if (next.selection !== undefined) select(next.selection);
  }, [data, pathname, search, select]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const href = (path: string) => { const [base, query = ""] = path.split("?"); const params = new URLSearchParams(query); if (embedded) params.set("embedded", "1"); if (selected && data?.campaigns.some((c) => c.id === selected) && !params.has("campaign")) params.set("campaign", selected); return `${base}${params.size ? `?${params}` : ""}`; };
  const command = async <T,>(value: MarketingCommand): Promise<T> => {
    const generation = authGeneration.current;
    const { data: auth } = await getSupabaseClient().auth.getSession();
    if (!auth.session) { invalidate("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại từ Dashboard.", 401); throw new MarketingError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại từ Dashboard.", 401); }
    const response = await fetch("/api/marketing", { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const body = await response.json();
    if (generation !== authGeneration.current) throw new MarketingError("Phiên đăng nhập đã thay đổi. Vui lòng mở lại Marketing.", 401);
    if (!response.ok) { if ([401, 403].includes(response.status)) invalidate(body.error || "Quyền truy cập đã thay đổi.", response.status); throw new MarketingError(body.error || "Không thể lưu thay đổi.", response.status); }
    // A committed mutation remains successful even if the follow-up read is temporarily unavailable.
    try { await refresh(); } catch { setError("Đã lưu, nhưng chưa làm mới được dữ liệu. Vui lòng tải lại."); }
    return body.result as T;
  };
  const roles = data?.profile.roles || []; const admin = roles.includes("Admin"); const manager = admin || roles.includes("PR Leader"); const canWrite = manager || roles.includes("PR Representative");
  const active = MARKETING_NAV.find((entry) => isMarketingActive(pathname, entry.href)) || MARKETING_NAV[0];
  const safeSelected = data?.campaigns.some((c) => c.id === selected) ? selected : "";
  return <div className={`mk-root ${embedded ? "mk-embedded" : ""}`}>
    <a className="mk-skip" href="#marketing-main">Đến nội dung Marketing</a>
    {!embedded && <><button className="mk-mobile-toggle" aria-expanded={mobile} aria-controls="marketing-sidebar" onClick={() => setMobile(!mobile)}>Menu</button><aside id="marketing-sidebar" onKeyDown={(e) => { if (e.key === "Escape") setMobile(false); }} className={`mk-sidebar ${mobile ? "mk-mobile-open" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Link className="mk-logo" href="/"><img src="/colorme-logo.png" alt="ColorME" width="145" height="48" /><span>PARTNERSHIP WORKSPACE</span></Link>
      <nav aria-label="Điều hướng ColorME"><p className="mk-nav-label">Báo cáo</p>{legacy.slice(0, 5).map(([id, label]) => <Link key={id} className="mk-nav-link" href={`/?legacy=${id}`}>{label}</Link>)}<p className="mk-nav-label">Quản lý công việc</p>{legacy.slice(5).filter(([id]) => id !== "phoihop" || canWrite).map(([id, label]) => <Link key={id} className="mk-nav-link" href={`/?legacy=${id}`}>{label}</Link>)}
      <button className="mk-nav-parent" aria-expanded={open} aria-controls="marketing-subnav" onClick={() => setOpen(!open)}><Icon name="megaphone" /><span>Marketing</span><span aria-hidden="true">{open ? "⌄" : "›"}</span></button>
      <div id="marketing-subnav" hidden={!open}>{MARKETING_NAV.map(({ href: path, label, icon }) => <Link key={path} className={`mk-nav-link mk-nav-child ${active.href === path ? "mk-current" : ""}`} href={href(path)} aria-current={active.href === path ? "page" : undefined}><Icon name={icon} />{label}</Link>)}</div>
      {manager && <><p className="mk-nav-label">Hệ thống</p><Link className="mk-nav-link" href="/?legacy=taikhoan">Quản lý tài khoản</Link></>}
      </nav><div className="mk-sidebar-profile">{data?.profile.fullName || "ColorME"}<small>{roles.join(" · ") || "Phiên tài khoản hiện tại"}</small></div>
    </aside></>}
    <div className="mk-content"><header className="mk-topbar"><div><span className="mk-eyebrow">COLORME PARTNERSHIP</span><p>Marketing <span aria-hidden="true">/</span> {active.label}</p></div>{data && <label className="mk-context">Campaign hiện tại<select value={safeSelected} onChange={(e) => { const id = e.target.value; select(id); if (/^\/marketing\/campaigns\/[^/]+$/.test(pathname)) router.push(id ? `/marketing/campaigns/${id}` : "/marketing/campaigns"); else { const url = new URL(window.location.href); if (pathname === "/marketing/studio") url.searchParams.delete("content"); if (id) url.searchParams.set("campaign", id); else url.searchParams.delete("campaign"); router.replace(url.pathname + url.search); } }}><option value="">Tất cả Campaign</option>{data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</header>
      <main id="marketing-main" className="mk-main" tabIndex={-1}>
      {loading && !data ? <div className="mk-loading" role="status"><span className="mk-eyebrow">MARKETING WORKSPACE</span><h1>Đang mở không gian làm việc…</h1><div className="mk-skeleton" /><div className="mk-skeleton" /></div> : !data ? <section className="mk-empty"><Icon name="folder" /><h1>{unauthorized ? "Tiếp tục với tài khoản ColorME" : "Chưa thể mở Marketing"}</h1><p role="alert">{error}</p>{unauthorized ? <a className="mk-button mk-primary" target={embedded ? "_top" : undefined} href={`/?returnTo=${encodeURIComponent(pathname + window.location.search)}`}>Đăng nhập Dashboard</a> : <button onClick={() => void load()}>Thử lại</button>}</section> : <Context.Provider value={{ data, refresh, command, selected: safeSelected, select, embedded, canWrite, manager, admin, href }}>{error && <div className="mk-notice" role="alert">{error}<button onClick={() => void load()}>Thử tải lại</button></div>}{!canWrite && <div className="mk-notice">Chế độ chỉ xem · Quyền chỉnh sửa do vai trò và phạm vi team quyết định.</div>}{children}</Context.Provider>}
      </main><footer className="mk-footer">Asia/Ho_Chi_Minh · Dữ liệu theo quyền truy cập · Meta chưa kết nối</footer>
    </div>
  </div>;
}

export function Icon({ name = "campaigns" }: { name?: string }) {
  const paths: Record<string, ReactNode> = {
    megaphone: <><path d="M3 10v5h4l10 4V5L7 10H3Z" /><path d="m7 15 2 6h3l-2-5M20 9v6" /></>,
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="11" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="18" width="7" height="3" rx="1" /></>,
    campaigns: <><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z" /><path d="M8 12v4M12 12v2M16 12v5" /></>,
    agent: <><path d="M12 4a4 4 0 0 0-6-1 4 4 0 0 0-3 6 4 4 0 0 0 0 6 4 4 0 0 0 3 6 4 4 0 0 0 6-1V4ZM12 4a4 4 0 0 1 6-1 4 4 0 0 1 3 6 4 4 0 0 1 0 6 4 4 0 0 1-3 6 4 4 0 0 1-6-1" /><path d="m6 8 3 2M6 16l3-2m6-4 3-2m-3 6 3 2" /></>,
    studio: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5M4 16l4 4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3M7 18h3" /></>,
    assets: <><rect x="6" y="3" width="15" height="15" rx="2" /><path d="M3 6v13a2 2 0 0 0 2 2h13M6 14l4-4 4 4 3-3 4 4" /><circle cx="16" cy="7" r="1" /></>,
    intelligence: <><path d="M3 3v18h18M6 16l5-6 4 3 6-9M17 4h4v4" /></>,
    approvals: <><path d="m2 12 5 5L18 6M12 16l3 3 8-10" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.campaigns}</svg>;
}
