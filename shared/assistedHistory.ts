import { resolveActiveStageLineage, type StageLineageNode } from "./assistedStageLineage";
import { stageTimestamp, type AssistedStageTiming, type StageTimeInterval } from "./assistedStageTiming";

export type HistoryStage = StageLineageNode & {
  ordinal: number;
  archivedAt?: unknown;
  acceptedAt?: string | null;
  snapshotJson?: unknown;
  validationSummaryJson?: Record<string, unknown>;
};
export type TimingTotal = { durationMs: number | null; knownStages: number; totalStages: number };
export type StageHistoryMetrics = {
  stage: HistoryStage;
  localNumber: number;
  timing: AssistedStageTiming;
  generationTotal: TimingTotal;
  processTotal: TimingTotal;
};

export function stageObligations(stage: HistoryStage | null | undefined) {
  const tasks = (stage?.snapshotJson as { tasks?: Array<{ startPlanned?: unknown; endPlanned?: unknown }> } | null)?.tasks;
  if (!Array.isArray(tasks)) return null;
  const scheduled = tasks.filter(task => task?.startPlanned && task?.endPlanned).length;
  return { scheduled, total: tasks.length, percentage: tasks.length ? scheduled / tasks.length * 100 : null };
}

function validInterval(value: StageTimeInterval | null | undefined): StageTimeInterval | null {
  if (!value) return null;
  const from = stageTimestamp(value.start), to = stageTimestamp(value.end);
  return from !== null && to !== null && to >= from && Number.isFinite(value.durationMs) && value.durationMs === to - from ? value : null;
}

const emptyTotal = (): TimingTotal => ({ durationMs: null, knownStages: 0, totalStages: 0 });
const add = (total: TimingTotal, interval: StageTimeInterval | null): TimingTotal => ({
  totalStages: total.totalStages + 1,
  knownStages: total.knownStages + (interval ? 1 : 0),
  durationMs: interval ? (total.durationMs ?? 0) + interval.durationMs : total.durationMs,
});

/** Presentation only: the persisted ordinal remains the historical acceptance order.
 * Resolve parent IDs first; never use ordinal gaps, dates or live-row counts as depth.
 */
export function projectAssistedStageCycle(history: readonly HistoryStage[], active: HistoryStage | null | undefined) {
  let lineage: HistoryStage[] = [];
  let lineageError: string | null = null;
  try {
    if (!active) throw new Error("Falta la etapa activa.");
    // Same fallback as state() on the server when history omits the active row.
    const stages = history.some(stage => stage.id === active.id) ? history : [...history, active];
    lineage = resolveActiveStageLineage(stages, active.id).reverse();
    if (lineage.some(stage => !Number.isSafeInteger(stage.id) ||
      (stage.parentStageId !== null && !Number.isSafeInteger(stage.parentStageId))))
      throw new Error("Faltan identificadores o relaciones válidas en el recorrido.");
    const ids = new Set(lineage.map(stage => stage.id));
    if (stages.some((stage, index) => ids.has(stage.id) && stages.findIndex(other => other.id === stage.id) !== index)) throw new Error("Hay etapas duplicadas en el recorrido.");
    if (lineage[0].ordinal !== 0 || lineage.some((stage, index) => stage.archivedAt || (index > 0 && stage.ordinal <= lineage[index - 1].ordinal))) throw new Error("El recorrido no tiene un S0 válido o contiene etapas inconsistentes.");
  } catch (error) {
    const cause = error instanceof Error && error.message === "CORRUPT_STAGE_LINEAGE" ? "Faltan ancestros o hay un ciclo en sus relaciones."
      : error instanceof Error && error.message === "STALE_BASE_STAGE" ? "No se encuentra la etapa activa."
      : error instanceof Error ? error.message : "Relaciones inconsistentes.";
    lineageError = `No se puede reconstruir el recorrido actual: ${cause} Numeración y acumulados no disponibles.`;
    lineage = [];
  }
  return { lineage, localNumber: lineage.length ? lineage.length - 1 : null, lineageError };
}

export function assistedStageLabel(localNumber: number | null) {
  return localNumber === null ? "Etapa no disponible" : `Etapa S${localNumber}`;
}

export function buildAssistedHistory(history: readonly HistoryStage[], active: HistoryStage | null | undefined, timings: readonly AssistedStageTiming[] = []) {
  const { lineage, localNumber, lineageError } = projectAssistedStageCycle(history, active);
  const ids = new Set(lineage.map(stage => stage.id));
  const otherStages = history.filter(stage => !ids.has(stage.id));
  const issues: number[] = [];
  let generationTotal = emptyTotal(), processTotal = emptyTotal();
  let previousAcceptance: number | null = null;
  const rows: StageHistoryMetrics[] = lineage.map((stage, index) => {
    const matches = timings.filter(timing => timing.stageId === stage.id);
    const raw = matches.length === 1 ? matches[0] : undefined;
    let generation = index === 0 ? null : validInterval(raw?.generation);
    let process = index === 0 ? null : validInterval(raw?.requestToAcceptance);
    const accepted = stageTimestamp(stage.acceptedAt);
    const inconsistent = matches.length > 1 || (raw?.generation && !generation && index > 0) || (raw?.requestToAcceptance && !process && index > 0)
      || (process && accepted !== null && stageTimestamp(process.end) !== accepted)
      || (process && generation && (stageTimestamp(generation.start)! < stageTimestamp(process.start)! || stageTimestamp(generation.end)! > stageTimestamp(process.end)!))
      || (index > 0 && previousAcceptance !== null && ((process && stageTimestamp(process.start)! < previousAcceptance) || (accepted !== null && accepted < previousAcceptance)));
    if (inconsistent) { issues.push(stage.id); generation = null; process = null; }
    previousAcceptance = accepted ?? (process ? stageTimestamp(process.end) : null);
    if (index > 0) { generationTotal = add(generationTotal, generation); processTotal = add(processTotal, process); }
    return { stage, localNumber: index, timing: { stageId: stage.id, generation, requestToAcceptance: process }, generationTotal, processTotal };
  });
  // Wall time requires full process coverage. Never span a missing request or
  // silently treat a manual Stage / unknown run as zero.
  const first = rows[1]?.timing.requestToAcceptance;
  const last = rows.at(-1)?.timing.requestToAcceptance;
  const elapsed = first && last && processTotal.knownStages === processTotal.totalStages
    ? { start: first.start, end: last.end, durationMs: stageTimestamp(last.end)! - stageTimestamp(first.start)! } : null;
  return { rows, otherStages, localNumber, lineageError, timingIssues: issues, generationTotal, processTotal, elapsed };
}
