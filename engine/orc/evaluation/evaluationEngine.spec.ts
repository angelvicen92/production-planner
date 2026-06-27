import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSimulatedStates } from "./evaluationEngine";

test("evaluationEngine compatibility export exposes Production Objective evaluator", () => {
  const result = evaluateSimulatedStates([], [], { createdAt: null });
  assert.deepEqual(result.summary, { evaluatedCount: 0, skippedInvalid: 0 });
});
