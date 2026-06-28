import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { generatePlanV4, type EngineV4Diagnostics } from "../../v4";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import type { SimulatedState, ValidationResult } from "../contracts";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics, type PlanningAssignment } from "../benchmark/operationalPlanningQualityMetrics";
import { stableStringify } from "../structuralEquality";

export type ORCActiveUsedEngine = "orc" | "v4_fallback";

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

function findBestValidSimulation(shadow: ORCShadowModeResult | null): { simulation: SimulatedState | null; validation: ValidationResult | null; value: number | null } {
  if (!shadow) return { simulation: null, validation: null, value: null };
  const validIds = new Set((shadow.validationResults ?? []).filter((item) => item.result === "VALID").map((item) => item.simulatedStateId));
  const valueById = new Map((shadow.operationalValues ?? []).map((item) => [item.simulatedStateId, item.overallScore]));
  const candidates = (shadow.simulatedStates ?? []).filter((state) => validIds.has(state.id));
  candidates.sort((a, b) => (valueById.get(b.id) ?? -Infinity) - (valueById.get(a.id) ?? -Infinity) || a.id.localeCompare(b.id));
  const simulation = candidates[0] ?? null;
  return { simulation, validation: simulation ? (shadow.validationResults ?? []).find((item) => item.simulatedStateId === simulation.id) ?? null : null, value: simulation ? valueById.get(simulation.id) ?? null : null };
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

function opqmNotWorse(v4: OperationalPlanningQualityMetrics, orc: OperationalPlanningQualityMetrics): boolean {
  return orc.operationalCompactness >= v4.operationalCompactness
    && orc.mainFlowContinuityQuality.gaps <= v4.mainFlowContinuityQuality.gaps
    && total(orc.resourceIdleTime) <= total(v4.resourceIdleTime)
    && total(orc.talentIdleTime) <= total(v4.talentIdleTime);
}

export function runORCActivePlanner(input: EngineInput, options: ORCActivePlannerOptions = {}): ORCActivePlannerResult {
  const v4 = generatePlanV4(input, options);
  let shadow: ORCShadowModeResult | null = null;
  try {
    shadow = options.orcShadowResult !== undefined ? options.orcShadowResult : (options.runORC ? options.runORC(input) : runORCShadowMode(input, { enabled: true, createdAt: null }));
  } catch (error) {
    const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: v4.diagnostics.status, generatedAt: v4.diagnostics.generatedAt, plannedTasks: v4.diagnostics.plannedTasks, unplannedTasks: v4.diagnostics.unplannedTasks, warning: v4.diagnostics.warning, usedEngine: "v4_fallback", fallbackReason: "orc_execution_failed", gates: { v4BaselineAvailable: true, orcExecuted: false }, orcSummary: { error: error instanceof Error ? error.message : String(error) }, v4Diagnostics: v4.diagnostics, operationalDelta: null, orcActiveBridge: true };
    return { output: v4.output, diagnostics };
  }

  const { simulation, validation, value } = findBestValidSimulation(shadow);
  const orcPlanned = simulation ? convertSimulationToPlannedTasks(simulation) : [];
  const needed = neededTaskIds(input);
  const plannedIds = new Set(orcPlanned.map((item) => item.taskId));
  const v4Metrics = calculateOperationalPlanningQualityMetrics(input, v4.output.plannedTasks ?? []);
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
  const diagnostics: ORCActiveDiagnostics = { engineVersion: "orc-active", status: failedGate ? v4.diagnostics.status : "success", generatedAt: v4.diagnostics.generatedAt, plannedTasks: failedGate ? v4.diagnostics.plannedTasks : orcPlanned.length, unplannedTasks: failedGate ? v4.diagnostics.unplannedTasks : 0, warning: failedGate ? v4.diagnostics.warning : "ORC Active Bridge generó un resultado V4 seguro.", usedEngine: failedGate ? "v4_fallback" : "orc", fallbackReason: failedGate ? (simulation ? `gate_failed:${failedGate}` : "no_valid_orc_simulation") : null, gates, orcSummary: { ...(shadow?.summary ?? null), selectedSimulatedStateId: simulation?.id ?? null, selectedOverallScore: value }, v4Diagnostics: v4.diagnostics, operationalDelta, orcActiveBridge: true };

  if (failedGate) return { output: v4.output, diagnostics };
  return { output: { ...v4.output, feasible: true, complete: true, hardFeasible: true, plannedTasks: orcPlanned, unplanned: [], warnings: v4.output.warnings ?? [] }, diagnostics };
}
