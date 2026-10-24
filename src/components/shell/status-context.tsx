"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { StatusView } from "@/server/views";

interface StatusState {
  status: StatusView | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<StatusState>({ status: null, error: null, refresh: async () => {} });

/** Polls /api/status so Ollama going up or down is reflected everywhere without a reload. */
export function StatusProvider({ children, intervalMs = 8000 }: { children: ReactNode; intervalMs?: number }) {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status unavailable");
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const polling = intervalMs > 0;
    const id = polling ? setInterval(refresh, intervalMs) : undefined;
    const onFocus = () => refresh();
    if (polling) window.addEventListener("focus", onFocus);
    window.addEventListener("aiops:refresh", onFocus);
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("aiops:refresh", onFocus);
    };
  }, [refresh, intervalMs]);

  return <Ctx.Provider value={{ status, error, refresh }}>{children}</Ctx.Provider>;
}

export function useStatus() {
  return useContext(Ctx);
}

/** Lets any component ask the shell to refresh status (e.g. after an execution). */
export function announceChange() {
  window.dispatchEvent(new Event("aiops:refresh"));
}
