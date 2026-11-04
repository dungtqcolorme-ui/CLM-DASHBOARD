"use client";

import { useEffect, useRef } from "react";

type DraftStorage = Pick<Storage, "getItem" | "removeItem">;

export function readDraft(key: string, storage?: DraftStorage): string | null {
  try { return (storage ?? sessionStorage).getItem(key); } catch { return null; }
}

// An older request must never remove a newer editor's draft, even for the same
// entity. Compare the complete serialized draft (including expected version).
export function discardDraftIfUnchanged(key: string, saved: string | null, storage?: DraftStorage): boolean {
  if (saved === null) return false;
  try {
    const cache = storage ?? sessionStorage;
    if (cache.getItem(key) !== saved) return false;
    cache.removeItem(key);
    return true;
  } catch { return false; }
}

export function useMountedEditor() {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return mounted;
}
