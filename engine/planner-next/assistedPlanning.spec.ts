import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { preflight, validatePlan } from "./validate";
import { executePlannerNext } from "./executePlannerNext";

function fixture(): PlannerNextProblem {
  return {
    day: { start: 0, end: 180 }, spaces: [
      { id: "main-space", availability: [{ start: 0, end: 180 }] },
      { id: "vocal-space", availability: [{ start: 0, end: 180 }] },
      { id: "other-space", availability: [{ start: 0, end: 180 }] },
    ], resources: [{ id: "coach", availability: [{ start: 0, end: 180 }], presencePreference: "OFF" }],
    participants: [{ id: "p1", availability: [{ start: 0, end: 180 }] }, { id: "p2", availability: [{ start: 0, end: 180 }] }],
    coaches: [{ id: "coach", availability: [{ start: 0, end: 180 }] }],
    tasks: [
      { id: "feed", kind: "vocal", duration: 10, spaceId: "vocal-space", participantId: "p1", coachId: "coach", dependencies: [] },
      { id: "main", kind: "main", duration: 15, spaceId: "main-space", participantId: "p1", coachId: "coach", blockKey: "coach", dependencies: ["feed"], requiredResourceIds: ["coach"] },
      { id: "protected", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
      { id: "outside", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
    ],
    mainFlow: { spaceId: "main-space", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 2, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 5_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

test("scope resolution is canonical and rejects duplicate or unknown task IDs", () => {
  const scope = createPlanningScope({ kind: "space", value: "main-space" }, { z: 1, a: true }, ["main"]);
  assert.deepEqual(scope.resolvedTaskIds, ["main"]);
  assert.deepEqual(Object.keys(scope.metadata), ["a", "z"]);
  assert.throws(() => createPlanningScope({ kind: "ids", value: "x" }, {}, ["main", "main"]), /DUPLICATE/);
  assert.throws(() => buildAssistedProblem(fixture(), createPlanningScope({ kind: "ids", value: "x" }, {}, ["missing"]), []), /UNKNOWN/);
});

test("assisted projection is immutable, fixes accepted placements and never moves outside scope", () => {
  const source = fixture();
  const before = structuredClone(source);
  const protectedPlacement: ScheduledTask = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(source, before);
  assert.deepEqual(assisted.automaticTaskIds, ["feed", "main"]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed"]);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), false);
  const first = executeAssistedPlanning(assisted);
  const second = executeAssistedPlanning(buildAssistedProblem(source, assisted.scope, [protectedPlacement]));
  assert.equal(first.evidence.completeForScope, true, first.evidence.reasonCodes.join(","));
  assert.equal(first.evidence.hardValid, true);
  assert.equal(first.evidence.requiredValid, true);
  assert.equal(first.evidence.proposalCount, 1);
  assert.deepEqual(first.evidence.supportingTaskIds, ["feed"]);
  assert.deepEqual(first.evidence.virtualSupportingReservations,["feed"]);
  assert.deepEqual(first.evidence.ephemeralSupportingPlacements?.map(({id})=>id),["feed"]);
  assert.deepEqual(first.evidence.acceptedSupportingPlacements,[]);
  assert.equal(first.evidence.fingerprint, second.evidence.fingerprint);
  assert.deepEqual(first.proposal?.map(({ id }) => id), ["main"]);
  assert.equal(first.proposal?.some(({ id }) => id === "feed" || id === "outside" || id === "protected"), false);
  const scheduledProtected = executeAssistedPlanning(assisted).evidence;
  assert.equal(scheduledProtected.protectedPlacementCount, 1);
  assert.equal(scheduledProtected.protectedPlacementsPreserved, true);
  assert.deepEqual(source, before);
});

test("protected placements remain traversal roots without becoming automatic variables", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "protected")!.dependencies = ["outside"];
  const protectedPlacement = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed", "outside"]);
  assert.equal(assisted.automaticTaskIds.includes("protected"), false);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), true);
});

test("an out-of-scope pending participant meal remains analytic without becoming automatic or proposed",()=>{
  const source=fixture();source.participantMealCapacity={maxSimultaneous:1};
  source.participantMeals=[{id:"meal",sourceTaskId:"outside",participantId:"p2",duration:15,
    window:{start:60,end:120},status:"pending"}];
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"space",value:"main-space"},{},["main"]),[]);
  assert.deepEqual(assisted.problem.participantMeals,[]);
  assert.equal(assisted.analyticalParticipantMeals[0]?.sourceTaskId,"outside");
  assert.equal(assisted.automaticTaskIds.includes("outside"),false);
  const result=executeAssistedPlanning(assisted);
  assert.equal(result.proposal?.some(task=>task.id==="outside"),false);
  assert.equal(result.evidence.selectedMealWitnesses?.participant?.scheduled.some(meal=>meal.sourceTaskId==="outside"),true);
  assert.equal(result.evidence.selectedMealWitnesses?.participant?.fingerprint.length,64);
  assert.equal(result.evidence.standaloneDiagnostic?.firstTerminalCompletionRejection,null);
});

