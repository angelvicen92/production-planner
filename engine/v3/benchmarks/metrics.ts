import type { EngineOutput } from "../../types";
import type { EngineV3Input } from "../types";
import type { EngineBenchmarkMetrics } from "./types";
import { summarizeStructuredBlockers } from "../blockers";
import { calculateEngineOperationalCompactionMetrics } from "../operationalQuality";
import { calculateDeclaredBundleMetrics, diagnoseCompositeResources } from "../resourceDiagnostics";
export {
  calculateCoachSwitchCount,
  calculateOperationalMetrics,
  calculateMainStageGaps,
  calculateMainStageUtilizationPercent,
  calculateMakespan,
  calculateResourceUtilizationSummary,
  calculateRestrictiveTalentAverageStartOffset,
  calculateRestrictiveTalentLatestFinishSlack,
  calculateTasksPerContestantMinMax,
  countContestantOverlaps,
  countContestantWindowViolations,
  countDependencyViolations,
  countExecutedTaskMoved,
  countExclusiveResourceOverlaps,
  countHardConstraintViolations,
  countLockedTaskMoved,
  countMealCrossings,
  countSpaceOverlaps,
  getPlannedViews,
  toMinutes,
};

import {
  calculateCoachSwitchCount,
  calculateOperationalMetrics,
  calculateMainStageGaps,
  calculateMainStageUtilizationPercent,
  calculateMakespan,
  calculateResourceUtilizationSummary,
  calculateRestrictiveTalentAverageStartOffset,
  calculateRestrictiveTalentLatestFinishSlack,
  calculateTasksPerContestantMinMax,
  countContestantOverlaps,
  countContestantWindowViolations,
  countDependencyViolations,
  countExecutedTaskMoved,
  countExclusiveResourceOverlaps,
  countHardConstraintViolations,
  countLockedTaskMoved,
  countMealCrossings,
  countSpaceOverlaps,
  getPlannedViews,
  toMinutes,
} from "../metrics";

