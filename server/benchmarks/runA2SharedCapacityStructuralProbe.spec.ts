import assert from "node:assert/strict";
import test from "node:test";
import { runA2SharedCapacityStructuralProbe } from "./runA2SharedCapacityStructuralProbe";

test("real A2 S1 uses anonymous shared prerequisite capacity before standalone", () => {
  const result = runA2SharedCapacityStructuralProbe(1_000);
  assert.deepEqual(result.effectiveInConfiguration,
    { targetGroupSize: 3, maximumGroupSize: 3, minGapMinutes: 30 });
  assert.ok(result.architecturesChecked > 0);
  assert.ok(result.sharedCapacityChecksByAuthority.TRANSPORT > 0);
  assert.ok(result.sharedCapacityPrunes > 0);
  assert.ok(result.firstSharedCapacityPrune);
  assert.equal(result.inputImmutable, true);
});