test("task dependencies retain participant-meal source vertices without turning them into tasks",()=>{
  const source=fixture();source.participantMealCapacity={maxSimultaneous:1};
  source.tasks.find(task=>task.id==="main")!.dependencies.push("meal-source");
  source.participantMeals=[{id:"meal",sourceTaskId:"meal-source",participantId:"p2",duration:15,
    window:{start:60,end:120},status:"pending"}];
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[]);
  assert.deepEqual(assisted.problem.participantMeals?.map(meal=>meal.sourceTaskId),["meal-source"]);
  assert.equal(assisted.problem.tasks.some(task=>task.id==="meal-source"),false);
  assert.equal(assisted.automaticTaskIds.includes("meal-source"),false);
  assert.equal(assisted.supportingTaskIds.includes("meal-source"),false);
  const result=executeAssistedPlanning(assisted);
  const meal=result.evidence.selectedMealWitnesses?.participant?.scheduled.find(item=>item.sourceTaskId==="meal-source");
  const exit=result.proposal?.find(task=>task.id==="main");
  assert.ok(meal&&exit&&meal.end<=exit.start,result.evidence.reasonCodes.join(","));
});

test("participant-meal closure traverses task and meal dependencies heterogeneously",()=>{
  const source=fixture();source.participantMealCapacity={maxSimultaneous:2};
  source.tasks.find(task=>task.id==="outside")!.dependencies=["meal-second"];
  source.participantMeals=[
    {id:"meal:first",sourceTaskId:"meal-first",participantId:"p1",duration:10,window:{start:20,end:80},status:"pending",dependencies:["feed"]},
    {id:"meal:second",sourceTaskId:"meal-second",participantId:"p2",duration:10,window:{start:40,end:120},status:"pending",dependencies:["meal-first"]},
  ];
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"outside"},{},["outside"]),[]);
  assert.deepEqual(assisted.problem.participantMeals?.map(meal=>meal.sourceTaskId),["meal-first","meal-second"]);
  assert.deepEqual(assisted.supportingTaskIds,["feed"]);
  assert.ok(!assisted.automaticTaskIds.includes("meal-first")&&!assisted.automaticTaskIds.includes("meal-second"));
});

test("heterogeneous dependency closure still rejects identities with no authority",()=>{
  const source=fixture();source.tasks.find(task=>task.id==="outside")!.dependencies=["missing"];
  assert.throws(()=>buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"outside"},{},["outside"]),[]),
    /UNKNOWN_SUPPORTING_DEPENDENCY_ID:missing/);
});

test("supporting closure does not infer feeders from task kind and participant", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "main")!.dependencies = [];
  source.tasks.push({ ...source.tasks.find(({ id }) => id === "feed")!, id: "another-vocal" });
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), []);
  assert.deepEqual(assisted.supportingTaskIds, []);
  assert.deepEqual(assisted.problem.tasks.map(({ id }) => id), ["main"]);
});

