import { stableStringify } from "../structuralEquality";
import type { ActiveOptimizationPriority, OptimizationPriorityLevel } from "./evidenceOptimizationCycle";
import type { ImprovementOpportunity, ImprovementOpportunityReport } from "./improvementOpportunityAnalyzer";
import type { OperationalDeltaReport } from "./operationalDeltaBenchmark";

export const EVIDENCE_GATE_VERSION = "ORC-EVIDENCE-GATE-V1";
export const EVIDENCE_GATE_PLANNING_INFLUENCE = "none" as const;
export const EVIDENCE_AUTHORIZATION_CRITERION = "benchmark_improvement_report_metric_reproducible" as const;

export type EvidenceGateStatus = "authorized" | "pending_evidence";

export interface EvidenceGatePriorityInput {
  id: string;
  metric: ImprovementOpportunity["metric"];
  priority: OptimizationPriorityLevel;
  benchmarkEvidence?: ActiveOptimizationPriority["benchmarkEvidence"];
}

export interface EvidenceGateRecord {
  priorityId: string;
  metric: ImprovementOpportunity["metric"];
  requestedPriority: OptimizationPriorityLevel;
  status: EvidenceGateStatus;
  authorizationCriterion: typeof EVIDENCE_AUTHORIZATION_CRITERION;
  benchmarkOrigin: Array<{
    benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
    scenario: OperationalDeltaReport["scenario"];
  }>;
  improvementReportsUsed: Array<{
    analyzerVersion: ImprovementOpportunityReport["analyzerVersion"];
    benchmarkVersion: ImprovementOpportunityReport["benchmarkVersion"];
    scenario: ImprovementOpportunityReport["scenario"];
    metric: ImprovementOpportunity["metric"];
    optimizationPriority: ImprovementOpportunity["optimizationPriority"];
    absoluteDelta: ImprovementOpportunity["absoluteDelta"];
    percentageDelta: ImprovementOpportunity["percentageDelta"];
  }>;
  metricsAssociated: Array<{
    metric: ImprovementOpportunity["metric"];
    absoluteDelta: ImprovementOpportunity["absoluteDelta"];
    percentageDelta: ImprovementOpportunity["percentageDelta"];
    operationalImpact: number;
    frequency: number;
  }>;
  explanation: string;
}

