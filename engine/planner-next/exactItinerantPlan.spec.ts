import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledSpaceMeal, Task } from "./contracts";
import { constructExactMainAndFeederCore, runExactMainAndFeederSearch } from "./exactMainAndFeederCore";
import { compareCompleteParticipantQuality, constructExactItinerantPlan,
  constructFirstHardValidExactItinerantPlan, revalidateFutureItinerantAgendaWitness, searchExactItinerantAgenda, runExactItinerantPlanSearch, standaloneJointGroupStartDomain } from "./exactItinerantPlan";
import { standaloneForwardDynamicDomain, standaloneForwardStaticDomain, tasksCanAffectEachOther } from "./exactItinerantPlan";
import { standaloneForwardAuthoritySignature } from "./exactItinerantPlan";
import { canPlaceTask, exactTaskDynamicStartDomain, exactTaskStaticStartDomain } from "./placement";
import { preflight, validatePlan } from "./validate";
import { materializeItinerantUnitAssignment } from "./itinerantUnitAssignment";
import { futureStructuralWitnessV2FromAcceptedPipeline } from "./anonymousPipelineWitness";
import { checkMacroPendingPrerequisites } from "./macroPendingPrerequisiteForwardCheck";
import { PreparedOperationalMealAuthority } from "./preparedOperationalMealAuthority";
import { itinerantAgendaStructuralFrontier } from "./itinerantAgendaAuthority";
import type { FutureItinerantAgendaWitnessV1 } from "./anonymousPipelineWitness";

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

function crossStagePipelineProblem():PlannerNextProblem{
  const availability=[{start:0,end:300}];const tasks:Task[]=[];
  for(let index=0;index<2;index++){const participantId=`cross-p${index}`;tasks.push(
    {id:`cross-in${index}`,kind:"auxiliary",participantId,duration:10,spaceId:"in",dependencies:[]},
    {id:`cross-style${index}`,kind:"auxiliary",participantId,duration:10,spaceId:"style",dependencies:[`cross-in${index}`]},
    {id:`cross-vocal${index}`,kind:"vocal",participantId,coachId:"cross-coach",duration:15,spaceId:"vocal",dependencies:[`cross-in${index}`]},
    {id:`cross-main${index}`,kind:"main",participantId,coachId:"cross-coach",blockKey:"cross-coach",duration:15,
      spaceId:"main",dependencies:[`cross-vocal${index}`,`cross-style${index}`]});}
  return {day:{start:0,end:300},spaces:["in","style","vocal","main"].map(id=>({id,availability})),resources:[],
    participants:[0,1].map(index=>({id:`cross-p${index}`,availability})),coaches:[{id:"cross-coach",availability}],tasks,
    mainFlow:{spaceId:"main",preferredEnd:240,continuity:"REQUIRED",maxBlocksByKey:2,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:100,maxPatterns:100,maxBranchExpansions:100},
    auxiliaryPolicy:{participantPresencePreference:"OFF"},searchPolicy:"EXACT_CONSTRUCTIVE",
    transportPolicy:{arrival:{taskIds:["cross-in0","cross-in1"],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1},
      departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1}}};
}

test("the itinerant accepted continuation preserves the exact reused V2",()=>{
  const input=crossStagePipelineProblem();const mains=[0,1].map(index=>({...input.tasks.find(task=>task.id===`cross-main${index}`)!,
    start:200+index*15,end:215+index*15}));
  const baseline=runExactMainAndFeederSearch(input,{fixedPlacements:mains,fixedPlacementsAsContext:true});
  const accepted=baseline.scheduledTasks.filter(task=>task.kind==="main"||task.kind==="vocal");
  const initial=runExactMainAndFeederSearch(input,{fixedPlacements:accepted,fixedPlacementsAsContext:true});
  const v1=initial.evidence.futureStructuralWitnesses[0]!;
  const prior=futureStructuralWitnessV2FromAcceptedPipeline(input,{pattern:["cross-coach","cross-coach"],slots:[200,215]},
    v1.geometryFingerprint,initial.scheduledTasks);
  const result=runExactItinerantPlanSearch(input,{fixedPlacements:accepted,fixedPlacementsAsContext:true,priorFutureStructuralWitness:prior});
  assert.equal(result.status,"COMPLETE");assert.equal(result.evidence.futureStructuralWitnesses.length,1);
  assert.equal(result.evidence.priorFutureStructuralWitnessRevalidation,"PASS");
  assert.equal(result.evidence.fixedMainBundleHardGatePasses,1);
  assert.equal(result.evidence.bundleMatchingAttempts,0);
  assert.deepEqual(result.scheduledTasks,initial.scheduledTasks);
  assert.equal(result.evidence.futureStructuralWitnesses[0]?.version,2);
  assert.equal(result.evidence.futureStructuralWitnesses[0]?.fingerprint,prior.fingerprint);
});

test("the real future-round prerequisite gate repairs the causal matching before ACCEPT",()=>{
  const input=problem([]);
  input.participantMealCapacity={maxSimultaneous:1};
  input.spaces.push({id:"future-round",availability:[{start:0,end:120}]},
    {id:"future-prerequisite",availability:[{start:0,end:120}]});
  input.participants.push({id:"future-a",availability:[{start:0,end:120}]},
    {id:"future-b",availability:[{start:0,end:120}]});
  const prerequisite:Task={id:"future-prerequisite",kind:"technical",duration:10,spaceId:"future-prerequisite",
    availability:[{start:20,end:30}],dependencies:[]};
  const dependent:Task={id:"future-z",kind:"auxiliary",participantId:"future-a",duration:10,spaceId:"future-round",
    availability:[{start:20,end:40}],dependencies:[prerequisite.id]};
  const interchangeable:Task={id:"future-b",kind:"auxiliary",participantId:"future-b",duration:10,spaceId:"future-round",
    availability:[{start:20,end:40}],dependencies:[]};
  const policy={id:"future-round",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE" as const,
    lanes:[{spaceId:"future-round",taskIds:[interchangeable.id,dependent.id],preparationMinutesBetweenRounds:0}]};
  input.analyticalFutureRoundSynchronizations=[{policy,tasks:[dependent,interchangeable,prerequisite]}];
  const early=[{...dependent,start:20,end:30},{...interchangeable,start:30,end:40}];
  const repaired=[{...interchangeable,start:20,end:30},{...dependent,start:30,end:40}];
  const witnessProblem={...input,tasks:[...input.tasks,dependent,interchangeable,prerequisite]};
  const initialPrerequisiteCheck=checkMacroPendingPrerequisites(witnessProblem,[prerequisite],[],early);
  assert.equal(initialPrerequisiteCheck.feasible,false);
  assert.equal(initialPrerequisiteCheck.blockingTaskId,prerequisite.id);
  assert.equal(checkMacroPendingPrerequisites(witnessProblem,[prerequisite],[],repaired).feasible,true);

  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID"});
  assert.equal(result.status,"COMPLETE",JSON.stringify({reasonCodes:result.reasonCodes,evidence:{
    completeMatchings:result.evidence.futureRoundWitnessCompleteMatchings,
    prerequisiteChecks:result.evidence.futureRoundWitnessPrerequisiteChecks,
    branches:result.evidence.futureRoundWitnessBranchesConsumed,
    witnesses:result.evidence.futureStructuralWitnesses,
  }}));
  assert.equal(result.evidence.futureRoundWitnessCompleteMatchings,2);
  const witness=result.evidence.futureStructuralWitnesses.find(item=>item.kind==="ROUND_SYNCHRONIZATION");
  assert.ok(witness);
  assert.equal(witness.matchingWitness[dependent.id],"0:2");
  assert.equal(witness.scheduledTaskPlacements.find(task=>task.id===dependent.id)?.start,30);
  assert.equal(witness.scheduledTaskPlacements.find(task=>task.id===interchangeable.id)?.start,20);
  assert.equal(result.scheduledTasks.some(task=>task.id===dependent.id||task.id===interchangeable.id),false);
  assert.equal(result.evidence.firstHardValidCoreTasks.some(task=>task.id===dependent.id||task.id===interchangeable.id),false);
});

