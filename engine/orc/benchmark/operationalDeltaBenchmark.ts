import type { EngineInput, EngineOutput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { assertSerializableORCSeed, buildORCBaselineSeededInput } from "../active/orcBaselineSeed";
import { auditORCBaselineSeedHardFeasibility, type ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";
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

export const FINAL_PLANNING_METRICS: OfficialOperationalMetric[] = [
  "makespan",
  "totalPermanence",
  "permanenceByTalent",
  "mainFlowContinuity",
  "resourceUtilization",
  "conflicts",
  "dependencyChainsProtected",
  "dependencyBlockagesAvoided",
  "dependencyAverageSlackRecovered",
  "dependencyCriticalityOperationalValueCorrelation",
  "operationalPlanningQuality",
];

export const EXPLORATION_METRICS: OfficialOperationalMetric[] = [
  "simulations",
  "candidatesGenerated",
  "candidatesSimulated",
  "candidatesConsolidated",
  "totalTime",
  "timeByIteration",
];

export const OFFICIAL_OPERATIONAL_METRICS: OfficialOperationalMetric[] = [
  ...FINAL_PLANNING_METRICS,
  ...EXPLORATION_METRICS,
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

export interface OfficialOrcOutcome {
  kind: "orc" | "orc_baseline_preserved" | "v4_fallback";
  source: "v4_seeded_shadow_commit" | "v4_seeded_shadow_baseline" | "v4_fallback_after_seeded_shadow_failure";
  reason: string;
  selectedSimulatedStateId: string | null;
  selectedCommitDecisionId: string | null;
  fallbackToV4: boolean;
  validSeededSimulationCount: number;
  invalidSeededSimulationCount: number;
  commitCount: number;
  readOnly: true;
  planningInfluence: "benchmark-outcome-classification-only";
}

export interface SeededShadowDiagnostics {
  candidateCount: number;
  candidateStateCount: number;
  simulatedStateCount: number;
  validCount: number;
  invalidCount: number;
  commitCount: number;
  validationViolationSummary: Record<string, number>;
  explorationOverhead: {
    candidatesGenerated: number;
    candidateStates: number;
    simulatedStates: number;
    validCount: number;
    invalidCount: number;
    commitCount: number;
  };
  selectedOutcomeKind: OfficialOrcOutcome["kind"];
  fallbackToV4: boolean;
  explanation: string;
  readOnly: true;
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

export interface ActiveEquivalentMetricNormalization {
  applied: boolean;
  reason: "baseline_preserved_final_metrics_equal_v4" | "fallback_final_metrics_equal_v4" | "orc_commit_final_metrics_from_valid_simulation";
  normalizedFinalMetrics: string[];
  preservedExplorationMetrics: string[];
  sourceOutcomeKind: OfficialOrcOutcome["kind"];
  readOnly: true;
  planningInfluence: "benchmark-metric-normalization-only";
}

export interface OperationalDeltaReport {
  benchmarkVersion: typeof OPERATIONAL_DELTA_BENCHMARK_VERSION;
  generatedAt: string | null;
  scenario: { planId: number; taskCount: number };
  metrics: { orc: OperationalDeltaMetrics; v4: OperationalDeltaMetrics };
  rawShadowDiagnostics: RawShadowDiagnostics;
  seededShadowDiagnostics: SeededShadowDiagnostics;
  officialOrcOutcome: OfficialOrcOutcome;
  activeEquivalentMetricNormalization: ActiveEquivalentMetricNormalization;
  orcBaselineSeed: ORCBaselineSeedReport;
  baselineSeedHardFeasibility: ORCBaselineSeedHardFeasibilityAudit;
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

function assignmentsFromPlanning(planning: ORCShadowModeResult["operationalState"]["planning"]): Assignment[] {
  return planning.map((item) => ({
    taskId: item.taskId,
    startPlanned: item.startPlanned,
    endPlanned: item.endPlanned,
    assignedResources: item.assignedResourceIds,
  }));
}

function resolveValidCommittedSimulation(shadow: ORCShadowModeResult) {
  const validBySimulationId = new Set(shadow.validationResults.filter((result) => result.result === "VALID").map((result) => result.simulatedStateId));
  for (const [index, decision] of shadow.commitDecisions.entries()) {
    if (decision.decision !== "COMMIT" || decision.operationalValueId == null) continue;
    const value = shadow.operationalValues.find((item) => item.simulatedStateId === decision.operationalValueId || `${item.simulatedStateId}:value` === decision.operationalValueId);
    const simulatedStateId = value?.simulatedStateId ?? decision.operationalValueId;
    const simulated = shadow.simulatedStates.find((item) => item.id === simulatedStateId);
    if (simulated && validBySimulationId.has(simulated.id)) return { decision, decisionId: `${decision.operationalValueId}:${index}`, simulated };
  }
  return null;
}

function noValidCommitReason(shadow: ORCShadowModeResult): string {
  if (shadow.simulatedStates.length === 0) return "seeded_shadow_no_simulations";
  if (shadow.commitDecisions.filter((decision) => decision.decision === "COMMIT").length === 0) return "seeded_shadow_no_commit";
  return "seeded_shadow_no_valid_commit";
}

function buildOfficialOrcOutcome(shadow: ORCShadowModeResult, baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit): OfficialOrcOutcome {
  const selected = resolveValidCommittedSimulation(shadow);
  if (selected) {
    const materialization = selected.simulated.planningMaterialization;
    const baselinePreserved = materialization?.source === "baseline_seed_preserved" || (materialization?.changedTaskCount ?? 0) === 0;
    return {
      kind: baselinePreserved ? "orc_baseline_preserved" : "orc",
      source: baselinePreserved ? "v4_seeded_shadow_baseline" : "v4_seeded_shadow_commit",
      reason: baselinePreserved ? "seeded_shadow_valid_commit_preserved_baseline" : "seeded_shadow_valid_commit_applied_changes",
      selectedSimulatedStateId: selected.simulated.id,
      selectedCommitDecisionId: selected.decisionId,
      fallbackToV4: false,
      validSeededSimulationCount: shadow.summary.validCount,
      invalidSeededSimulationCount: shadow.summary.invalidCount,
      commitCount: shadow.summary.commitCount,
      readOnly: true,
      planningInfluence: "benchmark-outcome-classification-only",
    };
  }
  return {
    kind: "v4_fallback",
    source: "v4_fallback_after_seeded_shadow_failure",
    reason: baselineSeedHardFeasibility?.available === true && baselineSeedHardFeasibility?.hardFeasible === false ? "baseline_seed_hard_infeasible" : noValidCommitReason(shadow),
    selectedSimulatedStateId: null,
    selectedCommitDecisionId: null,
    fallbackToV4: true,
    validSeededSimulationCount: shadow.summary.validCount,
    invalidSeededSimulationCount: shadow.summary.invalidCount,
    commitCount: shadow.summary.commitCount,
    readOnly: true,
    planningInfluence: "benchmark-outcome-classification-only",
  };
}

function operationalAssignmentsFromOfficialOutcome(shadow: ORCShadowModeResult, outcome: OfficialOrcOutcome, v4Assignments: Assignment[]): Assignment[] {
  if (outcome.kind === "v4_fallback") return v4Assignments;
  const simulated = outcome.selectedSimulatedStateId ? shadow.simulatedStates.find((item) => item.id === outcome.selectedSimulatedStateId) : null;
  return simulated ? assignmentsFromPlanning(simulated.operationalStateSnapshot.planning) : v4Assignments;
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

const cloneMetricSet = (metrics: OperationalDeltaMetrics): OperationalDeltaMetrics => JSON.parse(JSON.stringify(metrics)) as OperationalDeltaMetrics;

function explorationCounts(shadow: ORCShadowModeResult, runtime: number): Pick<OperationalDeltaMetrics, "conflicts" | "simulations" | "candidatesGenerated" | "candidatesSimulated" | "candidatesConsolidated" | "totalTime" | "timeByIteration"> {
  return {
    conflicts: 0,
    simulations: shadow.simulatedStates.length,
    candidatesGenerated: shadow.candidates.length,
    candidatesSimulated: shadow.candidateStates.length,
    candidatesConsolidated: shadow.commitDecisions.filter((decision) => decision.decision === "COMMIT").length,
    totalTime: round(runtime),
    timeByIteration: [round(runtime)],
  };
}

function orcMetrics(input: EngineInput, shadow: ORCShadowModeResult, outcome: OfficialOrcOutcome, v4MetricSet: OperationalDeltaMetrics, v4Assignments: Assignment[], runtime: number): OperationalDeltaMetrics {
  const counts = explorationCounts(shadow, runtime);
  if (outcome.kind === "v4_fallback" || outcome.kind === "orc_baseline_preserved") {
    const normalized = cloneMetricSet(v4MetricSet);
    return {
      ...normalized,
      simulations: counts.simulations,
      candidatesGenerated: counts.candidatesGenerated,
      candidatesSimulated: counts.candidatesSimulated,
      candidatesConsolidated: counts.candidatesConsolidated,
      totalTime: counts.totalTime,
      timeByIteration: counts.timeByIteration,
    };
  }
  return metricsFromAssignments(input, operationalAssignmentsFromOfficialOutcome(shadow, outcome, v4Assignments), counts);
}

function activeEquivalentMetricNormalization(outcome: OfficialOrcOutcome): ActiveEquivalentMetricNormalization {
  const applied = outcome.kind !== "orc";
  return {
    applied,
    reason: outcome.kind === "orc_baseline_preserved"
      ? "baseline_preserved_final_metrics_equal_v4"
      : outcome.kind === "v4_fallback"
        ? "fallback_final_metrics_equal_v4"
        : "orc_commit_final_metrics_from_valid_simulation",
    normalizedFinalMetrics: applied ? [...FINAL_PLANNING_METRICS] : [],
    preservedExplorationMetrics: [...EXPLORATION_METRICS],
    sourceOutcomeKind: outcome.kind,
    readOnly: true,
    planningInfluence: "benchmark-metric-normalization-only",
  };
}

function validationViolationSummary(shadow: ORCShadowModeResult): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of shadow.validationResults) {
    for (const violation of result.violatedConstraints ?? []) summary[violation] = (summary[violation] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)));
}

function seededShadowDiagnostics(shadow: ORCShadowModeResult, outcome: OfficialOrcOutcome, baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit): SeededShadowDiagnostics {
  return {
    candidateCount: shadow.candidates.length,
    candidateStateCount: shadow.candidateStates.length,
    simulatedStateCount: shadow.simulatedStates.length,
    validCount: shadow.summary.validCount,
    invalidCount: shadow.summary.invalidCount,
    commitCount: shadow.summary.commitCount,
    validationViolationSummary: validationViolationSummary(shadow),
    explorationOverhead: { candidatesGenerated: shadow.candidates.length, candidateStates: shadow.candidateStates.length, simulatedStates: shadow.simulatedStates.length, validCount: shadow.summary.validCount, invalidCount: shadow.summary.invalidCount, commitCount: shadow.summary.commitCount },
    selectedOutcomeKind: outcome.kind,
    fallbackToV4: outcome.fallbackToV4,
    explanation: outcome.fallbackToV4 ? (baselineSeedHardFeasibility?.available === true && baselineSeedHardFeasibility?.hardFeasible === false ? `Seeded ORC Shadow is blocked because the V4 baseline seed is hard-infeasible (${outcome.reason}); official metrics use V4 fallback and keep seeded failures as diagnostics only.` : `Seeded ORC Shadow did not produce a valid commit (${outcome.reason}); official metrics use V4 fallback and keep seeded failures as diagnostics only.`) : `Seeded ORC Shadow selected ${outcome.kind} from validated commit ${outcome.selectedCommitDecisionId}.`,
    readOnly: true,
    planningInfluence: "none",
  };
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
  const baselineSeedHardFeasibility = auditORCBaselineSeedHardFeasibility(cloneInput(seeded.input), { createdAt: options.createdAt ?? null });
  const seededShadow = runORCShadowMode(cloneInput(seeded.input), { enabled: true, createdAt: options.createdAt ?? null });
  if (seededShadow === null) throw new Error("Operational Delta Benchmark requires V4-seeded ORC Shadow Mode.");
  const rawShadow = runORCShadowMode(cloneInput(safeInput), { enabled: true, createdAt: options.createdAt ?? null });
  if (rawShadow === null) throw new Error("Operational Delta Benchmark requires raw ORC Shadow diagnostics.");
  const v4MetricSet = { ...v4Metrics(safeInput, v4.output, v4.diagnostics, options.v4RuntimeMs ?? 0), ...dependencyChainBenchmarkMetrics(safeInput, 0) };
  const officialOrcOutcome = buildOfficialOrcOutcome(seededShadow, baselineSeedHardFeasibility);
  const v4Assignments = v4.output.plannedTasks.map((item) => ({ taskId: item.taskId, startPlanned: item.startPlanned, endPlanned: item.endPlanned, assignedResources: item.assignedResources }));
  const normalization = activeEquivalentMetricNormalization(officialOrcOutcome);
  const orcBaseMetricSet = orcMetrics(safeInput, seededShadow, officialOrcOutcome, v4MetricSet, v4Assignments, options.orcRuntimeMs ?? 0);
  const orcMetricSet = normalization.applied
    ? orcBaseMetricSet
    : { ...orcBaseMetricSet, ...dependencyChainBenchmarkMetrics(safeInput, seededShadow.operationalValues[0]?.overallScore ?? 0) };
  const absoluteDelta = delta(orcMetricSet, v4MetricSet);
  const baseReport = {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: options.createdAt ?? null,
    scenario: { planId: safeInput.planId, taskCount: safeInput.tasks.length },
    metrics: { orc: orcMetricSet, v4: v4MetricSet },
    rawShadowDiagnostics: rawShadowDiagnostics(rawShadow),
    seededShadowDiagnostics: seededShadowDiagnostics(seededShadow, officialOrcOutcome, baselineSeedHardFeasibility),
    officialOrcOutcome,
    activeEquivalentMetricNormalization: normalization,
    baselineSeedHardFeasibility,
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
      `ORC seeded shadow explores on top of that V4 baseline seed and produced ${seededShadow.candidates.length} candidate(s), ${seededShadow.simulatedStates.length} simulation(s), and ${seededShadow.commitDecisions.length} decision(s).`,
      `Only a COMMIT decision backed by a VALID seeded simulated state can feed official metrics.orc; selected outcome is ${officialOrcOutcome.kind} (${officialOrcOutcome.reason}).`,
      baselineSeedHardFeasibility.hardFeasible === false ? "baseline_seed_hard_infeasible_blocks_candidate_optimization" : `Baseline seed hard-feasibility audit returned ${baselineSeedHardFeasibility.reason}.`,
      normalization.applied ? `The benchmark separates final planning metrics from exploration overhead; because production receives the V4-equivalent plan for ${officialOrcOutcome.kind}, final ORC metrics are normalized to V4 (${normalization.reason}).` : "The selected ORC commit changed the final plan, so final planning metrics are calculated from the validated simulated state using the original benchmark input as measurement context.",
      "ORC exploration overhead remains visible in diagnostics and computational metrics, but it must not create false final-planning deltas when the active-equivalent plan is V4.",
      "Only a real ORC commit with planning changes can produce official final-planning deltas; baseline preservation and fallback keep makespan, permanence, continuity, conflicts, resource utilization, dependency metrics, and OPQ equal to V4.",
      `Raw ORC Shadow diagnostics produced ${rawShadow.summary.invalidCount} invalid simulation(s), and seeded diagnostics produced ${seededShadow.summary.invalidCount} invalid simulation(s); diagnostics are preserved separately and do not substitute the official operational result.`,
      "Delta values are ORC minus V4 using active-equivalent official ORC outcome semantics, and do not modify official planning.",
      "Operational Planning Quality Metrics measure resource/talent idle time, fragmentation, compactness, main-flow continuity details, and critical-resource spread without changing planning behavior.",
    ],
    planningUnchanged: stableStringify(safeInput) === before,
  } satisfies Omit<OperationalDeltaReport, "improvementReport">;
  return { ...baseReport, improvementReport: analyzeImprovementOpportunities(baseReport as unknown as OperationalDeltaReport) };
}