export interface OptimizationAuthorizationReport {
  gateVersion: typeof EVIDENCE_GATE_VERSION;
  generatedAt: string | null;
  authorizationCriterion: typeof EVIDENCE_AUTHORIZATION_CRITERION;
  authorizedPriorities: EvidenceGateRecord[];
  pendingEvidencePriorities: EvidenceGateRecord[];
  benchmarksUsed: Array<{
    benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
    scenario: OperationalDeltaReport["scenario"];
  }>;
  metricsAssociated: EvidenceGateRecord["metricsAssociated"];
  evidence: {
    improvementReportsUsed: number;
    prioritiesReviewed: number;
    pendingEvidenceCount: number;
    planningUnchanged: true;
    explanations: string[];
  };
  planningInfluence: typeof EVIDENCE_GATE_PLANNING_INFLUENCE;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const priorityRank = (priority: OptimizationPriorityLevel): number => priority === "high" ? 3 : priority === "medium" ? 2 : 1;

function reportKey(report: Pick<ImprovementOpportunityReport, "benchmarkVersion" | "scenario">): string {
  return `${report.benchmarkVersion}:${stableStringify(report.scenario)}`;
}

function evidenceKey(evidence: { benchmarkVersion: OperationalDeltaReport["benchmarkVersion"]; scenario: OperationalDeltaReport["scenario"] }): string {
  return `${evidence.benchmarkVersion}:${stableStringify(evidence.scenario)}`;
}

function hasReproducibleMetrics(opportunity: ImprovementOpportunity): boolean {
  return opportunity.absoluteDelta !== undefined && opportunity.percentageDelta !== undefined && Number.isFinite(opportunity.operationalImpact) && opportunity.frequency > 0;
}

function buildRecord(priority: EvidenceGatePriorityInput, reports: ImprovementOpportunityReport[]): EvidenceGateRecord {
  const benchmarkEvidence = priority.benchmarkEvidence ?? [];
  const evidenceKeys = new Set(benchmarkEvidence.map(evidenceKey));
  const matchedOpportunities = reports.flatMap((report) => report.opportunities
    .filter((opportunity) => opportunity.metric === priority.metric)
    .filter((opportunity) => opportunity.optimizationPriority === priority.priority)
    .filter((opportunity) => opportunity.optimizationPriority !== "none")
    .filter(hasReproducibleMetrics)
    .filter(() => benchmarkEvidence.length > 0)
    .filter(() => evidenceKeys.has(reportKey(report)))
    .map((opportunity) => ({ report, opportunity })));

  const authorized = matchedOpportunities.length > 0;
  const improvementReportsUsed = matchedOpportunities.map(({ report, opportunity }) => ({
    analyzerVersion: report.analyzerVersion,
    benchmarkVersion: report.benchmarkVersion,
    scenario: report.scenario,
    metric: opportunity.metric,
    optimizationPriority: opportunity.optimizationPriority,
    absoluteDelta: opportunity.absoluteDelta,
    percentageDelta: opportunity.percentageDelta,
  })).sort((a, b) => a.scenario.planId - b.scenario.planId || a.metric.localeCompare(b.metric));
  const metricsAssociated = matchedOpportunities.map(({ opportunity }) => ({
    metric: opportunity.metric,
    absoluteDelta: opportunity.absoluteDelta,
    percentageDelta: opportunity.percentageDelta,
    operationalImpact: opportunity.operationalImpact,
    frequency: opportunity.frequency,
  })).sort((a, b) => a.metric.localeCompare(b.metric) || stableStringify(a.absoluteDelta).localeCompare(stableStringify(b.absoluteDelta)));
  const benchmarkOrigin = benchmarkEvidence.map((evidence) => ({ benchmarkVersion: evidence.benchmarkVersion, scenario: evidence.scenario }))
    .sort((a, b) => a.scenario.planId - b.scenario.planId || a.scenario.taskCount - b.scenario.taskCount || a.benchmarkVersion.localeCompare(b.benchmarkVersion));

  return {
    priorityId: priority.id,
    metric: priority.metric,
    requestedPriority: priority.priority,
    status: authorized ? "authorized" : "pending_evidence",
    authorizationCriterion: EVIDENCE_AUTHORIZATION_CRITERION,
    benchmarkOrigin: authorized ? benchmarkOrigin : [],
    improvementReportsUsed,
    metricsAssociated,
    explanation: authorized
      ? `${priority.id}: authorized because benchmark evidence matches reproducible ${priority.metric} metrics in an Improvement Report.`
      : `${priority.id}: pending_evidence because benchmark evidence or reproducible Improvement Report metrics are missing.`,
  };
}

export function buildOptimizationAuthorizationReport(params: {
  priorities: EvidenceGatePriorityInput[];
  improvementReports: ImprovementOpportunityReport[];
  generatedAt?: string | null;
}): OptimizationAuthorizationReport {
  const priorities = clone(params.priorities);
  const improvementReports = clone(params.improvementReports);
  const records = priorities
    .map((priority) => buildRecord(priority, improvementReports))
    .sort((a, b) => b.status.localeCompare(a.status) || priorityRank(b.requestedPriority) - priorityRank(a.requestedPriority) || a.metric.localeCompare(b.metric) || a.priorityId.localeCompare(b.priorityId));
  const authorizedPriorities = records.filter((record) => record.status === "authorized");
  const pendingEvidencePriorities = records.filter((record) => record.status === "pending_evidence");
  const benchmarksUsed = authorizedPriorities.flatMap((record) => record.benchmarkOrigin)
    .filter((benchmark, index, all) => all.findIndex((item) => evidenceKey(item) === evidenceKey(benchmark)) === index)
    .sort((a, b) => a.scenario.planId - b.scenario.planId || a.scenario.taskCount - b.scenario.taskCount || a.benchmarkVersion.localeCompare(b.benchmarkVersion));

  return {
    gateVersion: EVIDENCE_GATE_VERSION,
    generatedAt: params.generatedAt ?? null,
    authorizationCriterion: EVIDENCE_AUTHORIZATION_CRITERION,
    authorizedPriorities,
    pendingEvidencePriorities,
    benchmarksUsed,
    metricsAssociated: authorizedPriorities.flatMap((record) => record.metricsAssociated),
    evidence: {
      improvementReportsUsed: improvementReports.length,
      prioritiesReviewed: priorities.length,
      pendingEvidenceCount: pendingEvidencePriorities.length,
      planningUnchanged: true,
      explanations: [
        "Evidence Gate reviews optimization priorities without changing ORC planning behavior.",
        "Only priorities backed by benchmark origin, Improvement Report evidence, and reproducible metrics are authorized.",
        "Priorities without matching benchmark evidence are marked pending_evidence and must not be proposed as future optimizations.",
      ],
    },
    planningInfluence: EVIDENCE_GATE_PLANNING_INFLUENCE,
  };
}
