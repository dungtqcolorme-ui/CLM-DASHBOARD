"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

const PRIVATE_BUCKET = "clm-dashboard-private";
const PRIVATE_DASHBOARD = "clm-dashboard-private (3).html";
const STATE_BUCKET = "clm-dashboard-state";
const STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";
const UPLOAD_BUCKET = "clm-dashboard-uploads";

type DashboardRpcMessage = {
  type: "clm-dashboard-rpc";
  id: string;
  action: "load-state" | "save-state" | "upload-file" | "open-file" | "delete-file";
  payload?: Record<string, unknown>;
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

async function compressState(json: string) {
  if (typeof CompressionStream === "undefined") {
    return new Blob([json], { type: "application/json;charset=utf-8" });
  }
  const compressedStream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(compressedStream).arrayBuffer()], {
    type: "application/gzip",
  });
}

async function readStateBlob(blob: Blob, compressed: boolean) {
  if (!compressed) return blob.text();
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Trình duyệt chưa hỗ trợ đọc dữ liệu dashboard đã nén.");
  }
  const decompressedStream = blob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressedStream).text();
}

function Logo() {
  return (
    <div className="brand" aria-label="ColorME">
      <span className="brand-mark"><i /><i /><i /></span>
      <span className="brand-name">ColorME</span>
    </div>
  );
}

export default function Home() {
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedStateRef = useRef("");

  const runDashboardRpc = useCallback(async (message: DashboardRpcMessage) => {
    const supabase = getSupabaseClient();
    const payload = message.payload ?? {};

    if (message.action === "load-state") {
      const { data: compressedData } = await supabase.storage
        .from(STATE_BUCKET)
        .download(STATE_FILE);

      let json = compressedData ? await readStateBlob(compressedData, true) : "";
      if (!json) {
        const { data: legacyData, error: legacyError } = await supabase.storage
          .from(STATE_BUCKET)
          .download(LEGACY_STATE_FILE);
        if (legacyError || !legacyData) return null;
        json = await readStateBlob(legacyData, false);
      }
      lastSavedStateRef.current = json;
      return JSON.parse(json) as Record<string, unknown>;
    }

    if (message.action === "save-state") {
      const state = payload.state;
      if (!state || typeof state !== "object") throw new Error("Dữ liệu dashboard không hợp lệ.");
      const json = JSON.stringify(state);
      if (json === lastSavedStateRef.current) return { saved: false, unchanged: true };

      const saveOperation = saveQueueRef.current.then(async () => {
        const stateBlob = await compressState(json);
        const { error: uploadError } = await supabase.storage
          .from(STATE_BUCKET)
          .upload(STATE_FILE, stateBlob, {
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
      const { error: uploadError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(path, file, {
          contentType: typeof payload.type === "string" && payload.type ? payload.type : "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      return { path, name: originalName, size: file.size, type: payload.type ?? "" };
    }

    const path = typeof payload.path === "string" ? payload.path : "";
    if (!path) throw new Error("Đường dẫn file không hợp lệ.");

    if (message.action === "open-file") {
      const { data, error: signedUrlError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .createSignedUrl(path, 60 * 10);
      if (signedUrlError || !data?.signedUrl) throw signedUrlError ?? new Error("Không thể mở file.");
      return { url: data.signedUrl };
    }

    const { error: deleteError } = await supabase.storage.from(UPLOAD_BUCKET).remove([path]);
    if (deleteError) throw deleteError;
    return { deleted: true };
  }, []);

  const openPrivateDashboard = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: storageError } = await supabase.storage
      .from(PRIVATE_BUCKET)
      .download(PRIVATE_DASHBOARD);

    if (storageError || !data) {
      throw new Error("Tài khoản chưa được cấp quyền xem dashboard.");
    }

    const htmlBlob = new Blob([await data.arrayBuffer()], {
      type: "text/html;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(htmlBlob);
    setDashboardUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return objectUrl;
    });
  }, []);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setDashboardUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return "";
    });
    setError("");
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        try {
          await openPrivateDashboard();
        } catch (sessionError) {
          setError(sessionError instanceof Error ? sessionError.message : "Không thể mở dashboard.");
        }
      }
      if (active) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) setDashboardUrl("");
    });

    const handleDashboardMessage = (event: MessageEvent) => {
      const dashboardFrame = document.querySelector<HTMLIFrameElement>(".private-dashboard-frame");
      if (event.source !== dashboardFrame?.contentWindow) return;
      if (event.data?.type === "clm-dashboard-logout") {
        void logout();
        return;
      }
      if (event.data?.type !== "clm-dashboard-rpc") return;

      const message = event.data as DashboardRpcMessage;
      void runDashboardRpc(message)
        .then((data) => dashboardFrame.contentWindow?.postMessage({
          type: "clm-dashboard-rpc-result",
          id: message.id,
          ok: true,
          data,
        }, "*"))
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
  }, [logout, openPrivateDashboard, runDashboardRpc]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    try {
      const supabase = getSupabaseClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw new Error("Email hoặc mật khẩu không đúng.");
      await openPrivateDashboard();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Không thể đăng nhập.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="secure-loading"><Logo /><span>Đang kiểm tra phiên đăng nhập…</span></main>;
  }

  if (dashboardUrl) {
    return (
      <main className="secure-app">
        <iframe
          className="private-dashboard-frame"
          src={dashboardUrl}
          title="ColorME PR Sponsorship Dashboard"
          allow="clipboard-read; clipboard-write"
        />
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-side">
        <Logo />
        <div className="login-wrap">
          <p className="eyebrow">CLM DASHBOARD</p>
          <h1>Đăng nhập</h1>
          <p className="welcome">Chào mừng trở lại! Đăng nhập để truy cập dashboard và dữ liệu nội bộ.</p>

          <form onSubmit={login}>
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><span>✉</span><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
            <label htmlFor="password">Mật khẩu</label>
            <div className="input-wrap"><span>▣</span><input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" required /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>◉</button></div>
            <div className="form-meta"><span>Supabase Auth bảo vệ phiên đăng nhập</span><button type="button" disabled>Quên mật khẩu?</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-btn" type="submit" disabled={submitting}>{submitting ? "Đang đăng nhập…" : "Đăng nhập"} <span>→</span></button>
          </form>

          <div className="preview-hint"><b>Dashboard riêng tư</b><span>File HTML gốc và dữ liệu thật được lưu trong Supabase Storage private, chỉ tải sau khi xác thực thành công.</span></div>
        </div>
        <footer>© 2026 ColorME · PR Sponsorship Dashboard</footer>
      </section>

      <section className="visual-side">
        <div className="visual-copy"><p>QUẢN LÝ TẬP TRUNG</p><h2>PR<br />SPONSORSHIP</h2><span>Theo dõi sự kiện, công việc và tài trợ trong một không gian duy nhất.</span></div>
        <div className="floating-card card-one"><i>↗</i><div><span>Sự kiện tháng này</span><b>LIVE</b></div></div>
        <div className="floating-card card-two"><i>✓</i><div><span>Bảo vệ dữ liệu</span><b>PRIVATE</b></div></div>
        <div className="visual-lines"><i /><i /><i /></div>
      </section>
    </main>
  );
}
