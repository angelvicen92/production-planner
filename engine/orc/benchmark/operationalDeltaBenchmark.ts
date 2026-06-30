import type { EngineInput, EngineOutput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { assertSerializableORCSeed, buildORCBaselineSeededInput } from "../active/orcBaselineSeed";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import { optimizeDependencyChainFlow } from "../search/dependencyChainFlowOptimizer";
import { stableStringify } from "../structuralEquality";
import { analyzeImprovementOpportunities, type ImprovementOpportunityReport } from "./improvementOpportunityAnalyzer";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics } from "./operationalPlanningQualityMetrics";

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
  | "timeByIteration"
  | "dependencyChainsProtected"
  | "dependencyBlockagesAvoided"
  | "dependencyAverageSlackRecovered"
  | "dependencyCriticalityOperationalValueCorrelation"
  | "operationalPlanningQuality";

export const OFFICIAL_OPERATIONAL_METRICS: OfficialOperationalMetric[] = [
  "makespan",
  "totalPermanence",
  "permanenceByTalent",
  "mainFlowContinuity",
  "resourceUtilization",
  "conflicts",
  "simulations",
  "candidatesGenerated",
  "candidatesSimulated",
  "candidatesConsolidated",
  "totalTime",
  "timeByIteration",
  "dependencyChainsProtected",
  "dependencyBlockagesAvoided",
  "dependencyAverageSlackRecovered",
  "dependencyCriticalityOperationalValueCorrelation",
  "operationalPlanningQuality",
];

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
  dependencyChainsProtected: number;
  dependencyBlockagesAvoided: number;
  dependencyAverageSlackRecovered: number;
  dependencyCriticalityOperationalValueCorrelation: number;
  operationalPlanningQuality: OperationalPlanningQualityMetrics;
}

export interface RawShadowDiagnostics {
  enabled: boolean;
  candidateCount: number;
  simulatedStateCount: number;
  validCount: number;
  invalidCount: number;
  validationViolationSummary: Record<string, number>;
  explanation: string;
  planningInfluence: "none";
}

export interface ORCBaselineSeedReport {
  seededPlanningCount: number;
  sourcePlanningCount: number;
  serializedSize: number;
  serializable: boolean;
  warnings: string[];
  readOnly: true;
  planningInfluence: "benchmark-input-seeding-only";
}

export interface OperationalDeltaReport {
  benchmarkVersion: typeof OPERATIONAL_DELTA_BENCHMARK_VERSION;
  generatedAt: string | null;
  scenario: { planId: number; taskCount: number };
  metrics: { orc: OperationalDeltaMetrics; v4: OperationalDeltaMetrics };
  rawShadowDiagnostics: RawShadowDiagnostics;
  orcBaselineSeed: ORCBaselineSeedReport;
  absoluteDelta: OperationalDeltaMetrics;
  percentageDelta: OperationalDeltaMetrics;
  evidenceExplanation: string[];
  planningUnchanged: boolean;
  improvementReport: ImprovementOpportunityReport;
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
const zeroPercentage = (template: OperationalDeltaMetrics): OperationalDeltaMetrics => ({ ...template, permanenceByTalent: Object.fromEntries(Object.keys(template.permanenceByTalent).map((key) => [key, 0])), timeByIteration: template.timeByIteration.map(() => 0), operationalPlanningQuality: percentageOperationalPlanningQuality(template.operationalPlanningQuality, template.operationalPlanningQuality) });

function dependencyChainBenchmarkMetrics(input: EngineInput, operationalValue = 0) {
  const state = { id: `benchmark:${input.planId}`, planId: input.planId, workDay: input.workDay ?? null, planning: (input.tasks ?? []).filter((task) => task.startPlanned && task.endPlanned).map((task) => ({ taskId: task.id, startPlanned: task.startPlanned!, endPlanned: task.endPlanned!, assignedResourceIds: [], spaceId: task.spaceId ?? null })), tasks: input.tasks ?? [], resources: input.planResourceItems ?? [], spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} }, availability: { workDay: input.workDay ?? null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: input.protectedBreaks ?? [], contestantAvailabilityById: {} }, dependencies: (input.tasks ?? []).filter((task) => (task.dependsOnTaskIds?.length ?? 0) > 0).map((task) => ({ taskId: task.id, dependsOnTaskIds: task.dependsOnTaskIds ?? [], dependsOnTemplateIds: task.dependsOnTemplateIds ?? [] })), locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput" as const, schemaVersion: "ORC-SPEC-01" as const };
  const chains = optimizeDependencyChainFlow(state).chains;
  const averageSlack = chains.length === 0 ? 0 : round(chains.reduce((sum, chain) => sum + chain.metrics.accumulatedSlackMinutes, 0) / chains.length);
  const averageCriticality = chains.length === 0 ? 0 : round(chains.reduce((sum, chain) => sum + chain.metrics.structuralCriticality, 0) / chains.length);
  return { dependencyChainsProtected: chains.length, dependencyBlockagesAvoided: chains.filter((chain) => chain.metrics.blockingRisk >= 0.5).length, dependencyAverageSlackRecovered: averageSlack, dependencyCriticalityOperationalValueCorrelation: round(averageCriticality * operationalValue) };
}

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
    dependencyChainsProtected: 0,
    dependencyBlockagesAvoided: 0,
    dependencyAverageSlackRecovered: 0,
    dependencyCriticalityOperationalValueCorrelation: 0,
    operationalPlanningQuality: calculateOperationalPlanningQualityMetrics(input, assignments),
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

