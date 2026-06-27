import type { Evidence } from "../contracts";
import type { BacktrackingExecutionResult } from "./backtrackingSearchExecutor";
import { addSolution, initializeSolutionPool, type SolutionPool, type SolutionSnapshot } from "./solutionPool";

export interface SearchIteration {
  branchId: string;
  explored: boolean;
  score: number | null;
}

export interface IterativeSearchResult {
  exploredBranches: SearchIteration[];
  bestBranchId: string | null;
  completed: boolean;
  evidence: Evidence[];
  solutionPool: SolutionPool;
}

const scoreForBranch = (execution: BacktrackingExecutionResult, branchId: string): number | null => {
  const score = execution.branchScores?.[branchId];
  return typeof score === "number" && Number.isFinite(score) ? score : null;
};

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
    explored: iteration.explored,
    score: iteration.score,
    bestBranchId,
    previousBestBranchId,
    bestChanged: bestBranchId !== previousBestBranchId,
    reason,
    readOnly: true,
  },
});

const buildSolutionId = (branchId: string, index: number): string => `solution:${index + 1}:${branchId}`;

const buildSolutionSnapshot = (iteration: SearchIteration, index: number): SolutionSnapshot => ({
  solutionId: buildSolutionId(iteration.branchId, index),
  originatingBranchId: iteration.branchId,
  score: iteration.score,
  metadata: {
    explored: iteration.explored,
    readOnly: true,
  },
});

const buildSolutionPoolEvidence = (
  solution: SolutionSnapshot,
  bestSolutionId: string | null,
  previousBestSolutionId: string | null,
  index: number,
): Evidence => ({
  id: `evidence:orc-search:solution-pool:${index + 1}:${solution.solutionId}`,
  source: "orc-search",
  kind: "solution-pool-solution-added",
  subjectId: solution.solutionId,
  data: {
    solutionId: solution.solutionId,
    originatingBranchId: solution.originatingBranchId,
    score: solution.score,
    bestSolutionId,
    previousBestSolutionId,
    bestChanged: bestSolutionId !== previousBestSolutionId,
    readOnly: true,
  },
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
    completed: result.completed,
    readOnly: true,
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

  for (const branchId of execution.explorationOrder ?? []) {
    const score = scoreForBranch(execution, branchId);
    const iteration: SearchIteration = { branchId, explored: true, score };
    const previousBestBranchId = bestBranchId;
    let reason = "Best branch unchanged because the explored branch has no comparable score.";

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

    iterations.push(iteration);
    evidence.push(buildIterationEvidence(iteration, bestBranchId, previousBestBranchId, reason, iterations.length - 1));

    const solution = buildSolutionSnapshot(iteration, iterations.length - 1);
    const previousBestSolutionId = solutionPool.bestSolutionId;
    solutionPool = addSolution(solutionPool, solution);
    evidence.push(buildSolutionPoolEvidence(solution, solutionPool.bestSolutionId, previousBestSolutionId, iterations.length - 1));
  }

  const result = {
    exploredBranches: iterations,
    bestBranchId,
    completed: true,
    solutionPool,
  };

  return {
    ...result,
    evidence: [...evidence, buildCompletionEvidence(result)],
  };
}
