type TaskLike = any;

function parseHHMMToMinutes(value?: string | null): number | null {
  if (!value || typeof value !== "string") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function durationPlannedMin(task: TaskLike, templatesById: Map<number, any>): number {
  const templateId = Number(task?.templateId ?? task?.template_id ?? task?.template?.id);
  const tpl = Number.isFinite(templateId) ? templatesById.get(templateId) : null;
  const tplDuration = Number(tpl?.duration_min ?? tpl?.defaultDuration ?? tpl?.default_duration ?? task?.template?.defaultDuration ?? task?.template?.default_duration);
  if (Number.isFinite(tplDuration) && tplDuration > 0) return tplDuration;
  const startMin = parseHHMMToMinutes(task?.startPlanned ?? task?.start_planned);
  const endMin = parseHHMMToMinutes(task?.endPlanned ?? task?.end_planned);
  if (startMin == null || endMin == null || endMin <= startMin) return 0;
  return endMin - startMin;
}

function durationRealMin(task: TaskLike): number {
  const startMin = parseHHMMToMinutes(task?.startReal ?? task?.start_real);
  const endMin = parseHHMMToMinutes(task?.endReal ?? task?.end_real);
  if (startMin == null || endMin == null || endMin <= startMin) return 0;
  return endMin - startMin;
}

export function computeAdjustedEta(tasks: TaskLike[], templatesById: Map<number, any>) {
  const byZone = new Map<number | null, TaskLike[]>();
  for (const t of tasks ?? []) {
    const zoneId = Number(t?.zoneId ?? t?.zone_id ?? NaN);
    const key = Number.isFinite(zoneId) ? zoneId : null;
    const list = byZone.get(key) ?? [];
    list.push(t);
    byZone.set(key, list);
  }

  let etaAdjustedGlobal: number | null = null;
  let confidence: "low" | "medium" | "high" = "low";

  for (const zoneTasks of byZone.values()) {
    const done = zoneTasks.filter((t) => String(t?.status ?? "") === "done");
    const remaining = zoneTasks.filter((t) => String(t?.status ?? "") !== "done");

    const ratios = done
      .map((t) => {
        const planned = durationPlannedMin(t, templatesById);
        const real = durationRealMin(t);
        if (planned <= 0 || real <= 0) return null;
        const ratio = real / planned;
        return Math.max(0.5, Math.min(2, ratio));
      })
      .filter((v): v is number => v != null);

    const meanRatio = ratios.length
      ? ratios.reduce((acc, curr) => acc + curr, 0) / ratios.length
      : 1;

    if (ratios.length >= 6) confidence = "high";
    else if (ratios.length >= 3 && confidence !== "high") confidence = "medium";

    const remainingPlannedWork = remaining.reduce((acc, t) => acc + durationPlannedMin(t, templatesById), 0);
    const lastPlannedEnd = zoneTasks
      .map((t) => parseHHMMToMinutes(t?.endPlanned ?? t?.end_planned))
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)[0] ?? null;

    if (lastPlannedEnd == null) continue;

    const etaAdjusted = lastPlannedEnd + remainingPlannedWork * (meanRatio - 1);
    if (etaAdjustedGlobal == null || etaAdjusted > etaAdjustedGlobal) {
      etaAdjustedGlobal = etaAdjusted;
    }
  }

  return {
    etaAdjustedMin: etaAdjustedGlobal,
    confidence,
  };
}
