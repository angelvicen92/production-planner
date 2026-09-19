import assert from "node:assert/strict";
import test from "node:test";
import { runA2ArrivalFeasibilityProbe } from "./runA2ArrivalFeasibilityProbe";

test("A2 arrival probe reaches the core-leaf contiguous solver without membership fallback", () => {
  const result = runA2ArrivalFeasibilityProbe();
  assert.equal(result.classification, "CONTIGUOUS_EXACT");
  assert.equal(result.membershipFallbackEntered, 0);
  assert.ok(result.contiguousSizeStatesExplored > 0);
  assert.equal(result.inputImmutable, true);
});
