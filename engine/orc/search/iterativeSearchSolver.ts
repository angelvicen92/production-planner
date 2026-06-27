import type { Evidence } from "../contracts";
import type { BacktrackingExecutionResult } from "./backtrackingSearchExecutor";
import { executeIncrementalReplanning, type IncrementalReplanningResult } from "./incrementalReplanningEngine";
import {
  addSolution,
  compareSolutions,
  initializeSolutionPool,
  type SolutionComparison,
  type SolutionPool,
  type SolutionSnapshot,
} from "./solutionPool";

export interface SearchIteration {
  branchId: string;
  explored: boolean;
  score: number | null;
  solutionId: string;
}

export interface IterativeSearchResult {
  exploredBranches: SearchIteration[];
  bestBranchId: string | null;
  completed: boolean;
  evidence: Evidence[];
  solutionPool: SolutionPool;
  incrementalReplanningResults: IncrementalReplanningResult[];
}

const scoreForBranch = (execution: BacktrackingExecutionResult, branchId: string): number | null => {
  const score = execution.branchScores?.[branchId];
  return typeof score === "number" && Number.isFinite(score) ? score : null;
};

const buildSolutionId = (branchId: string, index: number): string => `solution:${index + 1}:${branchId}`;

const buildSolutionSnapshot = (iteration: SearchIteration, index: number): SolutionSnapshot => ({
  solutionId: iteration.solutionId,
  originatingBranchId: iteration.branchId,
  score: iteration.score,
  metadata: {
    explored: iteration.explored,
    solutionOrdinal: index + 1,
    complete: true,
    readOnly: true,
    shadowModeOnly: true,
  },
});

const comparisonReason = (comparison: SolutionComparison): string => {
  if (comparison.winnerSolutionId == null) {
    return "No comparable score exists yet, so no winning solution can be selected.";
  }

  if (comparison.bestChanged) {
    return comparison.previousBestSolutionId == null
      ? "First complete solution becomes the current best solution."
      : "Candidate solution score is greater than the previous best solution score.";
  }

  if (comparison.candidateScore == null) {
    return "Best solution unchanged because the candidate solution has no comparable score.";
  }

  if (comparison.previousBestScore == null) {
    return "Candidate solution becomes best because the previous best solution has no comparable score.";
  }

  return comparison.candidateScore === comparison.previousBestScore
    ? "Best solution unchanged because equal scores keep the earlier deterministic solution."
    : "Best solution unchanged because candidate solution score is lower than the current best solution score.";
};

