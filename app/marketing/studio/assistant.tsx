"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ColoroMotion } from "../../ColoroLoading";
import { Panel } from "../components";
import { StudioWebChatLink } from "./web-chat-link";

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

export function StudioWorkspace({ children, evidence, saved, scopeKey, profileId }: {
  children: ReactNode;
  evidence: ReactNode;
  saved: boolean;
  scopeKey: string;
  profileId: string;
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
        <StudioWebChatLink key={profileId} profileId={profileId} />
        <StudioChat key={scopeKey} saved={saved} />
        <details className="mk-assistant-evidence">
          <summary>Dẫn chứng nội dung</summary>
          {evidence}
        </details>
      </Panel>
    </aside>
  </div>;
}

function StudioChat({ saved }: { saved: boolean }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<{ id: number; question: string; answer: string }[]>([]);
  const sequence = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current && turns.length) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);

  function send(value: string) {
    const text = value.trim();
    if (!text) return;
    const turn = { id: ++sequence.current, question: text, answer: guidance(text, saved) };
    setTurns((current) => [...current.slice(-5), turn]);
    setQuestion("");
  }

  return <div className="mk-assistant-chat">
    <div className="mk-assistant-intro">
      <ColoroMotion key={turns.at(-1)?.id ?? "idle"} state={turns.length ? "creative" : "idle"} compact />
      <p>Gợi ý theo quy tắc trong ứng dụng. Chat không gửi dữ liệu ra ngoài.</p>
    </div>
    <div ref={log} className="mk-assistant-log" role="log" aria-label="Hội thoại Studio" aria-live="polite">
      {turns.map((turn) => <div key={turn.id} className="mk-assistant-turn">
        <p><strong>Bạn</strong>{turn.question}</p>
        <p><strong>Coloro</strong>{turn.answer}</p>
      </div>)}
    </div>
    <div className="mk-assistant-prompts" aria-label="Chủ đề gợi ý">
      {prompts.map((prompt) => <button type="button" key={prompt.label} onClick={() => send(prompt.question)}>{prompt.label}</button>)}
    </div>
    <form className="mk-assistant-form" onSubmit={(event) => { event.preventDefault(); send(question); }}>
      <label>Hỏi trợ lý Studio
        <textarea rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
      </label>
      <button type="submit" className="mk-primary" disabled={!question.trim()}>Gửi câu hỏi</button>
    </form>
  </div>;
}
