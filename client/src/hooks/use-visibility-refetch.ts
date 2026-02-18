import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useVisibilityRefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let throttle: ReturnType<typeof setTimeout> | null = null;

    const refreshActiveData = () => {
      if (throttle) return;
      throttle = setTimeout(() => {
        throttle = null;
      }, 400);

      queryClient.invalidateQueries();
      queryClient.refetchQueries({ type: "active" });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshActiveData();
      }
    };

    const onFocus = () => {
      refreshActiveData();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      if (throttle) clearTimeout(throttle);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient]);
}
