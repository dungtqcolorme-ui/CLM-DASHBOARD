"use client";

import Image from "next/image";
import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type AppRole, type AuthProfile, dashboardRole } from "@/lib/authTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

const STATE_BUCKET = "clm-dashboard-state";
const STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";
const UPLOAD_BUCKET = "clm-dashboard-uploads";
const STATE_CACHE = "clm-dashboard-state-v1";
const STATE_CACHE_URL = "/__clm_private/state-main-v1";
const CACHE_TIMEOUT_MS = 3_000;
const DASHBOARD_BOOT_TIMEOUT_MS = 40_000;
const STATE_DOWNLOAD_TIMEOUT_MS = 30_000;

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
    | "delete-user"
    | "load-work-items"
    | "save-work-item"
    | "delete-work-item"
    | "add-work-comment"
    | "mark-notifications"
    | "delete-notifications"
    | "reschedule-work-item"
    | "update-work-status"
    | "get-account-profile"
    | "update-account-profile"
    | "change-password"
    | "upload-avatar"
    | "delete-avatar"
    | "get-google-calendar-status"
    | "connect-google-calendar";
  payload?: Record<string, unknown>;
};

type DashboardBridgeWindow = Window & {
  __clmDashboardMessage?: (message: unknown) => void;
  __clmDashboardRpcResult?: (message: unknown) => void;
};

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

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