function validationViolationSummary(shadow: ORCShadowModeResult): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of shadow.validationResults) {
    for (const violation of result.violatedConstraints ?? []) summary[violation] = (summary[violation] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)));
}

function rawShadowDiagnostics(shadow: ORCShadowModeResult): RawShadowDiagnostics {
  return {
    enabled: shadow.summary.enabled,
    candidateCount: shadow.candidates.length,
    simulatedStateCount: shadow.simulatedStates.length,
    validCount: shadow.summary.validCount,
    invalidCount: shadow.summary.invalidCount,
    validationViolationSummary: validationViolationSummary(shadow),
    explanation: "Raw ORC Shadow runs on the original scenario input for technical diagnostics only; it does not influence official ORC-vs-V4 delta metrics.",
    planningInfluence: "none",
  };
}

function mapNumericRecord(a: Record<string, number>, b: Record<string, number>, fn: (x: number, y: number) => number): Record<string, number> {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  return Object.fromEntries(keys.map((key) => [key, round(fn(a[key] ?? 0, b[key] ?? 0))]));
}

function deltaOperationalPlanningQuality(a: OperationalPlanningQualityMetrics, b: OperationalPlanningQualityMetrics): OperationalPlanningQualityMetrics {
  const resourceIds = [...new Set([...a.criticalResourceSpread.resourceIds, ...b.criticalResourceSpread.resourceIds])].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  return {
    ...a,
    resourceActiveSpan: mapNumericRecord(a.resourceActiveSpan, b.resourceActiveSpan, (x, y) => x - y),
    resourceEffectiveWork: mapNumericRecord(a.resourceEffectiveWork, b.resourceEffectiveWork, (x, y) => x - y),
    resourceIdleTime: mapNumericRecord(a.resourceIdleTime, b.resourceIdleTime, (x, y) => x - y),
    resourceFragmentation: mapNumericRecord(a.resourceFragmentation, b.resourceFragmentation, (x, y) => x - y),
    talentActiveSpan: mapNumericRecord(a.talentActiveSpan, b.talentActiveSpan, (x, y) => x - y),
    talentEffectiveWork: mapNumericRecord(a.talentEffectiveWork, b.talentEffectiveWork, (x, y) => x - y),
    talentIdleTime: mapNumericRecord(a.talentIdleTime, b.talentIdleTime, (x, y) => x - y),
    talentFragmentation: mapNumericRecord(a.talentFragmentation, b.talentFragmentation, (x, y) => x - y),
    operationalCompactness: round(a.operationalCompactness - b.operationalCompactness),
    mainFlowContinuityQuality: { gaps: round(a.mainFlowContinuityQuality.gaps - b.mainFlowContinuityQuality.gaps), averageContinuousChainLength: round(a.mainFlowContinuityQuality.averageContinuousChainLength - b.mainFlowContinuityQuality.averageContinuousChainLength), interruptions: round(a.mainFlowContinuityQuality.interruptions - b.mainFlowContinuityQuality.interruptions) },
    criticalResourceSpread: { resourceIds, thresholdUtilization: round(a.criticalResourceSpread.thresholdUtilization - b.criticalResourceSpread.thresholdUtilization), averageActiveSpan: round(a.criticalResourceSpread.averageActiveSpan - b.criticalResourceSpread.averageActiveSpan), averageIdleTime: round(a.criticalResourceSpread.averageIdleTime - b.criticalResourceSpread.averageIdleTime), averageFragmentation: round(a.criticalResourceSpread.averageFragmentation - b.criticalResourceSpread.averageFragmentation) },
  };
}

