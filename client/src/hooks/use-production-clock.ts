import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/api";

type ProgramSettingsClock = {
  clockMode?: "auto" | "manual";
  simulatedTime?: string | null;
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

function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export function useProductionClock() {
  const { data, isLoading, error } = useQuery<ProgramSettingsClock>({
    queryKey: [api.programSettings.get.path],
    queryFn: () => apiRequest("GET", api.programSettings.get.path),
  });

  const mode = data?.clockMode === "manual" ? "manual" : "auto";
  const simulatedTime = isValidHHMM(data?.simulatedTime) ? data?.simulatedTime : null;

  const [autoNow, setAutoNow] = useState<string | null>(() => toHHMM(new Date()));

  useEffect(() => {
    if (mode !== "auto") return;

    setAutoNow(toHHMM(new Date()));
    const id = window.setInterval(() => setAutoNow(toHHMM(new Date())), 15000);
    return () => window.clearInterval(id);
  }, [mode]);

  const nowTime = useMemo(() => {
    if (mode === "manual") return simulatedTime;
    return autoNow;
  }, [mode, simulatedTime, autoNow]);

  return {
    nowTime: isValidHHMM(nowTime) ? nowTime : null,
    mode,
    simulatedTime,
    isLoading,
    error,
  };
}