async function authorizedApi<T>(path: string, init?: RequestInit, activeRole?: AppRole) {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");

  const sendRequest = (accessToken: string) => withTimeout(fetch(path, {
    ...init,
    headers: {
      ...(!(init?.body instanceof FormData) && !(init?.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...(activeRole ? { "X-CLM-Active-Role": activeRole } : {}),
      ...(init?.headers ?? {}),
    },
  }), 20_000, "Kết nối máy chủ quá thời gian. Vui lòng thử lại.");
  let response = await sendRequest(data.session.access_token);
  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) throw new Error("Phiên đăng nhập đã hết hạn.");
    response = await sendRequest(refreshed.session.access_token);
  }
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

function DashboardLoading({
  checking = false,
  error = "",
  onRetry,
}: {
  checking?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      <div className="loading-corner loading-corner-top" aria-hidden="true" />
      <div className="loading-corner loading-corner-bottom" aria-hidden="true" />
      <div className="loading-content">
        {error ? (
          <>
            <div className="loading-error-mark" aria-hidden="true">!</div>
            <h1>Không thể tải dashboard</h1>
            <p className="loading-error-copy">{error}</p>
            {onRetry && <button className="loading-retry" type="button" onClick={onRetry}>Thử lại</button>}
          </>
        ) : (
          <>
            <div className="loading-orbit" aria-hidden="true">
              <span className="loading-ring" />
              <span className="loading-spinner" />
            </div>
            <h1>{checking ? "Đang kiểm tra phiên đăng nhập" : "Đang tải dữ liệu"}</h1>
            <p>Vui lòng chờ trong giây lát…</p>
            <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>
          </>
        )}
      </div>
      <div className="loading-bars" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}

function Icon({ name }: { name: "mail" | "lock" | "eye" | "eyeOff" | "calendar" | "task" | "heart" | "arrow" | "chart" | "user" }) {
  const paths: Record<string, ReactNode> = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a9.9 9.9 0 0 0 3.4-.6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    task: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6V6H9zM8 11l2 2 5-5M8 17h8"/></>,
    heart: <><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.8l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.4 1-1a5.5 5.5 0 0 0 0-7.8Z"/><path d="m9 13 2-2 2 2 2-2"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    chart: <><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [dashboardFrameKey, setDashboardFrameKey] = useState(0);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [dashboardBootError, setDashboardBootError] = useState("");
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
  const dashboardFrameRef = useRef<HTMLIFrameElement>(null);

  const loadCurrentProfile = useCallback(async () => {
    const { profile: nextProfile } = await authorizedApi<{ profile: AuthProfile }>("/api/auth/profile");
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const openPrivateDashboard = useCallback(async (role: AppRole) => {
    await authorizedApi("/api/dashboard/session", {
      method: "POST",
      body: JSON.stringify({}),
    }, role);
    setDashboardUrl(`/api/dashboard/shell?v=33&reload=${Date.now()}`);
    setDashboardFrameKey((currentKey) => currentKey + 1);
  }, []);

  const enterDashboard = useCallback(async (role: AppRole) => {
    const currentProfile = profileRef.current;
    if (!currentProfile?.roles.includes(role)) throw new Error("Vai trò không thuộc tài khoản này.");
    setDashboardReady(false);
    setDashboardLoading(true);
    setDashboardBootError("");
    activeRoleRef.current = role;
    setActiveRole(role);
    setError("");
    try {
      await openPrivateDashboard(role);
    } catch (dashboardError) {
      setDashboardLoading(false);
      setDashboardBootError(dashboardError instanceof Error ? dashboardError.message : "Không thể mở dashboard.");
    }
  }, [openPrivateDashboard]);

  const retryDashboard = useCallback(async () => {
    if (!activeRoleRef.current) return;
    setDashboardReady(false);
    setDashboardLoading(true);
    setDashboardBootError("");
    try {
      await openPrivateDashboard(activeRoleRef.current);
    } catch (retryError) {
      setDashboardLoading(false);
      setDashboardBootError(retryError instanceof Error ? retryError.message : "Không thể mở dashboard.");
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
        dateOfBirth: currentProfile.dateOfBirth ?? "",
        phone: currentProfile.phone ?? "",
        avatarPath: currentProfile.avatarPath ?? "",
        avatarUrl: currentProfile.avatarUrl ?? "",
        activeRole: activeRoleRef.current,
        dashboardRole: dashboardRole(activeRoleRef.current),
        logoUrl: `${window.location.origin}/colorme-logo.png`,
      };
    }

    const requestRole = activeRoleRef.current || undefined;
    if (message.action === "list-users") return authorizedApi<{ users: AuthProfile[] }>("/api/admin/users", undefined, requestRole);
    if (message.action === "create-user") {
      return authorizedApi("/api/admin/users", { method: "POST", body: JSON.stringify(payload) }, requestRole);
    }
    if (message.action === "update-user" || message.action === "delete-user") {
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!id) throw new Error("Thiếu mã tài khoản.");
      const body = { ...payload };
      delete body.id;
      return authorizedApi(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: message.action === "delete-user" ? "DELETE" : "PATCH",
        body: message.action === "delete-user" ? undefined : JSON.stringify(body),
      }, requestRole);
    }

    if (message.action === "load-work-items") {
      return authorizedApi("/api/work-items", undefined, requestRole);
    }
    if (message.action === "save-work-item") {
      return authorizedApi("/api/work-items", {
        method: "POST",
        body: JSON.stringify(payload),
      }, requestRole);
    }
    if (message.action === "delete-work-item") {
      const kind = typeof payload.kind === "string" ? payload.kind : "";
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!kind || !id) throw new Error("Thiếu công việc cần xóa.");
      return authorizedApi(`/api/work-items?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, requestRole);
    }
    if (message.action === "add-work-comment") {
      return authorizedApi("/api/work-items", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }, requestRole);
    }
    if (message.action === "mark-notifications") {
      return authorizedApi("/api/work-items", {
        method: "PATCH",
        body: JSON.stringify({ ...payload, action: "mark-notifications" }),
      }, requestRole);
    }
    if (message.action === "delete-notifications") {
      return authorizedApi("/api/work-items", {
        method: "PATCH",
        body: JSON.stringify({ ...payload, action: "delete-notifications" }),
      }, requestRole);
    }
    if (message.action === "reschedule-work-item" || message.action === "update-work-status") {
      return authorizedApi("/api/work-items", {
        method: "PATCH",
        body: JSON.stringify({
          ...payload,
          action: message.action === "reschedule-work-item" ? "reschedule-task" : "update-task-status",
        }),
      }, requestRole);
    }
    if (message.action === "get-account-profile") {
      return authorizedApi("/api/account/profile", undefined, requestRole);
    }
    if (message.action === "update-account-profile") {
      const result = await authorizedApi<{ profile: AuthProfile }>("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }, requestRole);
      profileRef.current = result.profile;
      setProfile(result.profile);
      return result;
    }
    if (message.action === "change-password") {
      return authorizedApi("/api/account/profile", {
        method: "POST",
        body: JSON.stringify({ ...payload, action: "change-password" }),
      }, requestRole);
    }
    if (message.action === "upload-avatar") {
      const file = payload.file;
      if (!(file instanceof Blob)) throw new Error("Không nhận được ảnh đại diện.");
      const form = new FormData();
      form.set("file", file, typeof payload.name === "string" ? payload.name : "avatar");
      const result = await authorizedApi<{ profile: AuthProfile }>("/api/account/profile", {
        method: "PUT",
        body: form,
      }, requestRole);
      profileRef.current = result.profile;
      setProfile(result.profile);
      return result;
    }
    if (message.action === "delete-avatar") {
      const result = await authorizedApi<{ profile: AuthProfile }>("/api/account/profile", {
        method: "DELETE",
      }, requestRole);
      profileRef.current = result.profile;
      setProfile(result.profile);
      return result;
    }
    if (message.action === "get-google-calendar-status") {
      return authorizedApi("/api/google/calendar", undefined, requestRole);
    }
    if (message.action === "connect-google-calendar") {
      return authorizedApi("/api/google/calendar/oauth/start", {
        method: "POST",
        body: JSON.stringify({}),
      }, requestRole);
    }

    if (message.action === "load-state") {
      let stateVersion = "";
      try {
        const { data: meta } = await withTimeout(
          supabase
            .from("dashboard_state_meta")
            .select("updated_at")
            .eq("id", "main")
            .maybeSingle<{ updated_at: string }>(),
          8_000,
          "Không thể kiểm tra phiên bản dữ liệu.",
        );
        stateVersion = meta?.updated_at ?? "";
      } catch {
        // Metadata chỉ phục vụ kiểm tra cache; vẫn có thể tải file trạng thái trực tiếp.
      }
      let compressedData: Blob | null = null;
      if ("caches" in window) {
        try {
          const cached = await withTimeout(
            caches.open(STATE_CACHE).then((cache) => cache.match(STATE_CACHE_URL)),
            CACHE_TIMEOUT_MS,
            "Bộ nhớ đệm dữ liệu phản hồi quá chậm.",
          );
          if (cached && cached.headers.get("X-CLM-State-Version") === stateVersion) {
            compressedData = await withTimeout(
              cached.blob(),
              CACHE_TIMEOUT_MS,
              "Không thể đọc dữ liệu từ bộ nhớ đệm.",
            );
          }
        } catch {
          // Tiếp tục tải trực tiếp từ Supabase khi cache không khả dụng.
        }
      }
      if (!compressedData) {
        const { data, error: stateError } = await withTimeout(
          supabase.storage.from(STATE_BUCKET).download(STATE_FILE),
          STATE_DOWNLOAD_TIMEOUT_MS,
          "Tải dữ liệu dashboard quá thời gian. Vui lòng thử lại.",
        );
        if (stateError) throw stateError;
        compressedData = data;
        if (compressedData && "caches" in window) {
          void withTimeout(
            caches.open(STATE_CACHE).then((cache) => cache.put(STATE_CACHE_URL, new Response(compressedData, {
              headers: {
                "Content-Type": "application/gzip",
                "X-CLM-State-Version": stateVersion,
              },
            }))),
            CACHE_TIMEOUT_MS,
            "Không thể ghi bộ nhớ đệm dữ liệu.",
          ).catch(() => undefined);
        }
      }
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
      if (activeRoleRef.current === "Viewer") {
        return { saved: false, readonly: true };
      }
      const state = payload.state;
      if (!state || typeof state !== "object") throw new Error("Dữ liệu dashboard không hợp lệ.");
      const json = safeDashboardJson(state);
      if (json === lastSavedStateRef.current) return { saved: false, unchanged: true };

      const saveOperation = saveQueueRef.current.then(async () => {
        const stateBlob = await compressState(json);
        await authorizedApi("/api/dashboard/state", {
          method: "PUT",
          body: stateBlob,
        }, requestRole);
        if ("caches" in window) {
          const cache = await caches.open(STATE_CACHE);
          await cache.put(STATE_CACHE_URL, new Response(stateBlob, {
            headers: {
              "Content-Type": "application/gzip",
              "X-CLM-State-Version": new Date().toISOString(),
            },
          }));
        }
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
    void fetch("/api/dashboard/session", { method: "DELETE" }).catch(() => undefined);
    await supabase.auth.signOut();
    setDashboardUrl("");
    profileRef.current = null;
    activeRoleRef.current = "";
    setProfile(null);
    setActiveRole("");
    setDashboardLoading(false);
    setDashboardReady(false);
    setDashboardBootError("");
    setPassword("");
    setError("");
    if ("caches" in window) {
      void withTimeout(
        caches.delete(STATE_CACHE),
        CACHE_TIMEOUT_MS,
        "Không thể xóa bộ nhớ đệm.",
      ).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!dashboardLoading || dashboardReady || dashboardBootError) return;
    const timer = window.setTimeout(() => {
      setDashboardLoading(false);
      setDashboardBootError("Kết nối dữ liệu mất quá nhiều thời gian. Hãy kiểm tra mạng rồi thử lại.");
    }, DASHBOARD_BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [dashboardBootError, dashboardLoading, dashboardReady, dashboardFrameKey]);

  useEffect(() => {
    if (!dashboardUrl || dashboardReady) return;
    const timer = window.setInterval(() => {
      try {
        const dataset = dashboardFrameRef.current?.contentDocument?.documentElement.dataset;
        if (dataset?.clmReady === "1") {
          setDashboardReady(true);
          setDashboardLoading(false);
          setDashboardBootError("");
        } else if (dataset?.clmError) {
          setDashboardReady(false);
          setDashboardLoading(false);
          setDashboardBootError(dataset.clmError);
        }
      } catch {
        // Cầu nối trực tiếp vẫn tiếp tục xử lý nếu frame tạm thời chưa đọc được.
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [dashboardFrameKey, dashboardReady, dashboardUrl]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    void supabase.auth.getSession()
      .then(async ({ data }) => {
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
      })
      .catch((sessionError) => {
        if (active) setError(sessionError instanceof Error ? sessionError.message : "Không thể kiểm tra phiên đăng nhập.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        setDashboardUrl("");
        setDashboardLoading(false);
        setDashboardReady(false);
        setDashboardBootError("");
      }
    });

    const sendRpcResult = (message: Record<string, unknown>) => {
      const childWindow = dashboardFrameRef.current?.contentWindow as DashboardBridgeWindow | null;
      if (!childWindow) return;
      try {
        if (typeof childWindow.__clmDashboardRpcResult === "function") {
          childWindow.__clmDashboardRpcResult(message);
          return;
        }
      } catch {
        // Dùng postMessage làm phương án dự phòng khi frame chưa cùng nguồn.
      }
      childWindow.postMessage(message, "*");
    };

    const handleDashboardPayload = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      if (data.type === "clm-dashboard-logout") {
        void logout();
        return;
      }
      if (data.type === "clm-dashboard-ready") {
        setDashboardReady(true);
        setDashboardLoading(false);
        setDashboardBootError("");
        return;
      }
      if (data.type === "clm-dashboard-error") {
        setDashboardReady(false);
        setDashboardLoading(false);
        setDashboardBootError(typeof data.error === "string" ? data.error : "Không thể tải dữ liệu dashboard.");
        return;
      }
      if (data.type !== "clm-dashboard-rpc") return;
      const message = data as DashboardRpcMessage;
      void runDashboardRpc(message)
        .then((result) => sendRpcResult({ type: "clm-dashboard-rpc-result", id: message.id, ok: true, data: result }))
        .catch((rpcError) => sendRpcResult({
          type: "clm-dashboard-rpc-result",
          id: message.id,
          ok: false,
          error: rpcError instanceof Error ? rpcError.message : "Thao tác Supabase thất bại.",
        }));
    };

    const hostWindow = window as DashboardBridgeWindow;
    const directBridge = (message: unknown) => handleDashboardPayload(message);
    hostWindow.__clmDashboardMessage = directBridge;

    const handleDashboardMessage = (event: MessageEvent) => {
      if (event.source !== dashboardFrameRef.current?.contentWindow) return;
      handleDashboardPayload(event.data);
    };
    window.addEventListener("message", handleDashboardMessage);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("message", handleDashboardMessage);
      if (hostWindow.__clmDashboardMessage === directBridge) {
        delete hostWindow.__clmDashboardMessage;
      }
    };
  }, [enterDashboard, loadCurrentProfile, logout, runDashboardRpc]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError || !loginData.user) throw new Error("Email hoặc mật khẩu không đúng.");
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

  if (dashboardUrl || dashboardLoading || dashboardBootError) {
    return (
      <main className="secure-app">
        {dashboardUrl && (
          <iframe
            key={dashboardFrameKey}
            ref={dashboardFrameRef}
            className={`private-dashboard-frame ${dashboardReady ? "is-ready" : ""}`}
            src={dashboardUrl}
            title="ColorME PR Sponsorship Dashboard"
            allow="clipboard-read; clipboard-write"
          />
        )}
        {(!dashboardReady || dashboardLoading || dashboardBootError) && (
          <DashboardLoading error={dashboardBootError} onRetry={() => void retryDashboard()} />
        )}
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
        <div className="login-brand">
          <BrandLogo />
          <strong>PR Dashboard</strong>
        </div>

        <div className="login-wrap">
          <h1>Đăng nhập</h1>
          <p className="login-subtitle">Chào mừng bạn quay trở lại!</p>

          <form onSubmit={login}>
            <label className="sr-only" htmlFor="email">Email</label>
            <div className="input-wrap"><Icon name="mail" /><input id="email" name="email" type="email" autoComplete="email" placeholder="Email của bạn" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <label className="sr-only" htmlFor="password">Mật khẩu</label>
            <div className="input-wrap"><Icon name="lock" /><input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" placeholder="Mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}><Icon name={passwordVisible ? "eyeOff" : "eye"} /></button></div>
            <div className="form-meta"><label><input type="checkbox" defaultChecked />Ghi nhớ đăng nhập</label><button type="button" onClick={() => void forgotPassword()}>Quên mật khẩu?</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-btn" type="submit" disabled={submitting}>{submitting ? "Đang đăng nhập…" : "Đăng nhập"}<Icon name="arrow" /></button>
          </form>
        </div>
        <footer>© 2026 ColorME. All rights reserved.</footer>
      </section>

      <section className="visual-side" aria-label="Giới thiệu PR Dashboard">
        <div className="visual-copy">
          <span className="visual-mark"><Icon name="chart" /></span>
          <h2><b>Quản lý sự kiện,<br />công việc &amp; tài trợ</b><br /><span>trong một nơi duy nhất</span></h2>
        </div>

        <div className="dashboard-art" aria-hidden="true">
          <div className="art-orbit art-orbit-one" />
          <div className="art-orbit art-orbit-two" />
          <div className="art-window">
            <div className="art-top"><BrandLogo compact /></div>
            <div className="art-body">
              <div className="art-menu"><i /><i /><i /><i /></div>
              <div className="art-chart"><span /><span /><span /></div>
              <div className="art-ring" />
            </div>
          </div>
          <span className="art-float calendar"><Icon name="calendar" /></span>
          <span className="art-float user"><Icon name="user" /></span>
        </div>
      </section>
    </main>
  );
}
