import assert from "node:assert/strict";
import test from "node:test";
import { runA2SharedCapacityStructuralProbe } from "./runA2SharedCapacityStructuralProbe";

test("real A2 S1 stops before obsolete shared-capacity core activity", () => {
  const result = runA2SharedCapacityStructuralProbe(1_000);
  assert.deepEqual(result.effectiveInConfiguration,
    { targetGroupSize: 3, maximumGroupSize: 3, minGapMinutes: 30 });
  assert.equal(result.coreStatus,"BRANCH_BUDGET_EXHAUSTED");
  assert.deepEqual(result.coreReasonCodes,["PATTERN_SEARCH_BUDGET_EXHAUSTED"]);
  assert.equal(result.architecturesChecked,0);
  assert.deepEqual(result.sharedCapacityChecksByAuthority,{TRANSPORT:0,ENTRY_STYLING:0,COMBINED:0});
  assert.equal(result.sharedCapacityPrunes,0);
  assert.equal(result.firstSharedCapacityPrune,null);
  assert.equal(result.inputImmutable, true);
});
