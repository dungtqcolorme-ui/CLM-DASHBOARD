"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { KnowledgeCommand, KnowledgeWorkspace } from "@/lib/marketing/knowledge-types";
import { MarketingError } from "../workspace";
import { discardDraftIfUnchanged, readDraft } from "../draft-cache";
import { canAdoptServerDraft } from "./draft-refresh";

export function useKnowledge() {
  const [data, setData] = useState<KnowledgeWorkspace | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const mounted = useRef(true); const generation = useRef(0); const identity = useRef<string | null>(null); const readSequence = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { mounted.current = false; clearInterval(timer); }; }, []);
  const invalidate = useCallback((message: string) => { generation.current++; if (mounted.current) { setData(null); setError(message); } }, [mounted]);
  const request = useCallback(async (value?: KnowledgeCommand) => {
    const current = generation.current;
    const { data: auth } = await getSupabaseClient().auth.getSession();
    if (auth.session && identity.current && identity.current !== auth.session.user.id) { invalidate("Tài khoản đã thay đổi. Mở lại Marketing."); throw new MarketingError("Tài khoản đã thay đổi.", 401); }
    if (auth.session) identity.current = auth.session.user.id;
    if (!auth.session) { invalidate("Phiên đăng nhập đã kết thúc."); throw new MarketingError("Vui lòng đăng nhập lại.", 401); }
    const response = await fetch("/api/marketing/knowledge", { method: value ? "POST" : "GET", headers: { Authorization: `Bearer ${auth.session.access_token}`, ...(value ? { "Content-Type": "application/json" } : {}) }, ...(value ? { body: JSON.stringify(value) } : {}), cache: "no-store" });
    const body = await response.json();
    if (current !== generation.current || !mounted.current) throw new MarketingError("Phiên làm việc đã thay đổi.", 401);
    if (!response.ok) { if ([401, 403].includes(response.status)) invalidate(body.error || "Quyền truy cập đã thay đổi."); throw new MarketingError(body.error || "Không thể thực hiện thao tác.", response.status); }
    return body;
  }, [invalidate, mounted]);
  const refresh = useCallback(async () => { const sequence = ++readSequence.current; const body = await request(); if (mounted.current && sequence === readSequence.current) { setData(body); setError(""); } }, [request, mounted]);
  const command = useCallback(async <T = Record<string, unknown>,>(value: KnowledgeCommand): Promise<T> => {
    const body = await request(value);
    try { await refresh(); } catch (e) { if (mounted.current) setError(e instanceof Error ? `Đã lưu. ${e.message}` : "Đã lưu; hãy tải lại dữ liệu."); }
    return body.result as T;
  }, [request, refresh, mounted]);
  useEffect(() => {
    void refresh().catch((e) => { if (mounted.current) setError(e instanceof Error ? e.message : "Không thể tải kiến thức."); }).finally(() => { if (mounted.current) setLoading(false); });
    const { data: auth } = getSupabaseClient().auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT" || (session && identity.current && session.user.id !== identity.current)) invalidate("Phiên đăng nhập đã thay đổi."); });
    // This is a request generation counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; auth.subscription.unsubscribe(); };
  }, [refresh, mounted, invalidate]);
  return { data, error, loading, command, refresh, now };
}
export type KnowledgeController = ReturnType<typeof useKnowledge>;

// Per-user and entity drafts preserve their optimistic version. Never replace a
// dirty form merely because a follow-up GET returns a newer server record.
export function useKnowledgeDraft<T>(key: string, initial: T, serverVersion?: number) {
  const [form, setForm] = useState(initial); const [dirty, setDirty] = useState(false);
  const adoptedVersion = useRef(serverVersion);
  useEffect(() => { const saved = readDraft(key); if (saved) { try { const restored = JSON.parse(saved); setForm(restored); setDirty(true); } catch { /* Ignore corrupt optional browser storage. */ } } }, [key]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!canAdoptServerDraft(serverVersion, adoptedVersion.current, dirty, readDraft(key))) return;
    adoptedVersion.current = serverVersion;
    // Synchronize a new server version only when no unsaved browser draft exists.
    setForm(initial);
  }, [serverVersion, initial, dirty, key]);
  const change = (next: T) => { setForm(next); setDirty(true); try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Form remains usable without storage. */ } };
  const saved = (snapshot: string | null, next?: T) => { if (discardDraftIfUnchanged(key, snapshot) || (snapshot === null && readDraft(key) === null)) { setDirty(false); if (next !== undefined) setForm(next); } };
  const adoptServer = () => { discardDraftIfUnchanged(key, readDraft(key)); adoptedVersion.current = serverVersion; setForm(initial); setDirty(false); };
  return { form, change, dirty, saved, adoptServer, snapshot: () => readDraft(key) };
}
