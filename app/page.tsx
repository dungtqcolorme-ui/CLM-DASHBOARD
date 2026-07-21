"use client";

import Image from "next/image";
import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type AppRole, type AuthProfile, dashboardRole } from "@/lib/authTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

const PRIVATE_BUCKET = "clm-dashboard-private";
const PRIVATE_DASHBOARD = "clm-dashboard-private (10).html";
const STATE_BUCKET = "clm-dashboard-state";
const STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";
const UPLOAD_BUCKET = "clm-dashboard-uploads";

type DashboardRpcMessage = {
  type: "clm-dashboard-rpc";
  id: string;
  action:
    | "get-profile"
    | "load-state"
    | "save-state"
    | "upload-file"
    | "open-file"
    | "delete-file"
    | "list-users"
    | "create-user"
    | "update-user"
    | "delete-user";
  payload?: Record<string, unknown>;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  status: AuthProfile["status"];
  created_at: string;
  updated_at: string;
};

function safeStorageName(name: string) {
  const dot = name.lastIndexOf(".");
  const extension = dot > -1 ? name.slice(dot).replace(/[^a-zA-Z0-9.]/g, "") : "";
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
  return `${base}${extension.toLowerCase()}`;
}

function safeDashboardJson(state: unknown) {
  return JSON.stringify(state, (key, value) => {
    if (["accounts", "regRequests"].includes(key)) return undefined;
    if (["password", "passwordHash", "matKhau"].includes(key)) return undefined;
    return value;
  });
}

async function compressState(json: string) {
  if (typeof CompressionStream === "undefined") {
    throw new Error("Trình duyệt chưa hỗ trợ nén dữ liệu dashboard.");
  }
  const compressedStream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(compressedStream).arrayBuffer()], {
    type: "application/gzip",
  });
}

