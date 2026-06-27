import type { ProductionObjectiveScore } from "../contracts";

export interface SolutionSnapshot {
  solutionId: string;
  originatingBranchId: string;
  score: number | null;
  productionObjectiveScore: ProductionObjectiveScore | null;
  metadata: Record<string, unknown>;
}

export interface SolutionPool {
  solutions: SolutionSnapshot[];
  bestSolutionId: string | null;
}

export interface SolutionComparison {
  candidateSolutionId: string;
  previousBestSolutionId: string | null;
  winnerSolutionId: string | null;
  candidateScore: number | null;
  previousBestScore: number | null;
  bestChanged: boolean;
}

const cloneSolution = (solution: SolutionSnapshot): SolutionSnapshot => ({
  solutionId: solution.solutionId,
  originatingBranchId: solution.originatingBranchId,
  score: solution.score,
  productionObjectiveScore: solution.productionObjectiveScore == null ? null : { ...solution.productionObjectiveScore },
  metadata: { ...solution.metadata },
});

const isBetterSolution = (candidate: SolutionSnapshot, current: SolutionSnapshot | null): boolean => {
  if (current == null) return true;
  if (candidate.score == null) return false;
  if (current.score == null) return true;
  return candidate.score > current.score;
};

export function initializeSolutionPool(): SolutionPool {
  return {
    solutions: [],
    bestSolutionId: null,
  };
}

export function selectBestSolution(pool: SolutionPool): SolutionSnapshot | null {
  let best: SolutionSnapshot | null = null;

  for (const solution of pool.solutions) {
    if (isBetterSolution(solution, best)) {
      best = solution;
    }
  }

  return best == null ? null : cloneSolution(best);
}

export function compareSolutions(
  pool: SolutionPool,
  candidate: SolutionSnapshot,
): SolutionComparison {
  const previousBest = selectBestSolution(pool);
  const candidateSnapshot = cloneSolution(candidate);
  const winner = isBetterSolution(candidateSnapshot, previousBest) ? candidateSnapshot : previousBest;

  return {
    candidateSolutionId: candidateSnapshot.solutionId,
    previousBestSolutionId: previousBest?.solutionId ?? null,
    winnerSolutionId: winner?.solutionId ?? null,
    candidateScore: candidateSnapshot.score,
    previousBestScore: previousBest?.score ?? null,
    bestChanged: winner?.solutionId !== (previousBest?.solutionId ?? null),
  };
}

export function addSolution(
  pool: SolutionPool,
  solution: SolutionSnapshot,
): SolutionPool {
  const nextSolutions = [...pool.solutions.map(cloneSolution), cloneSolution(solution)];
  const bestSolution = selectBestSolution({
    solutions: nextSolutions,
    bestSolutionId: pool.bestSolutionId,
  });

  return {
    solutions: nextSolutions,
    bestSolutionId: bestSolution?.solutionId ?? null,
  };
}
