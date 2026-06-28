import type { OperationalDeltaReport } from "../benchmark/operationalDeltaBenchmark";

export interface OperationalDeltaEvidenceReport {
  benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
  generatedAt: string | null;
  scenario: OperationalDeltaReport["scenario"];
  metrics: OperationalDeltaReport["metrics"];
  absoluteDelta: OperationalDeltaReport["absoluteDelta"];
  percentageDelta: OperationalDeltaReport["percentageDelta"];
  explanation: string[];
  improvementReport: OperationalDeltaReport["improvementReport"];
  improvementEvidence: OperationalDeltaReport["improvementReport"]["evidence"];
  operationalPlanningQuality: OperationalDeltaReport["metrics"]["orc"]["operationalPlanningQuality"];
  operationalPlanningQualityExplanation: string[];
  operationalPlanningQualityWorstCases: OperationalDeltaReport["metrics"]["orc"]["operationalPlanningQuality"]["worstCases"];
  planningInfluence: "none";
}

export function buildOperationalDeltaEvidenceReport(report: OperationalDeltaReport): OperationalDeltaEvidenceReport {
  return {
    benchmarkVersion: report.benchmarkVersion,
    generatedAt: report.generatedAt,
    scenario: report.scenario,
    metrics: report.metrics,
    absoluteDelta: report.absoluteDelta,
    percentageDelta: report.percentageDelta,
    explanation: report.evidenceExplanation,
    improvementReport: report.improvementReport,
    improvementEvidence: report.improvementReport.evidence,
    operationalPlanningQuality: report.metrics.orc.operationalPlanningQuality,
    operationalPlanningQualityExplanation: report.metrics.orc.operationalPlanningQuality.explanations,
    operationalPlanningQualityWorstCases: report.metrics.orc.operationalPlanningQuality.worstCases,
    planningInfluence: "none",
  };
}