async function readCompressedState(blob: Blob) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Trình duyệt chưa hỗ trợ đọc dữ liệu dashboard đã nén.");
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function authorizedApi<T>(path: string, init?: RequestInit) {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Thao tác tài khoản thất bại.");
  return payload as T;
}

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-logo ${compact ? "compact" : ""}`} aria-label="ColorME">
      <Image src="/colorme-logo.png" alt="ColorME" width={447} height={447} priority />
    </div>
  );
}

function DashboardLoading({ checking = false }: { checking?: boolean }) {
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      <div className="loading-corner loading-corner-top" aria-hidden="true" />
      <div className="loading-corner loading-corner-bottom" aria-hidden="true" />
      <div className="loading-content">
        <div className="loading-orbit" aria-hidden="true">
          <span className="loading-ring" />
          <span className="loading-spinner" />
          <BrandLogo />
        </div>
        <h1>{checking ? "Đang kiểm tra phiên đăng nhập" : "Đang tải dữ liệu"}</h1>
        <p>Vui lòng chờ trong giây lát…</p>
        <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
      <div className="loading-bars" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}

function Icon({ name }: { name: "mail" | "lock" | "eye" | "eyeOff" | "calendar" | "task" | "heart" | "arrow" }) {
  const paths: Record<string, ReactNode> = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a9.9 9.9 0 0 0 3.4-.6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    task: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6V6H9zM8 11l2 2 5-5M8 17h8"/></>,
    heart: <><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.8l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.4 1-1a5.5 5.5 0 0 0 0-7.8Z"/><path d="m9 13 2-2 2 2 2-2"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [activeRole, setActiveRole] = useState<AppRole | "">("");
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedStateRef = useRef("");
  const profileRef = useRef<AuthProfile | null>(null);
  const activeRoleRef = useRef<AppRole | "">("");

  const loadCurrentProfile = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("Phiên đăng nhập không hợp lệ.");

    const [{ data: profileRow, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,status,created_at,updated_at").eq("id", userData.user.id).single<ProfileRow>(),
      supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    if (profileError || !profileRow) throw new Error("Tài khoản chưa có hồ sơ hệ thống.");
    if (roleError) throw new Error("Không thể đọc quyền tài khoản.");
    if (profileRow.status === "pending") throw new Error("Tài khoản đang chờ PR Leader hoặc Admin phê duyệt.");
    if (profileRow.status === "locked") throw new Error("Tài khoản đã bị khóa.");

    const roles = (roleRows ?? []).map((row) => row.role).filter((role): role is AppRole =>
      role === "Admin" || role === "PR Leader" || role === "PR Representative" || role === "Viewer",
    );
    if (!roles.length) throw new Error("Tài khoản chưa được phân quyền.");
    const nextProfile: AuthProfile = {
      id: profileRow.id,
      email: profileRow.email,
      fullName: profileRow.full_name,
      status: profileRow.status,
      roles,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    };
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const openPrivateDashboard = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: storageError } = await supabase.storage
      .from(PRIVATE_BUCKET)
      .download(PRIVATE_DASHBOARD);
    if (storageError || !data) throw new Error("Tài khoản chưa được cấp quyền xem dashboard.");

    const objectUrl = URL.createObjectURL(new Blob([await data.arrayBuffer()], { type: "text/html;charset=utf-8" }));
    setDashboardUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return objectUrl;
    });
  }, []);

  const enterDashboard = useCallback(async (role: AppRole) => {
    const currentProfile = profileRef.current;
    if (!currentProfile?.roles.includes(role)) throw new Error("Vai trò không thuộc tài khoản này.");
    setDashboardReady(false);
    setDashboardLoading(true);
    activeRoleRef.current = role;
    setActiveRole(role);
    setError("");
    try {
      await openPrivateDashboard();
    } catch (dashboardError) {
      activeRoleRef.current = "";
      setActiveRole("");
      setDashboardLoading(false);
      throw dashboardError;
    }
  }, [openPrivateDashboard]);

  const runDashboardRpc = useCallback(async (message: DashboardRpcMessage) => {
    const supabase = getSupabaseClient();
    const payload = message.payload ?? {};

    if (message.action === "get-profile") {
      const currentProfile = profileRef.current;
      if (!currentProfile || !activeRoleRef.current) throw new Error("Chưa chọn vai trò đăng nhập.");
      return {
        id: currentProfile.id,
        email: currentProfile.email,
        fullName: currentProfile.fullName,
        status: currentProfile.status,
        roles: currentProfile.roles,
        activeRole: activeRoleRef.current,
        dashboardRole: dashboardRole(activeRoleRef.current),
        logoUrl: `${window.location.origin}/colorme-logo.png`,
      };
    }

    if (message.action === "list-users") return authorizedApi<{ users: AuthProfile[] }>("/api/admin/users");
    if (message.action === "create-user") {
      return authorizedApi("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
    }
    if (message.action === "update-user" || message.action === "delete-user") {
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!id) throw new Error("Thiếu mã tài khoản.");
      const body = { ...payload };
      delete body.id;
      return authorizedApi(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: message.action === "delete-user" ? "DELETE" : "PATCH",
        body: message.action === "delete-user" ? undefined : JSON.stringify(body),
      });
    }

    if (message.action === "load-state") {
      const { data: compressedData } = await supabase.storage.from(STATE_BUCKET).download(STATE_FILE);
      let json = compressedData ? await readCompressedState(compressedData) : "";
      if (!json) {
        const { data: legacyData, error: legacyError } = await supabase.storage.from(STATE_BUCKET).download(LEGACY_STATE_FILE);
        if (legacyError || !legacyData) return null;
        json = await legacyData.text();
      }
      lastSavedStateRef.current = json;
      return JSON.parse(json) as Record<string, unknown>;
    }

    if (message.action === "save-state") {
      const state = payload.state;
      if (!state || typeof state !== "object") throw new Error("Dữ liệu dashboard không hợp lệ.");
      const json = safeDashboardJson(state);
      if (json === lastSavedStateRef.current) return { saved: false, unchanged: true };

      const saveOperation = saveQueueRef.current.then(async () => {
        const stateBlob = await compressState(json);
        const { error: uploadError } = await supabase.storage.from(STATE_BUCKET).upload(STATE_FILE, stateBlob, {
          contentType: stateBlob.type,
          upsert: true,
          cacheControl: "0",
        });
        if (uploadError) throw uploadError;
        const { data: userData } = await supabase.auth.getUser();
        const { error: metaError } = await supabase.from("dashboard_state_meta").upsert({
          id: "main",
          updated_at: new Date().toISOString(),
          updated_by: userData.user?.id ?? null,
          size_bytes: stateBlob.size,
        });
        if (metaError) throw metaError;
        lastSavedStateRef.current = json;
        return { saved: true, size: stateBlob.size };
      });
      saveQueueRef.current = saveOperation.catch(() => undefined);
      return saveOperation;
    }

    if (message.action === "upload-file") {
      const file = payload.file;
      if (!(file instanceof Blob)) throw new Error("Không nhận được file tải lên.");
      const originalName = typeof payload.name === "string" ? payload.name : "file";
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Phiên đăng nhập đã hết hạn.");
      const path = `${userData.user.id}/${Date.now()}-${safeStorageName(originalName)}`;
      const { error: uploadError } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, {
        contentType: typeof payload.type === "string" && payload.type ? payload.type : "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      return { path, name: originalName, size: file.size, type: payload.type ?? "" };
    }

    const path = typeof payload.path === "string" ? payload.path : "";
    if (!path) throw new Error("Đường dẫn file không hợp lệ.");
    if (message.action === "open-file") {
      const { data, error: signedUrlError } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(path, 600);
      if (signedUrlError || !data?.signedUrl) throw signedUrlError ?? new Error("Không thể mở file.");
      return { url: data.signedUrl };
    }
    const { error: deleteError } = await supabase.storage.from(UPLOAD_BUCKET).remove([path]);
    if (deleteError) throw deleteError;
    return { deleted: true };
  }, []);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setDashboardUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return "";
    });
    profileRef.current = null;
    activeRoleRef.current = "";
    setProfile(null);
    setActiveRole("");
    setDashboardLoading(false);
    setDashboardReady(false);
    setPassword("");
    setError("");
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        try {
          const currentProfile = await loadCurrentProfile();
          if (currentProfile.roles.length === 1) await enterDashboard(currentProfile.roles[0]);
        } catch (sessionError) {
          await supabase.auth.signOut();
          if (active) setError(sessionError instanceof Error ? sessionError.message : "Không thể mở dashboard.");
        }
      }
      if (active) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        setDashboardUrl("");
        setDashboardLoading(false);
        setDashboardReady(false);
      }
    });

    const handleDashboardMessage = (event: MessageEvent) => {
      const dashboardFrame = document.querySelector<HTMLIFrameElement>(".private-dashboard-frame");
      if (event.source !== dashboardFrame?.contentWindow) return;
      if (event.data?.type === "clm-dashboard-logout") {
        void logout();
        return;
      }
      if (event.data?.type === "clm-dashboard-ready") {
        setDashboardReady(true);
        setDashboardLoading(false);
        return;
      }
      if (event.data?.type !== "clm-dashboard-rpc") return;
      const message = event.data as DashboardRpcMessage;
      void runDashboardRpc(message)
        .then((data) => dashboardFrame.contentWindow?.postMessage({ type: "clm-dashboard-rpc-result", id: message.id, ok: true, data }, "*"))
        .catch((rpcError) => dashboardFrame.contentWindow?.postMessage({
          type: "clm-dashboard-rpc-result",
          id: message.id,
          ok: false,
          error: rpcError instanceof Error ? rpcError.message : "Thao tác Supabase thất bại.",
        }, "*"));
    };
    window.addEventListener("message", handleDashboardMessage);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("message", handleDashboardMessage);
    };
  }, [enterDashboard, loadCurrentProfile, logout, runDashboardRpc]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw new Error("Email hoặc mật khẩu không đúng.");
      const currentProfile = await loadCurrentProfile();
      if (currentProfile.roles.length === 1) await enterDashboard(currentProfile.roles[0]);
    } catch (loginError) {
      await getSupabaseClient().auth.signOut();
      setError(loginError instanceof Error ? loginError.message : "Không thể đăng nhập.");
    } finally {
      setSubmitting(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError("Nhập email trước khi yêu cầu đặt lại mật khẩu.");
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setSubmitting(false);
    setError(resetError ? "Không thể gửi email đặt lại mật khẩu." : "Đã gửi hướng dẫn đặt lại mật khẩu tới email của bạn.");
  }

  if (loading) {
    return <DashboardLoading checking />;
  }

  if (dashboardUrl || dashboardLoading) {
    return (
      <main className="secure-app">
        {dashboardUrl && <iframe className={`private-dashboard-frame ${dashboardReady ? "is-ready" : ""}`} src={dashboardUrl} title="ColorME PR Sponsorship Dashboard" allow="clipboard-read; clipboard-write" />}
        {(!dashboardReady || dashboardLoading) && <DashboardLoading />}
      </main>
    );
  }

  if (profile && !activeRole) {
    return (
      <main className="role-page">
        <section className="role-card">
          <BrandLogo />
          <p className="role-eyebrow">CLM DASHBOARD</p>
          <h1>Chọn vai trò đăng nhập</h1>
          <p>{profile.fullName} có nhiều quyền trên hệ thống. Chọn không gian làm việc bạn muốn mở.</p>
          <div className="role-grid">
            {profile.roles.map((role) => (
              <button key={role} onClick={() => void enterDashboard(role)}>
                <span>{role === "Admin" ? "A" : role === "PR Leader" ? "L" : role === "PR Representative" ? "PR" : "V"}</span>
                <div><b>{role}</b><small>{role === "Admin" ? "Toàn quyền quản trị hệ thống" : role === "PR Representative" ? "Quản lý hồ sơ và công việc được giao" : role === "PR Leader" ? "Điều phối và phê duyệt hoạt động PR" : "Theo dõi dashboard ở chế độ chỉ xem"}</small></div>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          <button className="role-logout" onClick={() => void logout()}>Đăng xuất tài khoản</button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-side">
        <BrandLogo />
        <div className="login-wrap">
          <p className="welcome-back">Chào mừng quay trở lại! <span>👋</span></p>
          <h1>Đăng nhập tài khoản</h1>

          <form onSubmit={login}>
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><Icon name="mail" /><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <label htmlFor="password">Mật khẩu</label>
            <div className="input-wrap"><Icon name="lock" /><input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}><Icon name={passwordVisible ? "eyeOff" : "eye"} /></button></div>
            <div className="form-meta"><label><input type="checkbox" defaultChecked />Ghi nhớ đăng nhập</label><button type="button" onClick={() => void forgotPassword()}>Quên mật khẩu?</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-btn" type="submit" disabled={submitting}>{submitting ? "Đang đăng nhập…" : "Đăng nhập"}<Icon name="arrow" /></button>
          </form>
        </div>
        <footer>© 2026 ColorME. All rights reserved.</footer>
      </section>

      <section className="visual-side">
        <div className="visual-dots" aria-hidden="true">{Array.from({ length: 42 }).map((_, index) => <i key={index} />)}</div>
        <div className="visual-copy"><p>CLM DASHBOARD</p><i /><h2>Quản lý sự kiện,<br />công việc &amp; tài trợ<br />trong <b>một nơi duy nhất</b></h2></div>
        <div className="feature-list">
          <article><span><Icon name="calendar" /></span><div><b>Quản lý sự kiện</b><small>Theo dõi toàn bộ sự kiện<br />từ kế hoạch đến kết quả.</small></div></article>
          <article><span><Icon name="task" /></span><div><b>Công việc &amp; tiến độ</b><small>Giao việc, theo dõi tiến độ<br />và tối ưu hiệu suất.</small></div></article>
          <article><span><Icon name="heart" /></span><div><b>Quản lý tài trợ</b><small>Quản lý đối tác, hợp đồng<br />và quyền lợi tài trợ.</small></div></article>
        </div>
        <div className="dashboard-art" aria-hidden="true">
          <div className="art-window"><div className="art-top"><BrandLogo compact /></div><div className="art-body"><div className="art-menu"><i/><i/><i/><i/></div><div className="art-chart"><span/><span/><span/></div><div className="art-ring"/></div></div>
          <div className="art-float user"><i/><i/></div><div className="art-float bars"><i/><i/><i/></div><div className="art-float pie"><i/></div>
        </div>
      </section>
    </main>
  );
}
