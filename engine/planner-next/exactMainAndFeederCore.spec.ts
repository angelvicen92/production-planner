import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { constructExactMainAndFeederCore, deriveFeederCohortRelaxedCertificate, exactFeederStartDomain,
  exactFeederStartDomainUnion, mergedClippedIntervals, runExactMainAndFeederSearch,
  subtractMergedIntervals } from "./exactMainAndFeederCore";
import { proveMainFeederArchitectureImpossible } from "./mainFlowPatterns";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { validatePlan } from "./validate";
import type { PlannerNextProblem, Task } from "./contracts";

function syntheticProblem(tasks: Task[], participantIds: string[], spaceIds: string[]): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  return { day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 }, resources: [],
    spaces: ["main", ...spaceIds].map((id) => ({ id, availability })),
    participants: participantIds.map((id) => ({ id, availability })), coaches: [{ id: "coach", availability }],
    tasks: tasks.map((task) => task.kind === "main" || task.kind === "vocal" ? ({ ...task, coachId: task.coachId ?? "coach",
      blockKey: task.kind === "main" ? "coach" : task.blockKey }) : task),
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 } };
}

function mainBacktrackingProblem(): PlannerNextProblem {
  return syntheticProblem([
    { id: "vocal-a-flex", kind: "vocal", participantId: "a", duration: 10, spaceId: "vocal-a", dependencies: [] },
    { id: "a-main-flex", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["vocal-a-flex"], blockKey: "block" },
    { id: "vocal-b-fixed", kind: "vocal", participantId: "b", duration: 10, spaceId: "vocal-b", dependencies: [] },
    { id: "b-main-fixed", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["vocal-b-fixed"], blockKey: "block", availability: [{ start: 80, end: 90 }] },
  ], ["a", "b"], ["vocal-a", "vocal-b"]);
}

function feederStartBacktrackingProblem(): PlannerNextProblem {
  const problem = syntheticProblem([
    { id: "vocal-a", kind: "vocal", participantId: "a", duration: 10, spaceId: "vocal", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["vocal-a"], blockKey: "coach-a" },
    { id: "vocal-b", kind: "vocal", participantId: "b", duration: 10, spaceId: "vocal", dependencies: [], availability: [{ start: 70, end: 80 }] },
    { id: "main-b", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["vocal-b"], blockKey: "coach-b" },
  ], ["a", "b"], ["vocal"]);
  problem.participants.find(({ id }) => id === "b")!.availability = [{ start: 70, end: 100 }];
  problem.tasks.find(({ id }) => id === "main-b")!.availability = [{ start: 90, end: 100 }];
  return problem;
}

test("constructs main and direct vocal feeders atomically, deterministically and immutably", () => {
  const problem = mainFlowVocalScenario(), snapshot = structuredClone(problem);
  const first = constructExactMainAndFeederCore(problem), second = constructExactMainAndFeederCore(mainFlowVocalScenario());
  assert.equal(first.status, "COMPLETE"); assert.equal(first.complete, true);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "main").length, 8);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, 8);
  assert.equal(first.evidence.coreFingerprint, second.evidence.coreFingerprint);
  assert.ok(first.evidence.feederRunOptimisticChecks > 0);
  assert.equal(first.evidence.feederRunOptimisticPrunes, 0);
  assert.equal(first.evidence.matchingFeederStartChecks, 0);
  assert.equal(first.evidence.feederCandidatesEvaluated, first.evidence.constructiveFeederStartChecks);
  assert.deepEqual(problem, snapshot); assert.deepEqual(first.remainingTaskIds, []);
  for (const main of first.scheduledTasks.filter(({ kind }) => kind === "main")) {
    const feeder = first.scheduledTasks.find(({ id }) => id === main.dependencies[0]);
    assert.ok(feeder && feeder.end <= main.start);
  }
});

test("explores the first valid feeder start immediately without enumerating earlier starts", () => {
  const problem = syntheticProblem([
    { id: "vocal", kind: "vocal", participantId: "p", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "main", kind: "main", participantId: "p", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
  ], ["p"], ["vocal-room"]);
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.evidence.constructiveFeederStartChecks, 1);
  assert.equal(result.evidence.matchingFeederStartChecks, 0);
  assert.equal(result.evidence.feederCandidatesEvaluated, 1);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal")!.start, 80);
  assert.equal(result.evidence.timelineCandidatesExplored, 1);
});

test("uses an intermediate departure deadline before the invalid end-of-day fallback", () => {
  const problem = syntheticProblem([
    { id: "vocal", kind: "vocal", participantId: "p", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "main", kind: "main", participantId: "p", duration: 80, spaceId: "main", dependencies: ["vocal"], blockKey: "block" },
    { id: "departure", kind: "auxiliary", participantId: "p", duration: 10, spaceId: "side", dependencies: [],
      availability: [{ start: 0, end: 110 }] },
  ], ["p"], ["vocal-room", "side"]);
  problem.mainFlow.preferredEnd = 60;
  problem.protectedMeal = undefined;
  problem.auxiliaryPolicy = { participantPresencePreference: "OFF" };
  problem.transportPolicy = {
    arrival: { taskIds: [], minimumGroupSize: 1, maximumGroupSize: 1, minGapMinutes: 0, groupingWeight: 0 },
    departure: { taskIds: ["departure"], minimumGroupSize: 1, maximumGroupSize: 1, minGapMinutes: 0, groupingWeight: 0 },
  };

  const result = constructExactMainAndFeederCore(problem);
  const main = result.scheduledTasks.find(({ kind }) => kind === "main");
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.equal(main?.end, 100);
  assert.ok(main!.end > problem.mainFlow.preferredEnd && main!.end < problem.day.end);
  assert.equal(result.evidence.timelineCandidatesExplored, 2);
});

test("is invariant to canonical input collection order", () => {
  const baseline = mainFlowVocalScenario(), reversed = mainFlowVocalScenario();
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.resources.reverse();
  assert.equal(constructExactMainAndFeederCore(reversed).evidence.coreFingerprint,
    constructExactMainAndFeederCore(baseline).evidence.coreFingerprint);
});

