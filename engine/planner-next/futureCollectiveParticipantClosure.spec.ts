import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { PreparedFutureCollectiveParticipantClosure } from "./futureCollectiveParticipantClosure";
import { assessParticipantMealFutureFeasibility } from "./participantMeals";
import { participantGapMinutes } from "./participantTransition";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { runExactItinerantPlanSearch } from "./exactItinerantPlan";
import { validatePlan } from "./validate";
import { materializeTerminalTransportDetailed } from "./transportGrouping";

function coreContext(source: PlannerNextProblem): ScheduledTask[] {
  const vocal: Task = { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 5, spaceId: "vocal", dependencies: [] };
  const main: Task = { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 5, spaceId: "main", dependencies: [vocal.id], blockKey: "coach" };
  source.tasks.push(vocal, main);
  return [{ ...vocal, start: 20, end: 25 }, { ...main, start: 25, end: 30 }];
}

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

test("an unsupported necessary geometry with a hard-valid continuation remains inconclusive, not infeasible", () => {
  const source = fixture([0, 10, 15]);
  const closeA = source.tasks.find(task => task.id === "close-a")!;
  closeA.duration = 10; closeA.availability = [{ start: 0, end: 10 }];
  const fixed = coreContext(source);
  const authority = new PreparedFutureCollectiveParticipantClosure(source);
  const necessary = authority.evaluate(fixed, [], undefined, "NECESSARY_ONLY");
  assert.equal(necessary.status, "ABSTAIN"); assert.equal(necessary.reason, "UNCERTIFIED_GEOMETRY");
  const starts: Record<string, number> = { "close-a": 0, "close-b": 10, "close-c": 15,
    "depart-a": 10, "depart-b": 15, "depart-c": 10 };
  const substantive = [...fixed, ...source.tasks.filter(task => task.id.startsWith("close-"))
    .map(task => ({ ...task, start: starts[task.id]!, end: starts[task.id]! + task.duration }))];
  const transport = materializeTerminalTransportDetailed(source, substantive, []);
  assert.equal(transport.status, "FEASIBLE");
  const completion = [...substantive, ...transport.scheduled!];
  const validation = validatePlan(source, completion);
  assert.equal(validation.hardValid, true, JSON.stringify(validation));
  const current: Task = { id: "current", kind: "auxiliary", participantId: "core", duration: 5,
    spaceId: "current", dependencies: [], availability: [{ start: 35, end: 45 }] };
  source.tasks.push(current);
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: current.id }, {}, [current.id]),
    fixed, new Set(source.tasks.map(task => task.id)));
  // Exercise the uncertainty contract without the newly composed exact producer.
  delete assisted.problem.analyticalFutureCollectiveContinuation;
  const result = runExactItinerantPlanSearch(assisted.problem, { fixedPlacements: assisted.protectedPlacements, fixedPlacementsAsContext: true });
  assert.equal(result.complete, false, "an unproved future must not be accepted");
  assert.equal(result.status, "UNSUPPORTED_STANDALONE_SHAPE");
  assert.ok(result.evidence.reasonCodes.includes("FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE"));
  assert.equal(result.evidence.standaloneCompleteLeafCount, 2, "both current alternatives remain explored");
});

