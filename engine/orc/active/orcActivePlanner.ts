import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { generatePlanV4, type EngineV4Diagnostics } from "../../v4";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import type { Candidate, CandidateState, Evidence, SimulatedState, ValidationResult } from "../contracts";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics, type PlanningAssignment } from "../benchmark/operationalPlanningQualityMetrics";
import { stableStringify } from "../structuralEquality";
import { deepFreeze } from "../immutability";

export type ORCActiveUsedEngine = "orc" | "v4_fallback";

export type ORCActivationGateStatus = "PASS" | "FAIL";

export interface ORCBestCandidateTrace {
  version: "ORC-BEST-CANDIDATE-TRACE-V1";
  simulationCount: number;
  bestCandidate: { candidateId: string | null; candidateStateId: string | null; simulatedStateId: string | null; assignments: unknown[]; metadata: unknown };
  score: number | null;
  plannedTasks: PlanningAssignment[];
  pendingTasks: number[];
  hardViolations: string[];
  softMetrics: unknown;
  opqm: OperationalPlanningQualityMetrics | null;
  gatesPassed: string[];
  gatesFailed: string[];
  discardReason: string | null;
  evidence: Evidence;
}

export interface ORCActivationReport {
  version: "ORC-ACTIVATION-REPORT-V1";
  summary: { selectedEngine: ORCActiveUsedEngine; reason: string; executionTimeMs: number; finalResult: string };
  gates: Array<{ name: string; passed: boolean; status: ORCActivationGateStatus }>;
  bestORCSimulation: { score: number | null; plannedTasks: number; hardViolations: string[]; softMetrics: unknown; opqm: OperationalPlanningQualityMetrics | null };
  comparison: { coachIdleTimeDelta: number; talentIdleTimeDelta: number; operationalCompactnessDelta: number; mainFlowContinuityDelta: number; makespanDelta: number };
  fallback: { reason: string | null; explanation: string | null };
  recommendation: { type: "NEXT_IMPROVEMENT"; message: string };
  evidence: { selectedSimulatedStateId: string | null; validationResult: string | null; v4PlannedTasks: number; orcPlannedTasks: number; v4UnplannedTasks: number; orcUnplannedTasks: number };
}

export interface ORCActiveDiagnostics {
  engineVersion: "orc-active";
  status: EngineV4Diagnostics["status"];
  generatedAt: string;
  plannedTasks: number;
  unplannedTasks: number;
  warning: string;
  usedEngine: ORCActiveUsedEngine;
  fallbackReason: string | null;
  gates: Record<string, boolean>;
  orcSummary: unknown;
  v4Diagnostics: unknown;
  operationalDelta: unknown;
  orcActivationReport: ORCActivationReport;
  bestCandidateTrace: ORCBestCandidateTrace;
  orcActiveBridge: true;
}

export interface ORCActivePlannerResult {
  output: EngineOutput;
  diagnostics: ORCActiveDiagnostics;
}

export interface ORCActivePlannerOptions extends EngineV3Options {
  orcShadowResult?: ORCShadowModeResult | null;
  runORC?: (input: EngineInput) => ORCShadowModeResult | null;
}

type ConvertedPlan = NonNullable<EngineOutput["plannedTasks"]>;

const ACTIVE_STATUSES = new Set<TaskInput["status"]>(["pending", "interrupted"]);
const PROTECTED_STATUSES = new Set<TaskInput["status"]>(["done", "in_progress"]);

const ordered = (tasks: ConvertedPlan): ConvertedPlan => [...tasks].sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned));

function neededTaskIds(input: EngineInput): number[] {
  return (input.tasks ?? []).filter((task) => ACTIVE_STATUSES.has(task.status)).map((task) => task.id).sort((a, b) => a - b);
}

function convertSimulationToPlannedTasks(simulatedState: SimulatedState): ConvertedPlan {
  return ordered((simulatedState.operationalStateSnapshot.planning ?? [])
    .filter((item) => item?.startPlanned && item?.endPlanned)
    .map((item) => ({ taskId: Number(item.taskId), startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: [...(item.assignedResourceIds ?? [])].sort((a, b) => a - b) }))
    .filter((item) => Number.isFinite(item.taskId)));
}

