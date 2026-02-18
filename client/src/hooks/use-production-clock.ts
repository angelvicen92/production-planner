import { useEffect, useRef, useState } from "react";
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
  const [manualNow, setManualNow] = useState<string | null>(simulatedTime);
  const manualStartRealMsRef = useRef<number>(0);
  const manualStartMinutesRef = useRef<number>(0);

  useEffect(() => {
    if (mode !== "auto") return;

    setAutoNow(toHHMM(new Date()));
    const id = window.setInterval(() => setAutoNow(toHHMM(new Date())), 15000);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "manual" || !simulatedTime) {
      setManualNow(simulatedTime);
      return;
    }

    const [h, m] = simulatedTime.split(":").map((x) => Number(x));
    const baseMinutes = (h * 60 + m) % (24 * 60);
    manualStartRealMsRef.current = Date.now();
    manualStartMinutesRef.current = baseMinutes;

    const tick = () => {
      const elapsedMinutes = Math.floor((Date.now() - manualStartRealMsRef.current) / 60000);
      const currentMinutes = (manualStartMinutesRef.current + elapsedMinutes) % (24 * 60);
      const hh = String(Math.floor(currentMinutes / 60)).padStart(2, "0");
      const mm = String(currentMinutes % 60).padStart(2, "0");
      setManualNow(`${hh}:${mm}`);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mode, simulatedTime]);

  const nowTime = mode === "manual" ? manualNow : autoNow;

  return {
    nowTime: isValidHHMM(nowTime) ? nowTime : null,
    mode,
    simulatedTime,
    isLoading,
    error,
  };
}
