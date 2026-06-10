export const PLANNING_PHASES = [
  { id: "loading_input", label: "Cargando datos", start: 2, end: 10 },
  { id: "phase_a_base_solution", label: "Construyendo solución base", start: 10, end: 32 },
  { id: "hard_validation", label: "Validando restricciones duras", start: 32, end: 40 },
  { id: "operational_neighborhoods", label: "Probando vecindarios", start: 40, end: 52 },
  { id: "segment_solver", label: "Resolviendo segmento crítico", start: 52, end: 58 },
  { id: "coach_compaction", label: "Compactando coaches", start: 58, end: 64 },
  { id: "coach_wave_ordering", label: "Ordenando coach waves", start: 64, end: 70 },
  { id: "pipeline_builder", label: "Pipeline Builder", start: 70, end: 78 },
  { id: "pipeline_repair", label: "Reparando carriles", start: 78, end: 85 },
  { id: "lane_only_repair", label: "Reparando carriles", start: 82, end: 87 },
  { id: "meal_scheduling", label: "Programando comidas", start: 87, end: 91 },
  { id: "scoring_candidates", label: "Evaluando candidatos", start: 91, end: 96 },
  { id: "persisting_result", label: "Guardando resultado", start: 96, end: 99 },
] as const;

export type PlanningPhaseStatus = "pending" | "active" | "completed" | "skipped" | "failed";

export function estimatedPlanningProgress(args: {
  phase?: string | null;
  persistedPercent?: number | null;
  status?: string | null;
  phaseStartedAt?: string | null;
  nowMs?: number;
}): number {
  const status = String(args.status ?? "").toLowerCase();
  if (status === "success") return 100;
  const persisted = Math.max(0, Math.min(99, Math.round(Number(args.persistedPercent ?? 0))));
  const phase = PLANNING_PHASES.find((item) => item.id === args.phase);
  if (!phase) return persisted;
  const started = Date.parse(String(args.phaseStartedAt ?? ""));
  if (!Number.isFinite(started)) return Math.max(persisted, phase.start);
  const elapsedSeconds = Math.max(0, ((args.nowMs ?? Date.now()) - started) / 1000);
  const heartbeat = Math.min(phase.end - 1, phase.start + Math.floor(elapsedSeconds / 2));
  return Math.min(99, Math.max(persisted, heartbeat));
}

export function planningPhaseSteps(currentPhase?: string | null, status?: string | null) {
  const currentIndex = PLANNING_PHASES.findIndex((phase) => phase.id === currentPhase);
  const failed = ["failed", "error", "invalid", "infeasible"].includes(String(status ?? "").toLowerCase());
  return PLANNING_PHASES.map((phase, index) => ({
    ...phase,
    status: (index < currentIndex ? "completed" : index === currentIndex ? (failed ? "failed" : "active") : "pending") as PlanningPhaseStatus,
  }));
}