test("individual predecessor release bounds cannot certify jointly conflicting pending prerequisites", () => {
  const source = fixture([10, 15]);
  source.tasks = source.tasks.filter(task => task.participantId !== "c");
  source.transportPolicy!.departure.taskIds = ["depart-a", "depart-b"];
  source.resources = [{ id: "exclusive", availability: [source.day], presencePreference: "OFF" }];
  for (const id of ["a", "b"]) {
    source.spaces.push({ id: `prior-${id}`, availability: [source.day] });
    const prior: Task = { id: `prior-${id}`, kind: "auxiliary", participantId: id, spaceId: `prior-${id}`,
      duration: 10, dependencies: [], requiredResourceIds: ["exclusive"], availability: [{ start: 0, end: 10 }] };
    source.tasks.push(prior); source.tasks.find(task => task.id === `close-${id}`)!.dependencies = [prior.id];
    assert.deepEqual([...exactTaskStartDomain(source, prior, []).starts()], [0]);
  }
  const priorA = source.tasks.find(task => task.id === "prior-a")!, priorB = source.tasks.find(task => task.id === "prior-b")!;
  assert.equal(canPlaceTask(source, priorB, 0, [{ ...priorA, start: 0, end: 10 }]), false);
  const authority = new PreparedFutureCollectiveParticipantClosure(source);
  assert.equal(authority.evaluate([], [], undefined, "NECESSARY_ONLY").status, "PASS");
  const result = authority.evaluate([]);
  assert.equal(result.maximumMatching, 2);
  assert.equal(result.status, "ABSTAIN"); assert.equal(result.certified, false);
  assert.equal(result.reason, "PENDING_PREDECESSORS"); assert.equal(result.witnessFingerprint, null);
  const invalidJointContext = [{ ...priorA, start: 0, end: 10 }, { ...priorB, start: 0, end: 10 }];
  assert.equal(authority.evaluate(invalidJointContext).certified, false, "supplied placements must also replay jointly");
  priorB.availability = [{ start: 10, end: 20 }];
  for (const task of source.tasks.filter(task => task.id.startsWith("close-"))) task.availability = [{ start: 20, end: 30 }];
  const saved = structuredClone(source);
  const repaired = new PreparedFutureCollectiveParticipantClosure(source).evaluate([
    { ...priorA, start: 0, end: 10 }, { ...priorB, start: 10, end: 20 }]);
  assert.equal(repaired.status, "PASS"); assert.equal(repaired.certified, true);
  assert.deepEqual(source, saved);
  const fixedCore = coreContext(source);
  const current: Task = { id: "current", kind: "auxiliary", participantId: "core", duration: 5,
    spaceId: "current", dependencies: [], availability: [{ start: 35, end: 40 }] };
  source.tasks.push(current);
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: current.id }, {}, [current.id]),
    fixedCore, new Set(source.tasks.map(task => task.id)));
  delete assisted.problem.analyticalFutureCollectiveContinuation;
  const before = structuredClone(assisted);
  const stage = runExactItinerantPlanSearch(assisted.problem, { fixedPlacements: assisted.protectedPlacements, fixedPlacementsAsContext: true });
  assert.equal(stage.status, "UNSUPPORTED_STANDALONE_SHAPE"); assert.equal(stage.complete, false);
  assert.deepEqual(stage.evidence.futureCollectiveClosurePendingPredecessorTaskIds, ["prior-a", "prior-b"]);
  assert.deepEqual(assisted, before, "a missing proof cannot create future placements or rewrite protection");
});

test("three obligations with individually nonempty domains and two slots have an exact Hall", () => {
  const result = new PreparedFutureCollectiveParticipantClosure(fixture([0, 5])).evaluate([], [], undefined, "NECESSARY_ONLY");
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.maximumMatching, 2);
  assert.deepEqual(result.hall, { closureTaskIds: ["close-a", "close-b", "close-c"], participantIds: ["a", "b", "c"],
    neighbourSlots: [0, 5], taskCount: 3, slotCount: 2 });
  assert.ok(Object.values(result.domains).every(domain => domain.length === 2));
});

