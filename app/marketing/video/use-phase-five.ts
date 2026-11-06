"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { MarketingError } from "@/lib/marketing/domain";
import { assertCreativeCurrent, CreativeCancelled, guardCreativeResponse } from "../creative/request-state";
import { phaseFiveDraftCache } from "./draft-access";
import { useMarketing } from "../workspace";

export function useVersionedDraft<T>(key: string, accessVersion: number) {
  const [draft, setDraft] = useState<T | null>(() => phaseFiveDraftCache.read<T>(key));
  return [draft, (next: T | null) => {
    if (!phaseFiveDraftCache.isCurrent(accessVersion)) return;
    phaseFiveDraftCache.write(key, next);
    setDraft(next);
  }] as const;
}

export function usePhaseFive<Workspace>(area: "video" | "reports", userId: string, accessVersion: number) {
  const { invalidateAccess } = useMarketing();
  const path = "/api/marketing/" + area;
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const sequence = useRef(0);
  const active = useRef(false);
  const capture = useCallback(() => {
    const current = generation.current;
    return () => assertCreativeCurrent(() => active.current && current === generation.current && phaseFiveDraftCache.isCurrent(accessVersion));
  }, [accessVersion]);
  const request = useCallback(async (url = path, init?: RequestInit) => {
    const current = generation.current;
    const allowed = () => active.current && current === generation.current && phaseFiveDraftCache.isCurrent(accessVersion);
    const { data: auth } = await getSupabaseClient().auth.getSession();
    assertCreativeCurrent(allowed);
    if (!auth.session || auth.session.user.id !== userId) {
      invalidateAccess("Phiên đăng nhập đã thay đổi.", 401);
      throw new CreativeCancelled();
    }
    const headers = new Headers(init?.headers);
    headers.set("Authorization", "Bearer " + auth.session.access_token);
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    assertCreativeCurrent(allowed);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      assertCreativeCurrent(allowed);
      if (response.status === 401 || (response.status === 403 && !["asset_unavailable", "share_not_approved"].includes(body.code))) {
        invalidateAccess(body.error || "Quyền truy cập đã thay đổi.", response.status);
        throw new CreativeCancelled();
      }
      throw new MarketingError(body.error || "Không thể thực hiện yêu cầu.", response.status, body.code);
    }
    return guardCreativeResponse(response, allowed);
  }, [accessVersion, invalidateAccess, path, userId]);
  const refresh = useCallback(async () => {
    const load = ++sequence.current;
    const body = await (await request()).json();
    if (load === sequence.current) {
      setData(body);
      setError("");
    }
    return body as Workspace;
  }, [request]);
  const retry = useCallback(() => {
    void refresh().catch((err) => { if (!(err instanceof CreativeCancelled)) setError(err.message); });
  }, [refresh]);
  useEffect(() => {
    active.current = true;
    retry();
    return () => {
      active.current = false;
      // A route unmount invalidates every in-flight request, including in Strict Mode.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [retry]);
  const command = useCallback(async <Result,>(value: unknown) => {
    const assertCurrent = capture();
    const response = await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const body = await response.json();
    assertCurrent();
    return body.result as Result;
  }, [capture, path, request]);
  return { data, error, request, refresh, retry, command, capture, setData };
}

export function useOperation() {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const running = useRef(false);
  async function run(action: () => Promise<void>, success = "") {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setNotice("");
    try {
      await action();
      setNotice(success);
      setConflict(false);
    } catch (error) {
      if (error instanceof CreativeCancelled) return;
      const stale = error instanceof MarketingError && error.status === 409;
      setConflict(stale);
      setNotice(stale ? "Phát hiện phiên bản mới. Thay đổi của bạn được giữ." : error instanceof Error ? error.message : "Không thể thực hiện yêu cầu.");
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return { run, pending, notice, conflict };
}
