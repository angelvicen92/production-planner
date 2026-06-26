import type { EngineOutput as EngineResult } from "../../types";
import { roundBenchmarkMetric, type ORCBenchmarkResult } from "../benchmarks/orcBenchmarkHarness";
import type { CalibrationReport } from "../benchmarks/calibrationFramework";
import type { AdvisoryDecision } from "../advisory/advisoryDecision";

export const REAL_SCENARIO_VALIDATION_VERSION = "ORC-REAL-SCENARIO-VALIDATION-V1";

export interface RealScenarioValidationReport {
  scenarioId: string;

  comparedAt: string | null;

  metrics: {
    detectedOpportunities: number;
    evaluatedCandidates: number;
    topRankAgreement: number;
    reasoningCoverage: number;
    planningDifferences: number;
  };

  differences: {
    onlyORC: string[];
    onlyV4: string[];
    common: string[];
  };

  advisoryDecision: AdvisoryDecision | null;

  summary: string;
}

type Evidence = {
  scenarioId: string;
  benchmarkVersion: string;
  baselineVersion: string;
  benchmarkCreatedAt: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const finiteNumber = (value: unknown): number => (
  typeof value === "number" && Number.isFinite(value) ? value : 0
);

const stringValue = (value: unknown): string | null => (
  typeof value === "string" && value.length > 0 ? value : null
);

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const difference = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
};

const intersection = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
};

const extractEvidence = (benchmark: ORCBenchmarkResult, calibration: CalibrationReport): Evidence => {
  const summary = asRecord(benchmark.summary);
  const evidence = asRecord(summary.evidence);
  const configuration = asRecord(evidence.configuration);

  return {
    scenarioId: stringValue(configuration.inputPlanId) ?? String(finiteNumber(configuration.inputPlanId)),
    benchmarkVersion: stringValue(evidence.benchmarkVersion) ?? stringValue(summary.benchmarkVersion) ?? "unknown-benchmark",
    baselineVersion: calibration.benchmarkVersion,
    benchmarkCreatedAt: stringValue(evidence.timestamp),
  };
};

const buildORCEvidence = (benchmark: ORCBenchmarkResult, calibration: CalibrationReport, evidence: Evidence): string[] => uniqueSorted([
  `scenario:${evidence.scenarioId}`,
  `benchmark:${evidence.benchmarkVersion}`,
  `baseline:${evidence.baselineVersion}`,
  `opportunities:${benchmark.opportunitiesDetected}`,
  `candidates:${benchmark.candidatesGenerated}`,
  `search-spaces:${benchmark.searchSpacesGenerated}`,
  `validations:${benchmark.validationResultsGenerated}`,
  `commit-decisions:${benchmark.commitDecisionsGenerated}`,
  `reasoning-efficiency:${calibration.quality.reasoningBudgetEfficiency}`,
]);

const extractAdvisoryDecision = (benchmark: ORCBenchmarkResult): AdvisoryDecision | null => {
  const candidate = asRecord(benchmark.summary).advisoryDecision;
  if (candidate === null) return null;
  const record = asRecord(candidate);
  if (typeof record.decisionId !== "string") return null;
  return record as unknown as AdvisoryDecision;
};

const buildV4Evidence = (planningResult: EngineResult, evidence: Evidence): string[] => {
  const plannedTaskIds = (planningResult.plannedTasks ?? []).map((task) => `planned-task:${task.taskId}`);
  const unplannedTaskIds = (planningResult.unplanned ?? []).map((task) => `unplanned-task:${task.taskId}`);
  const warningCodes = (planningResult.warnings ?? []).map((warning) => `warning:${warning.code}`);
  const insightCodes = (planningResult.insights ?? []).map((insight) => `insight:${insight.code}`);

  return uniqueSorted([
    `scenario:${evidence.scenarioId}`,
    `v4-complete:${planningResult.complete}`,
    `v4-hard-feasible:${planningResult.hardFeasible}`,
    `v4-feasible:${planningResult.feasible}`,
    `planned-count:${planningResult.plannedTasks?.length ?? 0}`,
    `unplanned-count:${planningResult.unplanned?.length ?? 0}`,
    ...plannedTaskIds,
    ...unplannedTaskIds,
    ...warningCodes,
    ...insightCodes,
  ]);
};

const computeTopRankAgreement = (benchmark: ORCBenchmarkResult, planningResult: EngineResult): number => {
  const orcHasTopDecision = benchmark.commitDecisionsGenerated > 0 || benchmark.operationalValuesGenerated > 0;
  const v4HasPlanDecision = (planningResult.plannedTasks?.length ?? 0) > 0;

  if (orcHasTopDecision === v4HasPlanDecision) return 1;
  return 0;
};

export function validateRealScenario(
  benchmark: ORCBenchmarkResult,
  calibration: CalibrationReport,
  planningResult: EngineResult,
): RealScenarioValidationReport {
  const evidence = extractEvidence(benchmark, calibration);
  const onlyComparableORC = buildORCEvidence(benchmark, calibration, evidence);
  const onlyComparableV4 = buildV4Evidence(planningResult, evidence);
  const common = intersection(onlyComparableORC, onlyComparableV4);
  const onlyORC = difference(onlyComparableORC, onlyComparableV4);
  const onlyV4 = difference(onlyComparableV4, onlyComparableORC);
  const planningDifferences = onlyORC.length + onlyV4.length;
  const advisoryDecision = extractAdvisoryDecision(benchmark);

  return {
    scenarioId: evidence.scenarioId,
    comparedAt: evidence.benchmarkCreatedAt,
    metrics: {
      detectedOpportunities: benchmark.opportunitiesDetected,
      evaluatedCandidates: benchmark.candidatesGenerated,
      topRankAgreement: computeTopRankAgreement(benchmark, planningResult),
      reasoningCoverage: roundBenchmarkMetric(calibration.quality.reasoningBudgetEfficiency),
      planningDifferences,
    },
    differences: {
      onlyORC,
      onlyV4,
      common,
    },
    advisoryDecision,
    summary: `${REAL_SCENARIO_VALIDATION_VERSION}: scenario ${evidence.scenarioId} compared ORC benchmark ${evidence.benchmarkVersion} against V4 output using baseline ${evidence.baselineVersion}; structural differences=${planningDifferences}.`,
  };
}
