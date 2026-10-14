import { useMemo } from "react";
import { useProductionClock } from "@/hooks/use-production-clock";
import { useElapsedSince } from "@/hooks/use-elapsed-since";
export function ExecutionElapsedTimer({
  status,
  startReal,
  startRealSeconds,
  pausedTotalSeconds,
  pausedAtSeconds,
}: {
  status?: string | null;
  startReal?: string | null;
  startRealSeconds?: number | null;
  pausedTotalSeconds?: number | null;
  pausedAtSeconds?: number | null;
}) {
  const { effectiveNow } = useProductionClock();
  const elapsed = useElapsedSince(startReal, startRealSeconds);

  const elapsedWithPauses = useMemo(() => {
    if (!startReal) return null;
    const [hh, mm] = String(startReal).split(":").map((v) => Number(v));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

    const start = new Date(effectiveNow);
    const ss = Number.isFinite(Number(startRealSeconds)) ? Math.max(0, Math.min(59, Math.floor(Number(startRealSeconds)))) : 0;
    start.setHours(hh, mm, ss, 0);

    const nowSeconds = effectiveNow.getHours() * 3600 + effectiveNow.getMinutes() * 60 + effectiveNow.getSeconds();
    const startSecondsOfDay = hh * 3600 + mm * 60 + ss;
    const pausedTotal = Number.isFinite(Number(pausedTotalSeconds)) ? Math.max(0, Math.floor(Number(pausedTotalSeconds))) : 0;
    const pausedAt = Number.isFinite(Number(pausedAtSeconds)) ? Math.max(0, Math.floor(Number(pausedAtSeconds))) : null;
    const currentPause = status === "interrupted" && pausedAt !== null ? Math.max(0, nowSeconds - pausedAt) : 0;

    const elapsedSeconds = Math.max(0, nowSeconds - startSecondsOfDay - pausedTotal - currentPause);
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [effectiveNow, pausedAtSeconds, pausedTotalSeconds, startReal, startRealSeconds, status]);

  if (status !== "in_progress" || !startReal || !(elapsedWithPauses ?? elapsed)) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <span className="text-xs font-medium text-emerald-700">Tiempo en marcha: {elapsedWithPauses ?? elapsed}</span>;
}

