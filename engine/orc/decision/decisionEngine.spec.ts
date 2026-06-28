import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, PartialPlan } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { preparePartialPlanDecisionUnits } from "./decisionEngine";

const candidate = (id: string): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments: [],
  operationalValues: [],
  evidenceIds: [`evidence:${id}`],
  metadata: { strategy: "COMPACT_REGION", sourceOpportunityId: "opp:1", expectedOperationalImpact: 1 },
});

const plan = (id: string, candidateIds: string[]): PartialPlan => ({
  partialPlanId: id,
  candidateIds,
  compatibilityScore: 1,
  expectedOperationalImpact: candidateIds.length,
});

test("preparePartialPlanDecisionUnits evaluates one Partial Plan as one synthetic proposal", () => {
  const result = preparePartialPlanDecisionUnits([candidate("candidate:1"), candidate("candidate:2")], [plan("partial-plan:1", ["candidate:1", "candidate:2"])]);
  assert.equal(result.decisionUnits.length, 1);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].metadata.partialPlanCandidateIds, ["candidate:1", "candidate:2"]);
  assert.equal(result.summary.fallbackToCandidates, false);
});

test("preparePartialPlanDecisionUnits preserves multiple Partial Plans deterministically", () => {
  const result = preparePartialPlanDecisionUnits([candidate("candidate:b"), candidate("candidate:a")], [plan("partial-plan:b", ["candidate:b"]), plan("partial-plan:a", ["candidate:a"])]);
  assert.deepEqual(result.decisionUnits.map((unit) => unit.partialPlan.partialPlanId), ["partial-plan:a", "partial-plan:b"]);
});

test("preparePartialPlanDecisionUnits ignores invalid Partial Plans without known candidates", () => {
  const result = preparePartialPlanDecisionUnits([candidate("candidate:1")], [plan("partial-plan:missing", ["candidate:missing"])]);
  assert.equal(result.decisionUnits.length, 0);
  assert.equal(result.summary.partialPlanCount, 0);
});

test("preparePartialPlanDecisionUnits falls back to individual candidates", () => {
  const result = preparePartialPlanDecisionUnits([candidate("candidate:2"), candidate("candidate:1")], undefined);
  assert.equal(result.summary.fallbackToCandidates, true);
  assert.deepEqual(result.decisionUnits.map((unit) => unit.partialPlan.candidateIds), [["candidate:1"], ["candidate:2"]]);
});

test("preparePartialPlanDecisionUnits is deterministic, serializable and non-mutating", () => {
  const source = [candidate("candidate:1"), candidate("candidate:2")];
  const plans = [plan("partial-plan:1", ["candidate:1", "candidate:2"])];
  const before = stableStringify({ source, plans });
  const first = preparePartialPlanDecisionUnits(source, plans, { createdAt: "2026-06-28T00:00:00.000Z" });
  const second = preparePartialPlanDecisionUnits(source, plans, { createdAt: "2026-06-28T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(stableStringify({ source, plans }), before);
});
