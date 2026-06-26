import type { EngineInput } from "../../types";
import type { ReasoningBudget } from "../cognitive/reasoningBudget";
import { runORCShadowMode } from "../shadow/runORCShadowMode";

export const ORC_BENCHMARK_VERSION = "ORC-BENCHMARK-HARNESS-V1";

export interface ORCBenchmarkOptions {
  createdAt?: string | null;
  executionTimeMs?: number;
}

export interface ORCBenchmarkResult {
  executionTimeMs: number;
  opportunitiesDetected: number;
  diagnosesGenerated: number;
  searchSpacesGenerated: number;
  candidatesGenerated: number;
  candidateStatesGenerated: number;
  simulatedStatesGenerated: number;
  validationResultsGenerated: number;
  operationalValuesGenerated: number;
  commitDecisionsGenerated: number;
  reasoningBudgetConsumed: ReasoningBudget;
  summary: Record<string, unknown>;
}

const roundMetric = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const deterministicExecutionTime = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, roundMetric(value));
};

export function runORCBenchmark(
  input: EngineInput,
  options: ORCBenchmarkOptions = {},
): ORCBenchmarkResult {
  const createdAt = options.createdAt ?? null;
  const shadow = runORCShadowMode(input, { enabled: true, createdAt });

  if (shadow === null) {
    throw new Error("ORC benchmark requires Shadow Mode to be enabled");
  }

  const searchSpacesGenerated = shadow.searchSpaces.length;
  const candidatesGenerated = shadow.candidates.length;
  const searchSpaceTaskCount = shadow.searchSpaces.reduce((sum, searchSpace) => sum + searchSpace.taskIds.length, 0);
  const averageSearchSpaceSize = searchSpacesGenerated === 0 ? 0 : roundMetric(searchSpaceTaskCount / searchSpacesGenerated);
  const candidatesPerSearchSpace = searchSpacesGenerated === 0 ? 0 : roundMetric(candidatesGenerated / searchSpacesGenerated);
  const prunedItems = shadow.summary.pruning.skippedOpportunities + shadow.summary.pruning.skippedSearchSpaces + shadow.summary.pruning.skippedCandidates;
  const exploredItems = shadow.opportunities.length + shadow.searchSpaces.length + shadow.candidates.length;
  const pruningPercentage = prunedItems + exploredItems === 0 ? 0 : roundMetric((prunedItems / (prunedItems + exploredItems)) * 100);
  const executionTimeMs = deterministicExecutionTime(options.executionTimeMs);

  return {
    executionTimeMs,
    opportunitiesDetected: shadow.opportunities.length,
    diagnosesGenerated: shadow.diagnoses.length,
    searchSpacesGenerated,
    candidatesGenerated,
    candidateStatesGenerated: shadow.candidateStates.length,
    simulatedStatesGenerated: shadow.simulatedStates.length,
    validationResultsGenerated: shadow.validationResults.length,
    operationalValuesGenerated: shadow.operationalValues.length,
    commitDecisionsGenerated: shadow.commitDecisions.length,
    reasoningBudgetConsumed: shadow.cognitiveState.reasoningBudget,
    summary: {
      benchmarkVersion: ORC_BENCHMARK_VERSION,
      configuration: {
        shadowMode: true,
        readOnly: true,
        deterministic: true,
        createdAt,
      },
      metrics: {
        executionTimeMs,
        opportunitiesDetected: shadow.opportunities.length,
        diagnosesGenerated: shadow.diagnoses.length,
        searchSpacesGenerated,
        candidatesGenerated,
        candidateStatesGenerated: shadow.candidateStates.length,
        simulatedStatesGenerated: shadow.simulatedStates.length,
        validationResultsGenerated: shadow.validationResults.length,
        operationalValuesGenerated: shadow.operationalValues.length,
        commitDecisionsGenerated: shadow.commitDecisions.length,
        averageSearchSpaceSize,
        candidatesPerSearchSpace,
        pruningPercentage,
        validCount: shadow.summary.validCount,
        invalidCount: shadow.summary.invalidCount,
        averageOverallScore: shadow.summary.evaluation.averageOverallScore,
        bestOverallScore: shadow.summary.evaluation.bestOverallScore,
        worstOverallScore: shadow.summary.evaluation.worstOverallScore,
      },
      reasoningBudget: shadow.summary.reasoningBudget,
      pruning: shadow.summary.pruning,
      evidence: {
        benchmarkVersion: ORC_BENCHMARK_VERSION,
        timestamp: createdAt,
        configuration: {
          inputPlanId: input.planId,
          shadowMode: true,
          planningInfluence: "none",
        },
        metrics: {
          averageSearchSpaceSize,
          candidatesPerSearchSpace,
          pruningPercentage,
        },
      },
      shadowSummary: shadow.summary,
    },
  };
}
