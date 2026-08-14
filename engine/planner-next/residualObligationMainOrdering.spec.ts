import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { constructFirstHardValidExactItinerantPlan, runExactItinerantPlanSearch } from "./exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "./participantItineraryQuality";
import { createResidualObligationMainOrderer } from "./residualObligationAlignment";
import { validatePlan } from "./validate";

function fixture(): PlannerNextProblem {
  const all = [{ start: 0, end: 180 }];
  return { day: { start: 0, end: 180 }, protectedMeal: { start: 170, end: 180 },
    spaces: ["main", "vocal-a", "vocal-b", "aux"].map((id) => ({ id, availability: all })), resources: [],
    participants: ["a", "b"].map((id) => ({ id, availability: all })), coaches: [{ id: "coach", availability: all }],
    tasks: [
      { id: "vocal-a", kind: "vocal", participantId: "a", coachId: "coach", duration: 10, spaceId: "vocal-a", dependencies: [] },
      { id: "main-a", kind: "main", participantId: "a", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal-a"], blockKey: "coach" },
      { id: "vocal-b", kind: "vocal", participantId: "b", coachId: "coach", duration: 10, spaceId: "vocal-b", dependencies: [] },
      { id: "main-b", kind: "main", participantId: "b", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal-b"], blockKey: "coach" },
      { id: "late-a", kind: "auxiliary", participantId: "a", duration: 10, spaceId: "aux", dependencies: [], availability: [{ start: 140, end: 160 }] },
    ], mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0, auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 }, searchPolicy: "EXACT_CONSTRUCTIVE" };
}
function experimental(input: PlannerNextProblem) {
  const standalone = input.tasks.filter(({ kind }) => kind === "auxiliary");
  const orderer = createResidualObligationMainOrderer(input, standalone);
  return { result: runExactItinerantPlanSearch(input, { coreOrderer: orderer.options }), evidence: orderer.evidence };
}

test("matching witness remains authoritative over experimental residual ordering", () => {
  const input = fixture(), before = structuredClone(input), baseline = constructFirstHardValidExactItinerantPlan(input), changed = experimental(input);
  assert.equal(baseline.status, "COMPLETE"); assert.equal(changed.result.status, "COMPLETE"); assert.equal(input.budget.bestK, 1);
  assert.equal(baseline.scheduledTasks.find(({ id }) => id === "main-a")!.start, 90);
  assert.equal(changed.result.scheduledTasks.find(({ id }) => id === "main-b")!.start, 80);
  assert.equal(evaluateParticipantItineraryQuality(input, changed.result.scheduledTasks).summary.totalIdleMinutes,
    evaluateParticipantItineraryQuality(input, baseline.scheduledTasks).summary.totalIdleMinutes);
  assert.deepEqual(changed.result.scheduledTasks, baseline.scheduledTasks);
  assert.deepEqual(changed.result.scheduledTasks.map(({ id }) => id).sort(), baseline.scheduledTasks.map(({ id }) => id).sort());
  assert.equal(validatePlan(input, baseline.scheduledTasks, [], baseline.scheduledSpaceMeals).hardValid, true);
  assert.equal(validatePlan(input, changed.result.scheduledTasks, [], changed.result.scheduledSpaceMeals).hardValid, true);
  assert.ok(changed.evidence.firstCandidateChangedCount > 0); assert.ok(changed.evidence.candidatesRanked >= 3);
  assert.deepEqual(input, before);
});

test("experimental ordering is deterministic and invariant to collection and window order", () => {
  const first = experimental(fixture()), second = experimental(fixture()), reversed = fixture();
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.coaches.reverse();
  for (const participant of reversed.participants) participant.availability.reverse();
  for (const space of reversed.spaces) space.availability.reverse();
  const third = experimental(reversed);
  assert.deepEqual(first.result, second.result); assert.deepEqual(first.evidence, second.evidence);
  assert.deepEqual(first.result, third.result); assert.deepEqual(first.evidence, third.evidence);
});

test("the experimental runner remains atomic at the exact B/B-1 boundary", () => {
  const complete = experimental(fixture()).result, budget = complete.evidence.branchesExplored;
  const exact = fixture(); exact.budget.maxBranchExpansions = budget;
  assert.equal(experimental(exact).result.status, "COMPLETE");
  const below = fixture(); below.budget.maxBranchExpansions = budget - 1;
  const exhausted = experimental(below).result;
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(exhausted.evidence.branchesExplored, budget - 1);
  assert.equal(exhausted.evidence.branchesExplored, exhausted.evidence.coreBranches + exhausted.evidence.standaloneBranches);
  assert.deepEqual(exhausted.scheduledTasks, []); assert.deepEqual(exhausted.scheduledSpaceMeals, []);
});

test("a contextually preferred dead end leaves later alternatives available to backtracking", () => {
  const input = fixture();
  // Static estimation ignores occupations: main-a at the first slot ranks first but occupies its only standalone window.
  input.tasks.find(({ id }) => id === "late-a")!.availability = [{ start: 80, end: 90 }];
  const changed = experimental(input);
  assert.equal(changed.result.status, "COMPLETE"); assert.ok(changed.result.evidence.coreBacktracks > 0);
  assert.equal(validatePlan(input, changed.result.scheduledTasks, [], changed.result.scheduledSpaceMeals).hardValid, true);
  assert.equal(changed.result.scheduledTasks.length, input.tasks.length);
});
