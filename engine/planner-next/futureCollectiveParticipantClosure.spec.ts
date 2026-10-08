import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { PreparedFutureCollectiveParticipantClosure } from "./futureCollectiveParticipantClosure";
import { assessParticipantMealFutureFeasibility } from "./participantMeals";
import { participantGapMinutes } from "./participantTransition";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";

function fixture(slots = [0, 5, 10]): PlannerNextProblem {
  const availability = [{ start: 0, end: 50 }];
  const tasks: Task[] = ["a", "b", "c"].flatMap(id => [
    { id: `close-${id}`, kind: "auxiliary", participantId: id, duration: 5, spaceId: "shared", dependencies: [],
      availability: slots.map(start => ({ start, end: start + 5 })), participantMarginAfterMinutes: 0 },
    { id: `depart-${id}`, kind: "auxiliary", participantId: id, duration: 5, spaceId: "exit", dependencies: [`close-${id}`],
      participantMarginBeforeMinutes: 0 },
  ]);
  const direction = { minimumGroupSize: 1, maximumGroupSize: 3, minGapMinutes: 0, groupingWeight: 0 };
  return { day: availability[0]!, spaces: ["shared", "exit", "main", "vocal", "current"].map(id => ({ id, availability })),
    participants: ["a", "b", "c", "core"].map(id => ({ id, availability })), resources: [], coaches: [{ id: "coach", availability }], tasks,
    mainFlow: { spaceId: "main", preferredEnd: 50, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    transportPolicy: { arrival: { ...direction, taskIds: [] }, departure: { ...direction, taskIds: ["depart-a", "depart-b", "depart-c"] } },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 1000 }, searchPolicy: "EXACT_CONSTRUCTIVE" };
}

test("three obligations with individually nonempty domains and two slots have an exact Hall", () => {
  const result = new PreparedFutureCollectiveParticipantClosure(fixture([0, 5])).evaluate([], [], undefined, "NECESSARY_ONLY");
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.maximumMatching, 2);
  assert.deepEqual(result.hall, { closureTaskIds: ["close-a", "close-b", "close-c"], participantIds: ["a", "b", "c"],
    neighbourSlots: [0, 5], taskCount: 3, slotCount: 2 });
  assert.ok(Object.values(result.domains).every(domain => domain.length === 2));
});

test("three slots certify a complete, deterministic, cached closure and departure witness", () => {
  const problem = fixture(), saved = structuredClone(problem), authority = new PreparedFutureCollectiveParticipantClosure(problem);
  let branches = 0;
  const result = authority.evaluate([], [], () => { branches++; return true; });
  assert.equal(result.status, "PASS"); assert.equal(result.certified, true);
  assert.equal(result.maximumMatching, 3); assert.ok(result.witnessFingerprint);
  const cached = authority.evaluate([], [], () => { throw new Error("cache must consume no branches"); });
  assert.equal(cached.cacheHit, true); assert.equal(cached.branchesConsumed, 0);
  assert.equal(branches, result.branchesConsumed); assert.deepEqual(problem, saved);
  problem.tasks.reverse(); problem.transportPolicy!.departure.taskIds.reverse();
  const reversed = new PreparedFutureCollectiveParticipantClosure(problem).evaluate([]);
  assert.deepEqual(result.matching, reversed.matching); assert.deepEqual(result.domains, reversed.domains);
  assert.equal(result.witnessFingerprint, reversed.witnessFingerprint);
});

test("canonical participant default and before/after overrides determine exact closure starts", () => {
  const problem = fixture([10, 15, 20]); problem.participantTransitionMinutes = 5;
  const prior: Task = { id: "prior", kind: "auxiliary", participantId: "a", duration: 5, spaceId: "current", dependencies: [] };
  const close = problem.tasks.find(task => task.id === "close-a")!; close.dependencies = [prior.id];
  const fixed = [{ ...prior, start: 5, end: 10 }];
  assert.equal(participantGapMinutes(problem, prior, close), 5);
  assert.deepEqual(new PreparedFutureCollectiveParticipantClosure(problem).evaluate(fixed, [], undefined, "NECESSARY_ONLY").domains[close.id], [15, 20]);
  close.participantMarginBeforeMinutes = 0;
  assert.equal(participantGapMinutes(problem, prior, close), 0);
  assert.deepEqual(new PreparedFutureCollectiveParticipantClosure(problem).evaluate(fixed, [], undefined, "NECESSARY_ONLY").domains[close.id], [10, 15, 20]);
  fixed[0]!.participantMarginAfterMinutes = 10;
  assert.equal(participantGapMinutes(problem, fixed[0]!, close), 10);
  assert.deepEqual(new PreparedFutureCollectiveParticipantClosure(problem).evaluate(fixed, [], undefined, "NECESSARY_ONLY").domains[close.id], [20]);
});

