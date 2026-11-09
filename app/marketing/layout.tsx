import { Suspense, type ReactNode } from "react";
import { MarketingLoading, MarketingProvider } from "./workspace";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="mk-root"><MarketingLoading /></div>}><MarketingProvider>{children}</MarketingProvider></Suspense>;
}
