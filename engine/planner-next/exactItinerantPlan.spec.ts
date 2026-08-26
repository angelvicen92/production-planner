import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledSpaceMeal, Task } from "./contracts";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { compareCompleteParticipantQuality, constructExactItinerantPlan,
  constructFirstHardValidExactItinerantPlan, runExactItinerantPlanSearch, standaloneJointGroupStartDomain } from "./exactItinerantPlan";
import { standaloneForwardDynamicDomain, standaloneForwardStaticDomain, tasksCanAffectEachOther } from "./exactItinerantPlan";
import { standaloneForwardAuthoritySignature } from "./exactItinerantPlan";
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
  const input = problem([auxiliary("standalone", "core", [{ start: 60, end: 70 }])]);
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
  assert.deepEqual(result.evidence.firstFeedableRunSizes, core.evidence.firstFeedableRunSizes);
  assert.deepEqual(result.evidence.firstFeedableRunSizes, [1]);
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

test("joint DFS intersects exact member domains instead of branching across the full day", () => {
  const create = () => problem([
    { ...auxiliary("joint-a", "a", [{ start: 20, end: 40 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
    { ...auxiliary("joint-b", "b", [{ start: 20, end: 40 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
  ]);
  const analytic = runExactItinerantPlanSearch(create());
  const oracle = runExactItinerantPlanSearch(create(), { jointGroupStartDomainMode: "FULL_GRID" });
  assert.equal(analytic.status, oracle.status);
  assert.equal(analytic.evidence.fullFingerprint, oracle.evidence.fullFingerprint);
  assert.deepEqual(analytic.evidence.selectedStandaloneStarts, oracle.evidence.selectedStandaloneStarts);
  assert.equal(analytic.evidence.jointGroupFullGridStarts, oracle.evidence.jointGroupFullGridStarts);
  assert.ok(analytic.evidence.jointGroupAnalyticallyEliminatedStarts > 0);
  assert.ok(analytic.evidence.jointGroupStartsEvaluated > 0);
  assert.ok(analytic.evidence.jointGroupStartsEvaluated <= analytic.evidence.jointGroupAnalyticEligibleStarts);
  assert.ok(analytic.evidence.jointGroupStartsEvaluated < oracle.evidence.jointGroupStartsEvaluated);
  assert.ok(oracle.evidence.jointGroupStartsEvaluated <= oracle.evidence.jointGroupFullGridStarts);
  assert.equal(analytic.evidence.standaloneBranches + analytic.evidence.coreBranches, analytic.evidence.branchesExplored);
});

test("joint common domain analytically applies participant, space, resource, dependency, and empty intersections", () => {
  const input = problem([
    { ...auxiliary("joint-a", "a", [{ start: 0, end: 100 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
    { ...auxiliary("joint-b", "b", [{ start: 20, end: 80 }], ["unit"]), spaceId: "joint", jointGroupId: "group", dependencies: ["pre"] },
    auxiliary("pre", "pre", [{ start: 0, end: 120 }]),
  ]);
  const members = input.tasks.filter(({ jointGroupId }) => jointGroupId === "group");
  // An unmaterialized predecessor does not constrain a domain merely because the joint is selected first.
  assert.deepEqual([...standaloneJointGroupStartDomain(input, members, []).starts()], [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]);
  const blocker = (id: string, start: number, end: number, fields: Partial<Task>) =>
    ({ ...auxiliary(id, "other", []), ...fields, start, end });
  const placed = [
    blocker("participant-block", 20, 30, { participantId: "a", spaceId: "other-a" }),
    blocker("space-block", 35, 45, { spaceId: "joint", participantId: "other-space" }),
    blocker("resource-block", 50, 60, { requiredResourceIds: ["unit"], spaceId: "other-resource" }),
    { ...input.tasks.find(({ id }) => id === "pre")!, start: 60, end: 70 },
  ];
  input.spaces.push({ id: "other-a", availability: [{ start: 0, end: 120 }] },
    { id: "other-resource", availability: [{ start: 0, end: 120 }] });
  assert.deepEqual([...standaloneJointGroupStartDomain(input, members, placed).starts()], [70]);
  const reversed = structuredClone(input); reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse();
  assert.deepEqual([...standaloneJointGroupStartDomain(reversed, [...members].reverse(), [...placed].reverse()).starts()], [70]);
  placed.push(blocker("empty", 70, 80, { spaceId: "joint", participantId: "empty" }));
  assert.equal(standaloneJointGroupStartDomain(input, members, placed).eligibleStartCount, 0);
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

test("bestK=1 revisits a worse technical-chain alternative when the preferred partial blocks completion",()=>{
  const fixed={...auxiliary("fixed","fixed",[{start:0,end:10}]),spaceId:"technical-a"};
  const input=problem([
    {id:"technical-a",kind:"technical",duration:10,spaceId:"technical-a",dependencies:[],requiredResourceIds:["unit"],availability:[{start:0,end:40}]},
    {id:"technical-b",kind:"technical",duration:10,spaceId:"technical-b",dependencies:["technical-a"],requiredResourceIds:["unit"],availability:[{start:0,end:40}]},
    fixed,
  ]);
  const result=runExactItinerantPlanSearch(input);
  assert.equal(result.status,"COMPLETE");
  assert.equal(result.scheduledTasks.find(({id})=>id==="fixed")?.start,0);
  assert.ok(result.scheduledTasks.find(({id})=>id==="technical-a")!.start>=10);
  assert.ok(result.evidence.technicalChainAlternativesDeferred>0);
  assert.ok(result.evidence.technicalChainAlternativesRevisited>0);
  assert.equal(validatePlan(input,result.scheduledTasks,[],result.scheduledSpaceMeals).hardValid,true);
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
  assert.equal(canPlaceTask(input, standalone, 60, isolated.scheduledTasks), false);
  const integrated = constructExactItinerantPlan(input);
  assert.equal(integrated.status, "COMPLETE"); assert.ok(integrated.evidence.standaloneForwardPrunes > 0);
  assert.equal(integrated.evidence.coreLeavesRejectedByStandalone, 0);
  assert.equal(integrated.evidence.firstStandaloneForwardPruneDepth, integrated.evidence.coreMaximumDepth);
  assert.equal(integrated.evidence.lastStandaloneForwardBlockingTaskId, "standalone");
  assert.equal(integrated.evidence.standaloneSearchInvocations, 1);
  assert.notEqual(integrated.scheduledTasks.find(({ id }) => id === "vocal")!.start,
    isolated.scheduledTasks.find(({ id }) => id === "vocal")!.start);
  assert.equal(validatePlan(input, integrated.scheduledTasks, [], integrated.scheduledSpaceMeals).hardValid, true);
  assert.deepEqual(input, snapshot); assert.equal(input.budget.bestK, 1);
});

test("derived feeder endpoints preserve a solution after historical endpoints fail", () => {
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
  assert.equal(result.status, "COMPLETE");
  assert.equal(validatePlan(input, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
  assert.ok(result.evidence.architecturesChecked > 1, "historical endpoints must retain priority");
});

test("secondary feasibility runs only after the accumulating core cohort is closed", () => {
  const blocking = { ...auxiliary("standalone-blocker", "standalone-person", [{ start: 0, end: 120 }], ["unit"]),
    duration: 120 };
  const input = problem([blocking]);
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
  assert.equal(result.status, "INFEASIBLE"); assert.equal(result.evidence.standaloneForwardWitnessesFound, 0);
  assert.ok((result.evidence.standaloneForwardPrunesByDepth["2"] ?? 0) > 0);
  assert.equal(result.evidence.lastStandaloneForwardBlockingTaskId, "standalone-blocker");
  assert.ok(result.evidence.lastStandaloneForwardCausingCoreTaskIds.some((id) => id.startsWith("main")));
  assert.deepEqual(result.scheduledTasks, []);
});

test("a current feeder blocker is repaired locally instead of producing an unsound causal backjump", () => {
  const input = problem([auxiliary("standalone-a", "a", [{ start:60, end:70 }])]);
  const availability=[{start:0,end:120}];
  input.participants=input.participants.filter(({id})=>id!=="core"&&id!=="a"&&id!=="b");
  input.participants.push({id:"a",availability},{id:"b",availability});
  input.spaces=input.spaces.filter(({id})=>id!=="vocal");
  input.spaces.push({id:"feed",availability});
  input.tasks=input.tasks.filter(({id})=>id!=="main"&&id!=="vocal");
  input.tasks.push(
    {id:"feeder-a",kind:"vocal",participantId:"a",coachId:"coach",duration:10,spaceId:"feed",dependencies:[]},
    {id:"b-main-a",kind:"main",participantId:"a",coachId:"coach",duration:10,spaceId:"main",
      dependencies:["feeder-a"],blockKey:"coach",availability:[{start:80,end:90}]},
    {id:"feeder-b",kind:"vocal",participantId:"b",coachId:"coach",duration:10,spaceId:"feed",dependencies:[]},
    {id:"a-main-b",kind:"main",participantId:"b",coachId:"coach",duration:10,spaceId:"main",
      dependencies:["feeder-b"],blockKey:"coach",availability:[{start:90,end:100}]},
  );
  input.mainFlow.preferredEnd=100;
  const result=runExactItinerantPlanSearch(input,{causalDiagnostic:true});
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.equal(result.scheduledTasks.find(({id})=>id==="feeder-b")!.start,60);
  assert.equal(result.scheduledTasks.find(({id})=>id==="feeder-a")!.start,70);
  assert.equal(result.scheduledTasks.find(({id})=>id==="standalone-a")!.start,60);
  assert.ok(result.evidence.feederMatchingWitnessRepairs>0);
  const rejected=result.evidence.causalDiagnostic!.futureFeasibility.assessments
    .find(row=>row.taskId==="standalone-a"&&row.domainEmpty);
  assert.equal(rejected?.certifiedBackjumpTargetDepth,null);
  assert.equal(validatePlan(input,result.scheduledTasks,[],result.scheduledSpaceMeals).hardValid,true);
  assert.deepEqual(runExactItinerantPlanSearch(structuredClone(input)),
    {...result,evidence:{...result.evidence,causalDiagnostic:null}});
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

test("static forward domain exactly intersects hard windows and subtracts hard meals", () => {
  const task: Task = { id: "domain", kind: "auxiliary", participantId: "person", coachId: "domain-coach",
    duration: 10, spaceId: "domain-space", dependencies: [], requiredResourceIds: ["domain-resource"],
    itinerantUnitId: "unit-a", availability: [{ start: 7, end: 28 }, { start: 55, end: 91 }] };
  const input = problem([task]);
  input.day = { start: 2, end: 102 };
  input.protectedMeal = { start: 70, end: 75 };
  input.participants.find(({ id }) => id === "person")!.availability = [{ start: 5, end: 30 }, { start: 50, end: 100 }];
  input.coaches.push({ id: "domain-coach", availability: [{ start: 0, end: 29 }, { start: 50, end: 100 }] });
  input.spaces.find(({ id }) => id === "domain-space")!.availability = [{ start: 0, end: 30 }, { start: 52, end: 100 }];
  input.resources.push({ id: "domain-resource", availability: [{ start: 0, end: 30 }, { start: 50, end: 100 }],
    assignedSpaceId: "meal-resource-space", presencePreference: "OFF" });
  input.itinerantUnits = [{ id: "unit-a", availability: [{ start: 0, end: 30 }, { start: 50, end: 90 }] }];
  input.itinerantUnitMeals = [{ id: "unit-meal", itinerantUnitId: "unit-a", interval: { start: 60, end: 65 } }];
  const meals: ScheduledSpaceMeal[] = [
    { id: "space-meal", kind: "space-meal", spaceId: "domain-space", entryIndex: 1, duration: 5, start: 17, end: 22 },
    { id: "resource-meal", kind: "space-meal", spaceId: "meal-resource-space", entryIndex: 1, duration: 5, start: 80, end: 85 },
  ];
  const domain = standaloneForwardStaticDomain(input, task, meals), starts = [...domain.starts()];
  assert.deepEqual(starts, [7]);
  assert.equal(domain.eligibleStartCount, starts.length);
  assert.deepEqual(domain.intervals, [{ start: 7, end: 7 }]);
  const fullGrid = Array.from({ length: Math.floor((input.day.end - task.duration - input.day.start) / 5) + 1 }, (_, i) => input.day.start + i * 5);
  assert.deepEqual(starts, fullGrid.filter((start) => canPlaceTask(input, task, start, [], meals)));
});

test("static forward domain supports multi-window technical tasks without a participant", () => {
  const task: Task = { id: "technical-domain", kind: "technical", duration: 10, spaceId: "technical-domain",
    dependencies: [], availability: [{ start: 1, end: 11 }, { start: 21, end: 36 }] };
  const input = problem([]); input.day = { start: 1, end: 41 };
  input.spaces.push({ id: "technical-domain", availability: [{ start: 0, end: 50 }] });
  assert.deepEqual([...standaloneForwardStaticDomain(input, task).starts()], [1, 21, 26]);
  assert.equal(canPlaceTask(input, task, 1, []), true);
});

test("a large static domain counts analytically and yields only the first requested witness", () => {
  const task: Task = { id: "large-domain", kind: "technical", duration: 5, spaceId: "large-space",
    dependencies: [] };
  const input = problem([]);
  input.day = { start: 2, end: 5_000_007 };
  input.protectedMeal = undefined;
  input.spaces.push({ id: "large-space", availability: [{ ...input.day }] });
  const domain = standaloneForwardStaticDomain(input, task);
  assert.deepEqual(domain.intervals, [{ start: 2, end: 5_000_002 }]);
  assert.equal(domain.eligibleStartCount, 1_000_001);
  const starts = domain.starts();
  assert.deepEqual(starts.next(), { value: 2, done: false });
  assert.equal(canPlaceTask(input, task, 2, []), true);
  assert.deepEqual(starts.return(), { value: undefined, done: true });
});

test("dynamic forward domain removes overlap intervals without enumerating a large blocked region", () => {
  const authorities = [
    { key: "participant", task: auxiliary("candidate", "shared", [{ start: 0, end: 1_000_000 }]), other: auxiliary("other", "shared", []) },
    { key: "coach", task: { ...auxiliary("candidate", "candidate", [{ start: 0, end: 1_000_000 }]), coachId: "coach" }, other: { ...auxiliary("other", "other", []), coachId: "coach" } },
    { key: "space", task: auxiliary("candidate", "candidate", [{ start: 0, end: 1_000_000 }]), other: { ...auxiliary("other", "other", []), spaceId: "space-candidate" } },
    { key: "resource", task: { ...auxiliary("candidate", "candidate", [{ start: 0, end: 1_000_000 }]), requiredResourceIds: ["unit"] }, other: { ...auxiliary("other", "other", []), requiredResourceIds: ["unit"] } },
  ];
  for (const { key, task, other } of authorities) {
    const input = problem([task]); input.day = { start: 0, end: 1_000_000 }; input.protectedMeal = undefined;
    for (const authority of [...input.participants, ...input.coaches, ...input.spaces, ...input.resources]) authority.availability = [{ ...input.day }];
    const placed = { ...other, start: 100, end: 900_000 };
    const domain = standaloneForwardDynamicDomain(input, task, [placed]);
    assert.deepEqual(domain.intervals, [{ start: 0, end: 90 }, { start: 900_000, end: 999_990 }], key);
    assert.equal(domain.eligibleStartCount, 20_018, key);
    assert.equal([...domain.starts()].every((start) => canPlaceTask(input, task, start, [placed])), true, key);
  }
});

test("dynamic transitions, dependencies, grid and inclusive placement boundaries are exact", () => {
  const task = { ...auxiliary("candidate", "shared", [{ start: 1, end: 101 }], ["unit"]), coachId: "coach" };
  const input = problem([task]); input.day = { start: 1, end: 101 }; input.protectedMeal = undefined;
  input.participantTransitionMinutes = 7; input.resources[0]!.transitionMinutes = 9;
  input.coachRouteTransitions = [
    { coachId: "coach", fromSpaceId: task.spaceId, toSpaceId: "other-space", minutes: 11 },
    { coachId: "coach", fromSpaceId: "other-space", toSpaceId: task.spaceId, minutes: 13 },
  ];
  input.spaces.push({ id: "other-space", availability: [{ ...input.day }] });
  const other = { ...auxiliary("other", "shared", [], ["unit"]), coachId: "coach", spaceId: "other-space", start: 41, end: 51 };
  assert.deepEqual([...standaloneForwardDynamicDomain(input, task, [other]).starts()], [1, 6, 11, 16, 66, 71, 76, 81, 86, 91]);
  for (let start = 1; start + task.duration <= 101; start += 5)
    assert.equal([...standaloneForwardDynamicDomain(input, task, [other]).starts()].includes(start), canPlaceTask(input, task, start, [other]), String(start));

  const predecessor = { ...other, id: "predecessor", end: 26, start: 16, participantId: "other", coachId: undefined, requiredResourceIds: [] };
  const dependent = { ...other, id: "dependent", start: 61, end: 71, participantId: "other", coachId: undefined, requiredResourceIds: [], dependencies: [task.id] };
  task.dependencies = [predecessor.id];
  assert.deepEqual([...standaloneForwardDynamicDomain(input, task, [predecessor, dependent]).starts()], [26, 31, 36, 41, 46, 51]);
  assert.equal(tasksCanAffectEachOther(task, predecessor), true);
  assert.equal(tasksCanAffectEachOther(task, dependent), true);
});

test("future authority signatures include only material, canonical placement authorities",()=>{
  const task={...auxiliary("candidate","shared",[{start:0,end:100}], ["unit"]),coachId:"coach"};
  const input=problem([task]);input.protectedMeal=undefined;
  const relevant={...auxiliary("relevant","shared",[]),coachId:"coach",requiredResourceIds:["unit"],start:30,end:40};
  const irrelevant={...auxiliary("irrelevant","other",[]),spaceId:"unrelated",start:50,end:60};
  input.spaces.push({id:"unrelated",availability:[{start:0,end:120}]});
  const signature=(placed:any[]=[],meals:ScheduledSpaceMeal[]=[],source=input)=>standaloneForwardAuthoritySignature(source,task,placed,meals,
    standaloneForwardStaticDomain(source,task,meals),"STATIC_DOMAIN");
  assert.equal(signature([relevant,irrelevant]),signature([irrelevant,relevant]));
  assert.equal(signature([relevant,irrelevant]),signature([relevant]));
  assert.notEqual(signature([]),signature([relevant]));
  const transition=structuredClone(input);transition.participantTransitionMinutes=5;
  assert.notEqual(signature([relevant]),signature([relevant],[],transition));
  const meal={id:"meal",kind:"space-meal" as const,spaceId:task.spaceId,entryIndex:1,duration:10,start:70,end:80};
  assert.notEqual(signature([relevant]),signature([relevant],[meal]));
});

test("FULL_GRID oracle and STATIC_DOMAIN preserve witnesses, pruning and deterministic order with exact accounting", () => {
  const create = () => coreLeafContinuationProblem();
  const staticResult = runExactItinerantPlanSearch(create(), { standaloneForwardStartDomainMode: "STATIC_DOMAIN" });
  const oracle = runExactItinerantPlanSearch(create(), { standaloneForwardStartDomainMode: "FULL_GRID" });
  assert.equal(staticResult.status, oracle.status);
  assert.equal(staticResult.evidence.fullFingerprint, oracle.evidence.fullFingerprint);
  assert.equal(staticResult.evidence.lastStandaloneForwardBlockingTaskId, oracle.evidence.lastStandaloneForwardBlockingTaskId);
  assert.equal(staticResult.evidence.standaloneForwardPrunes, oracle.evidence.standaloneForwardPrunes);
  assert.ok(staticResult.evidence.standaloneForwardStaticEliminatedStarts > 0);
  assert.ok(staticResult.evidence.standaloneForwardStartChecks < oracle.evidence.standaloneForwardStartChecks);
  assert.equal(staticResult.evidence.standaloneForwardBranches, staticResult.evidence.standaloneForwardStartChecks);
  assert.equal(oracle.evidence.standaloneForwardBranches, oracle.evidence.standaloneForwardStartChecks);
  assert.deepEqual(runExactItinerantPlanSearch(create(), { standaloneForwardStartDomainMode: "STATIC_DOMAIN" }), staticResult);
  assert.equal(staticResult.evidence.standaloneForwardOracleFallbacks, 0);
  assert.equal(staticResult.evidence.standaloneForwardOracleChecks, staticResult.evidence.standaloneForwardStartChecks);
  assert.ok(staticResult.evidence.standaloneForwardDynamicEliminatedStarts > 0);
  assert.ok(staticResult.evidence.standaloneForwardAnalyticEmptyDomainPrunes > 0);
});

test("block-closed future diagnostics are neutral, deterministic, and authority-sensitive", () => {
  const create=()=>coreLeafContinuationProblem();
  const disabled=runExactItinerantPlanSearch(create());
  const enabled=runExactItinerantPlanSearch(create(),{causalDiagnostic:true});
  assert.deepEqual({...enabled.evidence,causalDiagnostic:null},disabled.evidence);
  assert.equal(enabled.status,disabled.status);assert.deepEqual(enabled.scheduledTasks,disabled.scheduledTasks);
  assert.equal(enabled.evidence.fullFingerprint,disabled.evidence.fullFingerprint);
  const diagnostic=enabled.evidence.causalDiagnostic!.futureFeasibility;
  assert.ok(diagnostic.totalEvaluations>0);assert.equal(diagnostic.totalEvaluations,
    diagnostic.uniqueAuthorityStates+diagnostic.repeatedEvaluations);
  assert.equal(diagnostic.authorityResultCollisions,0);assert.deepEqual(diagnostic.collisions,[]);
  assert.equal(enabled.evidence.branchesExplored,disabled.evidence.branchesExplored);
  assert.equal(enabled.evidence.coreBranches,disabled.evidence.coreBranches);
  assert.equal(enabled.evidence.standaloneBranches,disabled.evidence.standaloneBranches);
  assert.equal(enabled.evidence.coreMaximumDepth,disabled.evidence.coreMaximumDepth);
  assert.equal(enabled.evidence.coreCompleteLeafCount,disabled.evidence.coreCompleteLeafCount);
  assert.equal(enabled.evidence.coreBacktracks,disabled.evidence.coreBacktracks);
  const reversed=create();reversed.tasks.reverse();reversed.spaces.reverse();reversed.resources.reverse();reversed.participants.reverse();
  assert.deepEqual(runExactItinerantPlanSearch(reversed,{causalDiagnostic:true}).evidence.causalDiagnostic!.futureFeasibility,diagnostic);

  const changed=create();changed.participantTransitionMinutes=5;
  const changedRows=runExactItinerantPlanSearch(changed,{causalDiagnostic:true}).evidence.causalDiagnostic!.futureFeasibility.assessments;
  assert.notDeepEqual(changedRows.map(row=>row.authoritySignature),diagnostic.assessments.map(row=>row.authoritySignature));
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
