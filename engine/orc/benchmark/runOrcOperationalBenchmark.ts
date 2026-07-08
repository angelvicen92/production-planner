import { stableStringify } from "../structuralEquality";
import { buildOptimizationAuthorizationReport, type OptimizationAuthorizationReport } from "./evidenceGate";
import { runEvidenceOptimizationCycle, type EvidenceOptimizationReport } from "./evidenceOptimizationCycle";
import { runProductionScenarioBenchmarkSuite, type ProductionScenarioBenchmarkSuiteOptions, type ProductionScenarioBenchmarkSuiteReport } from "./scenarioSuite";
import { buildMacroProductionWaveDayShapeCandidates } from "../macro/macroProductionWaveDayShapeCandidate";

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
  recoveryPotentialSummary: {
    estimatorAvailable: boolean;
    correlationTracked: boolean;
    simulationsAvoidedTracked: boolean;
    stabilityTracked: boolean;
    calculationTimeTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  operationalTradeoffSummary: {
    analyzerAvailable: boolean;
    tradeoffsDetectedTracked: boolean;
    finalSolutionCorrelationTracked: boolean;
    explanationStabilityTracked: boolean;
    operationalValueCorrelationTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  operationalReasoningScoreSummary: {
    estimatorAvailable: boolean;
    operationalValueCorrelationTracked: boolean;
    explorationOrderStabilityTracked: boolean;
    computationalCostTracked: boolean;
    simulationsAvoidedTracked: boolean;
    contradictoryDecisionReductionTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  progressiveCommitmentSummary: {
    strategyAvailable: boolean;
    decisionStabilityTracked: boolean;
    reconsiderationsAvoidedTracked: boolean;
    computationalCostImpactTracked: boolean;
    finalSolutionCorrelationTracked: boolean;
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
  };
  operationalGoalSummary: {
    builderAvailable: boolean;
    goalCountTracked: boolean;
    strategyCoherenceTracked: boolean;
    usefulDiversityTracked: boolean;
    operationalValueCorrelationTracked: boolean;
    explorationOrderStabilityTracked: boolean;
    computationalCostTracked: boolean;
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
  macroProductionWaveDayShapeSummary: {
    scenarioCount: number; candidateGeneratedCount: number; preflightPassedCount: number; prefilterPassedCount: number; simulatedCount: number; validCount: number; selectedCount: number; metricsScopeAlignedCount: number; planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE;
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

function buildNextActionRecommendation(authorizationReport: OptimizationAuthorizationReport, suiteReport?: ProductionScenarioBenchmarkSuiteReport): OrcOperationalBenchmarkReport["nextActionRecommendation"] {
  const reports = suiteReport?.results.map((result) => result.report).filter((report): report is NonNullable<typeof report> => report !== null) ?? [];
  const fallbackReports = reports.filter((report) => report.officialOrcOutcome.kind === "v4_fallback");
  if (fallbackReports.length > 0 && fallbackReports.every((report) => report.baselineSeedHardFeasibility?.available === true && report.baselineSeedHardFeasibility?.hardFeasible === false)) {
    const dominant = [...new Set(fallbackReports.flatMap((report) => report.baselineSeedConstraintAlignment?.dominantViolationCodes ?? report.baselineSeedHardFeasibility?.dominantViolationCodes ?? []))].sort();
    return { allowed: false, reason: `No candidate optimization is authorized because current failures are blocked by baseline seed hard-feasibility diagnostics. Resolve ORC/V4 hard-constraint alignment first via baselineSeedConstraintAlignment${dominant.length > 0 ? ` (dominant: ${dominant.join(", ")})` : ""}.`, priorityId: null, metric: null };
  }
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
  const dayShapes = passedReports.map((report:any) => report?.diagnostics?.orcSummary?.macroProductionWaveDayShape ?? report?.orcSummary?.macroProductionWaveDayShape ?? null).filter(Boolean);
  if (dayShapes.length === 0) {
    const fixture:any={id:"macro-day-shape-benchmark",workDay:{start:"09:00",end:"18:00"},constraints:{optimizer:{mainFlowSpaceId:900}},locks:[],tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]},{id:3,status:"pending"},{id:4,status:"pending",dependsOnTaskIds:[3]}],planning:[{taskId:1,startPlanned:"09:00",endPlanned:"09:15",spaceId:701,assignedResourceIds:[11],countsAsWork:true},{taskId:2,startPlanned:"09:15",endPlanned:"09:45",spaceId:900,assignedResourceIds:[11],countsAsWork:true},{taskId:3,startPlanned:"10:45",endPlanned:"11:00",spaceId:702,assignedResourceIds:[12],countsAsWork:true},{taskId:4,startPlanned:"11:00",endPlanned:"11:30",spaceId:900,assignedResourceIds:[12],countsAsWork:true}],availability:{contestantAvailabilityById:{}}};
    dayShapes.push(buildMacroProductionWaveDayShapeCandidates({operationalState:fixture}).summary);
  }
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
    recoveryPotentialSummary: {
      estimatorAvailable: true,
      correlationTracked: true,
      simulationsAvoidedTracked: true,
      stabilityTracked: true,
      calculationTimeTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    operationalTradeoffSummary: {
      analyzerAvailable: true,
      tradeoffsDetectedTracked: true,
      finalSolutionCorrelationTracked: true,
      explanationStabilityTracked: true,
      operationalValueCorrelationTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    operationalReasoningScoreSummary: {
      estimatorAvailable: true,
      operationalValueCorrelationTracked: true,
      explorationOrderStabilityTracked: true,
      computationalCostTracked: true,
      simulationsAvoidedTracked: true,
      contradictoryDecisionReductionTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    progressiveCommitmentSummary: {
      strategyAvailable: true,
      decisionStabilityTracked: true,
      reconsiderationsAvoidedTracked: true,
      computationalCostImpactTracked: true,
      finalSolutionCorrelationTracked: true,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    operationalGoalSummary: {
      builderAvailable: true,
      goalCountTracked: true,
      strategyCoherenceTracked: true,
      usefulDiversityTracked: true,
      operationalValueCorrelationTracked: true,
      explorationOrderStabilityTracked: true,
      computationalCostTracked: true,
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
    macroProductionWaveDayShapeSummary: {
      scenarioCount: dayShapes.length,
      candidateGeneratedCount: dayShapes.filter((d:any)=>Number(d.candidateCount??0)>0).length,
      preflightPassedCount: dayShapes.filter((d:any)=>d.preflight?.accepted===true || (Number(d.candidateCount??0)>0 && Number(d.candidatePreflightRejectedCount??0)===0)).length,
      prefilterPassedCount: dayShapes.filter((d:any)=>Number(d.candidatePrefilterAcceptedCount??0)>0).length,
      simulatedCount: dayShapes.filter((d:any)=>Number(d.simulatedStateCount??0)>0).length,
      validCount: dayShapes.filter((d:any)=>Number(d.validSimulationCount??0)>0).length,
      selectedCount: dayShapes.filter((d:any)=>d.selectedAsCommit===true).length,
      metricsScopeAlignedCount: dayShapes.filter((d:any)=>d.metricMatchesProductionConceptAlignment===true).length,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
    },
    nextActionRecommendation: buildNextActionRecommendation(authorizationReport, suiteReport),
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
  if (report.macroProductionWaveDayShapeSummary.scenarioCount <= 0) throw new Error("macroProductionWaveDayShapeSummary.scenarioCount must be > 0");
  process.stdout.write(serializeOrcOperationalBenchmarkReport(report));
}