test("unsupported feeder shapes and failures are atomic", () => {
  const missing = mainFlowVocalScenario(); missing.tasks = missing.tasks.filter(({ id }) => id !== "vocal-participant-z");
  const unsupported = constructExactMainAndFeederCore(missing);
  assert.equal(unsupported.status, "UNSUPPORTED_CORE_SHAPE");
  assert.deepEqual(unsupported.scheduledTasks, []); assert.deepEqual(unsupported.scheduledSpaceMeals, []);
  const multiple = mainFlowVocalScenario(); multiple.tasks.push({ ...multiple.tasks.find(({ id }) => id === "vocal-participant-z")!, id: "second-vocal" });
  assert.equal(constructExactMainAndFeederCore(multiple).status, "UNSUPPORTED_CORE_SHAPE");
  const nonArrivalDependency = mainFlowVocalScenario();
  nonArrivalDependency.tasks.find(({ id }) => id === "vocal-participant-z")!.dependencies = ["main-participant-c"];
  const nonArrival = constructExactMainAndFeederCore(nonArrivalDependency);
  assert.equal(nonArrival.status, "UNSUPPORTED_CORE_SHAPE");
  assert.ok(nonArrival.evidence.reasonCodes.includes("UNSUPPORTED_FEEDER_DEPENDENCY:main-participant-z"));
  const impossible = mainFlowVocalScenario(); impossible.participants.forEach((participant) => { participant.availability = [{ start: 540, end: 560 }]; });
  const infeasible = constructExactMainAndFeederCore(impossible);
  assert.equal(infeasible.status, "INFEASIBLE"); assert.deepEqual(infeasible.scheduledTasks, []);
  const bounded = mainFlowVocalScenario(); bounded.budget.maxBranchExpansions = 1;
  const exhausted = constructExactMainAndFeederCore(bounded);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.deepEqual(exhausted.scheduledTasks, []);
});

test("a deferred main survives bestK=1 after the stable-id first choice is causally pruned", () => {
  const problem = mainBacktrackingProblem(), result = constructExactMainAndFeederCore(problem);
  const firstOrderedMain = "a-main-flex";
  const selectedFirstMain = result.scheduledTasks.filter(({ kind }) => kind === "main").sort((a, b) => a.start - b.start)[0]!.id;
  assert.equal(result.status, "COMPLETE"); assert.equal(firstOrderedMain, "a-main-flex");
  assert.equal(selectedFirstMain, "b-main-fixed"); assert.notEqual(selectedFirstMain, firstOrderedMain);
  assert.ok(result.evidence.backtracks > 0 || result.evidence.blockStartsEliminatedByContiguousWindowBound > 0);
});

test("constructs the feasible feeder block without branching over individual starts", () => {
  const result = constructExactMainAndFeederCore(feederStartBacktrackingProblem());
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal-a")!.start, 60);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal-b")!.start, 70);
  assert.equal(result.evidence.constructiveFeederStartChecks, 1);
  assert.equal(result.evidence.blockStartsEliminatedByContiguousWindowBound,2);
  assert.equal(result.evidence.matchingFeederStartChecks, 0);
  assert.equal(result.evidence.feederCandidatesEvaluated, result.evidence.constructiveFeederStartChecks);
});

test("same-coach prefix capacity rejects individually possible feeders and subtracts prior occupation", () => {
  const problem=syntheticProblem([],[],[]);
  const feeder=(id:string,duration:number):Task=>({id,kind:"vocal",duration,spaceId:"main",coachId:"coach",dependencies:[]});
  const individuallyPossible=[{task:feeder("a",35),deadline:60},{task:feeder("b",35),deadline:60}];
  assert.equal(deriveFeederCohortRelaxedCertificate(problem,individuallyPossible,[]).prefixCapacityImpossible,true);
  const prior={...feeder("placed",30),start:0,end:30};
  const occupied=deriveFeederCohortRelaxedCertificate(problem,[{task:feeder("candidate",40),deadline:60}],[prior]);
  assert.equal(occupied.prefixCapacityImpossible,true);
});

test("EDD relaxed bound uses distinct deadline prefixes and is invariant to feeder IDs and input order", () => {
  const problem=syntheticProblem([],[],[]);
  const items=[
    {task:{id:"z",kind:"vocal",duration:20,spaceId:"main",coachId:"coach",dependencies:[]} as Task,deadline:50},
    {task:{id:"a",kind:"vocal",duration:10,spaceId:"main",coachId:"coach",dependencies:[]} as Task,deadline:90},
  ];
  const first=deriveFeederCohortRelaxedCertificate(problem,items,[]);
  const renamed=deriveFeederCohortRelaxedCertificate(problem,[
    {...items[1]!,task:{...items[1]!.task,id:"x"}},{...items[0]!,task:{...items[0]!.task,id:"y"}},
  ],[]);
  assert.equal(first.latestFeasibleBlockStart,30);
  assert.equal(renamed.latestFeasibleBlockStart,first.latestFeasibleBlockStart);
});

test("relaxed certificate ignores transitions and does not reject a feasible cohort", () => {
  const problem=syntheticProblem([],[],[]);
  problem.coachRouteTransitions=[{coachId:"coach",fromSpaceId:"main",toSpaceId:"main",minutes:50}];
  const task=(id:string):Task=>({id,kind:"vocal",duration:10,spaceId:"main",coachId:"coach",dependencies:[]});
  const certificate=deriveFeederCohortRelaxedCertificate(problem,[{task:task("a"),deadline:60},{task:task("b"),deadline:80}],[]);
  assert.equal(certificate.prefixCapacityImpossible,false);
  assert.equal(certificate.latestFeasibleBlockStart,50);
});

test("cohort bound clips a large block-start region analytically without changing the grid", () => {
  const problem=syntheticProblem([],[],[]),task={id:"f",kind:"vocal",duration:10,spaceId:"main",coachId:"coach",dependencies:[]} as Task;
  const domain=exactFeederStartDomain(problem,task,100,[],"COACH_DOMAIN",100);
  const bounded=exactFeederStartDomainUnion(0,100,[domain],20);
  assert.equal(bounded.eligibleStartCount,5);
  assert.deepEqual([...bounded.starts()],[20,15,10,5,0]);
});

