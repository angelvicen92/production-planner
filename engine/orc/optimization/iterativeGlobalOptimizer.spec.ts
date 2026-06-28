import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, PartialPlan } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import type { PartialPlanDecisionUnit } from "../decision/decisionEngine";
import { optimizeGlobalSolution } from "./iterativeGlobalOptimizer";

const assignment = (taskId: number, resourceId: number, start = "2026-06-28T08:00:00.000Z", end = "2026-06-28T09:00:00.000Z", spaceId = 1) => ({ taskId, startPlanned: start, endPlanned: end, spaceId, resourceIds: [resourceId] });

const candidate = (id: string, score: number, assignments = [assignment(Number(id.replace(/\D/g, "")) || 1, Number(id.replace(/\D/g, "")) || 1)]): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments,
  operationalValues: [{ simulatedStateId: `sim:${id}`, continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore: score, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} }],
  evidenceIds: [],
  metadata: { searchSpaceId: "space:a" },
});

const plan = (id: string, candidateIds: string[], compatibilityScore = 1, expectedOperationalImpact = 1): PartialPlan => ({ partialPlanId: id, candidateIds, compatibilityScore, expectedOperationalImpact });

const unit = (partialPlan: PartialPlan, candidates: Candidate[]): PartialPlanDecisionUnit => ({ partialPlan, candidates, syntheticCandidate: { ...candidate(`synthetic:${partialPlan.partialPlanId}`, 0, []), operationalValues: candidates.flatMap((item) => item.operationalValues) } });

const solution = (ids: string[], score: number) => ({ solutionId: `global-solution:${ids.join("+")}`, partialPlanIds: ids, compatibilityScore: 1, aggregatedEvaluationScore: score, explanation: "test solution" });

test("optimizeGlobalSolution keeps a solution with no improvements unchanged", () => {
  const units = [unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", 10)])];
  const result = optimizeGlobalSolution(solution(["partial-plan:a"], 10), units);
  assert.deepEqual(result.solution.partialPlanIds, ["partial-plan:a"]);
  assert.equal(result.iterations.length, 0);
});

test("optimizeGlobalSolution accepts one compatible score improvement", () => {
  const units = [unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", 10)]), unit(plan("partial-plan:b", ["candidate:2"]), [candidate("candidate:2", 5, [assignment(2, 2, "2026-06-28T09:00:00.000Z", "2026-06-28T10:00:00.000Z", 2)])])];
  const result = optimizeGlobalSolution(solution(["partial-plan:a"], 10), units);
  assert.deepEqual(result.solution.partialPlanIds, ["partial-plan:a", "partial-plan:b"]);
  assert.equal(result.solution.aggregatedEvaluationScore, 15);
  assert.equal(result.iterations[0].accepted, true);
});

test("optimizeGlobalSolution accepts multiple deterministic improvements", () => {
  const units = [unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", 10)]), unit(plan("partial-plan:b", ["candidate:2"]), [candidate("candidate:2", 5, [assignment(2, 2, "2026-06-28T09:00:00.000Z", "2026-06-28T10:00:00.000Z", 2)])]), unit(plan("partial-plan:c", ["candidate:3"]), [candidate("candidate:3", 7, [assignment(3, 3, "2026-06-28T10:00:00.000Z", "2026-06-28T11:00:00.000Z", 3)])])];
  const result = optimizeGlobalSolution(solution(["partial-plan:a"], 10), units);
  assert.equal(result.iterations.filter((iteration) => iteration.accepted).length, 2);
  assert.equal(result.solution.aggregatedEvaluationScore, 22);
});

test("optimizeGlobalSolution rejects incompatible operators and never accepts worse solutions", () => {
  const units = [unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", 10, [assignment(1, 7)])]), unit(plan("partial-plan:b", ["candidate:2"]), [candidate("candidate:2", 5, [assignment(2, 7)])])];
  const result = optimizeGlobalSolution(solution(["partial-plan:a"], 10), units);
  assert.equal(result.iterations[0].accepted, false);
  assert.equal(result.solution.aggregatedEvaluationScore, 10);
  assert.equal(result.evidence.some((item) => item.data.reason === "rejected-incompatible"), true);
});

test("optimizeGlobalSolution is deterministic, serializable, structurally equal and non-mutating", () => {
  const units = [unit(plan("partial-plan:a", ["candidate:1"]), [candidate("candidate:1", 10)]), unit(plan("partial-plan:b", ["candidate:2"]), [candidate("candidate:2", 5, [assignment(2, 2, "2026-06-28T09:00:00.000Z", "2026-06-28T10:00:00.000Z", 2)])])];
  const source = solution(["partial-plan:a"], 10);
  const beforeUnits = stableStringify(units);
  const beforeSolution = stableStringify(source);
  const first = optimizeGlobalSolution(source, units, { createdAt: "2026-06-28T00:00:00.000Z" });
  const second = optimizeGlobalSolution(source, units, { createdAt: "2026-06-28T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(stableStringify(units), beforeUnits);
  assert.equal(stableStringify(source), beforeSolution);
});
