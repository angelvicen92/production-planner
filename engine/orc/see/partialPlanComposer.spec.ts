import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { composePartialPlans } from "./partialPlanComposer";

const candidate = (id: string, overrides: Partial<Candidate> = {}): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: { readOnly: true } },
  assignments: [{ taskId: Number(id.replace(/\D/g, "")) || 1, startPlanned: "2026-06-28T08:00:00.000Z", endPlanned: "2026-06-28T09:00:00.000Z", spaceId: 1, resourceIds: [Number(id.replace(/\D/g, "")) || 1] }],
  operationalValues: [],
  evidenceIds: [],
  metadata: { readOnly: true, searchSpaceId: `space-${id}`, taskIds: [Number(id.replace(/\D/g, "")) || 1], expectedOperationalImpact: 1 },
  ...overrides,
});

test("composePartialPlans handles empty compositions", () => {
  const result = composePartialPlans([]);
  assert.deepEqual(result.partialPlans, []);
  assert.equal(result.summary.partialPlanCount, 0);
  assert.equal(result.summary.discardedCompositionCount, 0);
});

test("composePartialPlans creates a single-candidate partial plan", () => {
  const result = composePartialPlans([candidate("c1")]);
  assert.equal(result.partialPlans.length, 1);
  assert.deepEqual(result.partialPlans[0].candidateIds, ["c1"]);
  assert.equal(result.partialPlans[0].compatibilityScore, 1);
});

test("composePartialPlans combines multiple compatible candidates", () => {
  const result = composePartialPlans([candidate("c2"), candidate("c1")]);
  assert.equal(result.partialPlans.some((plan) => structuralEquals(plan.candidateIds, ["c1", "c2"])), true);
  assert.equal(result.discardedCompositions.length, 0);
  assert.equal(result.evidence.filter((item) => item.kind === "partial-plan-composed").length, 3);
});

test("composePartialPlans discards evidently incompatible candidates", () => {
  const left = candidate("c1", { assignments: [{ taskId: 1, startPlanned: "2026-06-28T08:00:00.000Z", endPlanned: "2026-06-28T10:00:00.000Z", spaceId: 1, resourceIds: [7] }] });
  const right = candidate("c2", { assignments: [{ taskId: 2, startPlanned: "2026-06-28T09:00:00.000Z", endPlanned: "2026-06-28T11:00:00.000Z", spaceId: 2, resourceIds: [7] }] });
  const result = composePartialPlans([left, right]);
  assert.equal(result.partialPlans.some((plan) => plan.candidateIds.length === 2), false);
  assert.equal(result.discardedCompositions[0].reason, "resource-time-overlap");
  assert.equal(result.evidence.some((item) => item.kind === "partial-plan-discarded"), true);
});

test("composePartialPlans is deterministic and serializable", () => {
  const input = [candidate("c3"), candidate("c1"), candidate("c2")];
  const first = composePartialPlans(input, { createdAt: "2026-06-28T10:00:00.000Z" });
  const second = composePartialPlans(input, { createdAt: "2026-06-28T10:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("composePartialPlans preserves structural equality and does not mutate inputs", () => {
  const input = [candidate("c1"), candidate("c2")];
  const before = stableStringify(input);
  const first = composePartialPlans(input);
  const second = composePartialPlans(input);
  assert.deepEqual(first, second);
  assert.equal(stableStringify(input), before);
});

test("composePartialPlans keeps baseline safety standalone and out of improvement combinations", () => {
  const baseline = candidate("baseline", { assignments: [], metadata: { baselinePreservation: true, baselineSafetyCandidate: true, readOnly: true, planningInfluence: "none", expectedOperationalImpact: 99 } });
  const result = composePartialPlans([candidate("c1"), candidate("c2"), baseline], { createdAt: "2026-06-30T00:00:00.000Z" });
  const baselinePlans = result.partialPlans.filter((plan) => plan.candidateIds.includes("baseline"));
  assert.equal(baselinePlans.length, 1);
  assert.deepEqual(baselinePlans[0].candidateIds, ["baseline"]);
  assert.equal(baselinePlans[0].compatibilityScore, 1);
  assert.equal(baselinePlans[0].expectedOperationalImpact, 0);
  assert.equal(result.partialPlans.some((plan) => plan.candidateIds.includes("baseline") && plan.candidateIds.length > 1), false);
  assert.equal(result.evidence.some((item) => item.kind === "baseline-safety-partial-plan-composed"), true);
});