test("a fixed placement violation requires its exact accepted baseline", () => {
  const source = fixture();
  const protectedTask = source.tasks.find(({ id }) => id === "protected")!;
  protectedTask.availability = [{ start: 0, end: 10 }];
  const protectedPlacement = { ...protectedTask, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  const direct = executePlannerNext(assisted.problem, {
    fixedPlacements: assisted.protectedPlacements,
    fixedPlacementsAsContext: true,
  });
  assert.equal(direct.result?.complete, false,
    "fixed context must not bypass a new HARD violation without acceptsValidation");
  const result = executeAssistedPlanning(assisted);
  assert.equal(result.proposal,null);
  assert.equal(result.evidence.protectedPlacementsPreserved, true);
  assert.equal(result.evidence.completeForScope, false);
  assert.equal(result.evidence.proposalCount, 0);
  assert.equal(result.evidence.hardValid, false);
  assert.equal(result.evidence.requiredValid, false);
});

test("protected-vs-protected inherited incompatibility remains an ASST-008 AcceptedException boundary", () => {
  const source = fixture();
  const first = source.tasks.find(({ id }) => id === "protected")!;
  const second = source.tasks.find(({ id }) => id === "outside")!;
  const protectedPlacements = [first, second].map((task) => ({ ...task, start: 140, end: 150 } as ScheduledTask));
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), protectedPlacements);
  const result = executeAssistedPlanning(assisted);

  // The strict solver sees both accepted rows as ordinary hard constraints. Teaching
  // it an accepted-exception delta would require the ASST-008 persistence/search contract.
  assert.equal(result.proposal, null);
  assert.equal(result.evidence.protectedPlacementCount, 2);
  assert.equal(result.evidence.proposalCount, 0);
  assert.ok(result.evidence.reasonCodes.includes("ASSISTED_SCOPE_INCOMPLETE")
    || result.evidence.reasonCodes.includes("ASSISTED_HARD_VALIDATION_FAILED"));
  const accepted=executeAssistedPlanning(assisted,{violations:validatePlan(assisted.originalValidationProblem,protectedPlacements).violations?.filter(item=>item.ruleCode==="OVERLAP_VIOLATION")??[]});
  assert.deepEqual(accepted.proposal?.map(task=>task.id),["main"]);
  assert.equal(accepted.evidence.hardValid,false);
  assert.deepEqual(accepted.evidence.unstructuredReasonCodes,[]);
});

test("a fixed main keeps its pending feeder automatic, while an accepted feeder is not duplicated",()=>{
  const source=fixture();
  const main={...source.tasks.find(task=>task.id==="main")!,start:60,end:75} as ScheduledTask;
  const scope=createPlanningScope({kind:"ids",value:"main"},{},["main"]);
  const pending=buildAssistedProblem(source,scope,[main]);
  const pendingExecution=executePlannerNext(pending.problem,{fixedPlacements:pending.protectedPlacements,
    fixedPlacementsAsContext:true});
  assert.equal(pendingExecution.kind,"EXACT_CONSTRUCTIVE");
  assert.equal(pendingExecution.result?.complete,true,JSON.stringify(pendingExecution.result));
  assert.deepEqual(pendingExecution.result?.scheduledTasks.filter(task=>task.id==="main"),[main]);
  assert.equal(pendingExecution.result?.scheduledTasks.filter(task=>task.id==="feed").length,1);
  assert.ok(pendingExecution.result!.scheduledTasks.find(task=>task.id==="feed")!.end<=main.start);
  const pendingProposal=executeAssistedPlanning(pending);
  assert.equal(pendingProposal.evidence.completeForScope,true,pendingProposal.evidence.reasonCodes.join(","));
  assert.deepEqual(pendingProposal.proposal?.map(task=>task.id),[],
    "the pending feeder gates search feasibility without entering the visible scope proposal");

  const feeder={...source.tasks.find(task=>task.id==="feed")!,start:40,end:50} as ScheduledTask;
  const accepted=buildAssistedProblem(source,scope,[main,feeder]);
  const acceptedExecution=executePlannerNext(accepted.problem,{fixedPlacements:accepted.protectedPlacements,
    fixedPlacementsAsContext:true});
  assert.equal(acceptedExecution.result?.complete,true);
  assert.deepEqual(acceptedExecution.result?.scheduledTasks.filter(task=>task.id==="main"),[main]);
  assert.deepEqual(acceptedExecution.result?.scheduledTasks.filter(task=>task.id==="feed"),[feeder]);
});

