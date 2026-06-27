import type { AdvisoryDecision } from "../advisory/advisoryDecision";
import type { RecommendationCalibrationReport } from "../advisory/recommendationCalibration";
import type { ORCBenchmarkResult } from "../benchmarks/orcBenchmarkHarness";
import type { ReadinessIndexReport } from "../benchmarks/readinessIndex";
import type { ORCConfiguration } from "../config/orcIntegrationMode";
import { deepFreeze } from "../immutability";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";

export interface ExecutionEvidenceRecord {
  executionId: string;
  generatedAt: string | null;

  configuration: ORCConfiguration;

  summary: ORCShadowModeResult["summary"];

  advisoryDecision: AdvisoryDecision | null;

  benchmark?: ORCBenchmarkResult;

  calibration?: RecommendationCalibrationReport;

  readinessIndex?: ReadinessIndexReport;

  evidenceIds: string[];
}

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildExecutionId = (shadowResult: ORCShadowModeResult): string => {
  const generatedAt = shadowResult.summary.generatedAt ?? "no-timestamp";
  return `orc-execution:${shadowResult.operationalState.id}:${generatedAt}`;
};

export function buildExecutionEvidenceRecord(
  shadowResult: ORCShadowModeResult,
): ExecutionEvidenceRecord {
  return deepFreeze({
    executionId: buildExecutionId(shadowResult),
    generatedAt: shadowResult.summary.generatedAt,
    configuration: cloneSerializable(shadowResult.summary.configuration),
    summary: cloneSerializable(shadowResult.summary),
    advisoryDecision: cloneSerializable(shadowResult.advisoryDecision),
    evidenceIds: shadowResult.evidence.map((evidence) => evidence.id),
  }) as ExecutionEvidenceRecord;
}