const buildSolutionStartedEvidence = (iteration: SearchIteration, index: number): Evidence => ({
  id: `evidence:orc-search:solution-started:${index + 1}:${iteration.solutionId}`,
  source: "orc-search",
  kind: "iterative-search-solution-started",
  subjectId: iteration.solutionId,
  data: {
    solutionId: iteration.solutionId,
    branchId: iteration.branchId,
    solutionOrdinal: index + 1,
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildSolutionCompletedEvidence = (solution: SolutionSnapshot, index: number): Evidence => ({
  id: `evidence:orc-search:solution-completed:${index + 1}:${solution.solutionId}`,
  source: "orc-search",
  kind: "iterative-search-solution-completed",
  subjectId: solution.solutionId,
  data: {
    solutionId: solution.solutionId,
    originatingBranchId: solution.originatingBranchId,
    solutionOrdinal: index + 1,
    score: solution.score,
    complete: true,
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildComparisonEvidence = (comparison: SolutionComparison, index: number): Evidence => ({
  id: `evidence:orc-search:solution-comparison:${index + 1}:${comparison.candidateSolutionId}`,
  source: "orc-search",
  kind: "iterative-search-solution-comparison",
  subjectId: comparison.candidateSolutionId,
  data: {
    ...comparison,
    reason: comparisonReason(comparison),
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildBestChangedEvidence = (comparison: SolutionComparison, index: number): Evidence => ({
  id: `evidence:orc-search:best-solution-changed:${index + 1}:${comparison.candidateSolutionId}`,
  source: "orc-search",
  kind: "iterative-search-best-solution-changed",
  subjectId: comparison.winnerSolutionId,
  data: {
    previousBestSolutionId: comparison.previousBestSolutionId,
    bestSolutionId: comparison.winnerSolutionId,
    candidateSolutionId: comparison.candidateSolutionId,
    reason: comparisonReason(comparison),
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildIterationEvidence = (
  iteration: SearchIteration,
  bestBranchId: string | null,
  previousBestBranchId: string | null,
  reason: string,
  index: number,
): Evidence => ({
  id: `evidence:orc-search:iterative-solver:${index + 1}:${iteration.branchId}`,
  source: "orc-search",
  kind: "iterative-search-iteration",
  subjectId: iteration.branchId,
  data: {
    branchId: iteration.branchId,
    solutionId: iteration.solutionId,
    explored: iteration.explored,
    score: iteration.score,
    bestBranchId,
    previousBestBranchId,
    bestChanged: bestBranchId !== previousBestBranchId,
    reason,
    readOnly: true,
    shadowModeOnly: true,
  },
});


const buildIncrementalReplanningEvidence = (
  branchId: string,
  result: IncrementalReplanningResult,
  index: number,
): Evidence => ({
  id: `evidence:orc-search:incremental-replanning:${index + 1}:${branchId}`,
  source: "orc-search",
  kind: "iterative-search-incremental-replanning",
  subjectId: branchId,
  data: {
    discardedBranchId: branchId,
    reusedState: result.reusedState,
    replannedElements: result.replannedElements,
    reason: result.explanation,
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildPreservedState = (
  iteration: SearchIteration,
  bestBranchId: string | null,
  previousBestBranchId: string | null,
): Record<string, unknown> => ({
  branchId: iteration.branchId,
  solutionId: iteration.solutionId,
  explored: iteration.explored,
  score: iteration.score,
  bestBranchId,
  previousBestBranchId,
});

const buildCompletionEvidence = (result: Omit<IterativeSearchResult, "evidence">): Evidence => ({
  id: "evidence:orc-search:iterative-solver:completed",
  source: "orc-search",
  kind: "iterative-search-completed",
  subjectId: result.bestBranchId,
  data: {
    exploredBranchCount: result.exploredBranches.length,
    bestBranchId: result.bestBranchId,
    bestSolutionId: result.solutionPool.bestSolutionId,
    solutionCount: result.solutionPool.solutions.length,
    incrementalReplanningCount: result.incrementalReplanningResults.length,
    completed: result.completed,
    readOnly: true,
    shadowModeOnly: true,
  },
});

export function executeIterativeSearch(
  execution: BacktrackingExecutionResult,
): IterativeSearchResult {
  const iterations: SearchIteration[] = [];
  const evidence: Evidence[] = [];
  let bestBranchId: string | null = null;
  let bestScore: number | null = null;
  let solutionPool = initializeSolutionPool();
  const incrementalReplanningResults: IncrementalReplanningResult[] = [];

  for (const branchId of execution.explorationOrder ?? []) {
    const score = scoreForBranch(execution, branchId);
    const solutionId = buildSolutionId(branchId, iterations.length);
    const iteration: SearchIteration = { branchId, explored: true, score, solutionId };
    const previousBestBranchId = bestBranchId;
    let reason = "Best branch unchanged because the explored branch has no comparable score.";

    evidence.push(buildSolutionStartedEvidence(iteration, iterations.length));

    if (score != null && (bestScore == null || score > bestScore)) {
      bestBranchId = branchId;
      bestScore = score;
      reason = previousBestBranchId == null
        ? "First scored branch becomes the current best solution."
        : "Explored branch score is greater than the previous best score.";
    } else if (score != null && bestScore != null) {
      reason = score === bestScore
        ? "Best branch unchanged because equal scores keep the earlier deterministic branch."
        : "Best branch unchanged because explored branch score is lower than the current best score.";
    }

    const solution = buildSolutionSnapshot(iteration, iterations.length);
    evidence.push(buildSolutionCompletedEvidence(solution, iterations.length));

    const comparison = compareSolutions(solutionPool, solution);
    solutionPool = addSolution(solutionPool, solution);

    iterations.push(iteration);
    evidence.push(buildIterationEvidence(iteration, bestBranchId, previousBestBranchId, reason, iterations.length - 1));
    evidence.push(buildComparisonEvidence(comparison, iterations.length - 1));
    if (comparison.bestChanged) {
      evidence.push(buildBestChangedEvidence(comparison, iterations.length - 1));
    }

    const incrementalReplanning = executeIncrementalReplanning({
      branchId: iteration.branchId,
      preservedState: buildPreservedState(iteration, bestBranchId, previousBestBranchId),
    });
    incrementalReplanningResults.push(incrementalReplanning);
    evidence.push(buildIncrementalReplanningEvidence(iteration.branchId, incrementalReplanning, iterations.length - 1));
  }

  const result = {
    exploredBranches: iterations,
    bestBranchId,
    completed: true,
    solutionPool,
    incrementalReplanningResults,
  };

  return {
    ...result,
    evidence: [...evidence, buildCompletionEvidence(result)],
  };
}