test("affected-edge domain PASS never certifies the jointly deficient frontier",()=>{
  const source=fixture([0,5]),saved=structuredClone(source),authority=new PreparedFutureCollectiveParticipantClosure(source);
  for(const participantId of ["a","b","c"]){
    const result=authority.evaluateIndividualContinuation([], [{id:`edge-${participantId}`,kind:"auxiliary",participantId,
      duration:5,spaceId:"current",dependencies:[],start:20,end:25}],()=>{throw new Error("singleton domain lookup must not run matching search");});
    assert.equal(result.status,"PASS");assert.equal(result.certified,false);assert.equal(result.branchesConsumed,0);
  }
  assert.equal(authority.evaluate([],[],()=>true,"NECESSARY_ONLY").status,"INFEASIBLE");
  assert.deepEqual(source,saved);
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

test("closure certification replays grouped IN with its exact packet authority", () => {
  const source = fixture([10, 15, 20]);
  source.spaces.push({ id: "arrival", availability: [source.day] });
  const arrivals: ScheduledTask[] = ["a", "b", "c"].map(participantId => ({
    id: `arrival-${participantId}`, kind: "auxiliary", participantId, spaceId: "arrival", duration: 5,
    dependencies: [], start: 0, end: 5,
  }));
  source.tasks.push(...arrivals);
  for (const task of source.tasks.filter(task => task.id.startsWith("close-")))
    task.dependencies = [`arrival-${task.participantId}`];
  source.transportPolicy!.arrival = { ...source.transportPolicy!.arrival, taskIds: arrivals.map(task => task.id),
    targetGroupSize: 3, maximumGroupSize: 3, minGapMinutes: 30 };
  const saved = structuredClone(source);
  assert.equal(canPlaceTask(source, arrivals[0]!, 0, arrivals.slice(1)), false,
    "ordinary exclusive-space replay cannot certify a grouped arrival");
  const valid = new PreparedFutureCollectiveParticipantClosure(source).evaluate(arrivals);
  assert.equal(valid.certified, true, JSON.stringify(valid));
  const oversized = structuredClone(source); oversized.transportPolicy!.arrival.maximumGroupSize = 2;
  const invalidSize = new PreparedFutureCollectiveParticipantClosure(oversized).evaluate(arrivals);
  assert.equal(invalidSize.certified, false);
  assert.equal(invalidSize.uncertifiedPlacement?.reason, "ARRIVAL_GROUP_SIZE_INVALID");
  const invalidGap = new PreparedFutureCollectiveParticipantClosure(source).evaluate(arrivals.map((task, index) =>
    index === 2 ? { ...task, start: 5, end: 10 } : task));
  assert.equal(invalidGap.certified, false);
  assert.equal(invalidGap.uncertifiedPlacement?.reason, "ARRIVAL_GROUP_POLICY_REJECTED");
  assert.deepEqual(source, saved);
});

test("anchored INCLUDED and joint prerequisites require their exact operation replay", () => {
  const source = fixture([25, 30, 35]);
  source.resources = ["anchor-resource", "joint-resource"].map(id => ({ id, availability: [source.day],
    presencePreference: "OFF", transitionMinutes: id === "anchor-resource" ? 10 : 0 }));
  const operation: ScheduledTask[] = [
    { id: "before", kind: "auxiliary", participantId: "core", spaceId: "vocal", duration: 5,
      dependencies: [], requiredResourceIds: ["anchor-resource"], start: 0, end: 5 },
    { id: "anchor", kind: "main", participantId: "core", coachId: "coach", blockKey: "coach", spaceId: "main", duration: 5,
      dependencies: ["before"], requiredResourceIds: ["anchor-resource"], start: 5, end: 10 },
    { id: "after", kind: "auxiliary", participantId: "core", spaceId: "current", duration: 5,
      dependencies: ["anchor"], requiredResourceIds: ["anchor-resource"], start: 10, end: 15 },
  ];
  const joint: ScheduledTask[] = ["a", "b"].map(participantId => ({ id: `joint-${participantId}`, kind: "auxiliary",
    participantId, spaceId: "current", duration: 5, dependencies: ["after"], jointGroupId: "group",
    requiredResourceIds: ["joint-resource"], start: 15, end: 20 }));
  source.tasks.push(...operation, ...joint);
  source.anchoredAccompaniments = [{ id: "operation", anchorTaskId: "anchor", beforeTaskIds: ["before"], afterTaskIds: ["after"],
    adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  for (const participantId of ["a", "b", "c"])
    source.tasks.find(task => task.id === `close-${participantId}`)!.dependencies = [participantId === "c" ? "after" : `joint-${participantId}`];
  const fixed = [...operation, ...joint], saved = structuredClone(source);
  assert.equal(canPlaceTask(source, operation[0]!, 0, operation.slice(1)), false);
  assert.equal(canPlaceTask(source, joint[0]!, 15, [joint[1]!]), false);
  assert.equal(new PreparedFutureCollectiveParticipantClosure(source).evaluate(fixed).certified, true);
  const brokenAnchor = new PreparedFutureCollectiveParticipantClosure(source).evaluate(fixed.map(task =>
    task.id === "after" ? { ...task, start: 15, end: 20 } : task));
  assert.equal(brokenAnchor.certified, false);
  assert.equal(brokenAnchor.uncertifiedPlacement?.reason, "ANCHORED_OPERATION_REPLAY_REJECTED");
  const brokenJoint = new PreparedFutureCollectiveParticipantClosure(source).evaluate(fixed.map(task =>
    task.id === "joint-b" ? { ...task, start: 20, end: 25 } : task));
  assert.equal(brokenJoint.certified, false);
  assert.equal(brokenJoint.uncertifiedPlacement?.reason, "JOINT_OPERATION_REPLAY_REJECTED");
  const outsider: ScheduledTask = { id: "outsider", kind: "auxiliary", participantId: "c", spaceId: "exit", duration: 5,
    dependencies: [], requiredResourceIds: ["joint-resource"], start: 15, end: 20 };
  const blockedJoint = new PreparedFutureCollectiveParticipantClosure(source).evaluate([...fixed, outsider]);
  assert.equal(blockedJoint.certified, false);
  assert.equal(blockedJoint.uncertifiedPlacement?.reason, "JOINT_OPERATION_REPLAY_REJECTED");
  assert.deepEqual(source, saved);
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
  problem.tasks.push({ ...prior, participantMarginAfterMinutes: 10 });
  fixed[0]!.participantMarginAfterMinutes = 0;
  assert.deepEqual(new PreparedFutureCollectiveParticipantClosure(problem).evaluate(fixed, [], undefined, "NECESSARY_ONLY").domains[close.id], [10, 15, 20],
    "release bounds replay the concrete protected predecessor's canonical margin");
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
    const result = authority.evaluate([], meals, undefined, "NECESSARY_ONLY");
    return result.status === "PASS" ? "ACCEPT" : result.status === "INFEASIBLE" ? "REJECT" : "ABSTAIN";
  });
  assert.equal(witness.complete, true); assert.equal(witness.scheduled[0]?.start, 20);
  assert.equal(witness.rejectedCandidateCount, 1);
  assert.equal(authority.evaluate([], witness.scheduled).reason, "PENDING_PREDECESSORS");
  const prior = source.tasks.find(task => task.id === "meal-prior")!;
  assert.equal(authority.evaluate([{ ...prior, start: 15, end: 20 }], witness.scheduled).certified, true);
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