function percentageOperationalPlanningQuality(abs: OperationalPlanningQualityMetrics, base: OperationalPlanningQualityMetrics): OperationalPlanningQualityMetrics {
  const pctOne = (value: number, denominator: number) => denominator === 0 ? 0 : round((value / denominator) * 100);
  return {
    ...abs,
    resourceActiveSpan: mapNumericRecord(abs.resourceActiveSpan, base.resourceActiveSpan, pctOne),
    resourceEffectiveWork: mapNumericRecord(abs.resourceEffectiveWork, base.resourceEffectiveWork, pctOne),
    resourceIdleTime: mapNumericRecord(abs.resourceIdleTime, base.resourceIdleTime, pctOne),
    resourceFragmentation: mapNumericRecord(abs.resourceFragmentation, base.resourceFragmentation, pctOne),
    talentActiveSpan: mapNumericRecord(abs.talentActiveSpan, base.talentActiveSpan, pctOne),
    talentEffectiveWork: mapNumericRecord(abs.talentEffectiveWork, base.talentEffectiveWork, pctOne),
    talentIdleTime: mapNumericRecord(abs.talentIdleTime, base.talentIdleTime, pctOne),
    talentFragmentation: mapNumericRecord(abs.talentFragmentation, base.talentFragmentation, pctOne),
    operationalCompactness: pctOne(abs.operationalCompactness, base.operationalCompactness),
    mainFlowContinuityQuality: { gaps: pctOne(abs.mainFlowContinuityQuality.gaps, base.mainFlowContinuityQuality.gaps), averageContinuousChainLength: pctOne(abs.mainFlowContinuityQuality.averageContinuousChainLength, base.mainFlowContinuityQuality.averageContinuousChainLength), interruptions: pctOne(abs.mainFlowContinuityQuality.interruptions, base.mainFlowContinuityQuality.interruptions) },
    criticalResourceSpread: { ...abs.criticalResourceSpread, thresholdUtilization: pctOne(abs.criticalResourceSpread.thresholdUtilization, base.criticalResourceSpread.thresholdUtilization), averageActiveSpan: pctOne(abs.criticalResourceSpread.averageActiveSpan, base.criticalResourceSpread.averageActiveSpan), averageIdleTime: pctOne(abs.criticalResourceSpread.averageIdleTime, base.criticalResourceSpread.averageIdleTime), averageFragmentation: pctOne(abs.criticalResourceSpread.averageFragmentation, base.criticalResourceSpread.averageFragmentation) },
  };
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
    dependencyChainsProtected: round(a.dependencyChainsProtected - b.dependencyChainsProtected),
    dependencyBlockagesAvoided: round(a.dependencyBlockagesAvoided - b.dependencyBlockagesAvoided),
    dependencyAverageSlackRecovered: round(a.dependencyAverageSlackRecovered - b.dependencyAverageSlackRecovered),
    dependencyCriticalityOperationalValueCorrelation: round(a.dependencyCriticalityOperationalValueCorrelation - b.dependencyCriticalityOperationalValueCorrelation),
    operationalPlanningQuality: deltaOperationalPlanningQuality(a.operationalPlanningQuality, b.operationalPlanningQuality),
  };
}
function pct(abs: OperationalDeltaMetrics, base: OperationalDeltaMetrics): OperationalDeltaMetrics {
  const out = zeroPercentage(abs);
  const pctOne = (value: number, denominator: number) => denominator === 0 ? 0 : round((value / denominator) * 100);
  out.makespan = abs.makespan === null || base.makespan === null ? null : pctOne(abs.makespan, base.makespan);
  for (const key of Object.keys(abs.permanenceByTalent)) out.permanenceByTalent[key] = pctOne(abs.permanenceByTalent[key] ?? 0, base.permanenceByTalent[key] ?? 0);
  for (const key of ["totalPermanence", "mainFlowContinuity", "resourceUtilization", "conflicts", "simulations", "candidatesGenerated", "candidatesSimulated", "candidatesConsolidated", "totalTime", "dependencyChainsProtected", "dependencyBlockagesAvoided", "dependencyAverageSlackRecovered", "dependencyCriticalityOperationalValueCorrelation"] as const) out[key] = pctOne(abs[key], base[key]);
  out.timeByIteration = abs.timeByIteration.map((value, index) => pctOne(value, base.timeByIteration[index] ?? 0));
  out.operationalPlanningQuality = percentageOperationalPlanningQuality(abs.operationalPlanningQuality, base.operationalPlanningQuality);
  return out;
}