test("terminal override zero allows consecutive departure; impossible departure removes the edge", () => {
  const problem = fixture([0, 5, 10]); problem.participantTransitionMinutes = 5;
  const departure = problem.tasks.find(task => task.id === "depart-a")!;
  departure.availability = [{ start: 5, end: 10 }];
  const result = new PreparedFutureCollectiveParticipantClosure(problem).evaluate([], [], undefined, "NECESSARY_ONLY");
  assert.deepEqual(result.domains["close-a"], [0]);
  assert.equal(result.status, "PASS");
  departure.availability = [{ start: 0, end: 5 }];
  const impossible = new PreparedFutureCollectiveParticipantClosure(problem).evaluate([], [], undefined, "NECESSARY_ONLY");
  assert.deepEqual(impossible.domains["close-a"], []); assert.equal(impossible.status, "INFEASIBLE");
});

test("the existing exact meal solver rejects M1 and finds M2 jointly with closure", () => {
  const problem = fixture(); problem.tasks.find(task => task.id === "close-a")!.availability = [{ start: 0, end: 5 }];
  problem.participantMeals = [{ id: "meal-a", sourceTaskId: "meal-source", participantId: "a", duration: 5,
    window: { start: 0, end: 10 }, status: "pending", dependencies: [] }];
  problem.participantMealCapacity = { maxSimultaneous: 1 };
  const authority = new PreparedFutureCollectiveParticipantClosure(problem);
  assert.equal(authority.evaluate([], [], undefined, "NECESSARY_ONLY").status, "PASS");
  assert.equal(authority.evaluate([]).reason, "MEALS_PENDING");
  const witness = assessParticipantMealFutureFeasibility(problem, [], { remaining: 100 }, "MATERIALIZE", (meals, complete) => {
    const result = authority.evaluate([], meals, undefined, complete ? "CERTIFY" : "NECESSARY_ONLY");
    return result.status === "INFEASIBLE" ? "REJECT" : result.status === "PASS" ? "ACCEPT" : "ABSTAIN";
  });
  assert.equal(witness.complete, true); assert.equal(witness.scheduled[0]?.start, 5); assert.equal(witness.rejectedCandidateCount, 1);
});

test("budget exhaustion and unsupported geometry abstain instead of reporting infeasibility", () => {
  const authority = new PreparedFutureCollectiveParticipantClosure(fixture());
  const exhausted = authority.evaluate([], [], () => false);
  assert.equal(exhausted.status, "ABSTAIN"); assert.equal(exhausted.reason, "BUDGET_EXHAUSTED");
  assert.equal(authority.evaluate([]).status, "PASS", "an exhausted answer must not poison the cache");
  let allowance = 1;
  const midMatching = authority.evaluate([], [], () => allowance-- > 0, "CERTIFY", [{ spaceId: "unused", start: 0, end: 5 }]);
  assert.equal(midMatching.status, "ABSTAIN"); assert.equal(midMatching.reason, "BUDGET_EXHAUSTED");
  const problem = fixture(); problem.tasks[0]!.duration = 10;
  assert.equal(new PreparedFutureCollectiveParticipantClosure(problem).evaluate([]).reason, "UNCERTIFIED_GEOMETRY");
  const mealProblem = fixture();
  const witness = assessParticipantMealFutureFeasibility(mealProblem, [], { remaining: 100 }, "MATERIALIZE", () => "BUDGET_EXHAUSTED");
  assert.equal(witness.complete, false); assert.deepEqual(witness.reasonCodes, ["PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED"]);
});

test("pending predecessor releases are preserved without selecting their placements", () => {
  const source = fixture([10, 15, 20]); source.participantTransitionMinutes = 5;
  for (const id of ["a", "b", "c"]) {
    source.spaces.push({ id: `prior-${id}`, availability: [{ start: 0, end: 50 }] });
    source.tasks.push({ id: `prior-${id}`, kind: "auxiliary", spaceId: `prior-${id}`, participantId: id,
      duration: 5, dependencies: [], availability: [{ start: 10, end: 15 }] });
    source.tasks.find(task => task.id === `close-${id}`)!.dependencies = [`prior-${id}`];
  }
  const saved = structuredClone(source);
  const result = new PreparedFutureCollectiveParticipantClosure(source).evaluate([], [], undefined, "NECESSARY_ONLY");
  assert.equal(result.status, "INFEASIBLE"); assert.equal(result.maximumMatching, 1);
  assert.deepEqual(result.domains, { "close-a": [20], "close-b": [20], "close-c": [20] });
  assert.deepEqual(result.releaseBoundsByClosure["close-a"], { earliestStart: 20, predecessorTaskIds: ["prior-a"] });
  assert.deepEqual(source, saved);
});

