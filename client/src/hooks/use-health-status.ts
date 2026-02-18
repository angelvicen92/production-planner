import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { getSupabaseClient, supabase } from "@/lib/supabaseClient";
import { getLastApiHealth, subscribeApiHealth, triggerGlobalRecovery, type ApiHealthSnapshot } from "@/lib/health-events";

export type HealthColor = "green" | "yellow" | "red";

export function useHealthStatus() {
  const queryClient = useQueryClient();
  const fetchingSinceRef = useRef(new Map<string, number>());

  const [sessionExpired, setSessionExpired] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealthSnapshot | null>(getLastApiHealth());
  const [apiPingOk, setApiPingOk] = useState(true);
  const [lastPingMs, setLastPingMs] = useState<number | null>(null);

  const revalidateSession = useCallback(async () => {
    const client = await getSupabaseClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    setSessionExpired(!session);
    return !session;
  }, []);

  const pingApi = useCallback(async () => {
    const started = performance.now();
    try {
      await apiRequest<{ status: string }>("GET", "/api/health");
      setApiPingOk(true);
      setLastPingMs(Math.round(performance.now() - started));
    } catch {
      setApiPingOk(false);
      setLastPingMs(Math.round(performance.now() - started));
    }
  }, []);

  useEffect(() => subscribeApiHealth(setApiHealth), []);

  useEffect(() => {
    const evaluate = () => {
      const now = Date.now();
      const stuck: { key: string; seconds: number }[] = [];
      const queries = queryClient.getQueryCache().findAll();

      for (const query of queries) {
        const hash = query.queryHash;
        const key = JSON.stringify(query.queryKey);
        if (query.state.fetchStatus === "fetching") {
          if (!fetchingSinceRef.current.has(hash)) {
            fetchingSinceRef.current.set(hash, now);
          }
          const since = fetchingSinceRef.current.get(hash) ?? now;
          if (now - since > 10_000) {
            stuck.push({ key, seconds: Math.floor((now - since) / 1000) });
          }
        } else {
          fetchingSinceRef.current.delete(hash);
        }
      }

      return stuck;
    };

    const interval = setInterval(() => {
      setStuckQueries(evaluate());
    }, 1_000);

    setStuckQueries(evaluate());
    return () => clearInterval(interval);
  }, [queryClient]);

  const [stuckQueries, setStuckQueries] = useState<{ key: string; seconds: number }[]>([]);

  useEffect(() => {
    void revalidateSession();
    void pingApi();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void revalidateSession();
      void pingApi();
    };

    const onFocus = () => {
      void revalidateSession();
      void pingApi();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void revalidateSession();
        void pingApi();
      }
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [pingApi, revalidateSession]);

  const realtimeStatus = useMemo(() => {
    const channels = supabase.getChannels();
    if (channels.length === 0) return "ok" as const;
    const hasBad = channels.some((channel) => {
      const state = (channel as any)?.state;
      return state !== "joined" && state !== "joining";
    });
    return hasBad ? ("error" as const) : ("ok" as const);
  }, [stuckQueries.length]);

  const apiOk = apiPingOk && apiHealth?.status !== "error";
  const color: HealthColor = sessionExpired || !apiOk
    ? "red"
    : realtimeStatus === "error" || stuckQueries.length > 0
      ? "yellow"
      : "green";

  const retryNow = useCallback(async () => {
    await triggerGlobalRecovery();
    await revalidateSession();
    await pingApi();
  }, [pingApi, revalidateSession]);

  return {
    color,
    sessionExpired,
    apiOk,
    lastPingMs,
    apiHealth,
    stuckQueries,
    realtimeStatus,
    retryNow,
  };
}