test("an impossible pending feeder still rejects a fixed-main proposal",()=>{
  const source=fixture();
  source.tasks.find(task=>task.id==="feed")!.availability=[{start:70,end:80}];
  const main={...source.tasks.find(task=>task.id==="main")!,start:60,end:75} as ScheduledTask;
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[main]);

  assert.deepEqual(assisted.supportingTaskIds,["feed"]);
  assert.equal(assisted.automaticTaskIds.includes("feed"),true);
  const result=executeAssistedPlanning(assisted);
  assert.equal(result.proposal,null);
  assert.equal(result.evidence.proposalCount,0);
  assert.ok(result.evidence.reasonCodes.includes("ASSISTED_SCOPE_INCOMPLETE")
    ||result.evidence.reasonCodes.includes("ASSISTED_HARD_VALIDATION_FAILED"));
});

test("an unaccepted anchored support remains automatic around a fixed main",()=>{
  const source=fixture();
  source.tasks.push({id:"support",kind:"auxiliary",duration:5,spaceId:"main-space",participantId:"p1",dependencies:[]});
  source.anchoredAccompaniments=[{id:"operation",anchorTaskId:"main",beforeTaskIds:["support"],afterTaskIds:[],
    adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED"}];
  const main={...source.tasks.find(task=>task.id==="main")!,start:60,end:75} as ScheduledTask;
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[main]);
  assert.deepEqual(assisted.protectedPlacements.map(task=>task.id),["main"]);
  const execution=executePlannerNext(assisted.problem,{fixedPlacements:assisted.protectedPlacements,
    fixedPlacementsAsContext:true});
  assert.equal(execution.result?.complete,true,JSON.stringify(execution.result));
  assert.deepEqual(execution.result?.scheduledTasks.find(task=>task.id==="main"),main);
  assert.deepEqual(execution.result?.scheduledTasks.filter(task=>task.id==="support").map(task=>[task.start,task.end]),[[55,60]]);
});

test("canonical validator emits separate exact structured overlap identities",()=>{
  const problem=fixture();const tasks=problem.tasks.map((task,index)=>({...task,start:index<2?20:140,end:index===1?35:index<2?30:150})) as ScheduledTask[];
  const overlaps=validatePlan(problem,tasks).violations?.filter(item=>item.ruleCode==="OVERLAP_VIOLATION")??[];
  assert.equal(overlaps.length,2);assert.deepEqual(overlaps.map(item=>item.affectedTaskIds),[["feed","main"],["outside","protected"]]);
  assert.deepEqual(overlaps[1]?.affectedSpaceIds,["other-space"]);assert.equal(overlaps[0]?.severity,"HARD");
});

test("one shared closure keeps every hard-coupled structure intact and explains supporting members", () => {
  const source = fixture();
  source.tasks = [
    { ...source.tasks[0], id: "dependency" },
    { ...source.tasks[2], id: "seed", dependencies: ["dependency"], jointGroupId: "joint" },
    { ...source.tasks[2], id: "joint-peer", jointGroupId: "joint" },
    { ...source.tasks[2], id: "anchor" },
    { ...source.tasks[2], id: "chain-peer" },
    { ...source.tasks[2], id: "round-peer" },
    { ...source.tasks[2], id: "unrelated" },
  ];
  source.anchoredAccompaniments = [{ id: "a", anchorTaskId: "joint-peer", beforeTaskIds: [], afterTaskIds: ["anchor"], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  source.technicalChains = [{ id: "c", orderedTaskIds: ["anchor", "chain-peer"], adjacency: "REQUIRED", resourceContinuity: "REQUIRED", requiredResourceIds: [] }];
  source.roundSynchronizations = [{ id: "r", synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE", lanes: [
    { spaceId: "other-space", taskIds: ["chain-peer"], preparationMinutesBetweenRounds: 0 },
    { spaceId: "vocal-space", taskIds: ["round-peer"], preparationMinutesBetweenRounds: 0 },
  ] }];
  const result = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: "seed" }, {}, ["seed"]), []);
  assert.deepEqual(result.problem.tasks.map(({ id }) => id).sort(), ["anchor", "chain-peer", "dependency", "joint-peer", "round-peer", "seed"].sort());
  assert.equal(result.problem.tasks.some(({ id }) => id === "unrelated"), false);
  assert.deepEqual(result.supportingTaskIds, ["anchor", "chain-peer", "dependency", "joint-peer", "round-peer"]);
  assert.match(result.supportingReasonByTaskId.dependency.join(), /DEPENDENCY_OF:seed/);
  assert.match(result.supportingReasonByTaskId["joint-peer"].join(), /JOINT_GROUP:joint/);
  assert.match(result.supportingReasonByTaskId.anchor.join(), /ANCHORED_WITH:joint-peer/);
  assert.match(result.supportingReasonByTaskId["chain-peer"].join(), /TECHNICAL_CHAIN:c/);
  assert.match(result.supportingReasonByTaskId["round-peer"].join(), /ROUND_SYNCHRONIZATION:r/);
});

