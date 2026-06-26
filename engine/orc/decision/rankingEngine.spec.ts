import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalValue } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { rankOperationalValues } from "./rankingEngine";

function value(id: string, overrides: Partial<OperationalValue> = {}): OperationalValue {
  return {
    simulatedStateId: id,
    continuity: 0,
    makespan: 0,
    permanence: 0,
    compaction: 0,
    resourcePressure: 0,
    robustness: 0,
    stability: 0,
    futureFreedom: 0,
    overallScore: 0,
    breakdown: {},
    evaluatedAt: null,
    evidenceIds: [`evidence:${id}`],
    metadata: {},
    ...overrides,
  };
}

test("rankOperationalValues handles zero candidates", () => {
  const result = rankOperationalValues([], { createdAt: "2026-06-26T00:00:00.000Z" });
  assert.deepEqual(result.rankedOperationalValues, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { rankedCount: 0, tieCount: 0 });
});

test("rankOperationalValues handles one candidate with ranking evidence", () => {
  const result = rankOperationalValues([value("sim-1")], { createdAt: "2026-06-26T00:00:00.000Z" });
  assert.deepEqual(result.rankedOperationalValues.map((item) => item.simulatedStateId), ["sim-1"]);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].data.position, 1);
  assert.equal(result.evidence[0].data.topCandidateId, "sim-1");
  assert.equal(result.evidence[0].createdAt, "2026-06-26T00:00:00.000Z");
});

test("rankOperationalValues sorts multiple candidates by score vector descending", () => {
  const result = rankOperationalValues([
    value("sim-low", { overallScore: 1 }),
    value("sim-high", { overallScore: 3 }),
    value("sim-mid", { overallScore: 2 }),
  ]);
  assert.deepEqual(result.rankedOperationalValues.map((item) => item.simulatedStateId), ["sim-high", "sim-mid", "sim-low"]);
});

test("rankOperationalValues resolves score ties deterministically by contained stable fields", () => {
  const result = rankOperationalValues([value("sim-b"), value("sim-a"), value("sim-c")]);
  assert.deepEqual(result.rankedOperationalValues.map((item) => item.simulatedStateId), ["sim-a", "sim-b", "sim-c"]);
  assert.equal(result.summary.tieCount, 2);
  assert.equal(result.evidence[1].data.tieBreakReason, "Tied score vector resolved by ascending simulatedStateId.");
});

test("rankOperationalValues is deterministic and structurally equal for repeated runs", () => {
  const input = [value("sim-b"), value("sim-a", { metadata: { z: "same" } })];
  const first = rankOperationalValues(input, { createdAt: null });
  const second = rankOperationalValues(input, { createdAt: null });
  assert.equal(structuralEquals(first, second), true);
});

test("rankOperationalValues does not mutate input or candidate objects", () => {
  const input = [value("sim-b"), value("sim-a")];
  const before = stableStringify(input);
  const result = rankOperationalValues(input);
  assert.equal(stableStringify(input), before);
  assert.notEqual(result.rankedOperationalValues, input);
  assert.equal(result.rankedOperationalValues[0], input[1]);
});
