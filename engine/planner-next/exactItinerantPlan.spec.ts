import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { compareCompleteParticipantQuality, constructExactItinerantPlan,
  constructFirstHardValidExactItinerantPlan, runExactItinerantPlanSearch } from "./exactItinerantPlan";
import { canPlaceTask } from "./placement";
import { validatePlan } from "./validate";

function problem(auxiliaries: Task[]): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  const participantIds = ["core", ...auxiliaries.flatMap((task) => task.kind === "technical" ? [] : [task.participantId])];
  const spaceIds = ["main", "vocal", ...auxiliaries.map(({ spaceId }) => spaceId)];
  return {
    day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 },
    spaces: [...new Set(spaceIds)].map((id) => ({ id, availability })),
    resources: [{ id: "unit", availability, presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [...new Set(participantIds)].map((id) => ({ id, availability })),
    coaches: [{ id: "coach", availability }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...auxiliaries,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 },
    searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

const auxiliary = (id: string, participantId: string, availability: Array<{ start: number; end: number }>,
  requiredResourceIds: string[] = []): Task => ({ id, kind: "auxiliary", participantId, duration: 10,
  spaceId: `space-${id}`, dependencies: [], availability, requiredResourceIds });

function coreLeafContinuationProblem(): PlannerNextProblem {
  const input = problem([auxiliary("standalone", "core", [{ start: 70, end: 80 }])]);
  const availability = [{ start: 0, end: 120 }];
  input.participants.push({ id: "other", availability });
  input.spaces.push({ id: "vocal-other", availability });
  input.tasks.push(
    { id: "vocal-other", kind: "vocal", participantId: "other", coachId: "coach", duration: 10,
      spaceId: "vocal-other", dependencies: [] },
    { id: "main-other", kind: "main", participantId: "other", coachId: "coach", duration: 10,
      spaceId: "main", dependencies: ["vocal-other"], blockKey: "coach" },
  );
  return input;
}

test("compatible standalone tasks complete atomically and preserve the exact core", () => {
  const input = problem([auxiliary("a", "a", [{ start: 0, end: 20 }]), auxiliary("b", "b", [{ start: 20, end: 40 }])]);
  const before = structuredClone(input), core = constructExactMainAndFeederCore(input), result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.scheduledTasks.length, 4);
  assert.deepEqual(result.scheduledTasks.filter(({ id }) => new Set(core.scheduledTasks.map((task) => task.id)).has(id)), core.scheduledTasks);
  assert.equal(validatePlan(input, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
  assert.deepEqual(input, before); assert.deepEqual(result.remainingTaskIds, []);
  assert.equal(result.evidence.standaloneForwardImpactedTaskChecks, 0);
});

test("EXACT_CONSTRUCTIVE schedules joint groups as one atomic work item", () => {
  const input = problem([
    { ...auxiliary("joint-a", "a", [{ start: 20, end: 40 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
    { ...auxiliary("joint-b", "b", [{ start: 20, end: 40 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
  ]);
  const result = constructExactItinerantPlan(input);
  const members = result.scheduledTasks.filter(({ jointGroupId }) => jointGroupId === "group");
  assert.equal(result.status, "COMPLETE");
  assert.equal(members.length, 2);
  assert.equal(members[0]!.start, members[1]!.start);
  assert.equal(validatePlan(input, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
});

test("EXACT_CONSTRUCTIVE schedules a technical dependency chain atomically", () => {
  const input = problem([
    { id: "technical-a", kind: "technical", duration: 10, spaceId: "technical-a", dependencies: [], requiredResourceIds: ["unit"], availability: [{ start: 20, end: 40 }] },
    { id: "technical-b", kind: "technical", duration: 10, spaceId: "technical-b", dependencies: ["technical-a"], requiredResourceIds: ["unit"], availability: [{ start: 20, end: 40 }] },
  ]);
  const result = constructExactItinerantPlan(input);
  const first = result.scheduledTasks.find(({ id }) => id === "technical-a")!;
  const second = result.scheduledTasks.find(({ id }) => id === "technical-b")!;
  assert.equal(result.status, "COMPLETE");
  assert.ok(first.end <= second.start);
  assert.equal(validatePlan(input, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
});

test("shared resources never overlap and the narrower task is selected first", () => {
  const input = problem([
    auxiliary("flexible", "a", [{ start: 0, end: 60 }], ["unit"]),
    auxiliary("narrow", "b", [{ start: 10, end: 20 }], ["unit"]),
  ]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.evidence.selectedStandaloneSelectionOrder[0], "narrow");
  const tasks = result.scheduledTasks.filter(({ id }) => id === "flexible" || id === "narrow").sort((a, b) => a.start - b.start);
  assert.ok(tasks[0]!.end <= tasks[1]!.start); assert.equal(result.evidence.standaloneMaximumDepth, 2);
});

test("bestK=1 retains a deferred standalone start", () => {
  const input = problem([
    auxiliary("a-first", "shared", [{ start: 0, end: 30 }], ["unit"]),
    auxiliary("z-fixed", "other", [{ start: 0, end: 10 }], ["unit"]),
  ]);
  input.tasks.find(({ id }) => id === "a-first")!.duration = 20;
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(input.budget.bestK, 1);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "z-fixed")!.start, 0);
});

test("standalone DFS backtracks from a valid start that blocks an equal-scarcity task", () => {
  const input = problem([
    auxiliary("a", "a", [{ start: 0, end: 10 }, { start: 10, end: 20 }], ["unit"]),
    auxiliary("b", "b", [{ start: 0, end: 15 }], ["unit"]),
  ]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.ok(result.evidence.standaloneBacktracks > 0);
  assert.deepEqual(result.evidence.selectedStandaloneSelectionOrder, ["a", "b"]);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "a")!.start, 10);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "b")!.start, 0);
});

test("a blocking first core leaf is rejected and a later hard-valid core leaf completes standalone", () => {
  const input = coreLeafContinuationProblem(), snapshot = structuredClone(input);
  const isolated = constructExactMainAndFeederCore(input), standalone = input.tasks.find(({ id }) => id === "standalone")!;
  assert.equal(isolated.status, "COMPLETE");
  assert.equal(isolated.scheduledTasks.find(({ id }) => id === "vocal")!.start, 70);
  assert.equal([...Array(3)].some((_, index) => canPlaceTask(input, standalone, 70 + index * 5, isolated.scheduledTasks)), false);
  const integrated = constructExactItinerantPlan(input);
  assert.equal(integrated.status, "COMPLETE"); assert.ok(integrated.evidence.standaloneForwardPrunes > 0);
  assert.ok(integrated.evidence.standaloneForwardStartChecks > 0);
  assert.equal(integrated.evidence.standaloneForwardBranches, 0);
  assert.equal(integrated.evidence.coreLeavesRejectedByStandalone, 0);
  assert.ok(integrated.evidence.firstStandaloneForwardPruneDepth! < integrated.evidence.coreMaximumDepth);
  assert.equal(integrated.evidence.lastStandaloneForwardBlockingTaskId, "standalone");
  assert.equal(integrated.evidence.standaloneSearchInvocations, 1);
  assert.notEqual(integrated.scheduledTasks.find(({ id }) => id === "vocal")!.start,
    isolated.scheduledTasks.find(({ id }) => id === "vocal")!.start);
  assert.equal(validatePlan(input, integrated.scheduledTasks, [], integrated.scheduledSpaceMeals).hardValid, true);
  assert.deepEqual(input, snapshot); assert.equal(input.budget.bestK, 1);
});

test("the last accumulating core occupation is recorded when it removes a prior witness", () => {
  const input = problem([auxiliary("standalone", "standalone-person", [{ start: 80, end: 105 }], ["unit"])]);
  const availability = [{ start: 0, end: 120 }];
  input.participants.push({ id: "other", availability }); input.spaces.push({ id: "vocal-other", availability });
  input.tasks.find(({ id }) => id === "main")!.requiredResourceIds = ["unit"];
  input.tasks.push(
    { id: "vocal-other", kind: "vocal", participantId: "other", coachId: "coach", duration: 10,
      spaceId: "vocal-other", dependencies: [] },
    { id: "main-other", kind: "main", participantId: "other", coachId: "coach", duration: 10,
      spaceId: "main", dependencies: ["vocal-other"], blockKey: "coach", requiredResourceIds: ["unit"] },
  );
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "INFEASIBLE"); assert.ok(result.evidence.standaloneForwardWitnessesFound > 0);
  assert.ok((result.evidence.standaloneForwardPrunesByDepth["2"] ?? 0) > 0);
  assert.equal(result.evidence.lastStandaloneForwardBlockingTaskId, "standalone");
  assert.ok(result.evidence.lastStandaloneForwardCausingCoreTaskIds.some((id) => id.startsWith("main")));
  assert.deepEqual(result.scheduledTasks, []);
});

test("zero alternatives are infeasible and failures publish no partial core", () => {
  const input = problem([auxiliary("impossible", "a", [{ start: 0, end: 5 }])]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "INFEASIBLE"); assert.ok(result.evidence.standaloneZeroAlternativePrunes > 0);
  assert.deepEqual(result.scheduledTasks, []); assert.deepEqual(result.scheduledSpaceMeals, []);assert.deepEqual(result.scheduledItinerantUnitMeals,[]);
});

test("unsupported standalone shapes are explicit and atomic", () => {
  const input = problem([{ id: "technical", kind: "technical", duration: 10, spaceId: "technical", dependencies: [] }]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "UNSUPPORTED_STANDALONE_SHAPE");
  assert.deepEqual(result.scheduledItinerantUnitMeals, []);
  assert.ok(result.evidence.reasonCodes.includes("UNSUPPORTED_STANDALONE_TASK_KIND:technical"));
  assert.deepEqual(result.scheduledTasks, []);
});

test("the global branch threshold completes at B and B-1 exhausts exactly", () => {
  const baseline = coreLeafContinuationProblem();
  const complete = constructExactItinerantPlan(baseline); assert.equal(complete.status, "COMPLETE");
  assert.ok(complete.evidence.standaloneForwardPrunes > 0);
  const threshold = complete.evidence.branchesExplored;
  const exact = coreLeafContinuationProblem(); exact.budget.maxBranchExpansions = threshold;
  const atThreshold = constructExactItinerantPlan(exact); assert.equal(atThreshold.status, "COMPLETE");
  assert.deepEqual(atThreshold.scheduledTasks, complete.scheduledTasks);
  const below = coreLeafContinuationProblem(); below.budget.maxBranchExpansions = threshold - 1;
  const exhausted = constructExactItinerantPlan(below);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(exhausted.evidence.branchesExplored, threshold - 1);assert.deepEqual(exhausted.scheduledItinerantUnitMeals,[]);
  assert.equal(exhausted.evidence.branchesExplored, exhausted.evidence.coreBranches + exhausted.evidence.standaloneBranches);
  assert.ok(exhausted.evidence.standaloneForwardPrunes > 0);
  assert.equal(exhausted.evidence.lastExhaustionPhase, "STANDALONE");
  assert.deepEqual(exhausted.scheduledTasks, []);
});

test("results are deterministic and invariant to input collection order", () => {
  const create = () => problem([auxiliary("a", "a", [{ start: 0, end: 20 }]), auxiliary("b", "b", [{ start: 20, end: 40 }])]);
  const first = constructExactItinerantPlan(create()), second = constructExactItinerantPlan(create()), reversedInput = create();
  reversedInput.tasks.reverse(); reversedInput.participants.reverse(); reversedInput.spaces.reverse(); reversedInput.resources.reverse();
  const reversed = constructExactItinerantPlan(reversedInput);
  assert.deepEqual(first, second); assert.equal(first.evidence.fullFingerprint, reversed.evidence.fullFingerprint);
  assert.deepEqual(first.scheduledTasks, reversed.scheduledTasks);
});

test("complete quality replaces only a strictly dominating incumbent", () => {
  const incumbent = { maximumParticipantIdleMinutes: 20, maximumSingleGapMinutes: 15, totalIdleMinutes: 30,
    totalGapCount: 2, totalSpaceChangeCount: 4 };
  assert.equal(compareCompleteParticipantQuality({ ...incumbent, totalIdleMinutes: 25 }, incumbent), 1);
  assert.equal(compareCompleteParticipantQuality({ ...incumbent, totalIdleMinutes: 25, maximumParticipantIdleMinutes: 25 }, incumbent), 0);
  assert.equal(compareCompleteParticipantQuality({ ...incumbent, maximumParticipantIdleMinutes: 15, maximumSingleGapMinutes: 20 }, incumbent), 0);
  assert.equal(compareCompleteParticipantQuality({ ...incumbent }, incumbent), -1);
});

test("the public constructor selects the best dominant leaf while the compatibility constructor remains first-complete", () => {
  const create = () => problem([auxiliary("standalone", "core", [{ start: 0, end: 110 }])]);
  const snapshot = structuredClone(create());
  const historical = constructFirstHardValidExactItinerantPlan(create());
  const explicitFirst = runExactItinerantPlanSearch(create(), { standaloneCompletionSelection: "FIRST_HARD_VALID" });
  const selected = runExactItinerantPlanSearch(snapshot, { standaloneCompletionSelection: "BEST_DOMINATING_WITHIN_BUDGET" });
  assert.deepEqual(explicitFirst, historical);
  assert.deepEqual(constructExactItinerantPlan(create()), selected);
  assert.equal(historical.evidence.completePlansObserved, 1);
  assert.equal(selected.status, "COMPLETE"); assert.equal(selected.complete, true);
  assert.ok(selected.evidence.completePlansObserved > 1); assert.ok(selected.evidence.completeIncumbentReplacements > 1);
  assert.notEqual(selected.evidence.firstCompleteFingerprint, selected.evidence.selectedCompleteFingerprint);
  assert.equal(compareCompleteParticipantQuality(selected.evidence.selectedCompleteQuality!, selected.evidence.firstCompleteQuality!), 1);
  assert.equal(selected.evidence.branchesExplored, selected.evidence.coreBranches + selected.evidence.standaloneBranches);
  assert.equal(validatePlan(snapshot, selected.scheduledTasks, [], selected.scheduledSpaceMeals).hardValid, true);
  assert.deepEqual(snapshot, create());
});

test("a core-only problem preserves the historical first-complete route", () => {
  const input = problem([]);
  const historical = constructFirstHardValidExactItinerantPlan(input);
  const accepted = constructExactItinerantPlan(input);
  assert.deepEqual(accepted, historical);
  assert.equal(accepted.evidence.completeSelectionMode, "FIRST_HARD_VALID");
  assert.equal(accepted.evidence.completePlansObserved, 1);
});

test("budget exhaustion publishes an incumbent atomically but never a partial plan", () => {
  const create = () => problem([auxiliary("standalone", "core", [{ start: 0, end: 110 }])]);
  const first = runExactItinerantPlanSearch(create(), { standaloneCompletionSelection: "FIRST_HARD_VALID" });
  const withIncumbent = create(); withIncumbent.budget.maxBranchExpansions = first.evidence.branchesExplored;
  const kept = runExactItinerantPlanSearch(withIncumbent, { standaloneCompletionSelection: "BEST_DOMINATING_WITHIN_BUDGET" });
  assert.equal(kept.status, "COMPLETE"); assert.equal(kept.evidence.completeSelectionStoppedByBudget, true);
  assert.equal(kept.scheduledTasks.length, withIncumbent.tasks.length);
  const withoutIncumbent = create(); withoutIncumbent.budget.maxBranchExpansions = first.evidence.branchesExplored - 1;
  const empty = runExactItinerantPlanSearch(withoutIncumbent, { standaloneCompletionSelection: "BEST_DOMINATING_WITHIN_BUDGET" });
  assert.equal(empty.status, "BRANCH_BUDGET_EXHAUSTED"); assert.deepEqual(empty.scheduledTasks, []);assert.deepEqual(empty.scheduledItinerantUnitMeals,[]);
});
