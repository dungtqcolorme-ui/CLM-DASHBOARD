"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ColoroMotion } from "../../ColoroLoading";
import { Panel } from "../components";
import { getSupabaseClient } from "@/lib/supabaseClient";

const prompts = [
  { label: "Caption", question: "Gợi ý kiểm tra caption" },
  { label: "Carousel", question: "Gợi ý bố cục carousel" },
  { label: "Chọn ảnh", question: "Cách chọn ảnh có quyền sử dụng" },
  { label: "Checklist gửi duyệt", question: "Cần kiểm tra gì trước khi gửi duyệt?" },
];

function guidance(question: string, saved: boolean) {
  const intent = question.toLocaleLowerCase("vi").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d");
  if (/duyet|preflight|xuat ban/.test(intent)) {
    return saved
      ? "Lưu caption và thiết kế, kiểm tra quyền của từng ảnh và xem Preflight. Mở bản chuẩn bị xuất bản để đối chiếu nội dung trước khi gửi duyệt."
      : "Lưu bản nháp trước để mở thiết kế và bước chuẩn bị xuất bản. Bạn có thể xem lại caption trong Studio trước khi lưu.";
  }
  if (/carousel|bo cuc|canvas|layer/.test(intent)) {
    return "Dùng trang đầu cho một thông điệp chính, các trang giữa cho từng ý và trang cuối cho lời kêu gọi. Xem thứ tự trong dải Trang, rồi dùng thuộc tính layer để căn chỉnh từng trang.";
  }
  if (/anh|hinh|logo|asset/.test(intent)) {
    return "Chọn ảnh gốc đúng team hoặc Campaign từ danh sách trong Workbench. Kiểm tra quyền dùng Facebook, hạn sử dụng và tác giả trong Asset & Template Library trước khi đưa ảnh vào bài.";
  }
  if (/caption|tieu de|noi dung|cta/.test(intent)) {
    return "Kiểm tra câu mở đầu có nêu một lợi ích rõ ràng. Đối chiếu tên riêng, ngày và số liệu với dẫn chứng, rồi kết thúc bằng một hành động cụ thể. Preview chỉ hiển thị caption đã lưu.";
  }
  return "Tôi có thể hướng dẫn kiểm tra caption, bố cục carousel, chọn ảnh có quyền sử dụng và chuẩn bị gửi duyệt. Chọn một chủ đề để bắt đầu.";
}

export function StudioWorkspace({ children, evidence, saved, scopeKey, profileId, codexAvailable }: {
  children: ReactNode;
  evidence: ReactNode;
  saved: boolean;
  scopeKey: string;
  profileId: string;
  codexAvailable: boolean;
}) {
  const [width, setWidth] = useState(304);
  const assistant = useRef<HTMLElement>(null);
  return <div className="mk-studio-workspace" style={{ "--mk-assistant-width": `${width}px` } as CSSProperties}>
    <button className="mk-assistant-jump" type="button" onClick={() => {
      assistant.current?.focus({ preventScroll: true });
      assistant.current?.scrollIntoView({ block: "start" });
    }}>Đến trợ lý Studio</button>
    <div className="mk-stack">{children}</div>
    <aside ref={assistant} tabIndex={-1} aria-label="Trợ lý Creative Studio" className="mk-studio-assistant">
      <Panel title="Trợ lý Studio">
        <label className="mk-assistant-resize">Độ rộng chat
          <input type="range" min={248} max={376} step={8} value={width}
            onChange={(event) => setWidth(event.currentTarget.valueAsNumber)} />
        </label>
        <StudioChat key={profileId + "/" + (codexAvailable ? "codex" : scopeKey)}
          profileId={profileId} saved={saved} codexAvailable={codexAvailable} />
        <details className="mk-assistant-evidence">
          <summary>Dẫn chứng nội dung</summary>
          {evidence}
        </details>
      </Panel>
    </aside>
  </div>;
}

type CodexQuestion = { id: string; message: string };

function readPendingQuestion(key: string): CodexQuestion | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (typeof value?.id === "string" && typeof value.message === "string" && value.message.length <= 1200
      && Number.isFinite(value.createdAt) && Date.now() - value.createdAt < 86400000) {
      return { id: value.id, message: value.message };
    }
  } catch { /* Studio can continue without tab storage. */ }
  return null;
}

function rememberPendingQuestion(key: string, job: CodexQuestion) {
  try { sessionStorage.setItem(key, JSON.stringify({ ...job, createdAt: Date.now() })); }
  catch { /* The current tab can still follow the result. */ }
}