test("contiguous coach window rejects split capacity and preserves an exact-fit window", () => {
  const problem=syntheticProblem([],[],[]),task=(id:string):Task=>({id,kind:"vocal",duration:20,spaceId:"main",coachId:"coach",dependencies:[]});
  problem.coaches[0]!.availability=[{start:0,end:30},{start:40,end:70}];
  const split=deriveFeederCohortRelaxedCertificate(problem,[{task:task("a"),deadline:100},{task:task("b"),deadline:100}],[]);
  assert.equal(split.prefixCapacityImpossible,false);
  assert.deepEqual(split.contiguousBlockStartIntervals,[]);
  problem.coaches[0]!.availability=[{start:0,end:40},{start:50,end:70}];
  assert.deepEqual(deriveFeederCohortRelaxedCertificate(problem,[{task:task("a"),deadline:100},{task:task("b"),deadline:100}],[]).contiguousBlockStartIntervals,[{start:0,end:0}]);
});

test("contiguous coach windows merge overlapping occupations and are ID/order invariant", () => {
  const problem=syntheticProblem([],[],[]),task=(id:string):Task=>({id,kind:"vocal",duration:10,spaceId:"main",coachId:"coach",dependencies:[]});
  const placed=[{...task("placed-z"),start:20,end:50},{...task("placed-a"),start:40,end:60}];
  const items=[{task:task("z"),deadline:100},{task:task("a"),deadline:100}];
  const first=deriveFeederCohortRelaxedCertificate(problem,items,placed);
  const reordered=deriveFeederCohortRelaxedCertificate(problem,[{...items[1]!,task:task("x")},{...items[0]!,task:task("y")}],placed.toReversed());
  assert.deepEqual(first.contiguousBlockStartIntervals,[{start:0,end:0},{start:60,end:100}]);
  assert.deepEqual(reordered.contiguousBlockStartIntervals,first.contiguousBlockStartIntervals);
});

test("contiguous-window domain intersection respects grid boundaries without scanning", () => {
  const problem=syntheticProblem([],[],[]),task={id:"f",kind:"vocal",duration:10,spaceId:"main",coachId:"coach",dependencies:[]} as Task;
  const domain=exactFeederStartDomain(problem,task,100,[],"COACH_DOMAIN",100);
  const bounded=exactFeederStartDomainUnion(0,100,[domain],100,[{start:11,end:24},{start:80,end:80}]);
  assert.deepEqual([...bounded.starts()],[80,20,15]);
  assert.equal(bounded.eligibleStartCount,3);
});

test("authorized meal metadata does not split the optimistic contiguous coach window", () => {
  const problem=syntheticProblem([],[],[]),task={id:"f",kind:"vocal",duration:40,spaceId:"main",coachId:"coach",dependencies:[]} as Task;
  problem.resourceMeals=[{id:"meal",sourceTaskId:"meal-source",resourceIds:["coach"],interval:{start:30,end:60},status:"pending"}];
  assert.deepEqual(deriveFeederCohortRelaxedCertificate(problem,[{task,deadline:100}],[]).contiguousBlockStartIntervals,[{start:0,end:80}]);
});

test("shared coach geometry merges overlapping and adjacent availability before measuring a feeder run",()=>{
  const problem=syntheticProblem([],[],["feed"]);
  problem.protectedMeal=undefined;
  const feeders=["a","b"].map(id=>({task:{id,kind:"vocal",duration:25,spaceId:"feed",coachId:"coach",dependencies:[]} as Task,deadline:60}));
  problem.coaches[0]!.availability=[{start:0,end:30},{start:20,end:50}];
  assert.deepEqual(deriveFeederCohortRelaxedCertificate(problem,feeders,[]).contiguousBlockStartIntervals,[{start:0,end:0}]);
  problem.coaches[0]!.availability=[{start:0,end:25},{start:25,end:50}];
  assert.deepEqual(deriveFeederCohortRelaxedCertificate(problem,feeders,[]).contiguousBlockStartIntervals,[{start:0,end:0}]);
  problem.coaches[0]!.availability=[{start:0,end:20},{start:30,end:60}];
  assert.deepEqual(deriveFeederCohortRelaxedCertificate(problem,feeders,[]).contiguousBlockStartIntervals,[]);
  assert.deepEqual(mergedClippedIntervals([{start:0,end:30},{start:20,end:50}],0,50),[{start:0,end:50}]);
  assert.deepEqual(mergedClippedIntervals([{start:0,end:25},{start:25,end:50}],0,50),[{start:0,end:50}]);
  assert.deepEqual(mergedClippedIntervals([{start:0,end:20},{start:30,end:60}],0,50),
    [{start:0,end:20},{start:30,end:50}]);
});

test("coach occupations are subtracted after overlapping availability has been merged",()=>{
  const available=mergedClippedIntervals([{start:0,end:30},{start:20,end:60}],0,60);
  const occupied=mergedClippedIntervals([{start:15,end:25},{start:20,end:35}],0,60);
  assert.deepEqual(subtractMergedIntervals(available,occupied),[{start:0,end:15},{start:35,end:60}]);
});

