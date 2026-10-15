import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";

import { daySectionDefaults, daySectionKey, daySectionChanged, readDaySection, writeDaySection, clearDaySectionMemory, type DaySection } from "@/lib/day-section-preferences";

export function useDaySection(planId: number, section: DaySection): [boolean, (open: boolean) => void] {
  const { user } = useAuth();
  const key = user?.id ? daySectionKey(user.id, planId, section) : null;
  const fallback = daySectionDefaults[section];
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        if (key) clearDaySectionMemory(key);
        notify();
      }
    };
    window.addEventListener("storage", storage);
    window.addEventListener(daySectionChanged, notify);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(daySectionChanged, notify);
    };
  }, [key]);
  const snapshot = useCallback(() => key ? readDaySection(key, fallback) : fallback, [key, fallback]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const open = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setOpen = useCallback((value: boolean) => { if (key) writeDaySection(key, value); }, [key]);
  return [open, setOpen];
}