function StudioChat({ saved, profileId, codexAvailable }: {
  saved: boolean;
  profileId: string;
  codexAvailable: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<{ id: number; question: string; answer: string }[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [resumeJob, setResumeJob] = useState<CodexQuestion | null>(null);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  const storageKey = `clm:studio-codex:${profileId}`;
  useEffect(() => {
    if (log.current && turns.length) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);

  const addTurn = useCallback((question: string, answer: string) => {
    const turn = { id: ++sequence.current, question, answer };
    setTurns(current => [...current.slice(-5), turn]);
    setQuestion("");
  }, []);

  const run = useCallback(async (job: CodexQuestion) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const signal = controller.signal;
    setResumeJob(job);
    setQuestion(job.message);
    setError("");
    setPending("Đang kết nối tới ColorME Marketing…");

    function forgetJob() {
      try { sessionStorage.removeItem(storageKey); } catch { /* No storage access. */ }
      setResumeJob(null);
    }

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (signal.aborted) return;
      if (!session || session.user.id !== profileId) throw new Error("Phiên đăng nhập đã đổi. Hãy mở lại Studio.");
      const headers = { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
      const url = "/api/marketing/studio-codex";
      // The ID is reused on reload and network retry. The database creates only one turn for it.
      const submitted = await fetch(url, {
        method: "POST", headers, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        body: JSON.stringify(job),
      });
      const receipt = await submitted.json().catch(() => null);
      if (signal.aborted) return;
      if (!submitted.ok || receipt?.id !== job.id) {
        if (submitted.status === 400 || submitted.status === 409) forgetJob();
        throw new Error(receipt?.error || "Chưa xác nhận được câu hỏi đã gửi.");
      }

      for (let attempt = 0; attempt < 330 && !signal.aborted; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (signal.aborted) return;
        const response = await fetch(`${url}?id=${encodeURIComponent(job.id)}`, {
          headers, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), cache: "no-store",
        }).catch(() => null);
        if (signal.aborted) return;
        if (!response || response.status >= 500) {
          setPending("Đang kết nối lại để lấy phản hồi…");
          continue;
        }
        const result = await response.json().catch(() => null);
        if (signal.aborted) return;
        if (!response.ok) throw new Error(result?.error || "Chưa đọc được trạng thái Codex.");
        if (result?.state === "completed" && typeof result.answer === "string" && result.answer.trim()) {
          forgetJob();
          addTurn(job.message, result.answer);
          return;
        }
        if (result?.state === "failed") {
          forgetJob();
          throw new Error("Codex chưa trả lời. Kiểm tra cầu nối trên máy rồi thử lại.");
        }
        setPending(result?.state === "running" ? "ColorME Marketing đang trả lời…" : "Đang chờ Codex trên máy nhận câu hỏi…");
      }
      throw new Error("Đã hết thời gian chờ phản hồi từ Codex.");
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Chưa thể hỏi Codex.");
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!signal.aborted) setPending("");
      }
    }
  }, [addTurn, profileId, storageKey]);

  useEffect(() => {
    if (!codexAvailable) return;
    const timer = setTimeout(() => {
      const job = readPendingQuestion(storageKey);
      if (job) void run(job);
    }, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [codexAvailable, run, storageKey]);

  function send(value: string) {
    const message = value.trim();
    if (!message || active.current || resumeJob) return;
    setError("");
    if (!codexAvailable) {
      addTurn(message, guidance(message, saved));
      return;
    }
    const job = { id: crypto.randomUUID(), message };
    rememberPendingQuestion(storageKey, job);
    void run(job);
  }

  return <div className="mk-assistant-chat">
    <div className="mk-assistant-intro">
      <ColoroMotion key={turns.at(-1)?.id ?? "idle"} state={pending ? "thinking" : error ? "error" : turns.length ? "creative" : "idle"} compact />
      <p>{codexAvailable ? "Hỏi trực tiếp chat ColorME Marketing trong Codex. Chat dùng chung ngữ cảnh Marketing." : "Gợi ý theo quy tắc trong ứng dụng. Cầu nối Codex chưa bật cho tài khoản này."}</p>
    </div>
    <div ref={log} className="mk-assistant-log" role="log" aria-label="Hội thoại Studio" aria-live="polite">
      {turns.map((turn) => <div key={turn.id} className="mk-assistant-turn">
        <p><strong>Bạn</strong>{turn.question}</p>
        <p><strong>Coloro</strong>{turn.answer}</p>
      </div>)}
    </div>
    {pending && <p role="status">{pending}</p>}
    {error && <p className="mk-error" role="alert">{error}</p>}
    {resumeJob && !pending && <button type="button" onClick={() => void run(resumeJob)}>Tiếp tục chờ phản hồi</button>}
    <div className="mk-assistant-prompts" aria-label="Chủ đề gợi ý">
      {prompts.map((prompt) => <button type="button" key={prompt.label} disabled={Boolean(pending || resumeJob)} onClick={() => send(prompt.question)}>{prompt.label}</button>)}
    </div>
    <form className="mk-assistant-form" onSubmit={(event) => { event.preventDefault(); send(question); }}>
      <label>Hỏi trợ lý Studio
        <textarea rows={2} maxLength={1200} disabled={Boolean(pending || resumeJob)} value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
      </label>
      <button type="submit" className="mk-primary" disabled={Boolean(pending || resumeJob) || !question.trim()}>Gửi câu hỏi</button>
    </form>
  </div>;
}