function findBestSimulation(shadow: ORCShadowModeResult | null): { simulation: SimulatedState | null; validation: ValidationResult | null; value: number | null; candidateState: CandidateState | null; candidate: Candidate | null } {
  if (!shadow) return { simulation: null, validation: null, value: null, candidateState: null, candidate: null };
  const valueById = new Map((shadow.operationalValues ?? []).map((item) => [item.simulatedStateId, item.overallScore]));
  const candidates = [...(shadow.simulatedStates ?? [])];
  candidates.sort((a, b) => (valueById.get(b.id) ?? -Infinity) - (valueById.get(a.id) ?? -Infinity) || a.id.localeCompare(b.id));
  const simulation = candidates[0] ?? null;
  const candidateState = simulation ? (shadow.candidateStates ?? []).find((item) => item.id === simulation.candidateStateId) ?? null : null;
  const candidate = candidateState ? (shadow.candidates ?? []).find((item) => item.id === candidateState.candidateId) ?? null : null;
  return { simulation, validation: simulation ? (shadow.validationResults ?? []).find((item) => item.simulatedStateId === simulation.id) ?? null : null, value: simulation ? valueById.get(simulation.id) ?? null : null, candidateState, candidate };
}

function assignmentMap(assignments: PlanningAssignment[]): Map<number, PlanningAssignment> {
  return new Map(assignments.map((item) => [item.taskId, item]));
}

function sameAssignment(a: PlanningAssignment | undefined, task: TaskInput): boolean {
  if (!a) return false;
  const resources = [...(a.assignedResources ?? [])].sort((x, y) => x - y);
  const taskResources = [...(task.assignedResourceIds ?? [])].sort((x, y) => x - y);
  return a.startPlanned === task.startPlanned && a.endPlanned === task.endPlanned && stableStringify(resources) === stableStringify(taskResources);
}

function locksPreserved(input: EngineInput, assignments: PlanningAssignment[]): boolean {
  const byTask = assignmentMap(assignments);
  return (input.locks ?? []).every((lock) => {
    const task = (input.tasks ?? []).find((item) => item.id === lock.taskId);
    const planned = byTask.get(lock.taskId);
    if (!task || !planned) return false;
    if ((lock.lockType === "time" || lock.lockType === "full") && (planned.startPlanned !== (lock.lockedStart ?? task.startPlanned) || planned.endPlanned !== (lock.lockedEnd ?? task.endPlanned))) return false;
    if ((lock.lockType === "resource" || lock.lockType === "full") && lock.lockedResourceId != null && !(planned.assignedResources ?? []).includes(lock.lockedResourceId)) return false;
    return true;
  });
}

function protectedTasksPreserved(input: EngineInput, assignments: PlanningAssignment[], status: TaskInput["status"]): boolean {
  const byTask = assignmentMap(assignments);
  return (input.tasks ?? []).filter((task) => task.status === status).every((task) => sameAssignment(byTask.get(task.id), task));
}

function total(record: Record<string, number>): number { return Object.values(record).reduce((sum, value) => sum + value, 0); }


function makespan(assignments: PlanningAssignment[]): number {
  const toMinutes = (value?: string | null): number | null => {
    const [hours, mins] = String(value ?? "").split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
  };
  const windows = assignments.map((item) => ({ start: toMinutes(item.startPlanned), end: toMinutes(item.endPlanned) })).filter((item): item is { start: number; end: number } => item.start !== null && item.end !== null);
  if (windows.length === 0) return 0;
  return Math.max(...windows.map((item) => item.end)) - Math.min(...windows.map((item) => item.start));
}

function readableFallbackReason(reason: string | null, gates: Record<string, boolean>, planned: { needed: number; orc: number }): string | null {
  if (!reason) return null;
  if (reason === "orc_execution_failed") return "No se utiliza ORC porque la ejecución del evaluador ORC falló antes de producir una simulación segura.";
  if (reason === "no_valid_orc_simulation") return "No se utiliza ORC porque no existe una simulación ORC válida sin hard violations.";
  if (!gates.complete || !gates.allPendingNeededPlanned) return `No se utiliza ORC porque la simulación deja ${Math.max(0, planned.needed - planned.orc)} tareas pendientes.`;
  if (!gates.opqmNotWorseThanV4) return "No se utiliza ORC porque empeora alguna métrica operacional crítica respecto a V4.";
  if (!gates.noHardViolations || !gates.hardFeasible) return "No se utiliza ORC porque la mejor simulación contiene hard violations.";
  if (!gates.doesNotModifyDone) return "No se utiliza ORC porque modificaría tareas ya completadas.";
  if (!gates.doesNotModifyInProgress) return "No se utiliza ORC porque modificaría tareas en progreso.";
  if (!gates.respectsLocks) return "No se utiliza ORC porque no respeta todos los locks del plan.";
  return `No se utiliza ORC porque falló el gate ${reason.replace(/^gate_failed:/, "")}.`;
}

