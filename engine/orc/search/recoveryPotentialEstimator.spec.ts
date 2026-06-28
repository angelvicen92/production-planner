import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate, OperationalState } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import { estimateRecoveryPotential } from "./recoveryPotentialEstimator";

const candidate = (id: string, assignments: Candidate["assignments"]): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments, operationalValues: [], evidenceIds: [], metadata: {} });
const state = { id: "state:rp", planId: 1, workDay: { start: "09:00", end: "17:00" }, planning: [], tasks: [{ id: 1, spaceId: 1 }, { id: 2, spaceId: 2 }, { id: 3 }, { id: 4 }, { id: 5, resourceRequirements: { byType: { 7: 1 } } }], dependencies: [{ taskId: 2, dependsOnTaskIds: [1] }], cognitive: { opportunities: [] } } as unknown as OperationalState;

test("estimateRecoveryPotential identifies low potential", () => {
  const result = estimateRecoveryPotential([candidate("low", [{ taskId: 1, startPlanned: "09:00", endPlanned: "17:00", spaceId: 1, resourceIds: [1] }])], state, "t");
  assert.ok(result.estimates[0].estimatedPotential < 0.45);
});

test("estimateRecoveryPotential identifies high potential", () => {
  const result = estimateRecoveryPotential([candidate("high", [{ taskId: 3, resourceIds: [] }])], state, "t");
  assert.ok(result.estimates[0].estimatedPotential > 0.65);
});

test("estimateRecoveryPotential preserves ties deterministically", () => {
  const result = estimateRecoveryPotential([candidate("b", [{ taskId: 3, resourceIds: [] }]), candidate("a", [{ taskId: 3, resourceIds: [] }])], state, "t");
  assert.deepEqual(result.estimates.map((item) => item.candidateId), ["b", "a"]);
  assert.equal(result.estimates[0].estimatedPotential, result.estimates[1].estimatedPotential);
});

test("estimateRecoveryPotential is deterministic and serializable", () => {
  const input = [candidate("c", [{ taskId: 1, startPlanned: "09:00", endPlanned: "10:00", resourceIds: [2, 1] }])];
  const first = estimateRecoveryPotential(input, state, "2026-06-28T12:10:00.000Z");
  const second = estimateRecoveryPotential(input, state, "2026-06-28T12:10:00.000Z");
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("estimateRecoveryPotential does not mutate inputs", () => {
  const input = [candidate("immutable", [{ taskId: 1, startPlanned: "09:00", endPlanned: "10:00", resourceIds: [2, 1] }])];
  const before = JSON.parse(JSON.stringify(input));
  estimateRecoveryPotential(input, state, "t");
  assert.deepEqual(input, before);
});
