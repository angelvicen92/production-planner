import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import { preselectCandidates } from "./candidatePreselectionEngine";

const candidate = (id: string, impact = 1, variantIndex = 0): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [`e:${id}`], metadata: { readOnly: true } },
  assignments: [{ taskId: variantIndex + 1, resourceIds: [1] }],
  operationalValues: [],
  evidenceIds: [`e:${id}`],
  metadata: {
    readOnly: true,
    sourceOpportunityId: "opp-1",
    expectedOperationalImpact: impact,
    confidence: 0.5,
    executesTransformations: true,
    variantIndex,
    estimatedCost: "low",
    taskIds: [variantIndex + 1],
  },
});

const profile = { opportunityId: "opp-1", criticalityLevel: 2, propagationScore: 0.5, reasoningBudget: 3, maxDepth: 2, maxBreadth: 3, expectedExplorationValue: 6.5 };
const propagation = { opportunityId: "opp-1", propagationScore: 0.5, affectedResources: [], affectedChains: [], estimatedConflictReduction: 0.25, estimatedFreedomGain: 0.75, explanation: "fixture" };

test("preselectCandidates handles zero candidates", () => {
  const result = preselectCandidates([], { adaptiveSearchSpaceProfiles: [profile], opportunityPropagation: [propagation] });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.decisions, []);
  assert.equal(result.summary.acceptedCandidates, 0);
  assert.equal(result.summary.discardedCandidates, 0);
});

test("preselectCandidates accepts one candidate without truncation", () => {
  const result = preselectCandidates([candidate("c1")], { maxCandidates: 0 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.decisions[0].accepted, true);
  assert.equal(result.summary.limit, 1);
});

test("preselectCandidates orders multiple candidates by deterministic score", () => {
  const result = preselectCandidates([candidate("low", 1), candidate("high", 5), candidate("mid", 3)], { maxCandidates: 2, adaptiveSearchSpaceProfiles: [profile], opportunityPropagation: [propagation] });
  assert.deepEqual(result.candidates.map((item) => item.id), ["high", "mid"]);
  assert.equal(result.decisions.find((item) => item.candidateId === "low")?.rejectionReason, "preselection-limit");
});

test("preselectCandidates resolves score ties by candidate id", () => {
  const result = preselectCandidates([candidate("b", 1), candidate("a", 1), candidate("c", 1)], { maxCandidates: 2 });
  assert.deepEqual(result.decisions.map((item) => item.candidateId), ["a", "b", "c"]);
  assert.deepEqual(result.candidates.map((item) => item.id), ["b", "a"]);
});

test("preselectCandidates applies candidate limit", () => {
  const result = preselectCandidates([candidate("a"), candidate("b"), candidate("c")], { maxCandidates: 1 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.summary.discardedCandidates, 2);
});

test("preselectCandidates is deterministic and serializable", () => {
  const input = [candidate("a", 2), candidate("b", 4), candidate("c", 1)];
  const first = preselectCandidates(input, { maxCandidates: 2, adaptiveSearchSpaceProfiles: [profile], opportunityPropagation: [propagation], createdAt: "2026-06-27T21:55:00.000Z" });
  const second = preselectCandidates(input, { maxCandidates: 2, adaptiveSearchSpaceProfiles: [profile], opportunityPropagation: [propagation], createdAt: "2026-06-27T21:55:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("preselectCandidates does not mutate input candidates", () => {
  const input = [candidate("a", 2), candidate("b", 1)];
  const before = JSON.parse(JSON.stringify(input));
  preselectCandidates(input, { maxCandidates: 1 });
  assert.deepEqual(input, before);
});