function recommendation(gates: Record<string, boolean>, comparison: ORCActivationReport["comparison"]): string {
  if (!gates.hardFeasible || !gates.noHardViolations || !gates.validSimulationAvailable) return "Resolver hard feasibility.";
  if (!gates.complete || !gates.allPendingNeededPlanned) return "Planificar todas las tareas pendientes.";
  if (!gates.doesNotModifyDone || !gates.doesNotModifyInProgress || !gates.respectsLocks) return "Preservar locks y tareas protegidas.";
  if (comparison.coachIdleTimeDelta > 0) return "Reducir Coach Idle Time.";
  if (comparison.talentIdleTimeDelta > 0) return "Reducir Talent Idle Time.";
  if (comparison.mainFlowContinuityDelta > 0) return "Mejorar Main Flow Continuity.";
  if (comparison.operationalCompactnessDelta < 0) return "Mejorar Operational Compactness.";
  if (comparison.makespanDelta > 0) return "Reducir Makespan.";
  return "Mantener ORC activo y monitorizar regresiones.";
}

function buildActivationReport(args: { usedEngine: ORCActiveUsedEngine; fallbackReason: string | null; gates: Record<string, boolean>; executionTimeMs: number; simulation: SimulatedState | null; validation: ValidationResult | null; score: number | null; v4Metrics: OperationalPlanningQualityMetrics; orcMetrics: OperationalPlanningQualityMetrics; v4Planned: PlanningAssignment[]; orcPlanned: PlanningAssignment[]; v4UnplannedTasks: number; neededTasks: number }): ORCActivationReport {
  const comparison = {
    coachIdleTimeDelta: total(args.orcMetrics.resourceIdleTime) - total(args.v4Metrics.resourceIdleTime),
    talentIdleTimeDelta: total(args.orcMetrics.talentIdleTime) - total(args.v4Metrics.talentIdleTime),
    operationalCompactnessDelta: args.orcMetrics.operationalCompactness - args.v4Metrics.operationalCompactness,
    mainFlowContinuityDelta: args.orcMetrics.mainFlowContinuityQuality.gaps - args.v4Metrics.mainFlowContinuityQuality.gaps,
    makespanDelta: makespan(args.orcPlanned) - makespan(args.v4Planned),
  };
  const explanation = readableFallbackReason(args.fallbackReason, args.gates, { needed: args.neededTasks, orc: args.orcPlanned.length });
  const reason = args.usedEngine === "orc" ? "ORC superó todos los gates y no empeora las métricas críticas frente a V4." : (explanation ?? "V4 se mantiene como fallback seguro.");
  return {
    version: "ORC-ACTIVATION-REPORT-V1",
    summary: { selectedEngine: args.usedEngine, reason, executionTimeMs: args.executionTimeMs, finalResult: args.usedEngine === "orc" ? "ORC aplicado" : "V4 Fallback aplicado" },
    gates: Object.keys(args.gates).sort().map((name) => ({ name, passed: args.gates[name], status: args.gates[name] ? "PASS" : "FAIL" })),
    bestORCSimulation: { score: args.score, plannedTasks: args.orcPlanned.length, hardViolations: [...(args.validation?.violatedConstraints ?? [])].sort(), softMetrics: args.simulation?.operationalStateSnapshot.operationalMetrics ?? {}, opqm: args.simulation ? args.orcMetrics : null },
    comparison,
    fallback: { reason: args.fallbackReason, explanation },
    recommendation: { type: "NEXT_IMPROVEMENT", message: recommendation(args.gates, comparison) },
    evidence: { selectedSimulatedStateId: args.simulation?.id ?? null, validationResult: args.validation?.result ?? null, v4PlannedTasks: args.v4Planned.length, orcPlannedTasks: args.orcPlanned.length, v4UnplannedTasks: args.v4UnplannedTasks, orcUnplannedTasks: Math.max(0, args.neededTasks - args.orcPlanned.length) },
  };
}

