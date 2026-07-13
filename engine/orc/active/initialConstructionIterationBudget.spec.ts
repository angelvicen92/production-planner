import test from "node:test";
import assert from "node:assert/strict";
import { defaultInitialConstructionIterationBudget, initialConstructionIterationBudgetFromReasoningBudget } from "./initialConstructionIterationBudget";

test("default iterative construction budget is explicit and decoupled from opportunities", () => {
  const budget = defaultInitialConstructionIterationBudget();
  assert.equal(budget.maxAcceptedCycles, 48);
  assert.equal(budget.maxElapsedMs, 60_000);
  assert.equal(budget.anchorBatchSize, 12);
  assert.equal(budget.maxAnchorsPerCycle, 12);
  assert.equal(budget.maxAnchorRanksScannedPerCycle, 128);
  assert.ok(budget.maxTotalAnchorAttempts >= budget.maxAcceptedCycles * budget.maxAnchorRanksScannedPerCycle);
});

test("maxAcceptedCycles is not derived from maxOpportunities", () => {
  const budget = initialConstructionIterationBudgetFromReasoningBudget({ maxOpportunities: 0, maxCandidates: 3 } as any);
  assert.equal(budget.maxAcceptedCycles, 48);
  assert.equal(budget.anchorBatchSize, 3);
  assert.equal(budget.maxAnchorsPerCycle, 3);
  assert.equal(budget.maxAnchorRanksScannedPerCycle, 128);
});

test("explicit maxAcceptedCycles overrides the constructive depth", () => {
  const budget = initialConstructionIterationBudgetFromReasoningBudget({ maxAcceptedCycles: 1, maxOpportunities: 99 } as any);
  assert.equal(budget.maxAcceptedCycles, 1);
});

test("anchorBatchSize and maxAnchorRanksScannedPerCycle can be configured independently", () => {
  const budget = initialConstructionIterationBudgetFromReasoningBudget({ anchorBatchSize: 5, maxAnchorRanksScannedPerCycle: 17 } as any);
  assert.equal(budget.anchorBatchSize, 5);
  assert.equal(budget.maxAnchorsPerCycle, 5);
  assert.equal(budget.maxAnchorRanksScannedPerCycle, 17);
});