test("incomplete source identities and invalid meal witnesses cannot certify PASS", () => {
  const source = fixture(); source.transportPolicy!.departure.taskIds.push("missing");
  assert.equal(new PreparedFutureCollectiveParticipantClosure(source).evaluate([]).status, "ABSTAIN");
  const meals = fixture(); meals.participantMeals = [{ id: "meal", sourceTaskId: "meal-source", participantId: "a",
    duration: 5, window: { start: 20, end: 30 }, status: "pending" }];
  meals.participantMealCapacity = { maxSimultaneous: 1 };
  const result = new PreparedFutureCollectiveParticipantClosure(meals).evaluate([], [{ id: "meal", sourceTaskId: "meal-source",
    participantId: "a", duration: 5, start: 40, end: 45 }]);
  assert.equal(result.status, "ABSTAIN"); assert.equal(result.certified, false);
});

test("a meal candidate before a pending hard predecessor is rejected, then repaired by the same meal search", () => {
  const source = fixture();
  source.tasks.push({ id: "meal-prior", kind: "auxiliary", participantId: "a", spaceId: "current", duration: 5,
    dependencies: [], availability: [{ start: 15, end: 20 }] });
  source.participantMeals = [{ id: "meal", sourceTaskId: "meal-source", participantId: "a", duration: 5,
    window: { start: 15, end: 30 }, status: "pending", dependencies: ["meal-prior"] }];
  source.participantMealCapacity = { maxSimultaneous: 1 };
  const authority = new PreparedFutureCollectiveParticipantClosure(source);
  const witness = assessParticipantMealFutureFeasibility(source, [], { remaining: 100 }, "MATERIALIZE", (meals, complete) => {
    const result = authority.evaluate([], meals, undefined, complete ? "CERTIFY" : "NECESSARY_ONLY");
    return result.status === "PASS" ? "ACCEPT" : result.status === "INFEASIBLE" ? "REJECT" : "ABSTAIN";
  });
  assert.equal(witness.complete, true); assert.equal(witness.scheduled[0]?.start, 20);
  assert.equal(witness.rejectedCandidateCount, 1);
});

test("Stage backtracks from A to B; the future witness stays outside proposal and protection", () => {
  const source = fixture();
  for (const id of ["close-b", "close-c"]) source.tasks.find(task => task.id === id)!.availability = [{ start: 5, end: 15 }];
  const current: Task = { id: "current", kind: "auxiliary", participantId: "a", duration: 5, spaceId: "current", dependencies: [],
    availability: [{ start: 0, end: 5 }, { start: 15, end: 20 }] };
  const vocal: Task = { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 5, spaceId: "vocal", dependencies: [] };
  const main: Task = { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 5, spaceId: "main", dependencies: [vocal.id], blockKey: "coach" };
  source.tasks.push(current, vocal, main);
  const fixed = [{ ...vocal, start: 20, end: 25 }, { ...main, start: 25, end: 30 }];
  const scope = createPlanningScope({ kind: "ids", value: "current" }, {}, [current.id]);
  const assisted = buildAssistedProblem(source, scope, fixed, new Set(source.tasks.map(task => task.id)));
  const saved = structuredClone(assisted);
  assert.equal(assisted.problem.transportPolicy!.departure.taskIds.length, 0);
  assert.equal(assisted.problem.analyticalFutureParticipantClosure!.departure.taskIds.length, 3);
  const result = executeAssistedPlanning(assisted);
  assert.ok(result.proposal, JSON.stringify(result.evidence.reasonCodes));
  assert.equal(result.proposal.find(task => task.id === current.id)?.start, 15);
  assert.equal(result.proposal.some(task => task.id.startsWith("close-") || task.id.startsWith("depart-")), false);
  assert.ok(result.evidence.standaloneDiagnostic?.futureCollectiveClosureFirstPrune);
  assert.deepEqual(assisted, saved);
});