test("scope projection removes structured-space requirements with no surviving tasks", () => {
  const source = fixture();
  source.spaces.find(space => space.id === "other-space")!.secondaryContinuity = "REQUIRED";
  source.spaces.find(space => space.id === "other-space")!.setupPolicy = { familyOrder: ["absent"], reentry: "FORBIDDEN" };
  const result = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: "main" }, {}, ["main"]), []);
  const unrelated = result.problem.spaces.find(space => space.id === "other-space")!;
  assert.equal(unrelated.secondaryContinuity, undefined);
  assert.equal(unrelated.setupPolicy, undefined);
  assert.equal(source.spaces.find(space => space.id === "other-space")!.secondaryContinuity, "REQUIRED");
});

test("future analytical authority excludes included and protected tasks and defaults to no fabricated future work",()=>{
  const source=fixture();
  const scope=createPlanningScope({kind:"ids",value:"main"},{},["main"]);
  const protectedTask=source.tasks.find(task=>task.id==="protected")!;
  const protectedPlacement={...protectedTask,start:60,end:60+protectedTask.duration};
  const eligible=new Set(source.tasks.map(task=>task.id));
  const assisted=buildAssistedProblem(source,scope,[protectedPlacement],eligible);
  assert.equal(assisted.problem.analyticalFutureParticipantTasks?.some(task=>task.id==="main"),false);
  assert.equal(assisted.problem.analyticalFutureParticipantTasks?.some(task=>task.id==="protected"),false);
  assert.ok((assisted.problem.analyticalFutureParticipantTasks?.length??0)>0);
  assert.deepEqual(buildAssistedProblem(source,scope,[]).problem.analyticalFutureParticipantTasks,[]);
});