function macroCompetitionProblem(options: { setup?: [number, number]; rounds?: [number, number]; resource?: [number, number]; dynamic?: boolean }): PlannerNextProblem {
  const extra: Task[] = [];
  const input = problem(extra);
  input.protectedMeal = undefined;
  const addParticipant = (id: string) => input.participants.push({ id, availability: [{ start: 0, end: 120 }] });
  if (options.setup) {
    input.spaces.push({ id: "setup", availability: [{ start: 0, end: 120 }], secondaryContinuity: "REQUIRED", setupPolicy: { familyOrder: ["family"], reentry: "FORBIDDEN" } });
    addParticipant("setup-person"); addParticipant("setup-person-2");
    input.tasks.push(
      { ...auxiliary("setup-task", "setup-person", [{ start: options.setup[0], end: options.setup[1] }]), duration: 5, spaceId: "setup", setupFamilyId: "family" },
      { ...auxiliary("setup-task-2", "setup-person-2", [{ start: options.setup[0], end: options.setup[1] }]), duration: 5, spaceId: "setup", setupFamilyId: "family" },
    );
  }
  if (options.rounds) {
    input.spaces.push({ id: "lane-a", availability: [{ start: 0, end: 120 }] }, { id: "lane-b", availability: [{ start: 0, end: 120 }] });
    addParticipant("round-a"); addParticipant("round-b");
    input.tasks.push(
      { ...auxiliary("round-a", "round-a", [{ start: options.rounds[0], end: options.rounds[1] }]), spaceId: "lane-a" },
      { ...auxiliary("round-b", "round-b", [{ start: options.rounds[0], end: options.rounds[1] }]), spaceId: "lane-b" },
    );
    input.roundSynchronizations = [{ id: "rounds", synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE", lanes: [
      { spaceId: "lane-a", taskIds: ["round-a"], preparationMinutesBetweenRounds: 0 },
      { spaceId: "lane-b", taskIds: ["round-b"], preparationMinutesBetweenRounds: 0 },
    ] }];
  }
  if (options.resource) {
    input.resources.push({ id: "scarce", availability: [{ start: 0, end: 120 }], presencePreference: "OFF", transitionMinutes: 0 });
    addParticipant("resource-person");
    input.spaces.push({ id: "space-resource-task", availability: [{ start: 0, end: 120 }] });
    input.tasks.push(auxiliary("resource-task", "resource-person", [{ start: options.resource[0], end: options.resource[1] }], ["scarce"]));
  }
  if (options.dynamic) {
    input.resources.push({ id: "dynamic", availability: [{ start: 0, end: 120 }], presencePreference: "OFF", transitionMinutes: 0 });
    addParticipant("dynamic-a"); addParticipant("dynamic-b"); addParticipant("dynamic-c");
    input.spaces.push(
      { id: "space-dynamic-a", availability: [{ start: 0, end: 120 }] },
      { id: "space-dynamic-b", availability: [{ start: 0, end: 120 }] },
      { id: "space-dynamic-c", availability: [{ start: 0, end: 120 }] },
    );
    input.tasks.push(
      { ...auxiliary("dynamic-a", "dynamic-a", [{ start: 20, end: 30 }], ["dynamic"]), duration: 10 },
      { ...auxiliary("dynamic-b", "dynamic-b", [{ start: 40, end: 70 }], ["unit"]), duration: 10 },
      { ...auxiliary("dynamic-c", "dynamic-c", [{ start: 20, end: 50 }], ["dynamic"]), duration: 10 },
    );
  }
  return input;
}

test("a fully protected round remains hard context without becoming a pending macro",()=>{
  const input=macroCompetitionProblem({rounds:[0,30],resource:[40,70]});
  const fixed=input.tasks.filter(task=>task.id==="round-a"||task.id==="round-b")
    .map(task=>({...task,start:0,end:task.duration}));
  const result=runExactItinerantPlanSearch(input,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  assert.ok(result.evidence.standaloneBranches>0);
  assert.equal(result.evidence.roundSynchronizationSearchInvocations,0);
  assert.deepEqual(result.evidence.firstHardValidCoreTasks.filter(task=>task.protected).map(task=>task.id).sort(),
    ["round-a","round-b"]);
  assert.ok(result.evidence.firstHardValidCoreTasks.every(task=>task.end>task.start&&task.spaceId.length>0));
});

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
  assert.ok(result.evidence.ordinaryMRVSelections > 0);
  assert.ok(result.evidence.ordinaryExactStartChecks < 2 * 23,
    "only the selected task domain is checked exactly, not every task over the full grid");
  assert.ok(result.evidence.ordinaryAnalyticDomainBuilds >= 2);
});

function ordinaryForwardProblem(tasks: Task[]): PlannerNextProblem {
  const input = problem(tasks);
  input.protectedMeal = undefined;
  if (!input.spaces.some(({ id }) => id === "forward-space"))
    input.spaces.push({ id: "forward-space", availability: [{ start: 0, end: 120 }] });
  return input;
}

test("singleton ordinary candidate that destroys the last analytic prerequisite domain is pruned immediately", () => {
  const prerequisite = { ...auxiliary("p", "p-person", [{ start: 0, end: 20 }]), duration: 10,
    spaceId: "forward-space" };
  const candidate = { ...auxiliary("a", "a-person", [{ start: 0, end: 20 }]), duration: 20,
    dependencies: [prerequisite.id], spaceId: "forward-space" };
  const input = ordinaryForwardProblem([candidate, prerequisite]);
  input.transportPolicy = { arrival: { taskIds: [prerequisite.id], targetGroupSize: 1, minimumGroupSize: 1,
    maximumGroupSize: 1, minGapMinutes: 0, groupingWeight: 1 }, departure: { taskIds: [], targetGroupSize: 1,
    minimumGroupSize: 1, maximumGroupSize: 1, minGapMinutes: 0, groupingWeight: 1 } };
  const core = constructExactMainAndFeederCore(input);
  assert.equal(canPlaceTask(input, candidate, 0, core.scheduledTasks, core.scheduledSpaceMeals), true,
    "the singleton is legal for A itself before the pending prerequisite is materialized");

  const result = runExactItinerantPlanSearch(input);
  assert.equal(result.status, "INFEASIBLE", result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.ordinaryIndividualForwardChecks > 0);
  assert.ok(result.evidence.ordinaryPrerequisiteReservationPrunes > 0,
    "terminal prerequisites excluded from ordinary DFS remain virtually reserved");
  assert.ok(result.evidence.ordinaryIndividualForwardZeroDomainPrunes > 0);
  assert.equal(result.evidence.ordinaryIndividualForwardCausingTaskCounts[candidate.id],
    result.evidence.ordinaryIndividualForwardZeroDomainPrunes);
  assert.equal(result.evidence.ordinaryIndividualForwardBlockingTaskCounts[prerequisite.id],
    result.evidence.ordinaryIndividualForwardZeroDomainPrunes);
  assert.equal(result.evidence.ordinaryIndividualForwardChecksByDepth["0"],
    result.evidence.ordinaryIndividualForwardChecks);
  assert.deepEqual(result.evidence.ordinaryIndividualForwardFirstPrune,
    { causingTaskId: candidate.id, blockingTaskId: prerequisite.id, depth: 0 });
  assert.equal(result.evidence.ordinaryIndividualForwardStartsChecked, 0,
    "the analytic certificate does not enumerate starts");
});

