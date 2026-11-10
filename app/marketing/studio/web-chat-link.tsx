"use client";

import { useState, useSyncExternalStore } from "react";
import { Field } from "../components";

const linkChanged = "clm:studio-web-chat-link";

function conversationUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const conversation = /^\/c\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/?$/i;
    if (url.origin !== "https://chatgpt.com" || url.username || url.password || !conversation.test(url.pathname)) {
      return "";
    }
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function subscribe(refresh: () => void) {
  window.addEventListener("storage", refresh);
  window.addEventListener(linkChanged, refresh);
  return () => {
    window.removeEventListener("storage", refresh);
    window.removeEventListener(linkChanged, refresh);
  };
}

export function StudioWebChatLink({ profileId }: { profileId: string }) {
  const key = `clm:studio-web-chat:${profileId}`;
  const href = useSyncExternalStore(subscribe, () => {
    try {
      return conversationUrl(window.localStorage.getItem(key) ?? "");
    } catch {
      return "";
    }
  }, () => "");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  function update(next: string) {
    setStatus("");
    setError("");
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch {
      setError("Trình duyệt đang chặn lưu liên kết cho tài khoản này.");
      return;
    }
    window.dispatchEvent(new Event(linkChanged));
    setValue("");
    setStatus(next ? "Đã lưu liên kết ChatGPT." : "Đã gỡ liên kết ChatGPT.");
  }

  return <div className="mk-assistant-web-chat">
    {href && <a className="mk-button" href={href} target="_blank" rel="noopener noreferrer">
      Mở cuộc chat trên ChatGPT
    </a>}
    <details>
      <summary>{href ? "Đổi liên kết ChatGPT" : "Thêm liên kết ChatGPT"}</summary>
      <form className="mk-assistant-form" onSubmit={(event) => {
        event.preventDefault();
        const url = conversationUrl(value);
        if (url) update(url);
        else {
          setStatus("");
          setError("Dùng địa chỉ của cuộc chat có dạng https://chatgpt.com/c/…");
        }
      }}>
        <p className="mk-muted">Dán địa chỉ từ thanh trình duyệt. Liên kết được lưu cho tài khoản này trên trình duyệt hiện tại.</p>
        <Field label="Liên kết cuộc chat ChatGPT">
          <input type="url" maxLength={512} required value={value} onChange={(event) => {
            setValue(event.currentTarget.value);
            setError("");
            setStatus("");
          }} />
        </Field>
        <button type="submit">Lưu liên kết ChatGPT</button>
        {href && <button type="button" onClick={() => update("")}>Gỡ liên kết ChatGPT</button>}
      </form>
    </details>
    {error && <p role="alert" className="mk-error">{error}</p>}
    <div role="status">{status}</div>
  </div>;
}
