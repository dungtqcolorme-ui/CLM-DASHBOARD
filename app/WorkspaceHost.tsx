"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Load the large legacy application only when visited, then preserve its mounted
// iframe and unsaved forms across client-side Marketing navigation.
const LegacyDashboard = dynamic(() => import("./page"), { ssr: false });

export default function WorkspaceHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const legacyVisible = pathname === "/";
  const [hasVisitedLegacy, setHasVisitedLegacy] = useState(legacyVisible);
  if (legacyVisible && !hasVisitedLegacy) setHasVisitedLegacy(true);
  useEffect(() => {
    if (legacyVisible) window.dispatchEvent(new Event("clm-legacy-resume"));
  }, [legacyVisible]);

  return <>
    <div data-clm-legacy-host hidden={!legacyVisible}>{hasVisitedLegacy && <LegacyDashboard />}</div>
    {!legacyVisible && children}
  </>;
}