export const calculateMetrics = (input: EngineV3Input, output: EngineOutput, runtimeMs: number): EngineBenchmarkMetrics => {
  const operationalMetrics = calculateOperationalMetrics(input, output);
  const compactionMetrics = calculateEngineOperationalCompactionMetrics(input, output);
  const resourceDiagnostics = diagnoseCompositeResources(input, output);
  const declaredBundleMetrics = calculateDeclaredBundleMetrics(input, output);
  const mainGaps = { count: operationalMetrics.mainStageGapCount, minutes: operationalMetrics.mainStageGapMinutes };
  const selectedCandidateMetrics = output.v3Meta?.selectedCandidateMetrics ?? null;
  const selectedCandidateMetricsConsistent = selectedCandidateMetrics === null ? null : (
    selectedCandidateMetrics.coachSwitchCount === operationalMetrics.coachSwitchCount
    && selectedCandidateMetrics.coachSwitchPenalty === operationalMetrics.coachSwitchPenalty
    && selectedCandidateMetrics.bundleCoherencePenalty === declaredBundleMetrics.bundleCoherencePenalty
    && selectedCandidateMetrics.bundleSwitchPenalty === resourceDiagnostics.bundleSwitchPenalty
    && selectedCandidateMetrics.partialBundleUsageWarnings === resourceDiagnostics.partialBundleUsageWarnings
    && selectedCandidateMetrics.bundleSpaceAffinityMatches === resourceDiagnostics.bundleSpaceAffinityMatches
    && selectedCandidateMetrics.bundleSpaceAffinityMismatches === resourceDiagnostics.bundleSpaceAffinityMismatches
    && selectedCandidateMetrics.restrictiveTalentAverageStartOffset === operationalMetrics.restrictiveTalentAverageStartOffset
    && selectedCandidateMetrics.mainStageGapMinutes === (operationalMetrics.mainStageGapMinutes ?? 0)
    && selectedCandidateMetrics.mainStageGapCount === (operationalMetrics.mainStageGapCount ?? 0)
    && selectedCandidateMetrics.makespan === operationalMetrics.makespan
    && selectedCandidateMetrics.hardConstraintViolations === operationalMetrics.hardConstraintViolations
  );
  const tasksPerContestant = calculateTasksPerContestantMinMax(input);
  const blockerSummary = summarizeStructuredBlockers(output);
  return {
    totalTasks: input.tasks.length,
    plannedTasks: output.plannedTasks?.length ?? 0,
    unplannedTasks: output.unplanned?.length ?? Math.max(0, input.tasks.length - (output.plannedTasks?.length ?? 0)),
    makespan: operationalMetrics.makespan,
    runtimeMs,
    mainStageGapMinutes: mainGaps.minutes,
    mainStageGapCount: mainGaps.count,
    contestantWindowViolations: countContestantWindowViolations(input, output),
    hardConstraintViolations: operationalMetrics.hardConstraintViolations,
    lockedTaskMovedCount: countLockedTaskMoved(input, output),
    executedTaskMovedCount: countExecutedTaskMoved(input, output),
    coachSwitchCount: operationalMetrics.coachSwitchCount,
    coachSwitchPenalty: operationalMetrics.coachSwitchPenalty,
    coachIdlePenalty: compactionMetrics.coachIdlePenalty,
    coachSpanPenalty: compactionMetrics.coachSpanPenalty,
    coachSplitDayPenalty: compactionMetrics.coachSplitDayPenalty,
    maxCoachGapMinutes: compactionMetrics.maxCoachGapMinutes,
    restrictiveTalentAverageStartOffset: operationalMetrics.restrictiveTalentAverageStartOffset,
    restrictiveTalentLatestFinishSlack: calculateRestrictiveTalentLatestFinishSlack(input, output),
    mainStageUtilizationPercent: calculateMainStageUtilizationPercent(input, output),
    tasksPerContestantMinMax: tasksPerContestant ? `${tasksPerContestant.min}-${tasksPerContestant.max}` : null,
    resourceUtilizationSummary: calculateResourceUtilizationSummary(input, output),
    resourcePoolPressureSummary: resourceDiagnostics.resourcePoolPressureSummary,
    maxAnyOfPoolConcurrency: resourceDiagnostics.maxAnyOfPoolConcurrency,
    resourceSwitchCount: resourceDiagnostics.resourceSwitchCount,
    compositeResourceCandidateCount: resourceDiagnostics.resourceSwitchCount === null && resourceDiagnostics.resourcePoolPressureSummary === null
      ? null
      : resourceDiagnostics.compositeResourceCandidateCount,
    declaredResourceBundleCount: resourceDiagnostics.declaredResourceBundleCount,
    usableResourceBundleCount: resourceDiagnostics.usableResourceBundleCount,
    invalidResourceBundleCount: resourceDiagnostics.invalidResourceBundleCount,
    partiallyUsableResourceBundleCount: resourceDiagnostics.partiallyUsableResourceBundleCount,
    resourceBundleValidationWarnings: resourceDiagnostics.resourceBundleValidationWarnings,
    bundleComponentUsageCount: resourceDiagnostics.bundleComponentUsageCount,
    partialBundleUsageWarnings: resourceDiagnostics.partialBundleUsageWarnings,
    bundleSpaceAffinityMatches: resourceDiagnostics.bundleSpaceAffinityMatches,
    bundleSpaceAffinityMismatches: resourceDiagnostics.bundleSpaceAffinityMismatches,
    bundleSwitchPenalty: resourceDiagnostics.bundleSwitchPenalty,
    declaredBundleCandidateMatches: resourceDiagnostics.declaredBundleCandidateMatches,
    resourceDiagnosticWarnings: resourceDiagnostics.resourceSwitchCount === null
      && resourceDiagnostics.resourcePoolPressureSummary === null
      && resourceDiagnostics.resourceDiagnosticWarnings.length === 0
      ? null
      : resourceDiagnostics.resourceDiagnosticWarnings.map((warning) => `${warning.code}: ${warning.message}`),
    cpSatAttempted: output.v3Meta?.cpSatAttempted ?? null,
    cpSatAccepted: output.v3Meta?.cpSatAccepted ?? null,
    cpSatPilotAttempted: output.v3Meta?.cpSatPilotAttempted ?? null,
    cpSatPilotAccepted: output.v3Meta?.cpSatPilotAccepted ?? null,
    cpSatPilotTaskCount: output.v3Meta?.cpSatPilotTaskCount ?? null,
    cpSatPilotRuntimeMs: output.v3Meta?.cpSatPilotRuntimeMs ?? null,
    cpSatPilotReason: output.v3Meta?.cpSatPilotReason ?? null,
    cpSatPilotImprovementSummary: output.v3Meta?.cpSatPilotImprovementSummary ?? null,
    cpSatSegmentsAttempted: output.v3Meta?.cpSatSegmentsAttempted ?? null,
    cpSatSegmentsAccepted: output.v3Meta?.cpSatSegmentsAccepted ?? null,
    cpSatSegmentReasons: output.v3Meta?.cpSatSegmentReasons ?? null,
    cpSatSegmentTaskCounts: output.v3Meta?.cpSatSegmentTaskCounts ?? null,
    cpSatBestSegmentKind: output.v3Meta?.cpSatBestSegmentKind ?? null,
    cpSatSegmentImprovementSummary: output.v3Meta?.cpSatSegmentImprovementSummary ?? null,
    phaseAUsed: output.v3Meta?.phaseAUsed ?? null,
    backtrackingAttempted: output.v3Meta?.backtrackingAttempted ?? null,
    backtrackingAccepted: output.v3Meta?.backtrackingAccepted ?? null,
    backtrackingAttempts: output.v3Meta?.backtrackingAttempts ?? null,
    backtrackingBranchesExplored: output.v3Meta?.backtrackingBranchesExplored ?? null,
    candidateSolutionsEvaluated: output.v3Meta?.candidateSolutionsEvaluated ?? null,
    bestCandidateSource: output.v3Meta?.bestCandidateSource ?? null,
    candidateSelectionReason: output.v3Meta?.candidateSelectionReason ?? null,
    bestCandidateScore: output.v3Meta?.bestCandidateScore ?? null,
    selectedCandidateMetrics,
    selectedCandidateMetricsConsistent,
    neighborhoodSearchAttempted: output.v3Meta?.neighborhoodSearchAttempted ?? null,
    neighborhoodCandidatesGenerated: output.v3Meta?.neighborhoodCandidatesGenerated ?? null,
    neighborhoodSearchDepth: output.v3Meta?.neighborhoodSearchDepth ?? null,
    neighborhoodDepth1Candidates: output.v3Meta?.neighborhoodDepth1Candidates ?? null,
    neighborhoodDepth2Candidates: output.v3Meta?.neighborhoodDepth2Candidates ?? null,
    neighborhoodChainsEvaluated: output.v3Meta?.neighborhoodChainsEvaluated ?? null,
    neighborhoodAcceptedChain: output.v3Meta?.neighborhoodAcceptedChain ?? null,
    neighborhoodCandidateAccepted: output.v3Meta?.neighborhoodCandidateAccepted ?? null,
    neighborhoodAcceptedReason: output.v3Meta?.neighborhoodAcceptedReason ?? null,
    neighborhoodSearchTimeMs: output.v3Meta?.neighborhoodSearchTimeMs ?? null,
    neighborhoodTypesAttempted: output.v3Meta?.neighborhoodTypesAttempted ?? null,
    neighborhoodTypesGenerated: output.v3Meta?.neighborhoodTypesGenerated ?? null,
    neighborhoodRejectedReasons: output.v3Meta?.neighborhoodRejectedReasons ?? null,
    ...blockerSummary,
    solutionSource: output.v3Meta?.solutionSource ?? null,
    warningsCount: output.warnings?.length ?? 0,
    infeasibleReasonCount: output.reasons?.length ?? 0,
  };
};
