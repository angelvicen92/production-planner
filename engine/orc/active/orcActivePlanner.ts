import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { generatePlanV4, type EngineV4Diagnostics } from "../../v4";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import type { Candidate, CandidateState, Evidence, SimulatedState, ValidationResult } from "../contracts";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics, type PlanningAssignment } from "../benchmark/operationalPlanningQualityMetrics";
import { stableStringify } from "../structuralEquality";
import { deepFreeze } from "../immutability";
import { assertSerializableORCSeed, buildORCBaselineSeededInput, type ORCBaselineSeedDiagnostics } from "./orcBaselineSeed";
import { auditORCBaselineSeedHardFeasibility, type ORCBaselineSeedHardFeasibilityAudit } from "./orcBaselineSeedFeasibilityAudit";
import type { EffectiveMovesDiagnostics } from "../simulation/applyLocalScheduleMove";

export type ORCActiveUsedEngine = "orc" | "orc_baseline_preserved" | "v4_fallback";
export type ORCResultKind = "orc_changed_plan" | "orc_baseline_preserved" | "v4_fallback";

export type ORCActivationGateStatus = "PASS" | "FAIL";


export interface ORCPlanningMaterializationDiagnostics {
  source: "baseline_seed_preserved" | "candidate_transformations" | "none";
  plannedTaskCount: number;
  changedTaskCount: number;
  warnings: readonly string[];
}

export interface ORCBestCandidateTrace {
  version: "ORC-BEST-CANDIDATE-TRACE-V1";
  simulationCount: number;
  bestCandidate: { candidateId: string | null; candidateStateId: string | null; simulatedStateId: string | null; assignments: unknown[]; metadata: unknown };
  score: number | null;
  extractionSource: string;
  extractionWarnings: string[];
  plannedTaskCount: number;
  pendingTaskCount: number;
  plannedTasks: PlanningAssignment[];
  pendingTasks: number[];
  hardViolations: string[];
  softMetrics: unknown;
  opqm: OperationalPlanningQualityMetrics | null;
  gatesPassed: string[];
  gatesFailed: string[];
  discardReason: string | null;
  evidence: Evidence;
  seededPlanningCount: number;
  planningRelationToBaseline: { changedTaskCount: number; unchangedTaskCount: number; isEquivalentToBaseline: boolean };
  planningMaterialization: ORCPlanningMaterializationDiagnostics;
  effectiveMoves: EffectiveMovesDiagnostics;
}

export interface ORCActivationReport {
  version: "ORC-ACTIVATION-REPORT-V1";
  summary: { selectedEngine: ORCActiveUsedEngine; reason: string; executionTimeMs: number; finalResult: string };
  orcResultKind: ORCResultKind;
  gates: Array<{ name: string; passed: boolean; status: ORCActivationGateStatus }>;
  bestORCSimulation: { score: number | null; plannedTasks: number; hardViolations: string[]; softMetrics: unknown; opqm: OperationalPlanningQualityMetrics | null };
  comparison: { coachIdleTimeDelta: number; talentIdleTimeDelta: number; operationalCompactnessDelta: number; mainFlowContinuityDelta: number; makespanDelta: number };
  fallback: { reason: string | null; explanation: string | null };
  recommendation: { type: "NEXT_IMPROVEMENT"; message: string };
  evidence: { selectedSimulatedStateId: string | null; validationResult: string | null; v4PlannedTasks: number; orcPlannedTasks: number; v4UnplannedTasks: number; orcUnplannedTasks: number };
  planningMaterialization: ORCPlanningMaterializationDiagnostics;
  effectiveMoves: EffectiveMovesDiagnostics;
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
  orcResultKind: ORCResultKind;
  planningRelationToBaseline: { changedTaskCount: number; unchangedTaskCount: number; isEquivalentToBaseline: boolean };
  explanation: string;
  gates: Record<string, boolean>;
  orcSummary: unknown;
  v4Diagnostics: unknown;
  operationalDelta: unknown;
  orcActivationReport: ORCActivationReport;
  bestCandidateTrace: ORCBestCandidateTrace;
  baselineSeed: ORCBaselineSeedDiagnostics;
  baselineSeedHardFeasibility: ORCBaselineSeedHardFeasibilityAudit;
  effectiveMoves: EffectiveMovesDiagnostics;
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

export interface ORCPlanningExtractionResult {
  plannedTasks: ConvertedPlan;
  pendingTaskIds: number[];
  extractionSource: string;
  extractionWarnings: string[];
}

const ACTIVE_STATUSES = new Set<TaskInput["status"]>(["pending", "interrupted"]);
const PROTECTED_STATUSES = new Set<TaskInput["status"]>(["done", "in_progress"]);
const EMPTY_EFFECTIVE_MOVES: EffectiveMovesDiagnostics = { attempted: 0, accepted: 0, rejected: 0, acceptedMoves: [], rejectedMoves: [] };

const ordered = (tasks: ConvertedPlan): ConvertedPlan => [...tasks].sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned));