function prefixDeadlineProblem():PlannerNextProblem{
  const problem=syntheticProblem([
    {id:"feeder-a",kind:"vocal",participantId:"a",duration:25,spaceId:"feed",dependencies:[]},
    {id:"before-b",kind:"auxiliary",participantId:"b",duration:50,spaceId:"side",dependencies:[]},
    {id:"a-main",kind:"main",participantId:"a",duration:10,spaceId:"main",dependencies:["feeder-a"],blockKey:"block"},
    {id:"feeder-b",kind:"vocal",participantId:"b",duration:25,spaceId:"feed",dependencies:[]},
    {id:"b-main",kind:"main",participantId:"b",duration:10,spaceId:"main",dependencies:["feeder-b"],blockKey:"block"},
  ],["a","b"],["feed","side"]);
  problem.protectedMeal=undefined;
  problem.auxiliaryPolicy={participantPresencePreference:"OFF"};
  problem.anchoredAccompaniments=[{id:"operation-b",anchorTaskId:"b-main",beforeTaskIds:["before-b"],afterTaskIds:[],
    adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED"}];
  return problem;
}

test("a selected main can make the optimistic completion impossible before its residual matching",()=>{
  const entered:string[]=[],derived:string[]=[],events:string[]=[];
  const result=runExactMainAndFeederSearch(prefixDeadlineProblem(),{
    onMainChoiceEntered:choice=>{entered.push(choice.mainTask.id);events.push(`enter:${choice.mainTask.id}`);},
    onResidualMatchingDerived:trace=>{derived.push(trace.selectedTaskId);events.push(`match:${trace.selectedTaskId}`);},
  });
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(entered.includes("b-main"));
  assert.ok((result.evidence.feederRunOptimisticPrunesByDepth["1"]??0)>0);
  const firstB=events.indexOf("enter:b-main");
  assert.notEqual(firstB,-1);
  assert.notEqual(events[firstB+1],"match:b-main");
  assert.ok(derived.includes("a-main"));
});

test("structurally rejects an impossible feeder window without publishing a partial result", () => {
  const problem = syntheticProblem([
    { id: "vocal-a", kind: "vocal", participantId: "a", duration: 10, spaceId: "vocal-a", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["vocal-a"], blockKey: "block" },
    { id: "vocal-b-impossible", kind: "vocal", participantId: "b", duration: 10, spaceId: "vocal-b",
      dependencies: [], availability: [{ start: 0, end: 5 }] },
    { id: "main-b", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["vocal-b-impossible"], blockKey: "block" },
  ], ["a", "b"], ["vocal-a", "vocal-b"]);
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.evidence.architecturesStructurallyRejected, result.evidence.architecturesChecked);
  assert.ok((result.evidence.structuralRejectionsByReason.RESOURCE_WINDOW ?? 0) > 0);
  assert.ok(Object.values(result.evidence.feederOrderBranchesByArchitecture).every((count) => count === 0));
  assert.equal(result.evidence.matchingFeederStartChecks, 0);
  assert.equal(result.evidence.feederCandidatesEvaluated, result.evidence.constructiveFeederStartChecks);
  assert.deepEqual(result.scheduledTasks, []); assert.deepEqual(result.scheduledSpaceMeals, []);
});

test("residual matching prunes an uncovered state and preserves a covered real solution", () => {
  const pruned = constructExactMainAndFeederCore(mainBacktrackingProblem());
  assert.equal(pruned.status, "COMPLETE"); assert.ok(pruned.evidence.backtracks > 0 || pruned.evidence.blockStartsEliminatedByContiguousWindowBound > 0);
  const covered = mainBacktrackingProblem(); covered.tasks.find(({ id }) => id === "b-main-fixed")!.availability = [{ start: 80, end: 100 }];
  const solution = constructExactMainAndFeederCore(covered);
  assert.equal(solution.status, "COMPLETE");
  assert.equal(solution.scheduledTasks.filter(({ kind }) => kind === "main").length, 2);
});

test("the exact branch threshold completes at B and exhausts atomically at B-1", () => {
  const generous = feederStartBacktrackingProblem(), complete = constructExactMainAndFeederCore(generous);
  assert.equal(complete.status, "COMPLETE"); const branchThreshold = complete.evidence.branchesExplored;
  const exact = feederStartBacktrackingProblem(); exact.budget.maxBranchExpansions = branchThreshold;
  const atThreshold = constructExactMainAndFeederCore(exact);
  assert.equal(atThreshold.status, "COMPLETE"); assert.deepEqual(atThreshold.scheduledTasks, complete.scheduledTasks);
  const below = feederStartBacktrackingProblem(); below.budget.maxBranchExpansions = branchThreshold - 1;
  const exhausted = constructExactMainAndFeederCore(below);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(exhausted.evidence.branchesExplored, branchThreshold - 1);
  assert.deepEqual(exhausted.scheduledTasks, []); assert.deepEqual(exhausted.scheduledSpaceMeals, []);
});

test("causal diagnostics are read-only and reconcile every already-consumed branch", () => {
  const problem=feederStartBacktrackingProblem();
  const disabled=runExactMainAndFeederSearch(structuredClone(problem));
  const enabled=runExactMainAndFeederSearch(structuredClone(problem),{causalDiagnostic:true});
  assert.deepEqual({...enabled.evidence,causalDiagnostic:null},disabled.evidence);
  assert.deepEqual(enabled.scheduledTasks,disabled.scheduledTasks);
  assert.equal(enabled.status,disabled.status);
  assert.equal(Object.values(enabled.evidence.causalDiagnostic!.waterfallByDepth).reduce((sum,row)=>sum+row.total,0),enabled.evidence.branchesExplored);
  assert.equal(Object.values(enabled.evidence.causalDiagnostic!.feederByDepth).reduce((sum,row)=>sum+row.startsEvaluated,0),enabled.evidence.constructiveFeederStartChecks);
  assert.equal(Object.values(enabled.evidence.feederOrderBranchesByArchitecture).reduce((sum,count)=>sum+count,0),enabled.evidence.feederOrderBranches);
  assert.ok(enabled.evidence.feederCohortCapacityChecks>0);
  assert.equal(enabled.evidence.feederCohortCapacityChecks,enabled.evidence.feederCohortEddChecks);
  assert.ok(enabled.evidence.blockStartsEliminatedByContiguousWindowBound>0);
});

test("a minimal anchored core is adjacent, fed before its first obligation, and hard-valid", () => {
  const problem = syntheticProblem([
    { id: "vocal", kind: "vocal", participantId: "p", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "before", kind: "auxiliary", participantId: "p", duration: 5, spaceId: "side", dependencies: [] },
    { id: "main", kind: "main", participantId: "p", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "block" },
    { id: "after", kind: "auxiliary", participantId: "p", duration: 5, spaceId: "side", dependencies: [] },
  ], ["p"], ["vocal-room", "side"]);
  problem.auxiliaryPolicy = { participantPresencePreference: "OFF" };
  problem.anchoredAccompaniments = [{ id: "operation", anchorTaskId: "main", beforeTaskIds: ["before"], afterTaskIds: ["after"], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.scheduledTasks.length, 4);
  for (const contract of problem.anchoredAccompaniments ?? []) {
    const sequence = [...contract.beforeTaskIds, contract.anchorTaskId, ...contract.afterTaskIds]
      .map((id) => result.scheduledTasks.find((task) => task.id === id)!);
    assert.ok(sequence.every(Boolean)); assert.ok(sequence.slice(1).every((task, index) => sequence[index]!.end === task.start));
    const feeder = result.scheduledTasks.find(({ id }) => id === sequence.find(({ kind }) => kind === "main")!.dependencies[0])!;
    assert.ok(feeder.end <= sequence[0]!.start);
  }
  const coreIds = new Set(result.scheduledTasks.map(({ id }) => id));
  const reduced = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)) };
  assert.equal(validatePlan(reduced, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
});

test("the internal core has no routing, historical search, scenario oracle or public PlanResult surface", () => {
  const source = readFileSync(new URL("./exactMainAndFeederCore.ts", import.meta.url), "utf8");
  assert.equal(source.includes("resolvePlannerSearchPolicy"), false);
  assert.equal(source.includes("compatibilityPreservingSearch"), false);
  assert.equal(source.includes("PlanResult"), false);
  assert.equal(source.includes("Focal A2"), false);
  assert.equal(source.includes("expectedFingerprint"), false);
  assert.equal(source.includes("PartialPlan"), false);
});

function twoCohortProblem(): PlannerNextProblem {
  const availability = [{ start: 0, end: 140 }];
  const tasks: Task[] = [
    { id: "feeder-a1", kind: "vocal", participantId: "a1", coachId: "coach-a", duration: 10, spaceId: "feed-a", dependencies: [], availability: [{ start: 10, end: 20 }] },
    { id: "main-a1", kind: "main", participantId: "a1", coachId: "coach-a", duration: 10, spaceId: "main", dependencies: ["feeder-a1"], blockKey: "coach-a" },
    { id: "feeder-a2", kind: "vocal", participantId: "a2", coachId: "coach-a", duration: 10, spaceId: "feed-a", dependencies: [], availability: [{ start: 0, end: 10 }] },
    { id: "main-a2", kind: "main", participantId: "a2", coachId: "coach-a", duration: 10, spaceId: "main", dependencies: ["feeder-a2"], blockKey: "coach-a" },
    { id: "feeder-b1", kind: "vocal", participantId: "b1", coachId: "coach-b", duration: 10, spaceId: "feed-b", dependencies: [] },
    { id: "main-b1", kind: "main", participantId: "b1", coachId: "coach-b", duration: 10, spaceId: "main", dependencies: ["feeder-b1"], blockKey: "coach-b" },
    { id: "feeder-b2", kind: "vocal", participantId: "b2", coachId: "coach-b", duration: 10, spaceId: "feed-b", dependencies: [] },
    { id: "main-b2", kind: "main", participantId: "b2", coachId: "coach-b", duration: 10, spaceId: "main", dependencies: ["feeder-b2"], blockKey: "coach-b" },
  ];
  return { day: { start: 0, end: 140 }, protectedMeal: { start: 130, end: 140 }, resources: [],
    spaces: ["main", "feed-a", "feed-b"].map((id) => ({ id, availability })),
    participants: ["a1", "a2", "b1", "b2"].map((id) => ({ id, availability })),
    coaches: ["coach-a", "coach-b"].map((id) => ({ id, availability })), tasks,
    mainFlow: { spaceId: "main", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 2 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    coachRouteTransitions: [
      { coachId: "coach-a", fromSpaceId: "feed-a", toSpaceId: "main", minutes: 10 },
      { coachId: "coach-b", fromSpaceId: "feed-b", toSpaceId: "main", minutes: 10 },
    ], budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 300_000 } };
}

test("closes configured contiguous feeder cohorts before advancing to secondary search", () => {
  const problem = twoCohortProblem(), snapshot = structuredClone(problem);
  const boundaries: Array<{ depth: number; ids: string[] }> = [];
  const result = runExactMainAndFeederSearch(problem, { onPartialCoreCandidate(candidate) {
    boundaries.push({ depth: candidate.depth, ids: candidate.addedTasks.map(({ id }) => id).sort() });
    return "CONTINUE";
  } });
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.deepEqual(boundaries.map(({ depth }) => depth), [2, 4]);
  assert.ok(result.evidence.feederRunPrePartialChecks > 0);
  assert.equal(result.evidence.feederRunPrePartialPrunes, 0);
  assert.ok(boundaries.every(({ ids }) => ids.filter((id) => id.startsWith("main-")).length === 2
    && ids.filter((id) => id.startsWith("feeder-")).length === 2));
  const byId = new Map(result.scheduledTasks.map((task) => [task.id, task]));
  const firstA = Math.min(byId.get("main-a1")!.start, byId.get("main-a2")!.start);
  const firstB = Math.min(byId.get("main-b1")!.start, byId.get("main-b2")!.start);
  assert.ok(byId.get("feeder-a1")!.end + 10 <= firstA && byId.get("feeder-a2")!.end + 10 <= firstA);
  assert.ok(byId.get("feeder-b1")!.end + 10 <= firstB && byId.get("feeder-b2")!.end + 10 <= firstB);
  assert.ok(byId.get("feeder-b1")!.start < firstA || byId.get("feeder-b2")!.start < firstA,
    "coach B can prepare its cohort while coach A owns the first main block");
  const mainAOrder = [byId.get("main-a1")!, byId.get("main-a2")!].sort((a,b)=>a.start-b.start).map(({participantId})=>participantId);
  const feederAOrder = [byId.get("feeder-a1")!, byId.get("feeder-a2")!].sort((a,b)=>a.start-b.start).map(({participantId})=>participantId);
  assert.deepEqual(new Set(feederAOrder), new Set(mainAOrder));
  const feederA = [byId.get("feeder-a1")!, byId.get("feeder-a2")!].sort((a,b)=>a.start-b.start);
  const feederB = [byId.get("feeder-b1")!, byId.get("feeder-b2")!].sort((a,b)=>a.start-b.start);
  assert.equal(feederA[0]!.end, feederA[1]!.start);
  assert.equal(feederB[0]!.end, feederB[1]!.start);
  assert.deepEqual(problem, snapshot);
});

test("exact feeder alternatives retain distinct internal orders", () => {
  const problem = twoCohortProblem();
  problem.tasks = problem.tasks.filter(({ participantId }) => participantId?.startsWith("b"));
  problem.participants = problem.participants.filter(({ id }) => id.startsWith("b"));
  problem.coaches = problem.coaches.filter(({ id }) => id === "coach-b");
  problem.coachRouteTransitions = problem.coachRouteTransitions?.filter(({ coachId }) => coachId === "coach-b");
  const orders = new Set<string>();
  const result = runExactMainAndFeederSearch(problem, { onPartialCoreCandidate(candidate) {
    const order = candidate.addedTasks.filter(({ kind }) => kind === "vocal")
      .sort((a,b)=>a.start-b.start).map(({ id }) => id).join("|");
    orders.add(order);
    return orders.size === 1 ? "REJECT" : "CONTINUE";
  } });
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.equal(orders.size, 2);
});

test("an analytically impossible cohort cannot perform hidden factorial work", () => {
  const participantIds = Array.from({ length: 7 }, (_, index) => `p${index}`);
  const tasks: Task[] = participantIds.flatMap((participantId, index) => [
    { id: `feeder-${participantId}`, kind: "vocal" as const, participantId, duration: 20,
      spaceId: "feed", dependencies: [] },
    { id: `main-${participantId}`, kind: "main" as const, participantId, duration: 10,
      spaceId: "main", dependencies: [`feeder-${participantId}`], blockKey: "coach",
      availability: [{ start: 30 + index * 10, end: 40 + index * 10 }] },
  ]);
  const problem = syntheticProblem(tasks, participantIds, ["feed"]);
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.evidence.constructiveFeederStartChecks, 0);
  assert.ok((result.evidence.structuralRejectionsByReason.FEEDER_CAPACITY ?? 0) > 0);
  assert.ok(result.evidence.branchesExplored < 5_040, `unexpected factorial work: ${result.evidence.branchesExplored}`);
  const bounded = structuredClone(problem); bounded.budget.maxBranchExpansions = 10;
  const exhausted = constructExactMainAndFeederCore(bounded);
  assert.equal(exhausted.status, "INFEASIBLE");
  assert.equal(exhausted.evidence.constructiveFeederStartChecks, 0);
});

