"use client";

import { FormEvent, useState } from "react";

const demoEvents = [
  { name: "Workshop Thiết kế sáng tạo", owner: "Nhân sự A", status: "Đang xử lý", date: "24/07" },
  { name: "Ngày hội câu lạc bộ", owner: "Nhân sự B", status: "Chờ phản hồi", date: "27/07" },
  { name: "Talkshow định hướng nghề nghiệp", owner: "Nhân sự C", status: "Đã ký", date: "02/08" },
];

function Logo() {
  return (
    <div className="brand" aria-label="ColorME">
      <span className="brand-mark"><i /><i /><i /></span>
      <span className="brand-name">ColorME</span>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          <button className="nav-active">⌂ <span>Tổng quan</span></button>
          <button>◫ <span>Sự kiện</span></button>
          <button>✓ <span>Công việc</span></button>
          <button>◇ <span>Kho tài trợ</span></button>
          <button>♙ <span>Nhân sự</span></button>
          <button>▥ <span>Báo cáo</span></button>
        </nav>
        <button className="logout" onClick={onLogout}>↪ <span>Đăng xuất</span></button>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <div>
            <p>PR Sponsorship</p>
            <h1>Tổng quan</h1>
          </div>
          <div className="profile"><span>DEMO</span><b>D</b></div>
        </header>

        <div className="demo-note">Bản demo công khai · Dữ liệu minh họa, không chứa dữ liệu nội bộ</div>

        <section className="metric-grid">
          <article><span className="metric-icon red">↗</span><p>Sự kiện đang chạy</p><strong>12</strong><small>+3 trong tháng này</small></article>
          <article><span className="metric-icon yellow">⌁</span><p>Chờ phản hồi</p><strong>08</strong><small>Cần theo dõi</small></article>
          <article><span className="metric-icon green">✓</span><p>Đã ký hợp tác</p><strong>24</strong><small>80% mục tiêu tháng</small></article>
          <article><span className="metric-icon blue">◇</span><p>Hiện vật còn lại</p><strong>1.248</strong><small>Sẵn sàng phân bổ</small></article>
        </section>

        <section className="content-grid">
          <article className="panel activity-panel">
            <div className="panel-title"><div><p>HOẠT ĐỘNG</p><h2>Sự kiện gần đây</h2></div><button>Xem tất cả →</button></div>
            <div className="event-list">
              {demoEvents.map((event) => (
                <div className="event-row" key={event.name}>
                  <time>{event.date}</time>
                  <div><b>{event.name}</b><span>{event.owner}</span></div>
                  <em className={`status ${event.status === "Đã ký" ? "done" : event.status === "Chờ phản hồi" ? "waiting" : "active"}`}>{event.status}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="panel progress-panel">
            <div className="panel-title"><div><p>TIẾN ĐỘ THÁNG</p><h2>Mục tiêu tài trợ</h2></div></div>
            <div className="donut"><span><b>72%</b><small>Hoàn thành</small></span></div>
            <div className="legend"><span><i className="red-dot" />Đã hoàn thành <b>36</b></span><span><i />Còn lại <b>14</b></span></div>
          </article>
        </section>
      </section>
    </main>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (!email.includes("@") || password.length < 4) {
      setError("Vui lòng nhập email hợp lệ và mật khẩu từ 4 ký tự.");
      return;
    }
    setError("");
    setLoggedIn(true);
  }

  if (loggedIn) return <Dashboard onLogout={() => setLoggedIn(false)} />;

  return (
    <main className="login-page">
      <section className="login-side">
        <Logo />
        <div className="login-wrap">
          <p className="eyebrow">CLM DASHBOARD</p>
          <h1>Đăng nhập</h1>
          <p className="welcome">Chào mừng trở lại! Vui lòng nhập thông tin để tiếp tục.</p>

          <form onSubmit={login}>
            <label>Email</label>
            <div className="input-wrap"><span>✉</span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" /></div>
            <label>Mật khẩu</label>
            <div className="input-wrap"><span>▣</span><input name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)}>◉</button></div>
            <div className="form-meta"><label><input type="checkbox" /> Ghi nhớ đăng nhập</label><button type="button">Quên mật khẩu?</button></div>
            {error && <p className="form-error">{error}</p>}
            <button className="submit-btn" type="submit">Đăng nhập <span>→</span></button>
          </form>

          <div className="preview-hint"><b>Bản xem trước công khai</b><span>Nhập email bất kỳ và mật khẩu từ 4 ký tự để mở dashboard demo.</span></div>
        </div>
        <footer>© 2026 ColorME · PR Sponsorship Dashboard</footer>
      </section>

      <section className="visual-side">
        <div className="visual-copy"><p>QUẢN LÝ TẬP TRUNG</p><h2>PR<br />SPONSORSHIP</h2><span>Theo dõi sự kiện, công việc và tài trợ trong một không gian duy nhất.</span></div>
        <div className="floating-card card-one"><i>↗</i><div><span>Sự kiện tháng này</span><b>+24%</b></div></div>
        <div className="floating-card card-two"><i>✓</i><div><span>Tiến độ công việc</span><b>86%</b></div></div>
        <div className="visual-lines"><i /><i /><i /></div>
      </section>
    </main>
  );
}
