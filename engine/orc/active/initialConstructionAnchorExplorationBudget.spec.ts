import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET, resolveInitialConstructionAnchorExplorationBudget } from "./initialConstructionAnchorExplorationBudget";

test("centralizes default anchor exploration budget", () => {
  assert.deepEqual(DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET, { initialTemporalCandidateBatchSize: 8, maxTemporalCandidatesPerAnchor: 24, maxBranchEvaluationsPerAnchor: 48, maxResourceAlternativesPerTemporalCandidate: 8, readOnly: true });
  assert.equal(Object.isFrozen(DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET), true);
});

test("resolves overrides without shrinking below the initial temporal batch", () => {
  const budget = resolveInitialConstructionAnchorExplorationBudget({ reasoningBudget: { maxCandidates: 3 } as any, maxBranches: 5 });
  assert.equal(budget.initialTemporalCandidateBatchSize, 8);
  assert.equal(budget.maxTemporalCandidatesPerAnchor, 24);
  assert.equal(budget.maxBranchEvaluationsPerAnchor, 5);
  assert.equal(budget.maxResourceAlternativesPerTemporalCandidate, 5);
});
