import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/api";

type ProgramSettingsClock = {
  clockMode?: "auto" | "manual";
  simulatedTime?: string | null;
};

type ManualClockSnapshot = {
  manualBaseHHMM: string;
  manualSetAtMs: number;
};

const MANUAL_CLOCK_STORAGE_KEY = "production-clock-manual-state";

function toHHMM(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return formatted.slice(0, 5);
}

function toSeconds(date: Date): number {
  return date.getSeconds();
}

function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function parseStoredManualSnapshot(): ManualClockSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MANUAL_CLOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualClockSnapshot>;
    if (!isValidHHMM(parsed.manualBaseHHMM) || !Number.isFinite(parsed.manualSetAtMs)) {
      return null;
    }
    return {
      manualBaseHHMM: parsed.manualBaseHHMM,
      manualSetAtMs: Number(parsed.manualSetAtMs),
    };
  } catch {
    return null;
  }
}

function persistManualSnapshot(snapshot: ManualClockSnapshot | null) {
  if (typeof window === "undefined") return;

  try {
    if (!snapshot) {
      window.localStorage.removeItem(MANUAL_CLOCK_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(MANUAL_CLOCK_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // no-op
  }
}

function manualBaseDateFromHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((value) => Number(value));
  const base = new Date();
  base.setHours(h, m, 0, 0);
  return base;
}

export function useProductionClock() {
  const { data, isLoading, error } = useQuery<ProgramSettingsClock>({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });

  const mode = data?.clockMode === "manual" ? "manual" : "auto";
  const simulatedTime = isValidHHMM(data?.simulatedTime) ? data?.simulatedTime : null;
  const [tickMs, setTickMs] = useState<number>(() => Date.now());
  const [manualSnapshot, setManualSnapshot] = useState<ManualClockSnapshot | null>(() => parseStoredManualSnapshot());

  useEffect(() => {
    const id = window.setInterval(() => setTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "manual" || !simulatedTime) {
      setManualSnapshot(null);
      persistManualSnapshot(null);
      return;
    }

    setManualSnapshot((current) => {
      if (current?.manualBaseHHMM === simulatedTime) return current;
      const next = {
        manualBaseHHMM: simulatedTime,
        manualSetAtMs: Date.now(),
      };
      persistManualSnapshot(next);
      return next;
    });
  }, [mode, simulatedTime]);

  const setManualNow = useCallback((hhmm: string) => {
    if (!isValidHHMM(hhmm)) return;
    const next = {
      manualBaseHHMM: hhmm,
      manualSetAtMs: Date.now(),
    };
    setManualSnapshot(next);
    persistManualSnapshot(next);
  }, []);

  const clearManualNow = useCallback(() => {
    setManualSnapshot(null);
    persistManualSnapshot(null);
  }, []);

  const effectiveNow = useMemo(() => {
    if (mode !== "manual" || !manualSnapshot) {
      return new Date(tickMs);
    }

    const manualBaseDate = manualBaseDateFromHHMM(manualSnapshot.manualBaseHHMM);
    const deltaMs = tickMs - manualSnapshot.manualSetAtMs;
    return new Date(manualBaseDate.getTime() + Math.max(0, deltaMs));
  }, [mode, manualSnapshot, tickMs]);

  const nowTime = toHHMM(effectiveNow);
  const nowSeconds = toSeconds(effectiveNow);

  return {
    effectiveNow,
    nowTime,
    nowSeconds,
    mode,
    isManual: mode === "manual",
    simulatedTime,
    setManualNow,
    clearManualNow,
    isLoading,
    error,
  };
}
