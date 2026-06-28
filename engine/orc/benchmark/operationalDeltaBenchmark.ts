import type { EngineInput, EngineOutput } from "../../types";
import { generatePlanV4 } from "../../v4";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import { stableStringify } from "../structuralEquality";

export const OPERATIONAL_DELTA_BENCHMARK_VERSION = "ORC-OPERATIONAL-DELTA-BENCHMARK-V1";

export type OfficialOperationalMetric =
  | "makespan"
  | "totalPermanence"
  | "permanenceByTalent"
  | "mainFlowContinuity"
  | "resourceUtilization"
  | "conflicts"
  | "simulations"
  | "candidatesGenerated"
  | "candidatesSimulated"
  | "candidatesConsolidated"
  | "totalTime"
  | "timeByIteration";

export interface OperationalDeltaMetrics {
  makespan: number | null;
  totalPermanence: number;
  permanenceByTalent: Record<string, number>;
  mainFlowContinuity: number;
  resourceUtilization: number;
  conflicts: number;
  simulations: number;
  candidatesGenerated: number;
  candidatesSimulated: number;
  candidatesConsolidated: number;
  totalTime: number;
  timeByIteration: number[];
}

export interface OperationalDeltaReport {
  benchmarkVersion: typeof OPERATIONAL_DELTA_BENCHMARK_VERSION;
  generatedAt: string | null;
  scenario: { planId: number; taskCount: number };
  metrics: { orc: OperationalDeltaMetrics; v4: OperationalDeltaMetrics };
  absoluteDelta: OperationalDeltaMetrics;
  percentageDelta: OperationalDeltaMetrics;
  evidenceExplanation: string[];
  planningUnchanged: boolean;
}

export interface OperationalDeltaBenchmarkOptions {
  createdAt?: string | null;
  v4RuntimeMs?: number;
  orcRuntimeMs?: number;
}

type Assignment = { taskId: number; startPlanned: string; endPlanned: string; assignedResources?: number[] };
const cloneInput = (input: EngineInput): EngineInput => JSON.parse(JSON.stringify(input)) as EngineInput;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const minutes = (value?: string | null): number | null => {
  const [hours, mins] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
};
const duration = (assignment: Assignment): number => {
  const start = minutes(assignment.startPlanned);
  const end = minutes(assignment.endPlanned);
  return start === null || end === null ? 0 : Math.max(0, end - start);
};
const zeroPercentage = (template: OperationalDeltaMetrics): OperationalDeltaMetrics => ({ ...template, permanenceByTalent: Object.fromEntries(Object.keys(template.permanenceByTalent).map((key) => [key, 0])), timeByIteration: template.timeByIteration.map(() => 0) });

function operationalAssignmentsFromShadow(shadow: ORCShadowModeResult): Assignment[] {
  const accepted = shadow.commitDecisions.find((decision) => decision.decision === "COMMIT");
  const value = accepted?.operationalValueId ? shadow.operationalValues.find((item) => item.simulatedStateId === accepted.operationalValueId || `${item.simulatedStateId}:value` === accepted.operationalValueId) : null;
  const simulated = value ? shadow.simulatedStates.find((item) => item.id === value.simulatedStateId) : shadow.simulatedStates[0];
  return (simulated?.operationalStateSnapshot.planning ?? shadow.operationalState.planning).map((item) => ({
    taskId: item.taskId,
    startPlanned: item.startPlanned,
    endPlanned: item.endPlanned,
    assignedResources: item.assignedResourceIds,
  }));
}

function metricsFromAssignments(input: EngineInput, assignments: Assignment[], counts: Pick<OperationalDeltaMetrics, "conflicts" | "simulations" | "candidatesGenerated" | "candidatesSimulated" | "candidatesConsolidated" | "totalTime" | "timeByIteration">): OperationalDeltaMetrics {
  const byTask = new Map(input.tasks.map((task) => [task.id, task]));
  const ends = assignments.map((item) => minutes(item.endPlanned)).filter((item): item is number => item !== null);
  const sorted = [...assignments].sort((a, b) => (minutes(a.startPlanned) ?? 0) - (minutes(b.startPlanned) ?? 0));
  const permanenceByTalent: Record<string, number> = {};
  for (const item of assignments) {
    const task = byTask.get(item.taskId);
    const talent = task?.contestantId ?? task?.itinerantTeamId ?? "unassigned";
    permanenceByTalent[String(talent)] = round((permanenceByTalent[String(talent)] ?? 0) + duration(item));
  }
  const totalAssigned = assignments.reduce((sum, item) => sum + duration(item) * Math.max(1, item.assignedResources?.length ?? 0), 0);
  const workStart = minutes(input.workDay?.start);
  const workEnd = minutes(input.workDay?.end);
  const available = workStart === null || workEnd === null ? 0 : Math.max(0, workEnd - workStart) * Math.max(1, input.planResourceItems.filter((item) => item.isAvailable).length);
  let gap = 0;
  for (let index = 1; index < sorted.length; index += 1) gap += Math.max(0, (minutes(sorted[index].startPlanned) ?? 0) - (minutes(sorted[index - 1].endPlanned) ?? 0));
  return {
    makespan: ends.length === 0 ? null : Math.max(...ends),
    totalPermanence: round(Object.values(permanenceByTalent).reduce((sum, item) => sum + item, 0)),
    permanenceByTalent,
    mainFlowContinuity: round(gap),
    resourceUtilization: available === 0 ? 0 : round(totalAssigned / available),
    ...counts,
  };
}