test("ordinary provisional placement prunes an affected hard obligation that is not a prerequisite", () => {
  const candidate = { ...auxiliary("a", "a-person", [{ start: 0, end: 20 }]), duration: 20,
    spaceId: "forward-space" };
  const obligation = { ...auxiliary("z", "z-person", [{ start: 0, end: 20 }]), duration: 10,
    spaceId: "forward-space" };
  assert.equal(candidate.dependencies.length, 0);
  assert.equal(obligation.dependencies.length, 0);

  const result = runExactItinerantPlanSearch(ordinaryForwardProblem([candidate, obligation]));
  assert.equal(result.status, "INFEASIBLE", result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.ordinaryIndividualForwardZeroDomainPrunes > 0);
  assert.equal(result.evidence.ordinaryIndividualForwardCausingTaskCounts[candidate.id],
    result.evidence.ordinaryIndividualForwardZeroDomainPrunes);
  assert.equal(result.evidence.ordinaryIndividualForwardBlockingTaskCounts[obligation.id],
    result.evidence.ordinaryIndividualForwardZeroDomainPrunes);
  assert.deepEqual(result.evidence.ordinaryIndividualForwardFirstPrune,
    { causingTaskId: candidate.id, blockingTaskId: obligation.id, depth: 0 });
  assert.equal(result.evidence.ordinaryIndividualForwardStartsChecked, 0);
});

test("singleton ordinary candidate is retained when its affected prerequisite keeps an analytic domain", () => {
  const prerequisite = { ...auxiliary("p", "p-person", [{ start: 0, end: 20 }]), duration: 10,
    spaceId: "forward-space" };
  const candidate = { ...auxiliary("a", "a-person", [{ start: 20, end: 40 }]), duration: 20,
    dependencies: [prerequisite.id], spaceId: "forward-space" };
  const input = ordinaryForwardProblem([candidate, prerequisite]);
  const first = runExactItinerantPlanSearch(input), second = runExactItinerantPlanSearch(structuredClone(input));
  assert.equal(first.status, "COMPLETE", first.evidence.reasonCodes.join(","));
  assert.ok(first.evidence.ordinaryIndividualForwardChecks > 0);
  assert.ok(first.evidence.ordinaryIndividualForwardWitnesses > 0);
  assert.equal(first.evidence.ordinaryIndividualForwardZeroDomainPrunes, 0);
  assert.equal(first.evidence.ordinaryIndividualForwardStartsChecked, 0);
  assert.deepEqual(first.evidence, second.evidence, "forward accounting is deterministic");
});

test("ordinary individual forward check skips unrelated pending prerequisites", () => {
  const prerequisite = auxiliary("p", "p-person", [{ start: 40, end: 60 }]);
  const successor = { ...auxiliary("z", "z-person", [{ start: 70, end: 90 }]), dependencies: [prerequisite.id] };
  const unrelated = { ...auxiliary("a", "a-person", [{ start: 0, end: 20 }, { start: 20, end: 40 }]), duration: 20 };
  const result = runExactItinerantPlanSearch(ordinaryForwardProblem([unrelated, prerequisite, successor]));
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.ordinaryIndividualForwardUnrelatedSkips > 0);
  assert.equal(result.evidence.ordinaryIndividualForwardZeroDomainPrunes, 0);
});

test("ordinary forward check accepts individual witnesses without joint prerequisite search", () => {
  const prerequisiteAvailability = [{ start: 0, end: 10 }, { start: 20, end: 30 }, { start: 40, end: 50 }];
  const prerequisites = ["p1", "p2"].map((id) =>
    ({ ...auxiliary(id, `${id}-person`, prerequisiteAvailability), duration: 10, spaceId: "forward-space" }));
  const candidate = { ...auxiliary("a", "a-person", [{ start: 15, end: 25 }]), duration: 5,
    dependencies: prerequisites.map(({ id }) => id) };
  const result = runExactItinerantPlanSearch(ordinaryForwardProblem([candidate, ...prerequisites]));
  assert.equal(result.status, "INFEASIBLE");
  assert.ok(result.evidence.ordinaryIndividualForwardChecks > 0);
  assert.ok(result.evidence.ordinaryIndividualForwardTasksChecked >= 2);
  assert.ok(result.evidence.ordinaryIndividualForwardExactDomainChecks >= 2);
  assert.ok(result.evidence.ordinaryIndividualForwardWitnesses >= 2,
    "P1 and P2 each retain the start at zero after provisional A");
  assert.equal(result.evidence.ordinaryIndividualForwardStartsChecked, 0,
    "the individual checker derives witnesses from analytic domain counts without a joint start scan");
});

test("global macro MRV lets setup beat a broader synchronized round unit", () => {
  const result = constructExactItinerantPlan(macroCompetitionProblem({ setup: [60, 70], rounds: [20, 100] }));
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.match(result.evidence.macroSelectionOrder[0]!, /^SETUP_GROUP:/);
  assert.ok(result.evidence.macroSelectionSteps[0]!.candidates.some(({ kind }) => kind === "ROUND_SYNCHRONIZATION"));
  const setup = result.evidence.macroSelectionSteps[0]!.candidates.find(({ kind }) => kind === "SETUP_GROUP")!;
  assert.equal(setup.domainSize, 1);
  assert.equal(setup.domainMeasure, "hard-valid-top-level-macro-placements");
  assert.equal(setup.domainExact, true);
  assert.equal(setup.matchingFeasibleCandidateCount, 1);
});

test("global macro MRV lets narrow rounds beat a flexible explicit-resource task", () => {
  const result = constructExactItinerantPlan(macroCompetitionProblem({ rounds: [60, 70], resource: [20, 100] }));
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.match(result.evidence.macroSelectionOrder[0]!, /^ROUND_SYNCHRONIZATION:/);
  const [round, resource] = ["ROUND_SYNCHRONIZATION", "RESOURCE_TASK"].map((kind) =>
    result.evidence.macroSelectionSteps[0]!.candidates.find((candidate) => candidate.kind === kind)!);
  assert.equal(round.domainSize, 1);
  assert.ok(resource.domainSize > round.domainSize);
});

test("global macro MRV lets a scarce resource task beat broader rounds", () => {
  const result = constructExactItinerantPlan(macroCompetitionProblem({ rounds: [20, 100], resource: [60, 70] }));
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.match(result.evidence.macroSelectionOrder[0]!, /^RESOURCE_TASK:/);
});

