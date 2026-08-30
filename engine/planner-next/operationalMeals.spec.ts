import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Window } from "./contracts";
import { assessOperationalMealFutureFeasibility, probeOperationalMealFutureFeasibility } from "./operationalMeals";

const availability = (start = 0, end = 120): Window[] => [{ start, end }];
function problem(duration = 75): PlannerNextProblem {
  return {
    day: { start: 0, end: 120 },
    spaces: [{ id: "meal", availability: availability() }, { id: "work", availability: availability() }],
    resources: [{ id: "resource-a", availability: availability(), presencePreference: "OFF", transitionMinutes: 0 }, { id: "resource-b", availability: availability(), presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [], coaches: [{ id: "coach", availability: availability() }], tasks: [],
    mainFlow: { spaceId: "work", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 100 }, searchPolicy: "EXACT_CONSTRUCTIVE",
    operationalMealPolicies: [{ id: "meal-policy", window: { start: 0, end: 75 }, duration, resourceIds: ["resource-a"], spaceIds: [] }],
  };
}
const task = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: "blocker", kind: "auxiliary", participantId: "participant", duration: 75, spaceId: "work",
  dependencies: [], requiredResourceIds: ["resource-a"], start: 0, end: 75, ...overrides,
});

test("75 minute policy with exactly one full interval is feasible", () => {
  const result = probeOperationalMealFutureFeasibility(problem(), []);
  assert.equal(result.feasible, true); assert.equal(result.candidateCountByPolicyId["meal-policy"], 1);
});

test("a provisional task consuming the final interval proves zero domain", () => {
  const source = problem(), added = task(), result = probeOperationalMealFutureFeasibility(source, [added], [added]);
  assert.equal(result.feasible, false); assert.equal(result.zeroDomainPrunes, 1); assert.deepEqual(result.blockingPolicyIds, ["meal-policy"]);
});

test("an unrelated task does not recalculate a policy", () => {
  const source = problem(), added = task({ requiredResourceIds: [], spaceId: "work" });
  const result = probeOperationalMealFutureFeasibility(source, [added], [added]);
  assert.equal(result.affectedPoliciesChecked, 0); assert.equal(result.analyticDomainBuilds, 0);
});

test("all policy resources must have common availability", () => {
  const source = problem(20); source.operationalMealPolicies![0]!.resourceIds.push("resource-b");
  source.resources[0]!.availability = availability(0, 30); source.resources[1]!.availability = availability(30, 60);
  assert.equal(probeOperationalMealFutureFeasibility(source, []).feasible, false);
});

test("space and resource scopes must both be free", () => {
  const source = problem(); source.operationalMealPolicies![0]!.spaceIds.push("meal");
  const blocker = task({ requiredResourceIds: [], spaceId: "meal" });
  assert.equal(probeOperationalMealFutureFeasibility(source, [blocker]).feasible, false);
});

test("fragment equal to duration remains feasible while shorter fragments prune", () => {
  const equal = problem(20); equal.resources[0]!.availability = [{ start: 0, end: 20 }, { start: 30, end: 40 }];
  assert.equal(probeOperationalMealFutureFeasibility(equal, []).feasible, true);
  equal.resources[0]!.availability = [{ start: 0, end: 19 }, { start: 30, end: 49 }];
  assert.equal(probeOperationalMealFutureFeasibility(equal, []).feasible, false);
});

test("grid boundaries are counted analytically and exactly", () => {
  const source = problem(10); source.operationalMealPolicies![0]!.window = { start: 2, end: 22 };
  source.resources[0]!.availability = [{ start: 3, end: 17 }];
  const result = probeOperationalMealFutureFeasibility(source, []);
  assert.equal(result.logicalGridStarts, 3); assert.equal(result.candidateCountByPolicyId["meal-policy"], 1);
});

test("probe is deterministic and invariant to collection order", () => {
  const source = problem(20); source.operationalMealPolicies!.push({ id: "second", window: { start: 0, end: 75 }, duration: 20, resourceIds: ["resource-b", "resource-a"], spaceIds: ["meal"] });
  const first = probeOperationalMealFutureFeasibility(source, []);
  source.resources.reverse(); source.spaces.reverse(); source.operationalMealPolicies!.reverse(); source.operationalMealPolicies![0]!.resourceIds.reverse();
  assert.deepEqual(probeOperationalMealFutureFeasibility(source, []), first);
});

test("cheap probe evaluates no starts and remains separate from candidate enumeration", () => {
  const result = probeOperationalMealFutureFeasibility(problem(), []);
  assert.equal(result.actuallyEvaluatedStarts, 0);
  assert.doesNotMatch(probeOperationalMealFutureFeasibility.toString(), /operationalMealCandidates/);
  assert.doesNotMatch(probeOperationalMealFutureFeasibility.toString(), /start\s*\+=/);
});

test("existing exact materialization result is unchanged", () => {
  const source = problem(20), budget = { remaining: 100 };
  const result = assessOperationalMealFutureFeasibility(source, [], budget, "MATERIALIZE");
  assert.equal(result.complete, true); assert.deepEqual(result.scheduled.map(({ start, end }) => ({ start, end })), [{ start: 0, end: 20 }]);
});