test("a high-cardinality impossible feeder load is rejected deterministically before order search", () => {
  const participantIds = Array.from({ length: 18 }, (_, index) => `large-${index}`);
  const tasks: Task[] = participantIds.flatMap((participantId, index) => [
    { id: `large-feeder-${index}`, kind: "vocal" as const, participantId, duration: 10,
      spaceId: "large-feed", dependencies: [] },
    { id: `large-main-${index}`, kind: "main" as const, participantId, duration: 5,
      spaceId: "main", dependencies: [`large-feeder-${index}`], blockKey: "coach",
      availability: [{ start: 10 + index * 5, end: 15 + index * 5 }] },
  ]);
  const problem = syntheticProblem(tasks, participantIds, ["large-feed"]);
  problem.mainFlow.preferredEnd = 100;
  problem.budget.maxBranchExpansions = 1_000;
  const first = constructExactMainAndFeederCore(problem);
  const second = constructExactMainAndFeederCore(structuredClone(problem));
  assert.equal(first.status, "INFEASIBLE");
  assert.deepEqual(second, first);
  assert.equal(first.evidence.constructiveFeederStartChecks, 0);
  assert.ok((first.evidence.structuralRejectionsByReason.FEEDER_CAPACITY ?? 0) > 0);
  assert.deepEqual(first.scheduledTasks, []);
});