test("macro constrainedness is recalculated after each placement", () => {
  const result = constructExactItinerantPlan(macroCompetitionProblem({ dynamic: true }));
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.deepEqual(result.evidence.macroSelectionOrder.slice(0, 2), [
    "RESOURCE_TASK:resource:dynamic-a",
    "RESOURCE_TASK:resource:dynamic-c",
  ]);
  assert.ok(result.evidence.macroSelectionSteps[1]!.candidates.find(({ id }) => id === "resource:dynamic-c")!.domainSize
    < result.evidence.macroSelectionSteps[1]!.candidates.find(({ id }) => id === "resource:dynamic-b")!.domainSize);
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

test("global macro MRV measures a joint unit by its exact common domain", () => {
  const input = problem([
    { ...auxiliary("joint-wide-left", "a", [{ start: 0, end: 60 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
    { ...auxiliary("joint-wide-right", "b", [{ start: 50, end: 110 }], ["unit"]), spaceId: "joint", jointGroupId: "group" },
  ]);
  const result = constructExactItinerantPlan(input);
  const joint = result.evidence.macroSelectionSteps[0]!.candidates.find(({ kind }) => kind === "JOINT")!;
  assert.equal(joint.domainSize, 1);
  assert.equal(joint.domainExact, true);
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
  assert.equal(result.evidence.technicalChainActiveFrontierPeak,1);
  assert.ok(result.evidence.technicalChainDeferredQueuePeak>0);
  assert.equal(result.evidence.technicalChainDeferredPushes,result.evidence.technicalChainAlternativesDeferred);
  assert.equal(result.evidence.technicalChainDeferredPops,result.evidence.technicalChainAlternativesRevisited);
  assert.equal(validatePlan(input,result.scheduledTasks,[],result.scheduledSpaceMeals).hardValid,true);
});

test("standalone forward domains delegate to the canonical placement domain authority",()=>{
  const input=problem([auxiliary("shared-domain","a",[{start:20,end:80}],["unit"])]);
  const task=input.tasks.find(({id})=>id==="shared-domain")!;
  const placed=[{...auxiliary("blocker","b",[]),spaceId:task.spaceId,start:35,end:50}];
  const canonicalStatic=exactTaskStaticStartDomain(input,task);
  const standaloneStatic=standaloneForwardStaticDomain(input,task);
  assert.deepEqual(standaloneStatic.intervals,canonicalStatic.intervals);
  assert.deepEqual([...standaloneStatic.starts()],[...canonicalStatic.starts()]);
  const canonicalDynamic=exactTaskDynamicStartDomain(input,task,placed,canonicalStatic);
  const standaloneDynamic=standaloneForwardDynamicDomain(input,task,placed,standaloneStatic);
  assert.deepEqual(standaloneDynamic.intervals,canonicalDynamic.intervals);
  assert.deepEqual([...standaloneDynamic.starts()],[...canonicalDynamic.starts()]);
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

test("tasks sharing a PREFERRED resource are searched as one rematchable geometry unit", () => {
  const input = problem([
    auxiliary("flexible", "a", [{ start: 0, end: 60 }], ["unit"]),
    auxiliary("narrow", "b", [{ start: 10, end: 20 }], ["unit"]),
  ]);
  input.resources[0]!.presenceConcentrationPolicy = "PREFERRED";
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidence.macroSelectionOrder[0], "RESOURCE_GROUP:preferred-resource:unit");
  assert.equal(result.evidence.macroSelectionOrder.filter(item => item.startsWith("RESOURCE_TASK:")).length, 0);
  const tasks = result.scheduledTasks.filter(({ id }) => id === "flexible" || id === "narrow").sort((a, b) => a.start - b.start);
  assert.ok(tasks[0]!.end <= tasks[1]!.start);
});

test("a preferred resource and its setup families form one structural macro", () => {
  const input = problem([
    auxiliary("resource-a", "a", [{ start: 0, end: 100 }], ["unit"]),
    {...auxiliary("setup-a", "b", [{ start: 0, end: 100 }], ["unit"]),spaceId:"setup",setupFamilyId:"a"},
    {...auxiliary("setup-b", "c", [{ start: 0, end: 100 }], ["unit"]),spaceId:"setup",setupFamilyId:"b"},
  ]);
  input.resources[0]!.presenceConcentrationPolicy="PREFERRED";
  input.spaces=input.spaces.filter(space=>space.id!=="setup");
  input.spaces.push({id:"setup",availability:[{start:0,end:100}],secondaryContinuity:"REQUIRED",
    setupPolicy:{familyOrder:["a","b"],flexibleFamilyOrder:true,reentry:"FORBIDDEN",preparationMinutesBetweenFamilies:5}});
  const result=constructExactItinerantPlan(input);
  assert.equal(result.status,"COMPLETE");
  assert.deepEqual(result.evidence.macroSelectionOrder.filter(item=>item.includes("resource")||item.includes("setup")),
    ["PREFERRED_RESOURCE_UNIT:preferred-resource-unit:unit"]);
  assert.deepEqual(result.evidence.preferredResourceUnit&&{
    members:result.evidence.preferredResourceUnit.memberTaskCount,
    resource:result.evidence.preferredResourceUnit.resourceTaskCount,
    setup:result.evidence.preferredResourceUnit.setupTaskCount,
  },{members:3,resource:1,setup:2});
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

test("a deferred partial REQUIRED chain is still rejected when residual search cannot complete it",()=>{
  const input=problem([auxiliary("chain-tail","tail",[{start:0,end:10}])]);
  input.technicalChains=[{id:"core-to-residual",orderedTaskIds:["main","chain-tail"],adjacency:"REQUIRED",
    resourceContinuity:"REQUIRED",requiredResourceIds:[]}];
  const result=constructExactItinerantPlan(input);
  assert.equal(result.status,"INFEASIBLE");
  assert.deepEqual(result.scheduledTasks,[]);
  assert.ok(result.evidence.coreCompleteLeavesEvaluated>0,"the partial chain must cross the intermediate core gate");
  assert.equal(result.evidence.completePlansObserved,0);
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

const participantFutureDependencyProblem=(futureWindow:{start:number;end:number},dependency="standalone"):PlannerNextProblem=>{
  const input=problem([{...auxiliary("standalone","core",[{start:0,end:10}]),duration:10}]);
  input.protectedMeal=undefined;
  input.analyticalFutureParticipantTasks=[{id:"future",kind:"auxiliary",participantId:"core",spaceId:"space-standalone",
    duration:10,availability:[futureWindow],dependencies:[dependency]}];
  return input;
};

test("defers an inconclusive core reservation until its reachable standalone dependency is placed",()=>{
  const result=runExactItinerantPlanSearch(participantFutureDependencyProblem({start:10,end:20}));
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.participantFutureReservationAbstentions>0);
  assert.ok(result.evidence.participantFutureReservationPasses>0);
  assert.equal(result.evidence.standaloneFirstSelectedTaskId,"standalone");
  assert.ok(result.evidence.standaloneMaximumDepth>0);
});

test("prunes after a reachable standalone dependency makes the future reservation impossible",()=>{
  const result=runExactItinerantPlanSearch(participantFutureDependencyProblem({start:0,end:10}));
  assert.equal(result.status,"INFEASIBLE");
  assert.ok(result.evidence.participantFutureReservationAbstentions>0);
  assert.ok(result.evidence.participantFutureReservationPrunes>0);
  assert.equal(result.evidence.firstParticipantFutureReservationPrune?.phase,"STANDALONE");
});

test("an unreachable unresolved dependency stays explicitly inconclusive and cannot publish a solution",()=>{
  const result=runExactItinerantPlanSearch(participantFutureDependencyProblem({start:10,end:20},"outside"));
  assert.equal(result.status,"UNSUPPORTED_STANDALONE_SHAPE");
  assert.deepEqual(result.scheduledTasks,[]);
  assert.deepEqual(result.evidence.participantFutureUnreachableDependencyIds,["outside"]);
  assert.deepEqual(result.evidence.reasonCodes,["PARTICIPANT_FUTURE_RESERVATION_INCONCLUSIVE"]);
});

const setupMacroParticipantFutureProblem=(secondDependency?:string):PlannerNextProblem=>{
  const input=problem([]);input.protectedMeal=undefined;
  input.spaces.push({id:"setup-future",availability:[{start:20,end:50}],secondaryContinuity:"REQUIRED",
    setupPolicy:{familyOrder:["family"],reentry:"FORBIDDEN"}},{id:"future-owner",availability:[{start:0,end:120}]});
  input.participants.push({id:"setup-owner",availability:[{start:0,end:120}]},{id:"setup-peer",availability:[{start:0,end:120}]});
  input.tasks.push(
    {...auxiliary("setup-owner-task","setup-owner",[{start:20,end:50}]),duration:5,spaceId:"setup-future",setupFamilyId:"family"},
    {...auxiliary("setup-peer-task","setup-peer",[{start:20,end:50}]),duration:5,spaceId:"setup-future",setupFamilyId:"family"},
  );
  if(secondDependency){
    input.resources.push({id:"future-resource",availability:[{start:0,end:120}],presencePreference:"OFF",transitionMinutes:0});
    input.spaces.push({id:"space-future-dependency",availability:[{start:0,end:120}]});
    input.participants.push({id:"dependency-owner",availability:[{start:0,end:120}]});
    input.tasks.push({...auxiliary(secondDependency,"dependency-owner",[{start:0,end:120}],["future-resource"]),duration:5});
  }
  input.analyticalFutureParticipantTasks=[{id:"future-owner-task",kind:"auxiliary",participantId:"setup-owner",spaceId:"future-owner",
    duration:10,availability:[{start:30,end:40}],dependencies:["setup-owner-task",...(secondDependency?[secondDependency]:[])]}];
  return input;
};

test("setup macro candidates use the participant future gate and retain an earlier extensible geometry",()=>{
  const result=runExactItinerantPlanSearch(setupMacroParticipantFutureProblem(),{standaloneCompletionSelection:"BEST_DOMINATING_WITHIN_BUDGET"});
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.participantFutureReservationPrunes>0);
  assert.equal(result.evidence.firstParticipantFutureReservationPrune?.phase,"MACRO");
  assert.match(result.evidence.firstParticipantFutureReservationPrune?.macroUnitId??"",/^setup:/);
  assert.deepEqual(result.evidence.firstParticipantFutureReservationPrune?.addedTaskIds,["setup-owner-task","setup-peer-task"]);
  assert.ok(result.scheduledTasks.find(({id})=>id==="setup-owner-task")!.end<=30);
  assert.ok(result.evidence.participantFutureMacroAnalyticPrunes>0);
  assert.equal(result.evidence.participantFutureTerminalExactPasses,1);
});

test("macro inconclusive shape defers while its dependency remains reachable and is rechecked",()=>{
  const input=setupMacroParticipantFutureProblem("future-dependency");
  input.spaces.find(({id})=>id==="setup-future")!.availability=[{start:20,end:30}];
  for(const task of input.tasks.filter(({setupFamilyId})=>setupFamilyId!==undefined))task.availability=[{start:20,end:30}];
  const result=runExactItinerantPlanSearch(input);
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.participantFutureReservationAbstentions>0);
  assert.ok(result.evidence.participantFutureReservationPasses>0);
  assert.deepEqual(result.evidence.participantFutureUnreachableDependencyIds,[]);
  assert.ok(result.evidence.participantFutureMacroAnalyticChecks>0);
  assert.equal(result.evidence.participantFutureTerminalExactPasses,1);
});

const setupMacroCollectiveProblem=(infeasible:boolean):PlannerNextProblem=>{
  const input=setupMacroParticipantFutureProblem();
  input.spaces.find(({id})=>id==="setup-future")!.availability=[{start:0,end:10}];
  for(const task of input.tasks.filter(({setupFamilyId})=>setupFamilyId!==undefined))task.availability=[{start:0,end:10}];
  input.analyticalFutureParticipantTasks=[
    {id:"future-a",kind:"auxiliary",participantId:"setup-owner",spaceId:"future-owner",duration:10,availability:[{start:40,end:80}],dependencies:infeasible?["future-b"]:[]},
    {id:"future-b",kind:"auxiliary",participantId:"setup-owner",spaceId:"future-owner",duration:10,availability:[{start:40,end:80}],dependencies:infeasible?["future-a"]:[]},
  ];
  input.participantMeals=[];
  return input;
};

test("macro partial collective feasibility stays analytic and terminal candidate requires an exact PASS",()=>{
  const result=runExactItinerantPlanSearch(setupMacroCollectiveProblem(false));
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.participantFutureMacroAnalyticChecks>0);
  assert.ok(result.evidence.participantFutureMacroAnalyticAbstentions>0);
  assert.equal(result.evidence.participantFutureTerminalExactChecks,1);
  assert.equal(result.evidence.participantFutureTerminalExactPasses,1);
  assert.ok(result.evidence.participantFutureTerminalExactBranches>0);
});

test("terminal exact participant-future PRUNE never publishes a macro candidate",()=>{
  const result=runExactItinerantPlanSearch(setupMacroCollectiveProblem(true));
  assert.equal(result.status,"INFEASIBLE");assert.deepEqual(result.scheduledTasks,[]);
  assert.ok(result.evidence.participantFutureMacroAnalyticChecks>0);
  assert.ok(result.evidence.participantFutureTerminalExactPrunes>0);
  assert.equal(result.evidence.completePlansObserved,0);
});

test("terminal exact participant-future budget exhaustion is explicit and never publishes",()=>{
  const baseline=runExactItinerantPlanSearch(setupMacroCollectiveProblem(false));
  const input=setupMacroCollectiveProblem(false);
  input.budget.maxBranchExpansions=baseline.evidence.branchesExplored-baseline.evidence.participantFutureTerminalExactBranches;
  const exhausted=runExactItinerantPlanSearch(input);
  assert.equal(exhausted.status,"BRANCH_BUDGET_EXHAUSTED");assert.deepEqual(exhausted.scheduledTasks,[]);
  assert.ok(exhausted.evidence.participantFutureTerminalExactAbstentions>0);
  assert.equal(exhausted.evidence.participantFutureTerminalExactPasses,0);
});

test("equivalent itinerant units are scheduled as one bounded deterministic two-lane agenda",()=>{
  const tasks:Task[]=[1,2,3,4].map(id=>({id:`pool-${id}`,kind:"auxiliary",participantId:`person-${id}`,
    duration:20,spaceId:`pool-space-${id}`,dependencies:[],requiredResourceIds:["cam-a","sound-a"],
    allowedItinerantUnitIds:["itinerant-team:7","itinerant-team:8"]}));
  const input=problem(tasks);input.day={start:0,end:140};input.protectedMeal=undefined;
  for(const entity of [...input.spaces,...input.participants,...input.coaches])entity.availability=[{start:0,end:140}];
  input.resources=["cam-a","sound-a","cam-b","sound-b"].map(id=>({id,availability:[{start:0,end:140}],presencePreference:"OFF",transitionMinutes:0}));
  input.itinerantUnits=[
    {id:"itinerant-team:7",availability:[{start:0,end:140}],resourceIds:["cam-a","sound-a"],transitionMinutes:15},
    {id:"itinerant-team:8",availability:[{start:0,end:140}],resourceIds:["cam-b","sound-b"],transitionMinutes:15},
  ];
  input.itinerantUnitMeals=[
    {id:"meal-a",itinerantUnitId:"itinerant-team:7",interval:{start:60,end:75}},
    {id:"meal-b",itinerantUnitId:"itinerant-team:8",interval:{start:60,end:75}},
  ];
  input.budget.maxBranchExpansions=2_000;
  const anchored:Task={id:"anchored-a",kind:"auxiliary",participantId:"anchored-person",duration:20,
    spaceId:"anchored-space",dependencies:[],itinerantUnitId:"itinerant-team:7",requiredResourceIds:["cam-a","sound-a"]};
  const future:Task={id:"combined",kind:"technical",duration:10,spaceId:"combined-space",dependencies:[],
    itinerantUnitId:"itinerant-team:9",requiredResourceIds:["cam-a","cam-b","sound-a"]};
  input.tasks.push(anchored,future);input.participants.push({id:"anchored-person",availability:[{start:0,end:140}]});
  input.spaces.push({id:"anchored-space",availability:[{start:0,end:140}]},{id:"combined-space",availability:[{start:0,end:140}]});
  input.itinerantUnits.push({id:"itinerant-team:9",availability:[{start:0,end:140}],resourceIds:["cam-a","cam-b","sound-a"],transitionMinutes:0});
  const fixed=[{...anchored,start:0,end:20},{...future,start:110,end:120}];
  const first=runExactItinerantPlanSearch(input,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  const second=runExactItinerantPlanSearch(structuredClone(input),{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  assert.equal(first.status,"COMPLETE",JSON.stringify({reasons:first.evidence.reasonCodes,rejection:first.evidence.firstTerminalCompletionRejection,branches:first.evidence.itinerantAgendaBranches}));
  const pool=first.scheduledTasks.filter(task=>task.id.startsWith("pool-"));
  assert.equal(pool.length,4);assert.deepEqual([...new Set(pool.map(task=>task.itinerantUnitId))].sort(),["itinerant-team:7","itinerant-team:8"]);
  assert.ok(pool.some(task=>task.itinerantUnitId==="itinerant-team:8"&&task.requiredResourceIds?.includes("cam-b")));
  assert.ok(pool.some(a=>pool.some(b=>a.id!==b.id&&a.itinerantUnitId!==b.itinerantUnitId&&a.start<b.end&&b.start<a.end)),`lanes work in parallel: ${JSON.stringify(pool)}`);
  for(const task of pool){const meal=input.itinerantUnitMeals.find(item=>item.itinerantUnitId===task.itinerantUnitId)!;assert.ok(task.end<=meal.interval.start||task.start>=meal.interval.end);}
  for(const unitId of ["itinerant-team:7","itinerant-team:8"]){const lane=pool.filter(task=>task.itinerantUnitId===unitId).sort((a,b)=>a.start-b.start);for(let i=1;i<lane.length;i++)assert.ok(lane[i]!.start-lane[i-1]!.end>=15);}
  assert.equal(first.evidence.ordinaryBranchesExplored,0);
  assert.ok(first.evidence.itinerantAgendaBranches<=8,
    `MRV agenda must branch over lane/start choices, not task construction permutations: ${first.evidence.itinerantAgendaBranches}`);
  assert.equal(first.evidence.itinerantAgendaCandidates,1);
  assert.equal(first.evidence.itinerantAgendaBranches,second.evidence.itinerantAgendaBranches);
  assert.deepEqual(pool.map(({id,start,end,itinerantUnitId,requiredResourceIds})=>({id,start,end,itinerantUnitId,requiredResourceIds})),
    second.scheduledTasks.filter(task=>task.id.startsWith("pool-")).map(({id,start,end,itinerantUnitId,requiredResourceIds})=>({id,start,end,itinerantUnitId,requiredResourceIds})));
});

function itineraryCounterexample():{input:PlannerNextProblem;members:Task[];unitIds:string[]}{
  const unitIds=["itinerant-team:71","itinerant-team:72"],members:Task[]=[
    {...auxiliary("agenda-a","agenda-person-a",[{start:40,end:100}],["resource-a"]),allowedItinerantUnitIds:unitIds,dependencies:["agenda-prerequisite"]},
    {...auxiliary("agenda-b","agenda-person-b",[{start:40,end:100}],["resource-a"]),allowedItinerantUnitIds:unitIds},
  ];
  const input=problem([]);input.protectedMeal=undefined;input.tasks.push(...members);
  input.participants.push({id:"agenda-person-a",availability:[{start:0,end:120}]},{id:"agenda-person-b",availability:[{start:0,end:120}]});
  input.spaces.push(...members.map(task=>({id:task.spaceId,availability:[{start:0,end:120}]})));
  input.resources.push({id:"resource-a",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"resource-b",availability:[{start:0,end:120}],presencePreference:"OFF"});
  input.itinerantUnits=[{id:"itinerant-team:71",availability:[{start:0,end:120}],resourceIds:["resource-a"],transitionMinutes:15},
    {id:"itinerant-team:72",availability:[{start:0,end:120}],resourceIds:["resource-b"],transitionMinutes:15}];
  return{input,members,unitIds};
}

test("future itinerary certification includes and exactly proves its prerequisite closure",()=>{
  const {input,members,unitIds}=itineraryCounterexample();
  const prerequisite:Task={id:"agenda-prerequisite",kind:"technical",duration:10,spaceId:"prerequisite-space",
    availability:[{start:100,end:110}],dependencies:[]};
  input.spaces.push({id:"prerequisite-space",availability:[{start:0,end:120}]});
  input.analyticalFutureItinerantAgendas=[{identity:unitIds.join("+"),unitIds,tasks:members,prerequisiteTasks:[prerequisite]}];
  input.tasks=input.tasks.filter(task=>!members.some(member=>member.id===task.id));
  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID"});
  assert.equal(result.evidence.futureStructuralWitnesses.some(witness=>witness.kind==="ITINERANT_AGENDA"),false);
  assert.notEqual(result.status,"COMPLETE","an impossible prerequisite must prevent Stage acceptance");
});

test("future and current itinerary searches share the protected structural frontier",()=>{
  const {input,members,unitIds}=itineraryCounterexample();for(const task of members)task.availability=[{start:60,end:100}];
  const blocker:Task={id:"frontier",kind:"technical",duration:10,spaceId:"frontier-space",dependencies:[],requiredResourceIds:["resource-a","resource-b"]};
  input.spaces.push({id:"frontier-space",availability:[{start:0,end:120}]});input.tasks=input.tasks.filter(task=>!members.some(member=>member.id===task.id));
  input.analyticalFutureItinerantAgendas=[{identity:unitIds.join("+"),unitIds,tasks:members,prerequisiteTasks:[]}];
  const fixed={...blocker,start:50,end:60};input.tasks.push(blocker);
  assert.equal(itinerantAgendaStructuralFrontier(input,unitIds,[fixed]),50);
  const result=runExactItinerantPlanSearch(input,{fixedPlacements:[fixed],fixedPlacementsAsContext:true,standaloneCompletionSelection:"FIRST_HARD_VALID"});
  assert.equal(result.evidence.futureStructuralWitnesses.some(witness=>witness.kind==="ITINERANT_AGENDA"),false);
  assert.notEqual(result.status,"COMPLETE");
});

test("a stale prior itinerary enters exact fallback without being reported as reused",()=>{
  const {input,members,unitIds}=itineraryCounterexample();members[0]!.dependencies=[];
  const placements=members.map((task,index)=>{const assigned=materializeItinerantUnitAssignment(input,task,unitIds[index]!)!;
    return {...assigned,start:40,end:50};});
  const body:Omit<FutureItinerantAgendaWitnessV1,"fingerprint">={kind:"ITINERANT_AGENDA",version:1,identity:unitIds.join("+"),unitIds,
    scheduledTaskPlacements:placements.map(({id,start,end,spaceId,itinerantUnitId})=>({id,start,end,spaceId,itinerantUnitId})),
    prerequisiteTaskPlacements:[],structuralFrontier:120,laneOrder:{"itinerant-team:71":["agenda-a"],"itinerant-team:72":["agenda-b"]},supportingFingerprint:null,
    futureFeasibility:{prerequisites:"PASS",participant:"PASS",technicalChain:"NOT_APPLICABLE",participantMeals:"NOT_APPLICABLE",
      itinerantUnitMeals:"NOT_APPLICABLE",operationalMeals:"NOT_APPLICABLE"}};
  const witness={...body,fingerprint:createHash("sha256").update(JSON.stringify(body)).digest("hex")};
  for(const task of members)task.availability=[{start:60,end:100}];
  const direct=revalidateFutureItinerantAgendaWitness(input,body.identity,unitIds,members,[],[],[],null,witness);
  assert.equal(direct.status,"REJECT");
  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID",priorFutureStructuralWitnesses:[witness]});
  assert.equal(result.status,"COMPLETE",JSON.stringify({reasons:result.reasonCodes,core:result.evidence.coreStatus,
    branches:result.evidence.branchesExplored,preflight:preflight(input)}));assert.equal(result.evidence.priorItinerantWitnessFound,true);
  assert.equal(result.evidence.priorItinerantWitnessRevalidation,"REJECT");assert.equal(result.evidence.priorItinerantWitnessReused,false);
  assert.equal(result.evidence.priorItinerantWitnessFallbackEntered,true);
  assert.ok(result.scheduledTasks.filter(task=>task.id.startsWith("agenda-")).every(task=>task.start>=60));
});

test("itinerary certificate revalidation rejects corrupt, changed, and incompatible authorities and reuses an exact certificate",()=>{
  const {input,members,unitIds}=itineraryCounterexample();members[0]!.dependencies=[];
  const assigned=members.map((task,index)=>materializeItinerantUnitAssignment(input,task,unitIds[index]!)!);
  const unsigned:Omit<FutureItinerantAgendaWitnessV1,"fingerprint">={kind:"ITINERANT_AGENDA",version:1,
    identity:unitIds.join("+"),unitIds,scheduledTaskPlacements:assigned.map((task,index)=>({id:task.id,start:40,end:50,
      spaceId:task.spaceId,itinerantUnitId:unitIds[index]})),prerequisiteTaskPlacements:[],structuralFrontier:120,
    laneOrder:{[unitIds[0]!]:[members[0]!.id],[unitIds[1]!]:[members[1]!.id]},supportingFingerprint:"pipeline-one",
    futureFeasibility:{prerequisites:"PASS",participant:"PASS",technicalChain:"NOT_APPLICABLE",participantMeals:"NOT_APPLICABLE",
      itinerantUnitMeals:"NOT_APPLICABLE",operationalMeals:"NOT_APPLICABLE"}};
  const witness:FutureItinerantAgendaWitnessV1={...unsigned,fingerprint:createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")};
  const validate=(candidate:FutureItinerantAgendaWitnessV1=witness,memberTasks:readonly Task[]=members,units:readonly string[]=unitIds,support="pipeline-one")=>
    revalidateFutureItinerantAgendaWitness(input,unitIds.join("+"),units,memberTasks,[],[],[],support,candidate);
  assert.equal(validate().status,"PASS");
  assert.deepEqual(validate({...witness,fingerprint:"corrupt"}),{status:"REJECT",reason:"FINGERPRINT_MISMATCH"});
  assert.deepEqual(validate(witness,members.slice(0,1)),{status:"STALE",reason:"MEMBER_SET_MISMATCH"});
  assert.deepEqual(validate(witness,members,[unitIds[0]!] ),{status:"STALE",reason:"UNIT_DOMAIN_MISMATCH"});
  assert.deepEqual(validate(witness,members,unitIds,"pipeline-two"),{status:"STALE",reason:"SUPPORTING_FINGERPRINT_MISMATCH"});
  const sameLaneTasks=members.map(task=>materializeItinerantUnitAssignment(input,task,unitIds[0]!)!);
  const transitionUnsigned={...unsigned,supportingFingerprint:null,
    scheduledTaskPlacements:sameLaneTasks.map((task,index)=>({id:task.id,start:40+index*25,end:50+index*25,spaceId:task.spaceId,itinerantUnitId:unitIds[0]})),
    laneOrder:{[unitIds[0]!]:members.map(task=>task.id),[unitIds[1]!]:[]}};
  const transitionWitness:FutureItinerantAgendaWitnessV1={...transitionUnsigned,
    fingerprint:createHash("sha256").update(JSON.stringify(transitionUnsigned)).digest("hex")};
  assert.equal(revalidateFutureItinerantAgendaWitness(input,unsigned.identity,unitIds,members,[],[],[],null,transitionWitness).status,"PASS");
  const changedTransition=structuredClone(input);changedTransition.itinerantUnits![0]!.transitionMinutes=20;
  assert.deepEqual(revalidateFutureItinerantAgendaWitness(changedTransition,unsigned.identity,unitIds,members,[],[],[],null,transitionWitness),
    {status:"REJECT",reason:"PLACEMENT_REJECTED"});

  const uncoupled={...unsigned,supportingFingerprint:null};
  const reusable:FutureItinerantAgendaWitnessV1={...uncoupled,fingerprint:createHash("sha256").update(JSON.stringify(uncoupled)).digest("hex")};
  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID",priorFutureStructuralWitnesses:[reusable]});
  assert.equal(result.status,"COMPLETE");assert.equal(result.evidence.priorItinerantWitnessRevalidation,"PASS");
  assert.equal(result.evidence.priorItinerantWitnessReused,true);assert.equal(result.evidence.priorItinerantWitnessFallbackEntered,false);
  assert.deepEqual(result.scheduledTasks.filter(task=>task.id.startsWith("agenda-")).map(({id,start,end,itinerantUnitId})=>({id,start,end,itinerantUnitId})).sort((a,b)=>a.id.localeCompare(b.id)),
    reusable.scheduledTaskPlacements.map(({id,start,end,itinerantUnitId})=>({id,start,end,itinerantUnitId})).sort((a,b)=>a.id.localeCompare(b.id)));
});

test("itinerary revalidation accepts an exact-grid start inside a domain interval",()=>{
  const {input,members,unitIds}=itineraryCounterexample();members[0]!.dependencies=[];
  const tasks=members.map((task,index)=>materializeItinerantUnitAssignment(input,task,unitIds[index]!)!);
  const unsigned:Omit<FutureItinerantAgendaWitnessV1,"fingerprint">={kind:"ITINERANT_AGENDA",version:1,
    identity:unitIds.join("+"),unitIds,scheduledTaskPlacements:tasks.map((task,index)=>({id:task.id,start:45,end:55,
      spaceId:task.spaceId,itinerantUnitId:unitIds[index]})),prerequisiteTaskPlacements:[],structuralFrontier:120,
    laneOrder:{[unitIds[0]!]:[members[0]!.id],[unitIds[1]!]:[members[1]!.id]},supportingFingerprint:null,
    futureFeasibility:{prerequisites:"PASS",participant:"PASS",technicalChain:"NOT_APPLICABLE",participantMeals:"NOT_APPLICABLE",
      itinerantUnitMeals:"NOT_APPLICABLE",operationalMeals:"NOT_APPLICABLE"}};
  const witness:FutureItinerantAgendaWitnessV1={...unsigned,fingerprint:createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")};
  assert.equal(revalidateFutureItinerantAgendaWitness(input,unsigned.identity,unitIds,members,[],[],[],null,witness).status,"PASS");
  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID",priorFutureStructuralWitnesses:[witness]});
  assert.equal(result.status,"COMPLETE");assert.equal(result.evidence.priorItinerantWitnessRevalidation,"PASS");
  assert.equal(result.evidence.priorItinerantWitnessReused,true);assert.equal(result.evidence.priorItinerantWitnessFallbackEntered,false);
});

test("itinerant assignment materialization validates the domain and atomically rederives member resources",()=>{
  const input=problem([]);input.resources.push(
    {id:"cam-a",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"cam-b",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"sound-a",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"sound-b",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"extra",availability:[{start:0,end:120}],presencePreference:"OFF"},
  );
  input.itinerantUnits=[
    {id:"itinerant-team:7",availability:[{start:0,end:120}],resourceIds:["cam-a","sound-a"]},
    {id:"itinerant-team:8",availability:[{start:0,end:120}],resourceIds:["cam-b","sound-b"]},
  ];
  const task={...auxiliary("choice","core",[{start:0,end:120}],["cam-a","sound-a","extra"]),allowedItinerantUnitIds:["itinerant-team:7","itinerant-team:8"]};
  const selected=materializeItinerantUnitAssignment(input,task,"itinerant-team:8");
  assert.equal(selected?.itinerantUnitId,"itinerant-team:8");
  assert.deepEqual(selected?.requiredResourceIds,["cam-b","extra","sound-b"]);
  assert.equal(materializeItinerantUnitAssignment(input,task,"itinerant-team:9"),null);
});

test("exact itinerary explores an interior start that preserves the last REQUIRED operational break",()=>{
  const {input,members,unitIds}=itineraryCounterexample();
  const task={...members[0]!,dependencies:[],availability:[{start:40,end:100}]};
  input.operationalMealPolicies=unitIds.map((id,index)=>({id:`required-break-${index}`,window:{start:0,end:90},duration:75,
    resourceIds:input.itinerantUnits!.find(unit=>unit.id===id)!.resourceIds!,spaceIds:[]}));
  const assigned=materializeItinerantUnitAssignment(input,task,unitIds[0]!)!;
  const domain=standaloneForwardDynamicDomain(input,assigned,[],standaloneForwardStaticDomain(input,assigned,[]));
  assert.equal(domain.intervals[0]?.start,40);assert.ok([...domain.starts()].includes(75));
  const authority=new PreparedOperationalMealAuthority(input);
  const early={...assigned,start:40,end:50};
  assert.equal(authority.assess([early],[early],{remaining:100},"STANDALONE",0).status,"PRUNE");
  const interior={...assigned,start:75,end:85};
  assert.equal(authority.assess([interior],[interior],{remaining:100},"STANDALONE",0).status,"PASS");
  let selected:readonly import("./contracts").ScheduledTask[]=[];
  const result=searchExactItinerantAgenda(input,[task],unitIds,[],[],120,()=>true,scheduled=>{selected=scheduled;return "FOUND";});
  assert.equal(result.outcome,"FOUND");assert.equal(selected[0]?.start,75);assert.ok(result.mealPrunes>0);
});

function coupledFutureProblem(impossible=false):PlannerNextProblem{
  const input=problem([]);input.protectedMeal=undefined;
  input.resources.push({id:"future-shared",availability:[{start:0,end:120}],presencePreference:"OFF"},
    {id:"future-other",availability:[{start:0,end:120}],presencePreference:"OFF"});
  input.spaces.push({id:"future-round-space",availability:[{start:0,end:120}]},
    {id:"future-agenda-space",availability:[{start:0,end:120}]});
  input.participants.push({id:"future-round-person",availability:[{start:0,end:120}]},
    {id:"future-agenda-person",availability:[{start:0,end:120}]});
  input.itinerantUnits=[{id:"itinerant-team:81",availability:[{start:0,end:120}],resourceIds:["future-shared"]},
    {id:"itinerant-team:82",availability:[{start:0,end:120}],resourceIds:["future-other"]}];
  const round:Task={id:"future-round-task",kind:"auxiliary",participantId:"future-round-person",spaceId:"future-round-space",
    duration:10,dependencies:[],requiredResourceIds:["future-shared"],availability:[{start:20,end:30}]};
  const agenda:Task={id:"future-agenda-task",kind:"auxiliary",participantId:"future-agenda-person",spaceId:"future-agenda-space",
    duration:10,dependencies:[],requiredResourceIds:["future-shared"],allowedItinerantUnitIds:["itinerant-team:81"],
    availability:[{start:20,end:impossible?30:40}]};
  input.analyticalFutureRoundSynchronizations=[{policy:{id:"coupled-round",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",
    lanes:[{spaceId:round.spaceId,taskIds:[round.id],preparationMinutesBetweenRounds:0}]},tasks:[round]}];
  input.analyticalFutureItinerantAgendas=[{identity:"itinerant-team:81+itinerant-team:82",unitIds:["itinerant-team:81","itinerant-team:82"],tasks:[agenda],prerequisiteTasks:[]}];
  return input;
}

test("production future-round and itinerary adapters certify shared occupancy jointly and remain ephemeral",()=>{
  const input=coupledFutureProblem(),snapshot=structuredClone(input);
  const result=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID"});
  assert.equal(result.status,"COMPLETE",JSON.stringify({reasons:result.reasonCodes,preflight:preflight(input)}));assert.deepEqual(input,snapshot);
  const round=result.evidence.futureStructuralWitnesses.find(item=>item.kind==="ROUND_SYNCHRONIZATION");
  const agenda=result.evidence.futureStructuralWitnesses.find(item=>item.kind==="ITINERANT_AGENDA");
  assert.ok(round?.kind==="ROUND_SYNCHRONIZATION"&&agenda?.kind==="ITINERANT_AGENDA");
  assert.equal(round.scheduledTaskPlacements[0]?.start,20);assert.equal(agenda.scheduledTaskPlacements[0]?.start,30);
  assert.equal(result.scheduledTasks.some(task=>task.id.startsWith("future-")),false);
  assert.equal(result.evidence.futureWitnessSet.finalSet?.identities.length,2);
});

test("production coupled future adapters prove DEAD_END when every resource combination conflicts",()=>{
  const result=runExactItinerantPlanSearch(coupledFutureProblem(true),{standaloneCompletionSelection:"FIRST_HARD_VALID"});
  assert.equal(result.status,"INFEASIBLE",JSON.stringify({reasons:result.reasonCodes,preflight:preflight(coupledFutureProblem(true))}));assert.deepEqual(result.scheduledTasks,[]);
  assert.deepEqual(result.evidence.futureStructuralWitnesses,[]);
  assert.equal(result.evidence.futureWitnessSet.futureWitnessSetFound,0);
});

test("joint future adapter input ordering and causal Evidence do not change the exact selected set",()=>{
  const input=coupledFutureProblem(),inverted=structuredClone(input);
  inverted.tasks.reverse();inverted.resources.reverse();inverted.participants.reverse();inverted.itinerantUnits?.reverse();
  inverted.analyticalFutureRoundSynchronizations?.forEach(future=>future.tasks.reverse());
  inverted.analyticalFutureItinerantAgendas?.forEach(future=>{future.tasks.reverse();future.unitIds.reverse();});
  const first=runExactItinerantPlanSearch(input,{standaloneCompletionSelection:"FIRST_HARD_VALID",causalDiagnostic:false});
  const second=runExactItinerantPlanSearch(inverted,{standaloneCompletionSelection:"FIRST_HARD_VALID",causalDiagnostic:true});
  assert.equal(first.status,"COMPLETE");assert.equal(second.status,first.status);
  assert.equal(first.evidence.branchesExplored,second.evidence.branchesExplored);
  assert.deepEqual(first.scheduledTasks,second.scheduledTasks);
  assert.deepEqual(first.evidence.futureWitnessSet,second.evidence.futureWitnessSet);
  assert.deepEqual(first.evidence.futureStructuralWitnesses,second.evidence.futureStructuralWitnesses);
});
