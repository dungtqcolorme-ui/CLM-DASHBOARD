"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { isMarketingPath } from "@/lib/marketing/navigation";
import { DashboardOutlet } from "./dashboard-outlet";

// Keep the authenticated Dashboard document mounted as the shared shell.
const LegacyDashboard = dynamic(() => import("./page"), { ssr: false });

export default function WorkspaceHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const marketing = isMarketingPath(pathname);
  const dashboardVisible = pathname === "/" || marketing;
  const [hasVisitedDashboard, setHasVisitedDashboard] = useState(dashboardVisible);
  if (dashboardVisible && !hasVisitedDashboard) setHasVisitedDashboard(true);

  return <>
    <div data-clm-legacy-host hidden={!dashboardVisible}>
      <DashboardOutlet.Provider value={marketing ? children : null}>
        {hasVisitedDashboard && <LegacyDashboard />}
      </DashboardOutlet.Provider>
    </div>
    {!dashboardVisible && children}
  </>;
}