function buildBestCandidateTrace(args: { shadow: ORCShadowModeResult | null; simulation: SimulatedState | null; validation: ValidationResult | null; candidateState: CandidateState | null; candidate: Candidate | null; score: number | null; orcPlanned: PlanningAssignment[]; pendingTasks: number[]; orcMetrics: OperationalPlanningQualityMetrics; gates: Record<string, boolean>; discardReason: string | null }): ORCBestCandidateTrace {
  const gatesPassed = Object.keys(args.gates).filter((name) => args.gates[name]).sort();
  const gatesFailed = Object.keys(args.gates).filter((name) => !args.gates[name]).sort();
  const traceCore = {
    simulationCount: args.shadow?.simulatedStates?.length ?? 0,
    bestCandidate: {
      candidateId: args.candidate?.id ?? args.candidateState?.candidateId ?? null,
      candidateStateId: args.candidateState?.id ?? args.simulation?.candidateStateId ?? null,
      simulatedStateId: args.simulation?.id ?? null,
      assignments: args.candidate?.assignments ? [...args.candidate.assignments] : [],
      metadata: args.candidate?.metadata ?? {},
    },
    score: args.score,
    plannedTasks: [...args.orcPlanned].sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned)),
    pendingTasks: [...args.pendingTasks].sort((a, b) => a - b),
    hardViolations: [...(args.validation?.violatedConstraints ?? [])].sort(),
    softMetrics: args.simulation?.operationalStateSnapshot.operationalMetrics ?? {},
    opqm: args.simulation ? args.orcMetrics : null,
    gatesPassed,
    gatesFailed,
    discardReason: args.discardReason,
  };
  const evidence: Evidence = deepFreeze({
    id: `evidence:orc-best-candidate-trace:${traceCore.bestCandidate.simulatedStateId ?? "none"}`,
    source: "orc-best-candidate-trace",
    kind: "best-candidate-trace",
    subjectId: traceCore.bestCandidate.simulatedStateId,
    createdAt: null,
    data: { ...traceCore, readOnly: true, mutatesOperationalState: false, commitsPlanning: false },
  }) as Evidence;
  return deepFreeze({ version: "ORC-BEST-CANDIDATE-TRACE-V1", ...traceCore, evidence }) as ORCBestCandidateTrace;
}

function opqmNotWorse(v4: OperationalPlanningQualityMetrics, orc: OperationalPlanningQualityMetrics): boolean {
  return orc.operationalCompactness >= v4.operationalCompactness
    && orc.mainFlowContinuityQuality.gaps <= v4.mainFlowContinuityQuality.gaps
    && total(orc.resourceIdleTime) <= total(v4.resourceIdleTime)
    && total(orc.talentIdleTime) <= total(v4.talentIdleTime);
}