test("future required rounds stay read-only and do not masquerade as independent participant futures",()=>{
  const source=fixture();
  source.tasks.push(
    {id:"future-round-a",kind:"auxiliary",participantId:"p1",spaceId:"other-space",duration:10,dependencies:[]},
    {id:"future-round-b",kind:"auxiliary",participantId:"p2",spaceId:"vocal-space",duration:10,dependencies:[]},
  );
  source.roundSynchronizations=[{id:"future-round",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",lanes:[
    {spaceId:"other-space",taskIds:["future-round-a"],preparationMinutesBetweenRounds:0},
    {spaceId:"vocal-space",taskIds:["future-round-b"],preparationMinutesBetweenRounds:0},
  ]}];
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[],
    new Set(["future-round-a","future-round-b"]));
  assert.deepEqual(assisted.problem.analyticalFutureRoundSynchronizations?.map(item=>item.policy.id),["future-round"]);
  assert.deepEqual(assisted.problem.analyticalFutureParticipantTasks?.filter(task=>task.id.startsWith("future-round")),[]);
  assert.equal(assisted.problem.tasks.some(task=>task.id.startsWith("future-round")),false);
  assert.equal(assisted.automaticTaskIds.some(id=>id.startsWith("future-round")),false);
});

const futureDependencyProjection=(prerequisiteAvailability:readonly {start:number;end:number}[]|null)=>{
  const source=fixture();
  source.tasks.push({id:"future",kind:"auxiliary",participantId:"p1",spaceId:"other-space",duration:10,
    availability:[{start:80,end:120}],dependencies:[prerequisiteAvailability===null?"unknown":"future-prerequisite"]});
  if(prerequisiteAvailability!==null)source.tasks.push({id:"future-prerequisite",kind:"auxiliary",participantId:"p1",
    spaceId:"other-space",duration:10,availability:[...prerequisiteAvailability],dependencies:[]});
  const eligible=new Set(["future",...(prerequisiteAvailability===null?[]:["future-prerequisite"])]);
  return buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[],eligible);
};

test("known future prerequisite stays analytical, certifies the chain, and is not proposed",()=>{
  const assisted=futureDependencyProjection([{start:60,end:80}]);
  assert.deepEqual(assisted.problem.analyticalFutureParticipantTasks?.map(task=>task.id).sort(),
    ["future","future-prerequisite"]);
  assert.equal(assisted.automaticTaskIds.includes("future-prerequisite"),false);
  const result=executeAssistedPlanning(assisted);
  assert.equal(result.evidence.participantFutureReservation.passes>0,true,result.evidence.reasonCodes.join(","));
  assert.equal(result.proposal?.some(task=>task.id==="future-prerequisite"),false);
});

test("known transitive future prerequisite closure remains analytical and certifiable",()=>{
  const source=fixture();
  source.tasks.find(task=>task.id==="main")!.dependencies=["future-mid"];
  source.tasks.push(
    {id:"future-root",kind:"auxiliary",participantId:"p1",spaceId:"other-space",duration:10,
      availability:[{start:20,end:40}],dependencies:[]},
    {id:"future-mid",kind:"auxiliary",participantId:"p1",spaceId:"other-space",duration:10,
      availability:[{start:40,end:70}],dependencies:["future-root"]},
    {id:"future-tail",kind:"auxiliary",participantId:"p1",spaceId:"other-space",duration:10,
      availability:[{start:100,end:140}],dependencies:["future-mid"]},
  );
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[],
    new Set(["future-root","future-mid","future-tail"]));
  assert.deepEqual(assisted.problem.analyticalFutureParticipantTasks?.map(task=>task.id),["future-tail"]);
  assert.deepEqual(assisted.problem.analyticalFutureParticipantSupportingTaskIds,["future-mid","future-root"]);
  const result=executeAssistedPlanning(assisted);
  assert.equal(result.evidence.participantFutureReservation.abstentions,0,result.evidence.reasonCodes.join(","));
  assert.equal(result.proposal?.some(task=>task.id==="future-mid"||task.id==="future-root"||task.id==="future-tail")??false,false);
});

test("hard-impossible known future prerequisite soundly prevents a proposal",()=>{
  const result=executeAssistedPlanning(futureDependencyProjection([]));
  assert.equal(result.proposal,null);
  assert.equal(result.evidence.participantFutureReservation.prunes>0,true);
});

