import type { Evidence } from "../contracts";
import type { BranchOrderingResult, OrderedSearchSpace } from "../analysis/branchOrderingEngine";

export interface PrunedBranch {
  branchId: string;
  pruned: boolean;
  pruningReason: string;
}

export interface BranchPruningResult {
  branches: PrunedBranch[];
}

const KEEP_REASON = "Branch kept for backtracking because it is the first occurrence in the deterministic branch ordering.";
const DUPLICATE_REASON = "Branch pruned before backtracking because an earlier branch with the same id already represents this exploration branch.";

const branchIdFor = (item: OrderedSearchSpace): string => item.searchSpace.id;

const evidenceDataFor = (item: OrderedSearchSpace, pruned: PrunedBranch): Record<string, unknown> => ({
  branchId: pruned.branchId,
  pruned: pruned.pruned,
  pruningReason: pruned.pruningReason,
  informationUsed: {
    searchSpaceId: item.searchSpace.id,
    explorationOrder: item.explorationOrder,
    orderingScore: item.orderingScore,
    orderingExplanation: item.explanation,
  },
  criteria: ["BranchOrderingResult", "StableDuplicateBranchIdPruning"],
  readOnly: true,
});

export function pruneBranches(ordering: BranchOrderingResult): BranchPruningResult {
  const seen = new Set<string>();
  const branches: PrunedBranch[] = [];

  for (const item of ordering?.orderedSearchSpaces ?? []) {
    const branchId = branchIdFor(item);
    const pruned = seen.has(branchId);
    if (!pruned) seen.add(branchId);
    branches.push({
      branchId,
      pruned,
      pruningReason: pruned ? DUPLICATE_REASON : KEEP_REASON,
    });
  }

  return { branches };
}

export function buildBranchPruningEvidence(
  ordering: BranchOrderingResult,
  result: BranchPruningResult,
  createdAt: string | null = null,
): Evidence[] {
  const ordered = ordering?.orderedSearchSpaces ?? [];
  return (result?.branches ?? []).map((branch, index) => {
    const orderedBranch = ordered[index];
    const data = orderedBranch == null
      ? { branchId: branch.branchId, pruned: branch.pruned, pruningReason: branch.pruningReason, informationUsed: null, criteria: ["BranchOrderingResult", "StableDuplicateBranchIdPruning"], readOnly: true }
      : evidenceDataFor(orderedBranch, branch);

    return {
      id: `evidence:orc-search:branch-pruning:${index + 1}:${branch.branchId}`,
      source: "orc-search",
      kind: "branch-pruning",
      subjectId: branch.branchId,
      createdAt,
      data,
    };
  });
}
