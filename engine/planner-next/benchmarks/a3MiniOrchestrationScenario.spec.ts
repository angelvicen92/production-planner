import assert from "node:assert/strict";
import test from "node:test";
import { runA3Mini } from "./a3MiniOrchestrationScenario";

test("A3-MINI isolates the causal cost of global selector ordering", () => {
  const global = runA3Mini("GLOBAL_SELECTOR"), structural = runA3Mini("STRUCTURAL");
  assert.equal(global.status, "BUDGET_EXHAUSTED");
  assert.equal(global.trace[1]?.kind, "TECHNICAL_CHAIN");
  assert.equal(global.trace[1]?.selectionReason, "mixed-domain-exact-mrv");
  assert.equal(global.trace[1]?.firstImpossibleFutureAuthority, "scarce-unit-capacity");
  assert.equal(structural.status, "COMPLETE");
  assert.equal(structural.hardValid, true);
  assert.deepEqual(structural.trace.map(({ kind }) => kind), [
    "PARTICIPANT_MEAL", "RESOURCE_TASK", "ROUND_SYNCHRONIZATION", "SETUP_GROUP", "TECHNICAL_CHAIN",
  ]);
  assert.deepEqual(runA3Mini("GLOBAL_SELECTOR"), global, "diagnostic trace must be deterministic");
});