test("unknown future prerequisite remains inconclusive and cannot publish",()=>{
  const result=executeAssistedPlanning(futureDependencyProjection(null));
  assert.equal(result.proposal,null);
  assert.ok(result.evidence.reasonCodes.includes("PARTICIPANT_FUTURE_RESERVATION_INCONCLUSIVE"));
});

test("scope projection preserves surviving setup families and removes only absent families immutably", () => {
  const source = fixture();
  source.tasks.find(task => task.id === "main")!.setupFamilyId = "present";
  source.spaces.find(space => space.id === "main-space")!.setupPolicy = {
    familyOrder: ["present", "absent"],
    reentry: "FORBIDDEN",
    preparationMinutesByFamily: { present: 4, absent: 9 },
  };
  const before = structuredClone(source);

  const result = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: "main" }, {}, ["main"]), []);

  assert.deepEqual(result.problem.spaces.find(space => space.id === "main-space")!.setupPolicy, {
    familyOrder: ["present"],
    reentry: "FORBIDDEN",
    preparationMinutesByFamily: { present: 4 },
  });
  assert.deepEqual(source, before);
});

test("scope projection preserves flexible setup preparation without materializing fixed-family preparation", () => {
  const source = fixture();
  source.tasks.filter(task => task.spaceId === "other-space").forEach(task => { task.setupFamilyId = "present"; });
  const setupSpace = source.spaces.find(space => space.id === "other-space")!;
  setupSpace.secondaryContinuity = "REQUIRED";
  setupSpace.setupPolicy = {
    familyOrder: ["present", "absent"], flexibleFamilyOrder: true, reentry: "FORBIDDEN",
    preparationMinutesBetweenFamilies: 10,
  };

  const result = buildAssistedProblem(source,
    createPlanningScope({ kind: "ids", value: "setup" }, {}, ["protected", "outside"]), []);
  const policy = result.problem.spaces.find(space => space.id === "other-space")!.setupPolicy!;

  assert.equal(Object.prototype.hasOwnProperty.call(policy, "preparationMinutesByFamily"), false);
  assert.deepEqual(policy.familyOrder, ["present"]);
  assert.equal(policy.flexibleFamilyOrder, true);
  assert.equal(policy.preparationMinutesBetweenFamilies, 10);
  assert.deepEqual(preflight(result.problem), []);
});

test("accepted operational meals are fixed search context and retain original validation authority",()=>{
  const source=fixture();
  source.operationalMealPolicies=[{id:"main-meal",window:{start:100,end:150},duration:15,resourceIds:[],spaceIds:["main-space"]}];
  const protectedMeal={id:"main-meal",start:120,end:135,duration:15,resourceIds:[],spaceIds:["main-space"]};
  const assisted=buildAssistedProblem(source,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[],new Set(),[protectedMeal]);
  assert.deepEqual(assisted.problem.operationalMealPolicies?.[0]?.window,{start:120,end:135});
  assert.deepEqual(assisted.originalValidationProblem.operationalMealPolicies?.[0]?.window,{start:100,end:150});
  assert.deepEqual(assisted.protectedOperationalMeals,[protectedMeal]);
  const result=executeAssistedPlanning(assisted);
  assert.deepEqual(result.evidence.selectedMealWitnesses?.operational?.scheduled.filter(meal=>meal.id==="main-meal").map(({start,end})=>({start,end})),[{start:120,end:135}]);
  const changed=fixture();changed.operationalMealPolicies=[{id:"main-meal",window:{start:100,end:119},duration:15,resourceIds:[],spaceIds:["main-space"]}];
  assert.throws(()=>buildAssistedProblem(changed,createPlanningScope({kind:"ids",value:"main"},{},["main"]),[],new Set(),[protectedMeal]),/UNREPRESENTABLE_PROTECTED_OPERATIONAL_MEAL/);
});
