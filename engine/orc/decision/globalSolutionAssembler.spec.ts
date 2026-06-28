import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, PartialPlan } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import type { PartialPlanDecisionUnit } from "./decisionEngine";
import { assembleGlobalSolutions } from "./globalSolutionAssembler";

const assignment = (taskId: number, resourceId: number, start = "2026-06-28T08:00:00.000Z", end = "2026-06-28T09:00:00.000Z", spaceId = 1) => ({
  taskId,
  startPlanned: start,
  endPlanned: end,
  spaceId,
  resourceIds: [resourceId],
});

const candidate = (id: string, assignments = [assignment(Number(id.replace(/\D/g, "")) || 1, Number(id.replace(/\D/g, "")) || 1)]): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments,
  operationalValues: [{
    simulatedStateId: `sim:${id}`,
    continuity: 1,
    makespan: 1,
    permanence: 1,
    compaction: 1,
    resourcePressure: 1,
    robustness: 1,
    stability: 1,
    futureFreedom: 1,
    overallScore: 10,
    breakdown: {},
    evaluatedAt: null,
    evidenceIds: [],
    metadata: {},
  }],
  evidenceIds: [],
  metadata: { searchSpaceId: "space:a" },
});

const plan = (id: string, candidateIds: string[], compatibilityScore = 1, expectedOperationalImpact = 1): PartialPlan => ({
  partialPlanId: id,
  candidateIds,
  compatibilityScore,
  expectedOperationalImpact,
});

const unit = (partialPlan: PartialPlan, candidates: Candidate[]): PartialPlanDecisionUnit => ({
  partialPlan,
  candidates,
  syntheticCandidate: { ...candidate(`synthetic:${partialPlan.partialPlanId}`, []), operationalValues: candidates.flatMap((item) => item.operationalValues) },
});

test("assembleGlobalSolutions builds one solution for one Partial Plan", () => {
  const result = assembleGlobalSolutions([unit(plan("partial-plan:1", ["candidate:1"]), [candidate("candidate:1")])]);
  assert.equal(result.globalSolutions.length, 1);
  assert.deepEqual(result.globalSolutions[0].partialPlanIds, ["partial-plan:1"]);
});

test("assembleGlobalSolutions builds multiple compatible global solutions in deterministic winning order", () => {
  const result = assembleGlobalSolutions([
    unit(plan("partial-plan:b", ["candidate:2"], 0.8, 2), [candidate("candidate:2", [assignment(2, 2, "2026-06-28T09:00:00.000Z", "2026-06-28T10:00:00.000Z", 2)])]),
    unit(plan("partial-plan:a", ["candidate:1"], 1, 1), [candidate("candidate:1")]),
  ]);
  assert.equal(result.globalSolutions.length, 3);
  assert.equal(result.globalSolutions[0].solutionId, "global-solution:partial-plan:a+partial-plan:b");
  assert.equal(result.summary.winningSolutionId, result.globalSolutions[0].solutionId);
});

test("assembleGlobalSolutions discards evident resource, temporal and space incompatibilities", () => {
  const result = assembleGlobalSolutions([
    unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", [assignment(1, 7)])]),
    unit(plan("partial-plan:b", ["candidate:2"]), [candidate("candidate:2", [assignment(2, 7)])]),
  ]);
  assert.equal(result.summary.discardedCompositionCount, 1);
  assert.equal(result.globalSolutions.some((solution) => solution.partialPlanIds.length === 2), false);
  assert.equal(result.evidence.some((item) => item.kind === "global-solution-composition-discarded"), true);
});

test("assembleGlobalSolutions handles an empty solution set", () => {
  const result = assembleGlobalSolutions([]);
  assert.equal(result.globalSolutions.length, 0);
  assert.equal(result.summary.winningSolutionId, null);
});

test("assembleGlobalSolutions is deterministic, serializable, structurally equal and non-mutating", () => {
  const source = [unit(plan("partial-plan:1", ["candidate:1"]), [candidate("candidate:1")])];
  const before = stableStringify(source);
  const first = assembleGlobalSolutions(source, { createdAt: "2026-06-28T00:00:00.000Z" });
  const second = assembleGlobalSolutions(source, { createdAt: "2026-06-28T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(stableStringify(source), before);
});
