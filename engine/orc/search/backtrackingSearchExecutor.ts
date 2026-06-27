import type { Evidence } from "../contracts";
import type { BranchOrderingResult } from "../analysis/branchOrderingEngine";
import { buildBranchPruningEvidence, pruneBranches } from "./branchPruningEngine";
import {
  buildSearchBacktrackingEvidence,
  markBranchExplored,
  registerBranch,
  selectNextBranch,
  type SearchBacktrackingState,
  type SearchBranchState,
} from "./searchBacktrackingFramework";

export interface BacktrackingExecutionResult {
  explorationOrder: string[];
  exploredBranches: string[];
  skippedBranches: string[];
  exhaustedBranches: string[];
  evidence: Evidence[];
}

const cloneBranch = (branch: SearchBranchState): SearchBranchState => ({
  branchId: branch.branchId,
  parentBranchId: branch.parentBranchId,
  depth: branch.depth,
  explored: branch.explored,
  exhausted: branch.exhausted,
});

const branchFromOrdering = (branchId: string, existing: SearchBranchState | undefined): SearchBranchState => existing == null
  ? { branchId, parentBranchId: null, depth: 0, explored: false, exhausted: false }
  : cloneBranch(existing);

export function executeBacktrackingSearch(
  ordering: BranchOrderingResult,
  state: SearchBacktrackingState,
): BacktrackingExecutionResult {
  const initialBranches = new Map((state?.branches ?? []).map((branch) => [branch.branchId, cloneBranch(branch)]));
  let currentState: SearchBacktrackingState = {
    activeBranchId: state?.activeBranchId ?? null,
    branches: (state?.branches ?? []).map(cloneBranch),
  };
  const pruning = pruneBranches(ordering);
  const evidence: Evidence[] = buildBranchPruningEvidence(ordering, pruning);
  const branchIds = pruning.branches.filter((branch) => !branch.pruned).map((branch) => branch.branchId);

  for (const branchId of branchIds) {
    currentState = registerBranch(currentState, branchFromOrdering(branchId, initialBranches.get(branchId)));
    const registeredBranch = currentState.branches.find((branch) => branch.branchId === branchId) ?? null;
    evidence.push(buildSearchBacktrackingEvidence("branch-created", registeredBranch, currentState));
  }

  const explorationOrder: string[] = [];
  const exploredBranches: string[] = [];
  const skippedBranches: string[] = [];
  const exhaustedBranches: string[] = [];
  const exhaustedSeen = new Set<string>();

  let nextBranch = selectNextBranch(currentState);
  evidence.push(buildSearchBacktrackingEvidence("next-branch", nextBranch, currentState));

  while (nextBranch != null) {
    const branchId = nextBranch.branchId;
    explorationOrder.push(branchId);
    exploredBranches.push(branchId);
    evidence.push(buildSearchBacktrackingEvidence("branch-explored", nextBranch, currentState));

    currentState = markBranchExplored(currentState, branchId);
    const exhaustedBranch = currentState.branches.find((branch) => branch.branchId === branchId) ?? { ...nextBranch, explored: true, exhausted: true };
    if (!exhaustedSeen.has(branchId)) {
      exhaustedSeen.add(branchId);
      exhaustedBranches.push(branchId);
    }
    evidence.push(buildSearchBacktrackingEvidence("branch-exhausted", exhaustedBranch, currentState));

    nextBranch = selectNextBranch(currentState);
    evidence.push(buildSearchBacktrackingEvidence("next-branch", nextBranch, currentState));
  }

  for (const branchId of branchIds) {
    const branch = currentState.branches.find((item) => item.branchId === branchId);
    if (branch != null && (branch.explored || branch.exhausted) && !exploredBranches.includes(branchId)) {
      skippedBranches.push(branchId);
      if (branch.exhausted && !exhaustedSeen.has(branchId)) {
        exhaustedSeen.add(branchId);
        exhaustedBranches.push(branchId);
      }
      evidence.push(buildSearchBacktrackingEvidence("branch-skipped", branch, currentState, null, "Branch was already explored or exhausted before executor selection."));
    }
  }

  return {
    explorationOrder,
    exploredBranches,
    skippedBranches,
    exhaustedBranches,
    evidence,
  };
}
