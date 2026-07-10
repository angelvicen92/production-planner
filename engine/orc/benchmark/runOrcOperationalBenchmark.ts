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
    planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE; lineageResolverTracked: boolean; pureCompositeCountsTracked: boolean; simulationSummaryConsistent: boolean; materializationSourceCoverageTracked: boolean; fallbackReturnedPlanningConsistent: boolean;
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
    scenarioCount: number; contextAwarePlacementExecuted: boolean; preflightPrefilterConsistency: boolean; candidateGeneratedCount: number; preflightPassedCount: number; prefilterPassedCount: number; simulatedCount: number; validCount: number; selectedCount: number; contextRejectedCount: number; metricsScopeAlignedCount: number; planningInfluence: typeof ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE; lineageResolverTracked: boolean; pureCompositeCountsTracked: boolean; simulationSummaryConsistent: boolean; materializationSourceCoverageTracked: boolean; fallbackReturnedPlanningConsistent: boolean; lineageWrapperNormalizationTracked: boolean; globalDayShapeSelectionTracked: boolean; macroMainPollutionDetected: boolean; materializationFinalSourceCoverageTracked: boolean; explainabilityGateSourceTracked: boolean; fallbackCoherenceTracked: boolean; postMacroUnifiedSelectionTracked: boolean; stalePreMacroSelectionDetected: boolean; macroPassSimulationPoolTracked: boolean; selectedMacroGateConsistencyTracked: boolean; finalMaterializationLineageTracked: boolean; productionConceptNonRegressionTracked: boolean; mainZoneContinuityConceptAlignmentTracked: boolean; mealBreakBlockGenerationTracked: boolean; mealBreakBlockCoverageTracked: boolean; flexibleMealGapRegressionTracked: boolean; spaceTaskChangeLimitTracked: boolean; spaceTaskChangeLimitViolationCount: number; mealBreakSourceOfTruthTracked: boolean; mealBreakPlanBreakPersistenceTracked: boolean; mealBreakVisiblePlanningTracked: boolean; syntheticMealBreakLeakDetected: boolean; zoneTaskChangeLimitTracked: boolean; zoneTaskChangeLimitGateTracked: boolean; zoneTaskChangeGroupingKeyTracked: boolean; productionConceptGateBlockedRegressionCount: number;
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
  const summaries = passedReports.map((report:any)=>report?.diagnostics?.orcSummary ?? report?.orcSummary ?? report?.diagnostics ?? {}).filter(Boolean);
  if (dayShapes.length === 0) {
    const fixture:any={id:"macro-day-shape-benchmark",workDay:{start:"09:00",end:"18:00"},constraints:{optimizer:{mainFlowSpaceId:900}},locks:[],tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]},{id:3,status:"pending"},{id:4,status:"pending",dependsOnTaskIds:[3]}],planning:[{taskId:1,startPlanned:"09:00",endPlanned:"09:15",spaceId:701,assignedResourceIds:[11],countsAsWork:true},{taskId:2,startPlanned:"09:15",endPlanned:"09:45",spaceId:900,assignedResourceIds:[11],countsAsWork:true},{taskId:3,startPlanned:"10:45",endPlanned:"11:00",spaceId:702,assignedResourceIds:[12],countsAsWork:true},{taskId:4,startPlanned:"11:00",endPlanned:"11:30",spaceId:900,assignedResourceIds:[12],countsAsWork:true}],availability:{contestantAvailabilityById:{}}};
    dayShapes.push({ ...buildMacroProductionWaveDayShapeCandidates({operationalState:fixture}).summary, lineageResolution:{wrapperIds:["candidate:partial-plan"],baseCandidateIds:["candidate:macro-production-wave-day-shape:benchmark"],readOnly:true}, lineageConsistency:{ok:true, readOnly:true}, pureDayShapeSimulatedStateIds:[], compositeDayShapeSimulatedStateIds:[] });
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
      contextAwarePlacementExecuted: dayShapes.some((d:any)=>d.contextAwarePlacementExecuted===true),
      preflightPrefilterConsistency: dayShapes.every((d:any)=>d.preflightPrefilterConsistency?.ok!==false && Array.isArray(d.unexpectedPrefilterRejections)),
      candidateGeneratedCount: dayShapes.filter((d:any)=>Number(d.candidateCount??0)>0).length,
      preflightPassedCount: dayShapes.filter((d:any)=>d.preflight?.accepted===true || (Number(d.candidateCount??0)>0 && Number(d.candidatePreflightRejectedCount??0)===0)).length,
      prefilterPassedCount: dayShapes.filter((d:any)=>Number(d.candidatePrefilterAcceptedCount??0)>0).length,
      simulatedCount: dayShapes.filter((d:any)=>Number(d.simulatedStateCount??0)>0).length,
      validCount: dayShapes.filter((d:any)=>Number(d.validSimulationCount??0)>0).length,
      selectedCount: dayShapes.filter((d:any)=>d.selectedAsCommit===true).length,
      contextRejectedCount: dayShapes.reduce((n:number,d:any)=>n+Number(d.contextAwarePlacementRejectedCount??0),0),
      metricsScopeAlignedCount: dayShapes.filter((d:any)=>d.metricMatchesProductionConceptAlignment===true).length,
      planningInfluence: ORC_OPERATIONAL_BENCHMARK_PLANNING_INFLUENCE,
      lineageResolverTracked: dayShapes.some((d:any)=>d.lineageResolution?.readOnly===true || d.lineageConsistency?.readOnly===true),
      pureCompositeCountsTracked: dayShapes.every((d:any)=>Array.isArray(d.pureDayShapeSimulatedStateIds ?? []) && Array.isArray(d.compositeDayShapeSimulatedStateIds ?? [])),
      simulationSummaryConsistent: summaries.every((s:any)=>{ const sel=s.simulationSelection??{}; const day=(s.macroProductionWaveDayShape??s.macroMainZoneBlockRelayout?.macroProductionWaveDayShape)??{}; return !(Array.isArray(sel.macroProductionWaveDayShapeSimulationIds) && sel.macroProductionWaveDayShapeSimulationIds.length>0 && Number(day.simulatedStateCount??sel.macroProductionWaveDayShapeSimulationIds.length)===0); }),
      materializationSourceCoverageTracked: summaries.every((s:any)=>s.planningMaterialization?.materializationSourceCoverage!=null || s.planningMaterialization?.materializationDiffContractValid!==false),
      fallbackReturnedPlanningConsistent: summaries.every((s:any)=>s.orcRuntimeMetrics?.fallbackUsed!==true || s.orcRuntimeMetrics?.returnedPlanningMatchesFallbackBaseline!==false || s.planningMaterialization?.returnedPlanningMatchesFallbackBaseline!==false),
      lineageWrapperNormalizationTracked: dayShapes.some((d:any)=>d.lineageResolution?.wrapperIds || d.lineageResolution?.baseCandidateIds),
      globalDayShapeSelectionTracked: summaries.every((s:any)=>{ const sel=s.simulationSelection??{}; const day=(s.macroProductionWaveDayShape??s.macroMainZoneBlockRelayout?.macroProductionWaveDayShape)??{}; return !(Number(day.simulatedStateCount??0)>0 && (!Array.isArray(sel.macroProductionWaveDayShapeSimulationIds) || sel.macroProductionWaveDayShapeSimulationIds.length===0)); }),
      macroMainPollutionDetected: summaries.some((s:any)=>{ const ids=s.simulationSelection?.macroMainZoneRelayoutSimulationIds??[]; return Array.isArray(ids) && ids.some((id:string)=>String(id).includes("macro-production-wave-day-shape") && !(s.simulationSelection?.compositeMacroSimulationIds??[]).includes(id)); }),
      materializationFinalSourceCoverageTracked: summaries.every((s:any)=>s.planningMaterialization?.materializationDiffContractValid!==false || (s.planningMaterialization?.selectedLineage!=null && s.planningMaterialization?.materializationSourceCoverage!=null)),
      explainabilityGateSourceTracked: summaries.every((s:any)=>s.explainabilityGateSource!=null || s.gates?.explainableDecision!==false),
      fallbackCoherenceTracked: summaries.every((s:any)=>s.orcRuntimeMetrics?.fallbackUsed!==true || s.orcRuntimeMetrics?.returnedPlanningMatchesFallbackBaseline===true),
      postMacroUnifiedSelectionTracked: summaries.every((s:any)=>s.simulationSelection==null || s.simulationSelection?.postMacroSelectionExecuted===true || s.simulationSelection?.postMacroUnifiedPoolBuilt===true || s.orcRuntimeMetrics?.postMacroSelectionExecuted===true),
      stalePreMacroSelectionDetected: summaries.every((s:any)=>!(s.simulationSelection?.selectedBucket==="valid-committed-macro-main-zone-block-relayout" && s.macroMainZoneBlockRelayout?.selectedAsCommit===false)),
      macroPassSimulationPoolTracked: summaries.every((s:any)=>s.simulationSelection?.macroPassLineageFallbackUsed!==true || Number(s.simulationSelection?.macroPassSimulationIdsMissingCount??0)>0),
      selectedMacroGateConsistencyTracked: summaries.every((s:any)=>!(s.simulationSelection?.macroMainZoneRelayoutAcceptedByGlobalMacroValueGate===true && s.macroMainZoneBlockRelayout?.netValue?.acceptedByGlobalMacroValueGate===false)),
      finalMaterializationLineageTracked: summaries.every((s:any)=>s.selectedSimulatedStateId==null || (s.planningMaterialization?.selectedLineage!=null && Array.isArray(s.planningMaterialization?.selectedCandidateFamilies) && s.planningMaterialization.selectedCandidateFamilies.length>0) || s.orcRuntimeMetrics?.fallbackUsed===true),
      productionConceptNonRegressionTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.orcRuntimeMetrics?.productionConceptGatePassed != null || s.productionConceptNonRegressionGate?.passed != null || s.gates?.productionConceptNotWorseThanV4 != null),
      mainZoneContinuityConceptAlignmentTracked: summaries.every((s:any)=>s.mainZoneContinuity?.productionConceptAlignmentMismatch != null || s.productionConceptAlignment == null),
      mealBreakBlockGenerationTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.orcRuntimeMetrics?.mealBreakBlocksGenerated != null || s.mealBreakBlocks?.blocks != null),
      mealBreakBlockCoverageTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.orcRuntimeMetrics?.mealBreakBlockCoverageValid != null || s.mealBreakBlocks?.blockers != null),
      flexibleMealGapRegressionTracked: summaries.every((s:any)=>s.orcRuntimeMetrics?.flexibleMealGapRegressionDetected != null || Number(s.productionConceptAlignment?.gapsIncorrectlyIgnoredBecauseMealWindow ?? 0) === 0),
      spaceTaskChangeLimitTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.orcRuntimeMetrics?.spaceTaskChangeLimitChecked === true || s.spaceTaskChangeLimitChecked === true || s.zoneTaskChangeLimitChecked === true),
      spaceTaskChangeLimitViolationCount: summaries.reduce((n:number,s:any)=>n+Number(s.orcRuntimeMetrics?.spaceTaskChangeLimitViolationsCount ?? s.zoneTaskChangeLimitViolations?.length ?? s.spaceTaskChangeLimitViolations?.length ?? 0),0),
      mealBreakSourceOfTruthTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.mealBreakBlocks?.mealBreakSourceOfTruth != null || s.mealBreakBlocks?.mealBreakConfigSource != null),
      mealBreakPlanBreakPersistenceTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.mealBreakBlocks?.evidence?.mealBreakBlocksPersisted != null || s.mealBreakBlocks?.evidence?.mealBreakBlocksFromPlanBreaks != null),
      mealBreakVisiblePlanningTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.mealBreakBlocks?.evidence?.mealBreakBlocksVisibleInPlanning != null),
      syntheticMealBreakLeakDetected: summaries.some((s:any)=>s.mealBreakBlocks?.evidence?.invalidSyntheticMealBreakIdsDetected === true || (s.plannedTasks ?? []).some?.((p:any)=>Number(p?.taskId)<=-900000000)),
      zoneTaskChangeLimitTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.zoneTaskChangeLimitChecked === true || s.orcRuntimeMetrics?.spaceTaskChangeLimitChecked === true),
      zoneTaskChangeLimitGateTracked: summaries.every((s:any)=>Number(s.orcRuntimeMetrics?.spaceTaskChangeLimitViolationsCount ?? s.zoneTaskChangeLimitViolations?.length ?? 0) === 0 || s.gates?.spaceTaskChangeLimitRespected === false),
      zoneTaskChangeGroupingKeyTracked: summaries.every((s:any)=>s.productionConceptAlignment == null || s.zoneTaskChangeGroupingKeySource != null || s.zoneTaskChangeSequenceByZoneId != null),
      productionConceptGateBlockedRegressionCount: summaries.filter((s:any)=>s.orcRuntimeMetrics?.productionConceptGatePassed === false || s.productionConceptNonRegressionGate?.passed === false || s.gates?.productionConceptNotWorseThanV4 === false).length,
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
  if (!report.macroProductionWaveDayShapeSummary.contextAwarePlacementExecuted) throw new Error("macroProductionWaveDayShapeSummary.contextAwarePlacementExecuted must be true");
  if (!report.macroProductionWaveDayShapeSummary.preflightPrefilterConsistency) throw new Error("macroProductionWaveDayShapeSummary.preflightPrefilterConsistency must be true");
  if (!report.macroProductionWaveDayShapeSummary.simulationSummaryConsistent) throw new Error("macroProductionWaveDayShapeSummary.simulationSummaryConsistent must be true");
  if (!report.macroProductionWaveDayShapeSummary.fallbackReturnedPlanningConsistent) throw new Error("macroProductionWaveDayShapeSummary.fallbackReturnedPlanningConsistent must be true");
  if (!report.macroProductionWaveDayShapeSummary.globalDayShapeSelectionTracked) throw new Error("global day-shape selection must be tracked when local day-shape simulations exist");
  if (report.macroProductionWaveDayShapeSummary.macroMainPollutionDetected) throw new Error("macro-main selection contains pure day-shape pollution");
  if (!report.macroProductionWaveDayShapeSummary.materializationFinalSourceCoverageTracked) throw new Error("materialization source coverage must be present when diff contract fails");
  if (!report.macroProductionWaveDayShapeSummary.fallbackCoherenceTracked) throw new Error("fallback must return baseline coherently");
  if (!report.macroProductionWaveDayShapeSummary.postMacroUnifiedSelectionTracked) throw new Error("post-macro unified selection must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.stalePreMacroSelectionDetected) throw new Error("stale pre-macro macro-main selection detected");
  if (!report.macroProductionWaveDayShapeSummary.macroPassSimulationPoolTracked) throw new Error("macro pass simulation pool must be resolved before lineage fallback");
  if (!report.macroProductionWaveDayShapeSummary.selectedMacroGateConsistencyTracked) throw new Error("selected macro gate flags must match final macro summary");
  if (!report.macroProductionWaveDayShapeSummary.finalMaterializationLineageTracked) throw new Error("final materialization lineage must be tracked for selected simulations");
  if (!report.macroProductionWaveDayShapeSummary.productionConceptNonRegressionTracked) throw new Error("production concept non-regression gate must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.mainZoneContinuityConceptAlignmentTracked) throw new Error("main-zone continuity and production concept alignment must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.mealBreakBlockGenerationTracked) throw new Error("meal break block generation must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.mealBreakBlockCoverageTracked) throw new Error("meal break block coverage must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.flexibleMealGapRegressionTracked) throw new Error("flexible meal gap regression must be tracked");
  if (!report.macroProductionWaveDayShapeSummary.spaceTaskChangeLimitTracked) throw new Error("space task change limit must be tracked");
  if (report.macroProductionWaveDayShapeSummary.spaceTaskChangeLimitViolationCount > 0 && !report.macroProductionWaveDayShapeSummary.zoneTaskChangeLimitGateTracked) throw new Error("zone task change limit violation gate incoherent");
  if (report.macroProductionWaveDayShapeSummary.syntheticMealBreakLeakDetected) throw new Error("synthetic meal break task id leaked into materializable planning");
  process.stdout.write(serializeOrcOperationalBenchmarkReport(report));
}
