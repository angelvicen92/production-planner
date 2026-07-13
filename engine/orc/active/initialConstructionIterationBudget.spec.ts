import test from "node:test";
import assert from "node:assert/strict";
import { defaultInitialConstructionIterationBudget, initialConstructionIterationBudgetFromReasoningBudget } from "./initialConstructionIterationBudget";

test("default iterative construction budget is explicit and decoupled from opportunities", () => {
  const budget = defaultInitialConstructionIterationBudget();
  assert.equal(budget.maxAcceptedCycles, 24);
  assert.equal(budget.maxElapsedMs, 60_000);
  assert.ok(budget.maxTotalAnchorAttempts >= budget.maxAcceptedCycles * budget.maxAnchorsPerCycle);
});

test("maxAcceptedCycles is not derived from maxOpportunities", () => {
  const budget = initialConstructionIterationBudgetFromReasoningBudget({ maxOpportunities: 0, maxCandidates: 3 } as any);
  assert.equal(budget.maxAcceptedCycles, 24);
  assert.equal(budget.maxAnchorsPerCycle, 3);
});

test("explicit maxAcceptedCycles overrides the constructive depth", () => {
  const budget = initialConstructionIterationBudgetFromReasoningBudget({ maxAcceptedCycles: 1, maxOpportunities: 99 } as any);
  assert.equal(budget.maxAcceptedCycles, 1);
});
