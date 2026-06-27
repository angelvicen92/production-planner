import type { Evidence, LearnedSearchPattern, OnlineSearchMemory, ProductionObjectiveScore } from "../contracts";
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
import { initializeOnlineSearchMemory, queryLearnedPattern, registerSearchObservation } from "./onlineSearchLearning";
import { buildStateSignature, lookupTransposition, registerTransposition, type TranspositionTable } from "./transpositionTable";

export interface SearchIteration {
  branchId: string;
  explored: boolean;
  score: number | null;
  productionObjectiveScore: ProductionObjectiveScore | null;
  solutionId: string;
}

export interface IterativeSearchResult {
  exploredBranches: SearchIteration[];
  bestBranchId: string | null;
  completed: boolean;
  evidence: Evidence[];
  solutionPool: SolutionPool;
  incrementalReplanningResults: IncrementalReplanningResult[];
  onlineSearchMemory: OnlineSearchMemory;
  transpositionEntries: Array<{ signature: string; bestScore: number; branchId: string; visits: number }>;
}

const finiteScore = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const scoreForBranch = (execution: BacktrackingExecutionResult, branchId: string): number | null => {
  const objectiveScore = execution.branchProductionObjectiveScores?.[branchId]?.overallScore;
  return finiteScore(objectiveScore) ?? finiteScore(execution.branchScores?.[branchId]);
};

const productionObjectiveScoreForBranch = (
  execution: BacktrackingExecutionResult,
  branchId: string,
): ProductionObjectiveScore | null => {
  const score = execution.branchProductionObjectiveScores?.[branchId];
  return score == null ? null : { ...score };
};

const buildSolutionId = (branchId: string, index: number): string => `solution:${index + 1}:${branchId}`;

const buildSolutionSnapshot = (iteration: SearchIteration, index: number): SolutionSnapshot => ({
  solutionId: iteration.solutionId,
  originatingBranchId: iteration.branchId,
  score: iteration.score,
  productionObjectiveScore: iteration.productionObjectiveScore,
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
    productionObjectiveScore: solution.productionObjectiveScore,
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
    productionObjectiveScore: iteration.productionObjectiveScore,
    bestBranchId,
    previousBestBranchId,
    bestChanged: bestBranchId !== previousBestBranchId,
    reason,
    readOnly: true,
    shadowModeOnly: true,
  },
});


const buildLearnedPattern = (iteration: SearchIteration): LearnedSearchPattern => ({
  patternId: iteration.branchId,
  observations: 1,
  averageScore: iteration.score ?? 0,
  lastScore: iteration.score ?? 0,
  explanation: iteration.score == null
    ? `Branch ${iteration.branchId} produced no comparable score during shadow-mode search.`
    : `Branch ${iteration.branchId} produced score ${iteration.score} during shadow-mode search.`,
});

