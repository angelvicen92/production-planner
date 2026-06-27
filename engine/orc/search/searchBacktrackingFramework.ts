import type { Evidence } from "../contracts";

export interface SearchBranchState {
  branchId: string;
  parentBranchId: string | null;

  depth: number;

  explored: boolean;

  exhausted: boolean;
}

export interface SearchBacktrackingState {
  activeBranchId: string | null;

  branches: SearchBranchState[];
}

export type SearchBacktrackingEvidenceEvent = "branch-created" | "branch-explored" | "branch-exhausted" | "next-branch";

const cloneBranch = (branch: SearchBranchState): SearchBranchState => ({
  branchId: branch.branchId,
  parentBranchId: branch.parentBranchId,
  depth: branch.depth,
  explored: branch.explored,
  exhausted: branch.exhausted,
});

const cloneState = (state: SearchBacktrackingState): SearchBacktrackingState => ({
  activeBranchId: state.activeBranchId,
  branches: state.branches.map(cloneBranch),
});

export function initializeBacktrackingState(): SearchBacktrackingState {
  return {
    activeBranchId: null,
    branches: [],
  };
}

export function registerBranch(
  state: SearchBacktrackingState,
  branch: SearchBranchState,
): SearchBacktrackingState {
  const next = cloneState(state);
  const registered = cloneBranch(branch);
  const existingIndex = next.branches.findIndex((item) => item.branchId === registered.branchId);
  const branches = existingIndex >= 0
    ? next.branches.map((item, index) => (index === existingIndex ? registered : item))
    : [...next.branches, registered];

  return {
    activeBranchId: next.activeBranchId ?? registered.branchId,
    branches,
  };
}

export function markBranchExplored(
  state: SearchBacktrackingState,
  branchId: string,
): SearchBacktrackingState {
  const next = cloneState(state);
  return {
    activeBranchId: next.activeBranchId === branchId ? null : next.activeBranchId,
    branches: next.branches.map((branch) => branch.branchId === branchId ? { ...branch, explored: true, exhausted: true } : branch),
  };
}

export function selectNextBranch(state: SearchBacktrackingState): SearchBranchState | null {
  const next = cloneState(state);
  const selected = next.branches.find((branch) => !branch.explored && !branch.exhausted) ?? null;
  return selected == null ? null : cloneBranch(selected);
}

export function buildSearchBacktrackingEvidence(
  event: SearchBacktrackingEvidenceEvent,
  branch: SearchBranchState | null,
  state: SearchBacktrackingState,
  createdAt: string | null = null,
): Evidence {
  const branchId = branch?.branchId ?? null;
  return {
    id: `evidence:orc-search:backtracking:${event}:${branchId ?? "none"}`,
    source: "orc-search",
    kind: `search-backtracking-${event}`,
    subjectId: branchId,
    createdAt,
    data: {
      event,
      branch: branch == null ? null : cloneBranch(branch),
      activeBranchId: state.activeBranchId,
      branches: state.branches.map(cloneBranch),
      branchCount: state.branches.length,
      readOnly: true,
      shadowModeOnly: true,
    },
  };
}
