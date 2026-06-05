import type { EngineOutput } from "../../types";
import type { EngineV3Input } from "../types";
import type { EngineBenchmarkMetrics } from "./types";
import { summarizeStructuredBlockers } from "../blockers";
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
  const mainGaps = { count: operationalMetrics.mainStageGapCount, minutes: operationalMetrics.mainStageGapMinutes };
  const selectedCandidateMetrics = output.v3Meta?.selectedCandidateMetrics ?? null;
  const selectedCandidateMetricsConsistent = selectedCandidateMetrics === null ? null : (
    selectedCandidateMetrics.coachSwitchCount === operationalMetrics.coachSwitchCount
    && selectedCandidateMetrics.coachSwitchPenalty === operationalMetrics.coachSwitchPenalty
    && selectedCandidateMetrics.restrictiveTalentAverageStartOffset === operationalMetrics.restrictiveTalentAverageStartOffset
    && selectedCandidateMetrics.mainStageGapMinutes === operationalMetrics.mainStageGapMinutes
    && selectedCandidateMetrics.mainStageGapCount === operationalMetrics.mainStageGapCount
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
    restrictiveTalentAverageStartOffset: operationalMetrics.restrictiveTalentAverageStartOffset,
    restrictiveTalentLatestFinishSlack: calculateRestrictiveTalentLatestFinishSlack(input, output),
    mainStageUtilizationPercent: calculateMainStageUtilizationPercent(input, output),
    tasksPerContestantMinMax: tasksPerContestant ? `${tasksPerContestant.min}-${tasksPerContestant.max}` : null,
    resourceUtilizationSummary: calculateResourceUtilizationSummary(input, output),
    cpSatAttempted: output.v3Meta?.cpSatAttempted ?? null,
    cpSatAccepted: output.v3Meta?.cpSatAccepted ?? null,
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
    neighborhoodCandidateAccepted: output.v3Meta?.neighborhoodCandidateAccepted ?? null,
    neighborhoodAcceptedReason: output.v3Meta?.neighborhoodAcceptedReason ?? null,
    neighborhoodSearchTimeMs: output.v3Meta?.neighborhoodSearchTimeMs ?? null,
    ...blockerSummary,
    solutionSource: output.v3Meta?.solutionSource ?? null,
    warningsCount: output.warnings?.length ?? 0,
    infeasibleReasonCount: output.reasons?.length ?? 0,
  };
};
