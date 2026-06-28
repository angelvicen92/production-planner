import { stableStringify } from "../structuralEquality";
import { buildOptimizationAuthorizationReport, type OptimizationAuthorizationReport } from "./evidenceGate";
import { runEvidenceOptimizationCycle, type EvidenceOptimizationReport } from "./evidenceOptimizationCycle";
import { runProductionScenarioBenchmarkSuite, type ProductionScenarioBenchmarkSuiteOptions, type ProductionScenarioBenchmarkSuiteReport } from "./scenarioSuite";

export const ORC_OPERATIONAL_BENCHMARK_VERSION = "ORC-OPERATIONAL-BENCHMARK-CLI-V1";
export const ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE = "none" as const;

export interface OrcOperationalBenchmarkReport {
  benchmarkVersion: typeof ORC_OPERATIONAL_BENCHMARK_VERSION;
  generatedAt: string | null;
  scenarioSummary: {
    scenarioCount: number;
    passedCount: number;
    failedCount: number;
  };
  operationalDeltaSummary: {
    orcBetterOpportunityCount: number;
    orcWorseOpportunityCount: number;
    equalOpportunityCount: number;
  };
  optimizationSummary: {
    priorityCount: number;
    authorizedPriorityCount: number;
    pendingEvidencePriorityCount: number;
    topAuthorizedPriorities: string[];
  };
  planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  dependencyChainFlowSummary: {
    optimizerAvailable: boolean;
    chainsProtected: number;
    blockagesAvoided: number;
    averageSlackRecovered: number;
    operationalValueCorrelationTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  opportunityCostSummary: {
    estimatorAvailable: boolean;
    correlationTracked: boolean;
    simulationsAvoidedTracked: boolean;
    correctlyDiscardedCandidatesTracked: boolean;
    calculationTimeTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  nextActionRecommendation: {
    allowed: boolean;
    reason: string;
    priorityId: string | null;
    metric: string | null;
  };
}

export interface OrcOperationalBenchmarkArtifacts {
  suiteReport: ProductionScenarioBenchmarkSuiteReport;
  optimizationReport: EvidenceOptimizationReport;
  authorizationReport: OptimizationAuthorizationReport;
  report: OrcOperationalBenchmarkReport;
}

export interface OrcOperationalBenchmarkOptions extends ProductionScenarioBenchmarkSuiteOptions {
  suiteReport?: ProductionScenarioBenchmarkSuiteReport;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function buildNextActionRecommendation(authorizationReport: OptimizationAuthorizationReport): OrcOperationalBenchmarkReport["nextActionRecommendation"] {
  const [top] = authorizationReport.authorizedPriorities;
  if (!top) {
    return {
      allowed: false,
      reason: "No next ORC improvement is recommended because the Evidence Gate found no priority with sufficient benchmark evidence and reproducible Improvement Report metrics.",
      priorityId: null,
      metric: null,
    };
  }
  return {
    allowed: true,
    reason: `${top.priorityId} is the next authorized ORC improvement candidate because it passed the Evidence Gate with reproducible ${top.metric} benchmark evidence.`,
    priorityId: top.priorityId,
    metric: top.metric,
  };
}

export function buildOrcOperationalBenchmarkReport(params: {
  suiteReport: ProductionScenarioBenchmarkSuiteReport;
  optimizationReport: EvidenceOptimizationReport;
  authorizationReport: OptimizationAuthorizationReport;
}): OrcOperationalBenchmarkReport {
  const suiteReport = clone(params.suiteReport);
  const optimizationReport = clone(params.optimizationReport);
  const authorizationReport = clone(params.authorizationReport);
  const passedReports = suiteReport.results.map((result) => result.report).filter((report): report is NonNullable<typeof report> => report !== null);
  return {
    benchmarkVersion: ORC_OPERATIONAL_BENCHMARK_VERSION,
    generatedAt: suiteReport.generatedAt,
    scenarioSummary: {
      scenarioCount: suiteReport.scenarioCount,
      passedCount: suiteReport.passedCount,
      failedCount: suiteReport.failedCount,
    },
    operationalDeltaSummary: {
      orcBetterOpportunityCount: suiteReport.globalSummary.orcBetterOpportunityCount,
      orcWorseOpportunityCount: suiteReport.globalSummary.orcWorseOpportunityCount,
      equalOpportunityCount: suiteReport.globalSummary.equalOpportunityCount,
    },
    optimizationSummary: {
      priorityCount: optimizationReport.optimizationPriorities.length,
      authorizedPriorityCount: authorizationReport.authorizedPriorities.length,
      pendingEvidencePriorityCount: authorizationReport.pendingEvidencePriorities.length,
      topAuthorizedPriorities: authorizationReport.authorizedPriorities.map((priority) => priority.priorityId),
    },
    planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    dependencyChainFlowSummary: {
      optimizerAvailable: true,
      chainsProtected: passedReports.reduce((sum, report) => sum + report.metrics.orc.dependencyChainsProtected, 0),
      blockagesAvoided: passedReports.reduce((sum, report) => sum + report.metrics.orc.dependencyBlockagesAvoided, 0),
      averageSlackRecovered: passedReports.length === 0 ? 0 : Number((passedReports.reduce((sum, report) => sum + report.metrics.orc.dependencyAverageSlackRecovered, 0) / passedReports.length).toFixed(6)),
      operationalValueCorrelationTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    opportunityCostSummary: {
      estimatorAvailable: true,
      correlationTracked: true,
      simulationsAvoidedTracked: true,
      correctlyDiscardedCandidatesTracked: true,
      calculationTimeTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    nextActionRecommendation: buildNextActionRecommendation(authorizationReport),
  };
}

export function runOrcOperationalBenchmark(options: OrcOperationalBenchmarkOptions = {}): OrcOperationalBenchmarkArtifacts {
  const suiteReport = options.suiteReport ?? runProductionScenarioBenchmarkSuite(options);
  const optimizationReport = runEvidenceOptimizationCycle({ ...options, suiteReport });
  const authorizationReport = buildOptimizationAuthorizationReport({
    priorities: optimizationReport.optimizationPriorities,
    improvementReports: optimizationReport.improvementReports,
    generatedAt: suiteReport.generatedAt,
  });
  const report = buildOrcOperationalBenchmarkReport({ suiteReport, optimizationReport, authorizationReport });
  return { suiteReport, optimizationReport, authorizationReport, report };
}

export function serializeOrcOperationalBenchmarkReport(report: OrcOperationalBenchmarkReport): string {
  return `${stableStringify(report)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { report } = runOrcOperationalBenchmark();
  process.stdout.write(serializeOrcOperationalBenchmarkReport(report));
}
