import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/api";

type ProgramSettingsClock = {
  clockMode?: "auto" | "manual";
  simulatedTime?: string | null;
  simulatedSetAt?: string | null;
};

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
  const simulatedSetAt = typeof data?.simulatedSetAt === "string" ? Date.parse(data.simulatedSetAt) : NaN;
  const [tickMs, setTickMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveNow = useMemo(() => {
    if (mode !== "manual" || !simulatedTime || !Number.isFinite(simulatedSetAt)) {
      return new Date(tickMs);
    }

    const manualBaseDate = manualBaseDateFromHHMM(simulatedTime);
    const deltaMs = tickMs - simulatedSetAt;
    return new Date(manualBaseDate.getTime() + Math.max(0, deltaMs));
  }, [mode, simulatedTime, simulatedSetAt, tickMs]);

  const nowTime = toHHMM(effectiveNow);
  const nowSeconds = toSeconds(effectiveNow);

  return {
    effectiveNow,
    nowTime,
    nowSeconds,
    mode,
    isManual: mode === "manual",
    simulatedTime,
    isLoading,
    error,
  };
}