export function runORCActivePlanner(input: EngineInput, options: ORCActivePlannerOptions = {}): ORCActivePlannerResult {
  const v4 = generatePlanV4(input, options);
  const reportExecutionTimeMs = options.orcShadowResult !== undefined ? 0 : (v4.diagnostics.performance?.runtimeMs ?? 0);
  let shadow: ORCShadowModeResult | null = null;
  try {
    shadow = options.orcShadowResult !== undefined ? options.orcShadowResult : (options.runORC ? options.runORC(input) : runORCShadowMode(input, { enabled: true, createdAt: null }));
  } catch (error) {
    const gates = { v4BaselineAvailable: true, orcExecuted: false };
    const v4Planned = (v4.output.plannedTasks ?? []).map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
    const emptyMetrics = calculateOperationalPlanningQualityMetrics(input, []);
    const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4Planned);
    const report = buildActivationReport({ usedEngine: "v4_fallback", fallbackReason: "orc_execution_failed", gates, executionTimeMs: reportExecutionTimeMs, simulation: null, validation: null, score: null, v4Metrics, orcMetrics: emptyMetrics, v4Planned, orcPlanned: [], v4UnplannedTasks: v4.output.unplanned?.length ?? v4.diagnostics.unplannedTasks, neededTasks: neededTaskIds(input).length });
    const trace = buildBestCandidateTrace({ shadow: null, simulation: null, validation: null, candidateState: null, candidate: null, score: null, orcPlanned: [], pendingTasks: neededTaskIds(input), orcMetrics: emptyMetrics, gates, discardReason: "orc_execution_failed" });
    const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: v4.diagnostics.status, generatedAt: v4.diagnostics.generatedAt, plannedTasks: v4.diagnostics.plannedTasks, unplannedTasks: v4.diagnostics.unplannedTasks, warning: v4.diagnostics.warning, usedEngine: "v4_fallback", fallbackReason: "orc_execution_failed", gates, orcSummary: { error: error instanceof Error ? error.message : String(error) }, v4Diagnostics: v4.diagnostics, operationalDelta: null, orcActivationReport: report, bestCandidateTrace: trace, orcActiveBridge: true };
    return { output: v4.output, diagnostics };
  }

  const { simulation, validation, value, candidateState, candidate } = findBestSimulation(shadow);
  const orcPlanned = simulation ? convertSimulationToPlannedTasks(simulation) : [];
  const needed = neededTaskIds(input);
  const plannedIds = new Set(orcPlanned.map((item) => item.taskId));
  const v4Planned = (v4.output.plannedTasks ?? []).map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
  const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4Planned);
  const orcMetrics = calculateOperationalPlanningQualityMetrics(input, orcPlanned);
  const gates: Record<string, boolean> = {
    v4BaselineAvailable: true,
    orcExecuted: shadow != null,
    validSimulationAvailable: simulation != null,
    complete: needed.every((id) => plannedIds.has(id)),
    hardFeasible: validation?.result === "VALID",
    allPendingNeededPlanned: needed.every((id) => plannedIds.has(id)),
    doesNotModifyDone: protectedTasksPreserved(input, orcPlanned, "done"),
    doesNotModifyInProgress: protectedTasksPreserved(input, orcPlanned, "in_progress"),
    respectsLocks: locksPreserved(input, orcPlanned),
    noHardViolations: (validation?.violatedConstraints?.length ?? 1) === 0,
    opqmNotWorseThanV4: opqmNotWorse(v4Metrics, orcMetrics),
    deterministicOutput: simulation != null && stableStringify(orcPlanned) === stableStringify(convertSimulationToPlannedTasks(simulation)),
    explainableDecision: true,
  };
  const failedGate = Object.entries(gates).find(([, passed]) => !passed)?.[0] ?? null;
  const operationalDelta = { v4: v4Metrics, orc: orcMetrics, criticalComparison: { opqmNotWorseThanV4: gates.opqmNotWorseThanV4 } };
  const usedEngine: ORCActiveUsedEngine = failedGate ? "v4_fallback" : "orc";
  const fallbackReason = failedGate ? (simulation ? `gate_failed:${failedGate}` : "no_valid_orc_simulation") : null;
  const orcActivationReport = buildActivationReport({ usedEngine, fallbackReason, gates, executionTimeMs: reportExecutionTimeMs, simulation, validation, score: value, v4Metrics, orcMetrics, v4Planned, orcPlanned, v4UnplannedTasks: v4.output.unplanned?.length ?? v4.diagnostics.unplannedTasks, neededTasks: needed.length });
  const bestCandidateTrace = buildBestCandidateTrace({ shadow, simulation, validation, candidateState, candidate, score: value, orcPlanned, pendingTasks: needed.filter((id) => !plannedIds.has(id)), orcMetrics, gates, discardReason: fallbackReason });
  const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: failedGate ? v4.diagnostics.status : "success", generatedAt: v4.diagnostics.generatedAt, plannedTasks: failedGate ? v4.diagnostics.plannedTasks : orcPlanned.length, unplannedTasks: failedGate ? v4.diagnostics.unplannedTasks : 0, warning: failedGate ? v4.diagnostics.warning : "ORC Active Bridge generó un resultado V4 seguro.", usedEngine, fallbackReason, gates, orcSummary: { ...(shadow?.summary ?? null), selectedSimulatedStateId: simulation?.id ?? null, selectedOverallScore: value }, v4Diagnostics: v4.diagnostics, operationalDelta, orcActivationReport, bestCandidateTrace, orcActiveBridge: true };

  if (failedGate) return { output: v4.output, diagnostics };
  return { output: { ...v4.output, feasible: true, complete: true, hardFeasible: true, plannedTasks: orcPlanned, unplanned: [], warnings: v4.output.warnings ?? [] }, diagnostics };
}