const buildLearningEvidence = (pattern: LearnedSearchPattern, index: number): Evidence => ({
  id: `evidence:orc-search:online-learning:observation:${index + 1}:${pattern.patternId}`,
  source: "orc-search",
  kind: "iterative-search-online-learning-observation",
  subjectId: pattern.patternId,
  data: {
    learnedPattern: pattern.patternId,
    observations: pattern.observations,
    averageScore: pattern.averageScore,
    lastScore: pattern.lastScore,
    explanation: pattern.explanation,
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildLearningConsultedEvidence = (sourceBranchId: string, pattern: LearnedSearchPattern, index: number): Evidence => ({
  id: `evidence:orc-search:online-learning:consulted:${index + 1}:${sourceBranchId}:${pattern.patternId}`,
  source: "orc-search",
  kind: "iterative-search-online-learning-consulted",
  subjectId: pattern.patternId,
  data: {
    sourceBranchId,
    learnedPattern: pattern.patternId,
    observations: pattern.observations,
    averageScore: pattern.averageScore,
    lastScore: pattern.lastScore,
    usedForScoring: false,
    usedForPruning: false,
    reason: "Online search memory was consulted before branch prioritization; scoring and pruning remain unchanged in shadow mode.",
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
  productionObjectiveScore: iteration.productionObjectiveScore,
  bestBranchId,
  previousBestBranchId,
});

interface PendingBranch {
  branchId: string;
  originalIndex: number;
}

const reorderPendingBranches = (
  pending: PendingBranch[],
  execution: BacktrackingExecutionResult,
): { nextPending: PendingBranch[]; changes: Array<{ branchId: string; previousPriority: number; nextPriority: number; score: number | null }> } => {
  const before = pending.map((branch) => branch.branchId);
  const nextPending = [...pending].sort((a, b) => {
    const scoreA = scoreForBranch(execution, a.branchId);
    const scoreB = scoreForBranch(execution, b.branchId);
    if (scoreA != null && scoreB != null && scoreA !== scoreB) return scoreB - scoreA;
    if (scoreA != null && scoreB == null) return -1;
    if (scoreA == null && scoreB != null) return 1;
    return a.originalIndex - b.originalIndex;
  });
  const changes = nextPending.flatMap((branch, index) => {
    const previousIndex = before.indexOf(branch.branchId);
    return previousIndex === index ? [] : [{
      branchId: branch.branchId,
      previousPriority: previousIndex + 1,
      nextPriority: index + 1,
      score: scoreForBranch(execution, branch.branchId),
    }];
  });
  return { nextPending, changes };
};

const buildBranchReorderedEvidence = (
  sourceBranchId: string,
  change: { branchId: string; previousPriority: number; nextPriority: number; score: number | null },
  bestBranchId: string | null,
  index: number,
): Evidence => ({
  id: `evidence:orc-search:evaluation-guided-reorder:${index + 1}:${sourceBranchId}:${change.branchId}`,
  source: "orc-search",
  kind: "iterative-search-evaluation-guided-reorder",
  subjectId: change.branchId,
  data: {
    sourceBranchId,
    branchId: change.branchId,
    previousPriority: change.previousPriority,
    nextPriority: change.nextPriority,
    scoreUsedForDecision: change.score,
    bestBranchId,
    reason: "Pending branch priority changed by deterministic ProductionObjectiveScore-guided ordering after evaluating a simulated solution.",
    readOnly: true,
    shadowModeOnly: true,
  },
});

const buildTranspositionEvidence = (
  branchId: string,
  signature: string,
  equivalent: ReturnType<typeof lookupTransposition>,
  registered: ReturnType<typeof registerTransposition>,
  index: number,
): Evidence => {
  const entry = registered.entries.get(signature) ?? null;
  return {
    id: `evidence:orc-search:transposition:${index + 1}:${branchId}`,
    source: "orc-search",
    kind: "iterative-search-transposition",
    subjectId: branchId,
    data: {
      branchId,
      signature,
      equivalenceDetected: equivalent != null,
      originalBranchId: equivalent?.branchId ?? branchId,
      knownScore: equivalent?.bestScore ?? null,
      visits: entry?.visits ?? 1,
      registeredBestScore: entry?.bestScore ?? null,
      registeredBestBranchId: entry?.branchId ?? null,
      reason: equivalent == null
        ? "No equivalent simulated state was known before exploring this branch."
        : "An equivalent simulated state was already registered; branch exploration remains unchanged in shadow mode.",
      readOnly: true,
      shadowModeOnly: true,
    },
  };
};

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
    onlineSearchPatternCount: result.onlineSearchMemory.patterns.length,
    onlineSearchMemory: result.onlineSearchMemory,
    transpositionEntryCount: result.transpositionEntries.length,
    transpositionEntries: result.transpositionEntries,
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
  let onlineSearchMemory = initializeOnlineSearchMemory();
  let transpositionTable: TranspositionTable = { entries: new Map() };

  let pendingBranches: PendingBranch[] = (execution.explorationOrder ?? []).map((branchId, originalIndex) => ({ branchId, originalIndex }));

  while (pendingBranches.length > 0) {
    const [{ branchId }, ...remaining] = pendingBranches;
    pendingBranches = remaining;
    const score = scoreForBranch(execution, branchId);
    const simulatedState = execution.branchSimulatedStates?.[branchId] ?? null;
    if (simulatedState != null) {
      const signature = buildStateSignature(simulatedState);
      const equivalent = lookupTransposition(transpositionTable, signature);
      transpositionTable = registerTransposition(transpositionTable, signature, score ?? Number.NEGATIVE_INFINITY, branchId);
      evidence.push(buildTranspositionEvidence(branchId, signature.signature, equivalent, transpositionTable, iterations.length));
    }
    const productionObjectiveScore = productionObjectiveScoreForBranch(execution, branchId);
    const solutionId = buildSolutionId(branchId, iterations.length);
    const iteration: SearchIteration = { branchId, explored: true, score, productionObjectiveScore, solutionId };
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

    const observedPattern = buildLearnedPattern(iteration);
    onlineSearchMemory = registerSearchObservation(onlineSearchMemory, observedPattern);
    const learnedPattern = queryLearnedPattern(onlineSearchMemory, observedPattern.patternId) ?? observedPattern;
    evidence.push(buildLearningEvidence(learnedPattern, iterations.length));

    iterations.push(iteration);
    evidence.push(buildIterationEvidence(iteration, bestBranchId, previousBestBranchId, reason, iterations.length - 1));
    evidence.push(buildComparisonEvidence(comparison, iterations.length - 1));
    if (comparison.bestChanged) {
      evidence.push(buildBestChangedEvidence(comparison, iterations.length - 1));
    }

    for (const pending of pendingBranches) {
      const learnedPattern = queryLearnedPattern(onlineSearchMemory, pending.branchId);
      if (learnedPattern != null) {
        evidence.push(buildLearningConsultedEvidence(iteration.branchId, learnedPattern, iterations.length - 1));
      }
    }

    const reorder = reorderPendingBranches(pendingBranches, execution);
    pendingBranches = reorder.nextPending;
    for (const change of reorder.changes) {
      evidence.push(buildBranchReorderedEvidence(iteration.branchId, change, bestBranchId, iterations.length - 1));
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
    onlineSearchMemory,
    transpositionEntries: Array.from(transpositionTable.entries.values()),
  };

  return {
    ...result,
    evidence: [...evidence, buildCompletionEvidence(result)],
  };
}