export function runOperationalDeltaBenchmark(input: EngineInput, options: OperationalDeltaBenchmarkOptions = {}): OperationalDeltaReport {
  const safeInput = cloneInput(input);
  const before = stableStringify(safeInput);
  const v4 = generatePlanV4(cloneInput(safeInput), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any);
  const seeded = buildORCBaselineSeededInput(cloneInput(safeInput), v4.output);
  const serializedSeed = assertSerializableORCSeed(seeded.seedPlanning);
  const seededShadow = runORCShadowMode(cloneInput(seeded.input), { enabled: true, createdAt: options.createdAt ?? null });
  if (seededShadow === null) throw new Error("Operational Delta Benchmark requires V4-seeded ORC Shadow Mode.");
  const rawShadow = runORCShadowMode(cloneInput(safeInput), { enabled: true, createdAt: options.createdAt ?? null });
  if (rawShadow === null) throw new Error("Operational Delta Benchmark requires raw ORC Shadow diagnostics.");
  const v4MetricSet = { ...v4Metrics(safeInput, v4.output, v4.diagnostics, options.v4RuntimeMs ?? 0), ...dependencyChainBenchmarkMetrics(safeInput, 0) };
  const orcMetricSet = { ...orcMetrics(seeded.input, seededShadow, options.orcRuntimeMs ?? 0), ...dependencyChainBenchmarkMetrics(seeded.input, seededShadow.operationalValues[0]?.overallScore ?? 0) };
  const absoluteDelta = delta(orcMetricSet, v4MetricSet);
  const baseReport = {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: options.createdAt ?? null,
    scenario: { planId: safeInput.planId, taskCount: safeInput.tasks.length },
    metrics: { orc: orcMetricSet, v4: v4MetricSet },
    rawShadowDiagnostics: rawShadowDiagnostics(rawShadow),
    orcBaselineSeed: {
      seededPlanningCount: seeded.seedPlanning.length,
      sourcePlanningCount: v4.output.plannedTasks.length,
      serializedSize: Buffer.byteLength(serializedSeed, "utf8"),
      serializable: true,
      warnings: [...seeded.baselineSeed.warnings],
      readOnly: true,
      planningInfluence: "benchmark-input-seeding-only",
    },
    absoluteDelta,
    percentageDelta: pct(absoluteDelta, v4MetricSet),
    evidenceExplanation: [
      `V4 produced ${v4.output.plannedTasks.length} planned task(s) and ${(v4.output.unplanned ?? []).length} unplanned task(s) as the benchmark baseline.`,
      `The official ORC metric runs ORC Shadow Mode on the V4 baseline seed and produced ${seededShadow.candidates.length} candidate(s), ${seededShadow.simulatedStates.length} simulation(s), and ${seededShadow.commitDecisions.length} decision(s).`,
      `Raw ORC Shadow diagnostics produced ${rawShadow.summary.invalidCount} invalid simulation(s) on the original scenario input; those diagnostics are preserved separately and do not decide the official delta.`,
      "Delta values are ORC minus V4 using V4-seeded ORC Shadow for ORC metrics, and do not modify official planning.",
      "Operational Planning Quality Metrics measure resource/talent idle time, fragmentation, compactness, main-flow continuity details, and critical-resource spread without changing planning behavior.",
    ],
    planningUnchanged: stableStringify(safeInput) === before,
  } satisfies Omit<OperationalDeltaReport, "improvementReport">;
  return { ...baseReport, improvementReport: analyzeImprovementOpportunities(baseReport as OperationalDeltaReport) };
}