test("rejects the minimum impossible architecture then admits the next plausible one", () => {
  const problem = syntheticProblem([
    { id: "feeder-a", kind: "vocal", participantId: "a", duration: 40, spaceId: "feed", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["feeder-a"], blockKey: "block" },
    { id: "feeder-b", kind: "vocal", participantId: "b", duration: 40, spaceId: "feed", dependencies: [] },
    { id: "main-b", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["feeder-b"], blockKey: "block" },
  ], ["a", "b"], ["feed"]);
  problem.mainFlow.preferredEnd = 60;
  problem.protectedMeal = undefined;
  const first = constructExactMainAndFeederCore(problem);
  const second = constructExactMainAndFeederCore(structuredClone(problem));
  assert.equal(first.status, "COMPLETE", first.evidence.reasonCodes.join(","));
  assert.ok(first.evidence.architecturesStructurallyRejected > 0);
  assert.ok(first.evidence.firstExactArchitecture?.includes("END:120"));
  assert.ok((first.evidence.feederOrderBranchesByArchitecture[first.evidence.firstExactArchitecture!] ?? 0) > 0);
  assert.deepEqual(second, first);
});

test("same-coach terminal transition rejects an architecture before FEEDER_ORDER", () => {
  const problem = syntheticProblem([
    { id: "feeder-a", kind: "vocal", participantId: "a", coachId: "coach", duration: 20,
      spaceId: "feed", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", coachId: "coach", duration: 10,
      spaceId: "main", dependencies: ["feeder-a"], blockKey: "block" },
    { id: "feeder-b", kind: "vocal", participantId: "b", coachId: "coach", duration: 20,
      spaceId: "feed", dependencies: [] },
    { id: "main-b", kind: "main", participantId: "b", coachId: "coach", duration: 10,
      spaceId: "main", dependencies: ["feeder-b"], blockKey: "block" },
  ], ["a", "b"], ["feed"]);
  problem.mainFlow.preferredEnd = 65;
  problem.resourceTransitionMinutes = 10;
  problem.protectedMeal = undefined;
  const first = constructExactMainAndFeederCore(problem);
  const second = constructExactMainAndFeederCore(structuredClone(problem));
  assert.equal(first.status, "COMPLETE", first.evidence.reasonCodes.join(","));
  assert.ok((first.evidence.structuralRejectionsByReason.TRANSITION_CAPACITY ?? 0) > 0);
  const rejected = Object.entries(first.evidence.feederOrderBranchesByArchitecture)
    .filter(([key]) => key.includes("END:65"));
  assert.ok(rejected.length > 0 && rejected.every(([, branches]) => branches === 0));
  assert.ok(first.evidence.firstExactArchitecture?.includes("END:120"));
  assert.deepEqual(second, first);
});

