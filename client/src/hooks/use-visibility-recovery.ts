import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient, supabase } from "@/lib/supabaseClient";
import { registerRecoveryHandler } from "@/lib/health-events";

type UseVisibilityRecoveryOptions = {
  onSessionExpired?: (expired: boolean) => void;
};

export function useVisibilityRecovery(options: UseVisibilityRecoveryOptions = {}) {
  const queryClient = useQueryClient();

  const recoverNow = useCallback(async () => {
    await queryClient.invalidateQueries({
      refetchType: "active",
    });

    const client = await getSupabaseClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    options.onSessionExpired?.(!session);

    supabase.realtime.connect();
    for (const channel of supabase.getChannels()) {
      const state = (channel as any)?.state;
      if (state !== "joined" && state !== "joining") {
        channel.subscribe();
      }
    }
  }, [options, queryClient]);

  useEffect(() => {
    let throttle: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;

    const triggerRecovery = () => {
      if (throttle) return;
      throttle = setTimeout(() => {
        throttle = null;
      }, 500);
      void recoverNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenDurationMs = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (hiddenDurationMs < 3_000) return;
        triggerRecovery();
      }
    };

    const onFocus = () => triggerRecovery();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      if (throttle) clearTimeout(throttle);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [recoverNow]);

  useEffect(() => {
    registerRecoveryHandler(recoverNow);
    return () => registerRecoveryHandler(null);
  }, [recoverNow]);

  return { recoverNow };
}
