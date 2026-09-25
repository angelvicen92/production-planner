import assert from "node:assert/strict";
import test from "node:test";
import { runA2SharedCapacityStructuralProbe } from "./runA2SharedCapacityStructuralProbe";

test("real A2 S1 remains bounded without pinning its exhaustion sub-phase", () => {
  const result = runA2SharedCapacityStructuralProbe(1_000);
  assert.deepEqual(result,runA2SharedCapacityStructuralProbe(1_000));
  assert.deepEqual(result.effectiveInConfiguration,
    { targetGroupSize: 3, maximumGroupSize: 3, minGapMinutes: 30 });
  assert.equal(result.coreStatus,"BRANCH_BUDGET_EXHAUSTED");
  assert.ok(result.branchesExplored<=1_000);
  assert.equal(result.inputImmutable, true);
});
