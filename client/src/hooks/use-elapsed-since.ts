import { useMemo } from "react";
import { useProductionClock } from "@/hooks/use-production-clock";

function formatElapsedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useElapsedSince(startReal?: string | null, startRealSeconds?: number | null) {
  const { effectiveNow } = useProductionClock();

  return useMemo(() => {
    if (!startReal) return null;

    const [hh, mm] = String(startReal)
      .split(":")
      .map((v) => Number(v));

    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

    const start = new Date(effectiveNow);
    const startSeconds = Number.isFinite(Number(startRealSeconds))
      ? Math.max(0, Math.min(59, Math.floor(Number(startRealSeconds))))
      : 0;
    start.setHours(hh, mm, startSeconds, 0);

    const elapsedMs = effectiveNow.getTime() - start.getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;

    return formatElapsedDuration(elapsedMs);
  }, [effectiveNow, startReal, startRealSeconds]);
}
