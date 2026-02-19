import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { contestantsQueryKey, planQueryKey } from "@/lib/plan-query-keys";

export function usePlanRealtime({ planId }: { planId: number | null }) {
  const queryClient = useQueryClient();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeFailed, setRealtimeFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubscribe = useMemo(() => Number.isFinite(planId) && Number(planId) > 0, [planId]);

  useEffect(() => {
    if (!canSubscribe || !planId) {
      setRealtimeConnected(false);
      setRealtimeFailed(false);
      return;
    }

    const invalidateDebounced = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
        queryClient.invalidateQueries({ queryKey: contestantsQueryKey(planId) });
        timeoutRef.current = null;
      }, 320);
    };

    const channel = supabase
      .channel(`control-room-plan-${planId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_tasks", filter: `plan_id=eq.${planId}` },
        invalidateDebounced,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locks", filter: `plan_id=eq.${planId}` },
        invalidateDebounced,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planning_runs", filter: `plan_id=eq.${planId}` },
        invalidateDebounced,
      );

    const ensureSubscribed = () => {
      try {
        const state = (channel as any)?.state;
        if (state === "joined" || state === "joining") return;
        supabase.realtime.connect();
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            setRealtimeConnected(true);
            setRealtimeFailed(false);
            invalidateDebounced();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeConnected(false);
            setRealtimeFailed(true);
          }
        });
      } catch {
        setRealtimeConnected(false);
        setRealtimeFailed(true);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ensureSubscribed();
    };

    ensureSubscribed();
    window.addEventListener("focus", ensureSubscribed);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", ensureSubscribed);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [canSubscribe, planId, queryClient]);

  return {
    realtimeConnected,
    realtimeFailed,
  };
}