test("different coaches preserve possible feeder parallelism without structural pruning", () => {
  const problem = syntheticProblem([
    { id: "feeder-a", kind: "vocal", participantId: "a", coachId: "coach-a", duration: 30,
      spaceId: "feed-a", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", coachId: "coach-a", duration: 10,
      spaceId: "main", dependencies: ["feeder-a"], blockKey: "block" },
    { id: "feeder-b", kind: "vocal", participantId: "b", coachId: "coach-b", duration: 30,
      spaceId: "feed-b", dependencies: [] },
    { id: "main-b", kind: "main", participantId: "b", coachId: "coach-b", duration: 10,
      spaceId: "main", dependencies: ["feeder-b"], blockKey: "block" },
  ], ["a", "b"], ["feed-a", "feed-b"]);
  problem.coaches = ["coach-a", "coach-b"].map((id) => ({ id, availability: [{ start: 0, end: 120 }] }));
  problem.mainFlow.preferredEnd = 60;
  problem.protectedMeal = undefined;
  const mains = problem.tasks.filter((task) => task.kind === "main");
  const feeders = new Map(mains.map((main) => [main.id,
    problem.tasks.find((task) => task.id === main.dependencies[0])!]));
  assert.equal(proveMainFeederArchitectureImpossible(problem, mains, feeders,
    { pattern: ["coach", "coach"], slots: [40, 50] }), null);
});

function splitTransitionCohort(transitionMinutes:number):PlannerNextProblem {
  const problem=syntheticProblem([
    {id:"feeder-a",kind:"vocal",participantId:"a",duration:20,spaceId:"feed-a",dependencies:[],availability:[{start:0,end:20}]},
    {id:"main-a",kind:"main",participantId:"a",duration:10,spaceId:"main",dependencies:["feeder-a"],blockKey:"block",availability:[{start:80,end:90}]},
    {id:"feeder-b",kind:"vocal",participantId:"b",duration:20,spaceId:"feed-b",dependencies:[],availability:[{start:40,end:60}]},
    {id:"main-b",kind:"main",participantId:"b",duration:10,spaceId:"main",dependencies:["feeder-b"],blockKey:"block",availability:[{start:90,end:100}]},
  ],["a","b"],["feed-a","feed-b"]);
  problem.coaches[0]!.availability=[{start:0,end:20},{start:40,end:60},{start:80,end:100}];
  problem.coachRouteTransitions=transitionMinutes>0?[{coachId:"coach",fromSpaceId:"feed-a",toSpaceId:"feed-b",minutes:transitionMinutes}]:[];
  problem.protectedMeal=undefined;
  return problem;
}

test("split coach availability bridged by a positive transition remains exactly searchable",()=>{
  const result=constructExactMainAndFeederCore(splitTransitionCohort(20));
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.deepEqual(result.scheduledTasks.filter(({kind})=>kind==="vocal").sort((a,b)=>a.start-b.start).map(({start,end})=>({start,end})),
    [{start:0,end:20},{start:40,end:60}]);
  assert.ok(result.evidence.contiguousWindowSkippedByTransition>0);
  assert.ok(result.evidence.feederRunOptimisticSkippedByTransition>0);
  assert.equal(result.evidence.feederRunOptimisticPrunes,0);
  assert.equal(result.evidence.feederCohortContiguousWindowPrunes,0);
});

test("an impossible contiguous run is rejected structurally before matching or feeder search",()=>{
  const result=constructExactMainAndFeederCore(splitTransitionCohort(0));
  assert.equal(result.status,"INFEASIBLE");
  assert.ok((result.evidence.structuralRejectionsByReason.FEEDER_CONTIGUOUS_CAPACITY??0)>0);
  assert.equal(result.evidence.feederRunOptimisticChecks,0);
  assert.equal(result.evidence.feederRunOptimisticPrunes,0);
  assert.equal(result.evidence.residualMatchingInvocations,0);
  assert.equal(result.evidence.feederOrderBranches,0);
});

