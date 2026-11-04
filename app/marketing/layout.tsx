import { Suspense, type ReactNode } from "react";
import { MarketingProvider } from "./workspace";
import "./marketing.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="mk-root"><p role="status">Đang mở Marketing…</p></div>}><MarketingProvider>{children}</MarketingProvider></Suspense>;
}
