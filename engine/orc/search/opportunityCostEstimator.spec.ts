import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate, OperationalState } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import { estimateOpportunityCosts } from "./opportunityCostEstimator";

const candidate = (id: string, assignments: Candidate["assignments"]): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments,
  operationalValues: [],
  evidenceIds: [],
  metadata: {},
});

const state = {
  id: "state:1",
  planId: 1,
  workDay: { start: "09:00", end: "17:00" },
  spaces: { exclusiveById: { 1: true } },
} as unknown as OperationalState;

test("estimateOpportunityCosts returns null cost for candidate without constraining assignments", () => {
  const result = estimateOpportunityCosts([candidate("empty", [])], state, "t");
  assert.equal(result.estimates[0].estimatedCost, 0);
});

test("estimateOpportunityCosts returns higher cost for scarce windows and constrained resources", () => {
  const result = estimateOpportunityCosts([candidate("high", [{ taskId: 1, startPlanned: "09:00", endPlanned: "17:00", spaceId: 1, resourceIds: [1, 2, 3] }])], state, "t");
  assert.ok(result.estimates[0].estimatedCost > 0.7);
  assert.equal(result.estimates[0].factors.length, 5);
});

test("estimateOpportunityCosts preserves ties deterministically", () => {
  const input = [candidate("b", [{ taskId: 1, resourceIds: [1] }]), candidate("a", [{ taskId: 2, resourceIds: [1] }])];
  const result = estimateOpportunityCosts(input, state, "t");
  assert.deepEqual(result.estimates.map((item) => item.candidateId), ["b", "a"]);
  assert.equal(result.estimates[0].estimatedCost, result.estimates[1].estimatedCost);
});

test("estimateOpportunityCosts is deterministic and serializable", () => {
  const input = [candidate("c", [{ taskId: 1, startPlanned: "09:00", endPlanned: "10:00", resourceIds: [2, 1] }])];
  const first = estimateOpportunityCosts(input, state, "2026-06-28T11:58:00.000Z");
  const second = estimateOpportunityCosts(input, state, "2026-06-28T11:58:00.000Z");
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("estimateOpportunityCosts does not mutate inputs", () => {
  const input = [candidate("immutable", [{ taskId: 1, startPlanned: "09:00", endPlanned: "10:00", resourceIds: [2, 1] }])];
  const before = JSON.parse(JSON.stringify(input));
  estimateOpportunityCosts(input, state, "t");
  assert.deepEqual(input, before);
});