function v4Metrics(input: EngineInput, output: EngineOutput, diagnostics: ReturnType<typeof generatePlanV4>["diagnostics"], runtime: number): OperationalDeltaMetrics {
  const simulated = diagnostics.candidateRunner?.candidates?.filter((candidate: any) => !candidate.skipped).length ?? 0;
  return metricsFromAssignments(input, output.plannedTasks, {
    conflicts: (output.hardFeasible === false ? 1 : 0) + (output.warnings?.length ?? 0) + (output.reasons?.length ?? 0),
    simulations: simulated,
    candidatesGenerated: diagnostics.candidateRunner?.candidateCount ?? output.plannedTasks.length,
    candidatesSimulated: simulated,
    candidatesConsolidated: output.complete ? 1 : 0,
    totalTime: round(runtime),
    timeByIteration: [round(runtime)],
  });
}

function orcMetrics(input: EngineInput, shadow: ORCShadowModeResult, runtime: number): OperationalDeltaMetrics {
  return metricsFromAssignments(input, operationalAssignmentsFromShadow(shadow), {
    conflicts: shadow.summary.invalidCount,
    simulations: shadow.simulatedStates.length,
    candidatesGenerated: shadow.candidates.length,
    candidatesSimulated: shadow.candidateStates.length,
    candidatesConsolidated: shadow.commitDecisions.filter((decision) => decision.decision === "COMMIT").length,
    totalTime: round(runtime),
    timeByIteration: [round(runtime)],
  });
}

function delta(a: OperationalDeltaMetrics, b: OperationalDeltaMetrics): OperationalDeltaMetrics {
  const keys = new Set([...Object.keys(a.permanenceByTalent), ...Object.keys(b.permanenceByTalent)]);
  return {
    makespan: a.makespan === null || b.makespan === null ? null : round(a.makespan - b.makespan),
    totalPermanence: round(a.totalPermanence - b.totalPermanence),
    permanenceByTalent: Object.fromEntries([...keys].sort().map((key) => [key, round((a.permanenceByTalent[key] ?? 0) - (b.permanenceByTalent[key] ?? 0))])),
    mainFlowContinuity: round(a.mainFlowContinuity - b.mainFlowContinuity),
    resourceUtilization: round(a.resourceUtilization - b.resourceUtilization),
    conflicts: round(a.conflicts - b.conflicts),
    simulations: round(a.simulations - b.simulations),
    candidatesGenerated: round(a.candidatesGenerated - b.candidatesGenerated),
    candidatesSimulated: round(a.candidatesSimulated - b.candidatesSimulated),
    candidatesConsolidated: round(a.candidatesConsolidated - b.candidatesConsolidated),
    totalTime: round(a.totalTime - b.totalTime),
    timeByIteration: a.timeByIteration.map((value, index) => round(value - (b.timeByIteration[index] ?? 0))),
  };
}
function pct(abs: OperationalDeltaMetrics, base: OperationalDeltaMetrics): OperationalDeltaMetrics {
  const out = zeroPercentage(abs);
  const pctOne = (value: number, denominator: number) => denominator === 0 ? 0 : round((value / denominator) * 100);
  out.makespan = abs.makespan === null || base.makespan === null ? null : pctOne(abs.makespan, base.makespan);
  for (const key of Object.keys(abs.permanenceByTalent)) out.permanenceByTalent[key] = pctOne(abs.permanenceByTalent[key] ?? 0, base.permanenceByTalent[key] ?? 0);
  for (const key of ["totalPermanence", "mainFlowContinuity", "resourceUtilization", "conflicts", "simulations", "candidatesGenerated", "candidatesSimulated", "candidatesConsolidated", "totalTime"] as const) out[key] = pctOne(abs[key], base[key]);
  out.timeByIteration = abs.timeByIteration.map((value, index) => pctOne(value, base.timeByIteration[index] ?? 0));
  return out;
}

export function runOperationalDeltaBenchmark(input: EngineInput, options: OperationalDeltaBenchmarkOptions = {}): OperationalDeltaReport {
  const safeInput = cloneInput(input);
  const before = stableStringify(safeInput);
  const v4 = generatePlanV4(cloneInput(safeInput), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any);
  const shadow = runORCShadowMode(cloneInput(safeInput), { enabled: true, createdAt: options.createdAt ?? null });
  if (shadow === null) throw new Error("Operational Delta Benchmark requires ORC Shadow Mode.");
  const v4MetricSet = v4Metrics(safeInput, v4.output, v4.diagnostics, options.v4RuntimeMs ?? 0);
  const orcMetricSet = orcMetrics(safeInput, shadow, options.orcRuntimeMs ?? 0);
  const absoluteDelta = delta(orcMetricSet, v4MetricSet);
  return {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: options.createdAt ?? null,
    scenario: { planId: safeInput.planId, taskCount: safeInput.tasks.length },
    metrics: { orc: orcMetricSet, v4: v4MetricSet },
    absoluteDelta,
    percentageDelta: pct(absoluteDelta, v4MetricSet),
    evidenceExplanation: [
      `ORC Shadow Mode produced ${shadow.candidates.length} candidate(s), ${shadow.simulatedStates.length} simulation(s), and ${shadow.commitDecisions.length} decision(s).`,
      `V4 produced ${v4.output.plannedTasks.length} planned task(s) and ${(v4.output.unplanned ?? []).length} unplanned task(s).`,
      "Delta values are ORC minus V4 and do not decide which result is better.",
    ],
    planningUnchanged: stableStringify(safeInput) === before,
  };
}