function neededTaskIds(input: EngineInput): number[] {
  return (input.tasks ?? []).filter((task) => ACTIVE_STATUSES.has(task.status)).map((task) => task.id).sort((a, b) => a - b);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const arrayAt = (root: unknown, path: string[]): unknown[] | null => {
  let cursor: unknown = root;
  for (const part of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[part];
  }
  return Array.isArray(cursor) ? cursor : null;
};

function normalizePlanningItem(item: unknown): ConvertedPlan[number] | null {
  if (!isRecord(item)) return null;
  const taskId = Number(item.taskId ?? item.id);
  const startPlanned = typeof item.startPlanned === "string" ? item.startPlanned : typeof item.start === "string" ? item.start : null;
  const endPlanned = typeof item.endPlanned === "string" ? item.endPlanned : typeof item.end === "string" ? item.end : null;
  const rawResources = Array.isArray(item.assignedResourceIds) ? item.assignedResourceIds : Array.isArray(item.assignedResources) ? item.assignedResources : Array.isArray(item.resourceIds) ? item.resourceIds : [];
  if (!Number.isFinite(taskId) || !startPlanned || !endPlanned) return null;
  return { taskId, startPlanned, endPlanned, assignedResources: rawResources.map(Number).filter(Number.isFinite).sort((a, b) => a - b) };
}

export function extractPlannedTasksFromORCSimulatedState(simulatedState: SimulatedState, neededIds?: readonly number[]): ORCPlanningExtractionResult {
  const warnings: string[] = [];
  const paths = [
    ["operationalStateSnapshot", "planning"],
    ["operationalState", "planning"],
    ["scheduledTasks"],
    ["assignments"],
    ["operationalStateSnapshot", "scheduledTasks"],
    ["operationalStateSnapshot", "assignments"],
    ["operationalState", "scheduledTasks"],
    ["operationalState", "assignments"],
  ];
  for (const path of paths) {
    const source = path.join(".");
    const raw = arrayAt(simulatedState, path);
    if (!raw) continue;
    const plannedTasks = ordered(raw.map(normalizePlanningItem).filter((item): item is ConvertedPlan[number] => item !== null));
    if (raw.length > 0 && plannedTasks.length === 0) warnings.push(`${source}: found ${raw.length} item(s) but none could be converted to EngineOutput planned tasks.`);
    if (plannedTasks.length > 0) {
      const plannedIds = new Set(plannedTasks.map((item) => item.taskId));
      const pendingTaskIds = [...(neededIds ?? [])].filter((id) => !plannedIds.has(id)).sort((a, b) => a - b);
      return { plannedTasks, pendingTaskIds, extractionSource: source, extractionWarnings: warnings };
    }
    warnings.push(`${source}: empty planning array.`);
  }
  const fallbackNeeded = neededIds ?? (arrayAt(simulatedState, ["operationalStateSnapshot", "tasks"]) ?? []).filter((task) => isRecord(task) && ACTIVE_STATUSES.has(task.status as TaskInput["status"])).map((task) => Number((task as Record<string, unknown>).id)).filter(Number.isFinite);
  return { plannedTasks: [], pendingTaskIds: [...fallbackNeeded].sort((a, b) => a - b), extractionSource: "none", extractionWarnings: warnings.length ? warnings : ["No ORC planning array found in SimulatedState."] };
}

function convertSimulationToPlannedTasks(simulatedState: SimulatedState): ConvertedPlan {
  return extractPlannedTasksFromORCSimulatedState(simulatedState).plannedTasks;
}

function findBestSimulation(shadow: ORCShadowModeResult | null): { simulation: SimulatedState | null; validation: ValidationResult | null; value: number | null; candidateState: CandidateState | null; candidate: Candidate | null } {
  if (!shadow) return { simulation: null, validation: null, value: null, candidateState: null, candidate: null };
  const valueById = new Map((shadow.operationalValues ?? []).map((item) => [item.simulatedStateId, item.overallScore]));
  const candidateById = new Map((shadow.candidates ?? []).map((item) => [item.id, item]));
  const stateById = new Map((shadow.candidateStates ?? []).map((item) => [item.id, item]));
  const executable = (simulation: SimulatedState): boolean => {
    const state = stateById.get(simulation.candidateStateId);
    const candidate = state ? candidateById.get(state.candidateId) : null;
    if (candidate?.metadata?.abstract === true || candidate?.metadata?.readOnly === true) return false;
    return true;
  };
  const filtered = [...(shadow.simulatedStates ?? [])].filter(executable);
  const candidates = filtered.length > 0 ? filtered : [...(shadow.simulatedStates ?? [])];
  candidates.sort((a, b) => (valueById.get(b.id) ?? -Infinity) - (valueById.get(a.id) ?? -Infinity) || a.id.localeCompare(b.id));
  const simulation = candidates[0] ?? null;
  const candidateState = simulation ? stateById.get(simulation.candidateStateId) ?? null : null;
  let candidate = candidateState ? candidateById.get(candidateState.candidateId) ?? null : null;
  if (candidate == null && candidateState?.candidateId.startsWith("candidate:partial-plan:")) {
    const sourceCandidateId = candidateState.candidateId.slice("candidate:partial-plan:".length).split("+")[0];
    candidate = (shadow.candidates ?? []).find((item) => item.id === sourceCandidateId) ?? null;
  }
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
  if (reason === "baseline_seed_not_serializable") return "No se utiliza ORC porque el baseline seed no superó la validación de serialización segura.";
  if (reason === "baseline_seed_too_large") return "No se utiliza ORC porque el baseline seed excedió el umbral de tamaño documentado.";
  if (reason === "main_flow_not_configured") return "No se utiliza ORC porque no hay flujo principal configurado; ORC no infiere el flujo por nombre.";
  if (reason === "no_executable_main_flow_candidate") return "No se utiliza ORC porque no existe ningún candidato ejecutable de cambio; los candidatos abstractos no compiten como mejor cambio operativo.";
  if (reason === "orc_execution_failed") return "No se utiliza ORC porque la ejecución del evaluador ORC falló antes de producir una simulación segura.";
  if (reason === "no_valid_orc_simulation") return "No se utiliza ORC porque no existe una simulación ORC válida sin hard violations.";
  if (reason === "orc_planning_extraction_empty") return "No se utiliza ORC porque la simulación seleccionada no expone ninguna planificación ORC convertible a tareas planificadas.";
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


function planningMaterializationOf(simulation: SimulatedState | null): ORCPlanningMaterializationDiagnostics {
  const raw = simulation?.planningMaterialization;
  if (!raw) return { source: "none", plannedTaskCount: 0, changedTaskCount: 0, warnings: ["No planning materialization diagnostics available."] };
  return { source: raw.source, plannedTaskCount: raw.plannedTaskCount, changedTaskCount: raw.changedTaskCount, warnings: [...raw.warnings] };
}

function buildActivationReport(args: { effectiveMoves?: EffectiveMovesDiagnostics; materialization?: ORCPlanningMaterializationDiagnostics; usedEngine: ORCActiveUsedEngine; orcResultKind: ORCResultKind; fallbackReason: string | null; gates: Record<string, boolean>; executionTimeMs: number; simulation: SimulatedState | null; validation: ValidationResult | null; score: number | null; v4Metrics: OperationalPlanningQualityMetrics; orcMetrics: OperationalPlanningQualityMetrics; v4Planned: PlanningAssignment[]; orcPlanned: PlanningAssignment[]; v4UnplannedTasks: number; neededTasks: number }): ORCActivationReport {
  const comparison = {
    coachIdleTimeDelta: total(args.orcMetrics.resourceIdleTime) - total(args.v4Metrics.resourceIdleTime),
    talentIdleTimeDelta: total(args.orcMetrics.talentIdleTime) - total(args.v4Metrics.talentIdleTime),
    operationalCompactnessDelta: args.orcMetrics.operationalCompactness - args.v4Metrics.operationalCompactness,
    mainFlowContinuityDelta: args.orcMetrics.mainFlowContinuityQuality.gaps - args.v4Metrics.mainFlowContinuityQuality.gaps,
    makespanDelta: makespan(args.orcPlanned) - makespan(args.v4Planned),
  };
  const explanation = readableFallbackReason(args.fallbackReason, args.gates, { needed: args.neededTasks, orc: args.orcPlanned.length });
  const reason = args.usedEngine === "orc" ? "ORC superó todos los gates, aplicó cambios reales y no empeora las métricas críticas frente a V4." : args.usedEngine === "orc_baseline_preserved" ? "ORC ejecutado correctamente, pero no aplicó cambios sobre el baseline. Se muestra una planificación completa equivalente al baseline." : (explanation ?? "V4 se mantiene como fallback seguro.");
  return {
    version: "ORC-ACTIVATION-REPORT-V1",
    summary: { selectedEngine: args.usedEngine, reason, executionTimeMs: args.executionTimeMs, finalResult: args.usedEngine === "orc" ? "ORC aplicado" : args.usedEngine === "orc_baseline_preserved" ? "ORC baseline preservado" : "V4 Fallback aplicado" },
    orcResultKind: args.orcResultKind,
    gates: Object.keys(args.gates).sort().map((name) => ({ name, passed: args.gates[name], status: args.gates[name] ? "PASS" : "FAIL" })),
    bestORCSimulation: { score: args.score, plannedTasks: args.orcPlanned.length, hardViolations: [...(args.validation?.violatedConstraints ?? [])].sort(), softMetrics: args.simulation?.operationalStateSnapshot.operationalMetrics ?? {}, opqm: args.simulation ? args.orcMetrics : null },
    comparison,
    fallback: { reason: args.fallbackReason, explanation },
    recommendation: { type: "NEXT_IMPROVEMENT", message: recommendation(args.gates, comparison) },
    evidence: { selectedSimulatedStateId: args.simulation?.id ?? null, validationResult: args.validation?.result ?? null, v4PlannedTasks: args.v4Planned.length, orcPlannedTasks: args.orcPlanned.length, v4UnplannedTasks: args.v4UnplannedTasks, orcUnplannedTasks: Math.max(0, args.neededTasks - args.orcPlanned.length) },
    planningMaterialization: args.materialization ?? planningMaterializationOf(args.simulation),
    effectiveMoves: args.effectiveMoves ?? EMPTY_EFFECTIVE_MOVES,
  };
}


function buildPlanningRelationToBaseline(materialization: ORCPlanningMaterializationDiagnostics, orcPlanned: PlanningAssignment[]): { changedTaskCount: number; unchangedTaskCount: number; isEquivalentToBaseline: boolean } {
  const changedTaskCount = Math.max(0, Number(materialization.changedTaskCount) || 0);
  const plannedTaskCount = Math.max(0, Number(materialization.plannedTaskCount) || orcPlanned.length);
  return { changedTaskCount, unchangedTaskCount: Math.max(0, plannedTaskCount - changedTaskCount), isEquivalentToBaseline: changedTaskCount === 0 && orcPlanned.length > 0 };
}

function buildBestCandidateTrace(args: { effectiveMoves?: EffectiveMovesDiagnostics; materialization?: ORCPlanningMaterializationDiagnostics; baselineSeed: ORCBaselineSeedDiagnostics; v4Planned: PlanningAssignment[]; shadow: ORCShadowModeResult | null; simulation: SimulatedState | null; validation: ValidationResult | null; candidateState: CandidateState | null; candidate: Candidate | null; score: number | null; orcPlanned: PlanningAssignment[]; pendingTasks: number[]; extractionSource: string; extractionWarnings: string[]; orcMetrics: OperationalPlanningQualityMetrics; gates: Record<string, boolean>; discardReason: string | null }): ORCBestCandidateTrace {
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
    extractionSource: args.extractionSource,
    extractionWarnings: [...args.extractionWarnings],
    plannedTaskCount: args.orcPlanned.length,
    seededPlanningCount: args.baselineSeed.seededPlanningCount,
    planningRelationToBaseline: buildPlanningRelationToBaseline(args.materialization ?? planningMaterializationOf(args.simulation), args.orcPlanned),
    planningMaterialization: args.materialization ?? planningMaterializationOf(args.simulation),
    effectiveMoves: args.effectiveMoves ?? EMPTY_EFFECTIVE_MOVES,
    pendingTaskCount: args.pendingTasks.length,
    plannedTasks: [...args.orcPlanned].sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned)).slice(0, 10),
    pendingTasks: [...args.pendingTasks].sort((a, b) => a - b).slice(0, 10),
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
  let seededInput: EngineInput | null = null;
  let baselineSeed: ORCBaselineSeedDiagnostics = { applied: false, v4PlannedCount: 0, protectedExistingPlanningCount: 0, clearedRawPlanningCount: 0, unseededPendingCount: 0, seededPlanningCount: 0, sourcePlanningCount: 0, source: "v4_baseline", warnings: [] };
  let baselineSeedHardFeasibility: ORCBaselineSeedHardFeasibilityAudit = auditORCBaselineSeedHardFeasibility(null, { createdAt: null });
  try {
    const seeded = buildORCBaselineSeededInput(input, v4.output);
    assertSerializableORCSeed(seeded.seedPlanning);
    seededInput = seeded.input;
    baselineSeed = seeded.baselineSeed;
    baselineSeedHardFeasibility = auditORCBaselineSeedHardFeasibility(seededInput, { createdAt: null });
  } catch (error) {
    baselineSeed = { applied: false, v4PlannedCount: 0, protectedExistingPlanningCount: 0, clearedRawPlanningCount: 0, unseededPendingCount: 0, seededPlanningCount: 0, sourcePlanningCount: v4.output.plannedTasks?.length ?? 0, source: "v4_baseline", warnings: ["ORC baseline seed disabled before execution."], error: error instanceof Error ? error.message : String(error) };
    const gates = { v4BaselineAvailable: true, baselineSeedHardFeasible: baselineSeedHardFeasibility.hardFeasible, orcExecuted: false };
    const v4Planned = (v4.output.plannedTasks ?? []).map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
    const emptyMetrics = calculateOperationalPlanningQualityMetrics(input, []);
    const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4Planned);
    const fallbackReason = baselineSeed.error?.startsWith("baseline_seed_too_large") ? "baseline_seed_too_large" : "baseline_seed_not_serializable";
    const report = buildActivationReport({ usedEngine: "v4_fallback", orcResultKind: "v4_fallback", fallbackReason, gates, executionTimeMs: reportExecutionTimeMs, simulation: null, validation: null, score: null, v4Metrics, orcMetrics: emptyMetrics, v4Planned, orcPlanned: [], v4UnplannedTasks: v4.output.unplanned?.length ?? v4.diagnostics.unplannedTasks, neededTasks: neededTaskIds(input).length });
    const trace = buildBestCandidateTrace({ baselineSeed, v4Planned, shadow: null, simulation: null, validation: null, candidateState: null, candidate: null, score: null, orcPlanned: [], pendingTasks: neededTaskIds(input), extractionSource: "none", extractionWarnings: ["ORC baseline seed failed safety validation before execution."], orcMetrics: emptyMetrics, gates, discardReason: fallbackReason });
    const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: v4.diagnostics.status, generatedAt: v4.diagnostics.generatedAt, plannedTasks: v4.diagnostics.plannedTasks, unplannedTasks: v4.diagnostics.unplannedTasks, warning: v4.diagnostics.warning, usedEngine: "v4_fallback", fallbackReason, orcResultKind: "v4_fallback", planningRelationToBaseline: buildPlanningRelationToBaseline(planningMaterializationOf(null), []), explanation: readableFallbackReason(fallbackReason, gates, { needed: neededTaskIds(input).length, orc: 0 }) ?? "V4 se mantiene como fallback seguro.", gates, orcSummary: { error: baselineSeed.error, baselineSeed, baselineSeedHardFeasibility }, v4Diagnostics: v4.diagnostics, operationalDelta: null, orcActivationReport: report, bestCandidateTrace: trace, baselineSeed, baselineSeedHardFeasibility, effectiveMoves: EMPTY_EFFECTIVE_MOVES, orcActiveBridge: true };
    return { output: v4.output, diagnostics };
  }
  let shadow: ORCShadowModeResult | null = null;
  try {
    shadow = options.orcShadowResult !== undefined ? options.orcShadowResult : (options.runORC ? options.runORC(seededInput) : runORCShadowMode(seededInput, { enabled: true, createdAt: null }));
  } catch (error) {
    const gates = { v4BaselineAvailable: true, baselineSeedHardFeasible: baselineSeedHardFeasibility.hardFeasible, orcExecuted: false };
    const v4Planned = (v4.output.plannedTasks ?? []).map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
    const emptyMetrics = calculateOperationalPlanningQualityMetrics(input, []);
    const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4Planned);
    const report = buildActivationReport({ usedEngine: "v4_fallback", orcResultKind: "v4_fallback", fallbackReason: "orc_execution_failed", gates, executionTimeMs: reportExecutionTimeMs, simulation: null, validation: null, score: null, v4Metrics, orcMetrics: emptyMetrics, v4Planned, orcPlanned: [], v4UnplannedTasks: v4.output.unplanned?.length ?? v4.diagnostics.unplannedTasks, neededTasks: neededTaskIds(input).length });
    const trace = buildBestCandidateTrace({ baselineSeed, v4Planned, shadow: null, simulation: null, validation: null, candidateState: null, candidate: null, score: null, orcPlanned: [], pendingTasks: neededTaskIds(input), extractionSource: "none", extractionWarnings: ["ORC execution failed before planning extraction."], orcMetrics: emptyMetrics, gates, discardReason: "orc_execution_failed" });
    const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: v4.diagnostics.status, generatedAt: v4.diagnostics.generatedAt, plannedTasks: v4.diagnostics.plannedTasks, unplannedTasks: v4.diagnostics.unplannedTasks, warning: v4.diagnostics.warning, usedEngine: "v4_fallback", fallbackReason: "orc_execution_failed", orcResultKind: "v4_fallback", planningRelationToBaseline: buildPlanningRelationToBaseline(planningMaterializationOf(null), []), explanation: readableFallbackReason("orc_execution_failed", gates, { needed: neededTaskIds(input).length, orc: 0 }) ?? "V4 se mantiene como fallback seguro.", gates, orcSummary: { error: error instanceof Error ? error.message : String(error), baselineSeedHardFeasibility }, v4Diagnostics: v4.diagnostics, operationalDelta: null, orcActivationReport: report, bestCandidateTrace: trace, baselineSeed, baselineSeedHardFeasibility, effectiveMoves: EMPTY_EFFECTIVE_MOVES, orcActiveBridge: true };
    return { output: v4.output, diagnostics };
  }

  const { simulation, validation, value, candidateState, candidate } = findBestSimulation(shadow);
  const needed = neededTaskIds(input);
  const extraction = simulation ? extractPlannedTasksFromORCSimulatedState(simulation, needed) : { plannedTasks: [], pendingTaskIds: needed, extractionSource: "none", extractionWarnings: ["No ORC simulation available for planning extraction."] };
  let orcPlanned = extraction.plannedTasks;
  const plannedIds = new Set(orcPlanned.map((item) => item.taskId));
  const v4Planned = (v4.output.plannedTasks ?? []).map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
  const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4Planned);
  let orcMetrics = calculateOperationalPlanningQualityMetrics(input, orcPlanned);
  const shadowBaselineOverlapRepair = (shadow?.summary as Record<string, unknown> | undefined)?.baselineOverlapRepair as Record<string, unknown> | undefined;
  const materialization = planningMaterializationOf(simulation);
  const baselineRepairFinalHardFeasible = shadowBaselineOverlapRepair?.selectedAsCommit === true
    && Number(shadowBaselineOverlapRepair?.validSimulationCount ?? 0) > 0
    && materialization.source === "candidate_transformations"
    && materialization.changedTaskCount > 0
    && validation?.result === "VALID"
    && protectedTasksPreserved(input, orcPlanned, "done")
    && protectedTasksPreserved(input, orcPlanned, "in_progress")
    && locksPreserved(input, orcPlanned)
    && (validation?.violatedConstraints?.length ?? 1) === 0;
  const gates: Record<string, boolean> = {
    v4BaselineAvailable: true,
    baselineSeedHardFeasible: baselineSeedHardFeasibility.hardFeasible || baselineRepairFinalHardFeasible,
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
    deterministicOutput: simulation != null && stableStringify(orcPlanned) === stableStringify(extractPlannedTasksFromORCSimulatedState(simulation, needed).plannedTasks),
    explainableDecision: true,
  };
  const effectiveMoves: EffectiveMovesDiagnostics = EMPTY_EFFECTIVE_MOVES;
  const failedGate = Object.entries(gates).find(([, passed]) => !passed)?.[0] ?? null;
  const operationalDelta = { v4: v4Metrics, orc: orcMetrics, criticalComparison: { opqmNotWorseThanV4: gates.opqmNotWorseThanV4 } };
  const planningRelationToBaseline = buildPlanningRelationToBaseline(materialization, orcPlanned);
  const orcResultKind: ORCResultKind = failedGate ? "v4_fallback" : materialization.changedTaskCount > 0 ? "orc_changed_plan" : "orc_baseline_preserved";
  const usedEngine: ORCActiveUsedEngine = failedGate ? "v4_fallback" : orcResultKind === "orc_changed_plan" ? "orc" : "orc_baseline_preserved";
  const mainFlowGapClosure = (shadow?.summary as Record<string, unknown> | undefined)?.mainFlowGapClosure as Record<string, unknown> | undefined;
  const baselineOverlapRepair = shadowBaselineOverlapRepair;
  const mainFlowSkippedReason = typeof mainFlowGapClosure?.skippedReason === "string" ? mainFlowGapClosure.skippedReason : null;
  const fallbackReason = failedGate ? (failedGate === "baselineSeedHardFeasible" && !baselineRepairFinalHardFeasible ? baselineSeedHardFeasibility.reason : (mainFlowSkippedReason === "main_flow_not_configured" ? "main_flow_not_configured" : (simulation ? (orcPlanned.length === 0 && needed.length > 0 ? "orc_planning_extraction_empty" : `gate_failed:${failedGate}`) : "no_valid_orc_simulation"))) : null;
  const orcActivationReport = buildActivationReport({ effectiveMoves, materialization, usedEngine, orcResultKind, fallbackReason, gates, executionTimeMs: reportExecutionTimeMs, simulation, validation, score: value, v4Metrics, orcMetrics, v4Planned, orcPlanned, v4UnplannedTasks: v4.output.unplanned?.length ?? v4.diagnostics.unplannedTasks, neededTasks: needed.length });
  const bestCandidateTrace = buildBestCandidateTrace({ effectiveMoves, materialization, baselineSeed, v4Planned, shadow, simulation, validation, candidateState, candidate, score: value, orcPlanned, pendingTasks: extraction.pendingTaskIds.length ? extraction.pendingTaskIds : needed.filter((id) => !plannedIds.has(id)), extractionSource: extraction.extractionSource, extractionWarnings: extraction.extractionWarnings, orcMetrics, gates, discardReason: fallbackReason });
  const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: failedGate ? v4.diagnostics.status : "success", generatedAt: v4.diagnostics.generatedAt, plannedTasks: failedGate ? v4.diagnostics.plannedTasks : orcPlanned.length, unplannedTasks: failedGate ? v4.diagnostics.unplannedTasks : 0, warning: failedGate ? v4.diagnostics.warning : "ORC Active Bridge generó un resultado V4 seguro.", usedEngine, fallbackReason, orcResultKind, planningRelationToBaseline, explanation: usedEngine === "orc_baseline_preserved" ? "ORC ejecutado correctamente, pero no aplicó cambios sobre el baseline. Se muestra una planificación completa equivalente al baseline." : usedEngine === "orc" ? "ORC ejecutado correctamente y aplicó cambios reales sobre el baseline." : (readableFallbackReason(fallbackReason, gates, { needed: needed.length, orc: orcPlanned.length }) ?? "V4 se mantiene como fallback seguro."), gates, orcSummary: { ...(shadow?.summary ?? null), baselineSeed, baselineSeedHardFeasibility, selectedSimulatedStateId: simulation?.id ?? null, selectedOverallScore: value, planningExtraction: { source: extraction.extractionSource, plannedTaskCount: orcPlanned.length, pendingTaskCount: extraction.pendingTaskIds.length, warnings: extraction.extractionWarnings }, planningMaterialization: materialization, effectiveMoves, mainFlowGapClosure, baselineOverlapRepair }, v4Diagnostics: v4.diagnostics, operationalDelta, orcActivationReport, bestCandidateTrace, baselineSeed, baselineSeedHardFeasibility, effectiveMoves, orcActiveBridge: true };

  if (failedGate) return { output: v4.output, diagnostics };
  return { output: { ...v4.output, feasible: true, complete: true, hardFeasible: true, plannedTasks: orcPlanned, unplanned: [], warnings: v4.output.warnings ?? [] }, diagnostics };
}
