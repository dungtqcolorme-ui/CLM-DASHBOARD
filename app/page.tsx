"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

const PRIVATE_BUCKET = "clm-dashboard-private";
const PRIVATE_DASHBOARD = "clm-dashboard-private (1).html";

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
      if (event.source === dashboardFrame?.contentWindow && event.data?.type === "clm-dashboard-logout") {
        void logout();
      }
    };
    window.addEventListener("message", handleDashboardMessage);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("message", handleDashboardMessage);
    };
  }, [logout, openPrivateDashboard]);

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