test("a fixed authorized space meal bridges one feeder operational block", () => {
  const problem = twoCohortProblem();
  problem.tasks = problem.tasks.filter(({ participantId }) => participantId?.startsWith("a"));
  problem.participants = problem.participants.filter(({ id }) => id.startsWith("a"));
  problem.coaches = problem.coaches.filter(({ id }) => id === "coach-a");
  problem.coachRouteTransitions = problem.coachRouteTransitions?.filter(({ coachId }) => coachId === "coach-a");
  problem.tasks.find(({ id }) => id === "feeder-a1")!.availability = [{ start: 20, end: 30 }];
  problem.spaces.find(({ id }) => id === "feed-a")!.mealPolicy = { window: { start: 10, end: 20 }, duration: 10 };
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  const feeders = result.scheduledTasks.filter(({ kind }) => kind === "vocal").sort((a,b)=>a.start-b.start);
  assert.deepEqual(feeders.map(({ start, end }) => ({ start, end })), [{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  assert.deepEqual(result.scheduledSpaceMeals.filter(({ spaceId }) => spaceId === "feed-a")
    .map(({ start, end }) => ({ start, end })), [{ start: 10, end: 20 }]);
  assert.ok(result.evidence.contiguousWindowSkippedByAuthorizedMeal>0);
  assert.ok(result.evidence.feederRunOptimisticSkippedByAuthorizedMeal>0);
  assert.equal(result.evidence.feederRunOptimisticPrunes,0);
});

test("an uncontracted pause breaks feeder continuity", () => {
  const problem = twoCohortProblem();
  problem.tasks = problem.tasks.filter(({ participantId }) => participantId?.startsWith("a"));
  problem.participants = problem.participants.filter(({ id }) => id.startsWith("a"));
  problem.coaches = problem.coaches.filter(({ id }) => id === "coach-a");
  problem.coachRouteTransitions = problem.coachRouteTransitions?.filter(({ coachId }) => coachId === "coach-a");
  problem.tasks.find(({ id }) => id === "feeder-a1")!.availability = [{ start: 20, end: 30 }];
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "INFEASIBLE");
  assert.ok(result.evidence.architecturesChecked > result.evidence.architecturesStructurallyRejected,
    "ambiguous continuity must reach exact search");
  assert.deepEqual(result.scheduledTasks, []);
});

test("a configured coach transition is the only authorized interruption inside a feeder block", () => {
  const problem = twoCohortProblem();
  problem.tasks = problem.tasks.filter(({ participantId }) => participantId?.startsWith("a"));
  problem.participants = problem.participants.filter(({ id }) => id.startsWith("a"));
  problem.coaches = problem.coaches.filter(({ id }) => id === "coach-a");
  const first = problem.tasks.find(({ id }) => id === "feeder-a1")!;
  const second = problem.tasks.find(({ id }) => id === "feeder-a2")!;
  first.spaceId = "feed-a1"; first.availability = [{ start: 15, end: 25 }];
  second.spaceId = "feed-a2"; second.availability = [{ start: 0, end: 10 }];
  problem.spaces.push({ id: "feed-a1", availability: [{ start: 0, end: 140 }] },
    { id: "feed-a2", availability: [{ start: 0, end: 140 }] });
  problem.coachRouteTransitions = [
    { coachId: "coach-a", fromSpaceId: "feed-a1", toSpaceId: "feed-a2", minutes: 5 },
    { coachId: "coach-a", fromSpaceId: "feed-a2", toSpaceId: "feed-a1", minutes: 5 },
    { coachId: "coach-a", fromSpaceId: "feed-a1", toSpaceId: "main", minutes: 10 },
    { coachId: "coach-a", fromSpaceId: "feed-a2", toSpaceId: "main", minutes: 10 },
  ];
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  const feeders = result.scheduledTasks.filter(({ kind }) => kind === "vocal").sort((a,b)=>a.start-b.start);
  assert.deepEqual(feeders.map(({ id }) => id), ["feeder-a2", "feeder-a1"]);
  assert.equal(feeders[1]!.start - feeders[0]!.end, 5);
});

test("an impossible cohort backtracks before any secondary callback", () => {
  const problem = twoCohortProblem();
  problem.tasks = problem.tasks.filter(({ participantId }) => participantId?.startsWith("a"));
  problem.participants = problem.participants.filter(({ id }) => id.startsWith("a"));
  problem.coaches = problem.coaches.filter(({ id }) => id === "coach-a");
  problem.coachRouteTransitions = problem.coachRouteTransitions?.filter(({ coachId }) => coachId === "coach-a");
  problem.tasks.find(({ id }) => id === "feeder-a2")!.availability = [{ start: 0, end: 5 }];
  let callbacks = 0;
  const result = runExactMainAndFeederSearch(problem, { onPartialCoreCandidate() { callbacks += 1; return "CONTINUE"; } });
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(callbacks, 0);
  assert.deepEqual(result.scheduledTasks, []);
});

test("cohort construction is deterministic and invariant to input order", () => {
  const first = twoCohortProblem(), reversed = twoCohortProblem();
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.coaches.reverse();
  const a = constructExactMainAndFeederCore(first), b = constructExactMainAndFeederCore(reversed);
  assert.equal(a.status, "COMPLETE"); assert.equal(b.status, "COMPLETE");
  assert.equal(a.evidence.coreFingerprint, b.evidence.coreFingerprint);
  assert.deepEqual(a.evidence.feederRunPrePartialPrunesByDepth,b.evidence.feederRunPrePartialPrunesByDepth);
  assert.deepEqual(a.evidence.feederRunPreFeederPrunesByDepth,b.evidence.feederRunPreFeederPrunesByDepth);
  assert.deepEqual(a.evidence.selectedPattern, ["coach-a", "coach-a", "coach-b", "coach-b"]);
});

test("cohort causal diagnostics are passive and preserve structural depth and coach eliminations", () => {
  const disabled = runExactMainAndFeederSearch(twoCohortProblem());
  const enabled = runExactMainAndFeederSearch(twoCohortProblem(), { causalDiagnostic: true });
  assert.deepEqual({ ...enabled.evidence, causalDiagnostic: null }, disabled.evidence);
  assert.deepEqual(enabled.scheduledTasks, disabled.scheduledTasks);
  assert.equal(enabled.status, disabled.status);
  assert.equal(enabled.evidence.maximumDepth, 4);
  const diagnostic = enabled.evidence.causalDiagnostic!;
  assert.equal(Math.max(...Object.keys(diagnostic.feederByDepth).map(Number)), enabled.evidence.maximumDepth);
  assert.equal(Math.max(...diagnostic.feederCoachDomainEliminations.map(({ depth }) => depth)),
    enabled.evidence.maximumDepth);
  assert.equal(Math.max(...Object.keys(diagnostic.waterfallByDepth).map(Number)), enabled.evidence.maximumDepth);
  assert.ok(diagnostic.feederCoachDomainEliminations.length > 0);
  assert.ok(diagnostic.feederCoachDomainEliminations.every(({ reason }) =>
    reason === "OVERLAP_COACH" || reason === "TRANSITION_COACH"));
  assert.ok(diagnostic.feederCoachDomainEliminations.every(({ mainTaskId, feederTaskId, blockingPlacedTaskId,
    blockingDecisionDepth, blockingDecisionMainTaskId }) => mainTaskId.startsWith("main-")
      && feederTaskId.startsWith("feeder-")
      && (blockingPlacedTaskId.startsWith("main-") || blockingPlacedTaskId.startsWith("feeder-"))
      && blockingDecisionDepth !== null && blockingDecisionMainTaskId !== null));
});
