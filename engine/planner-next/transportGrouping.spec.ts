import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import {
  transportGroupCandidates,
  transportContiguousGroupSizes,
  assessArrivalTransportFutureFeasibility,
  validateTransportGrouping,
} from "./transportGrouping";
import { preflight } from "./validate";
import { validatePlan } from "./validate";

const policy = (minimumGroupSize = 3, maximumGroupSize = 4, minGapMinutes = 20): TransportGroupingPolicy => ({
  taskIds: [], minimumGroupSize, maximumGroupSize, minGapMinutes, groupingWeight: 3,
});

function arrivalProbeProblem(count=1,minGapMinutes=0):PlannerNextProblem {
  const participants=Array.from({length:count},(_,index)=>({id:`person-${index}`,availability:[{start:0,end:100}]}));
  const arrivals=participants.map((participant,index):Task=>({id:`transport-${index}`,kind:"auxiliary",participantId:participant.id,duration:5,spaceId:"vehicle",dependencies:[],availability:[{start:0,end:100}]}));
  const obligations=participants.map((participant,index):Task=>({id:`obligation-${index}`,kind:"auxiliary",participantId:participant.id,duration:10,spaceId:`room-${index}`,dependencies:[arrivals[index]!.id]}));
  return {day:{start:0,end:100},spaces:[{id:"vehicle",availability:[{start:0,end:100}]},...participants.map((_,index)=>({id:`room-${index}`,availability:[{start:0,end:100}]}))],resources:[],participants,coaches:[],tasks:[...arrivals,...obligations],mainFlow:{spaceId:"vehicle",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:1000},transportPolicy:{arrival:{taskIds:arrivals.map(({id})=>id),minimumGroupSize:3,maximumGroupSize:3,targetGroupSize:3,minGapMinutes,groupingWeight:0},departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:1,targetGroupSize:1,minGapMinutes:0,groupingWeight:0}}};
}

test("arrival future probe jointly certifies transport before a substantive obligation without reserving it",()=>{
  const problem=arrivalProbeProblem(),obligation=problem.tasks.find(({id})=>id==="obligation-0")!;
  const substantive=[scheduled(obligation,10)],snapshot=structuredClone(substantive);
  const result=assessArrivalTransportFutureFeasibility(problem,substantive);
  assert.equal(result.feasible,true);assert.ok(result.witnessFingerprint);assert.deepEqual(substantive,snapshot);
  assert.equal(assessArrivalTransportFutureFeasibility(problem,[scheduled(obligation,0)]).feasible,false);
  assert.equal([0,10].some(start=>assessArrivalTransportFutureFeasibility(problem,[scheduled(obligation,start)]).feasible),true);
});

test("arrival probe preserves residual contiguous groups, min gap, cache, and input-order determinism",()=>{
  const problem=arrivalProbeProblem(7,20);const substantive=problem.tasks.filter(({id})=>id.startsWith("obligation-")).map(task=>scheduled(task,60));
  const cache=new Map();const first=assessArrivalTransportFutureFeasibility(problem,substantive,cache),cached=assessArrivalTransportFutureFeasibility(problem,substantive,cache);
  assert.equal(first.feasible,true);assert.equal(first.groupsChecked,3);assert.equal(cached.cacheHit,true);
  const unrelated=scheduled({id:"neutral",kind:"technical",duration:5,spaceId:"neutral-room",dependencies:[]},80);
  assert.equal(assessArrivalTransportFutureFeasibility(problem,[...substantive,unrelated],cache).cacheHit,true,
    "occupations outside every arrival authority do not fragment the safe cache");
  const reversed={...problem,tasks:[...problem.tasks].reverse(),participants:[...problem.participants].reverse(),transportPolicy:{...problem.transportPolicy!,arrival:{...problem.transportPolicy!.arrival,taskIds:[...problem.transportPolicy!.arrival.taskIds].reverse()}}};
  assert.equal(assessArrivalTransportFutureFeasibility(reversed,[...substantive].reverse()).witnessFingerprint,first.witnessFingerprint);
  const impossible=arrivalProbeProblem(7,50);const early=impossible.tasks.filter(({id})=>id.startsWith("obligation-")).map(task=>scheduled(task,30));
  assert.equal(assessArrivalTransportFutureFeasibility(impossible,early).feasible,false);
});
const tasks = (count: number): Task[] => Array.from({ length: count }, (_, index) => ({
  id: `transport-${String(index).padStart(2, "0")}`, kind: "auxiliary", participantId: `p-${index}`,
  duration: 10, spaceId: "transport", dependencies: [],
}));

test("candidate partitions honor minimum, maximum, and never leave a small residual", () => {
  const seven = transportGroupCandidates(tasks(7), policy());
  assert.ok(seven.length > 0);
  assert.ok(seven.every((group) => group.length === 3 || group.length === 4));
  assert.deepEqual(transportGroupCandidates(tasks(5), policy()), []);
  assert.ok(transportGroupCandidates(tasks(6), policy()).every((group) => group.length === 3));
});

test("terminal contiguous grouping uses directional defaults and preserves explicit targets", () => {
  assert.deepEqual(transportContiguousGroupSizes(6, policy(1, 6), "arrival"), [3, 3]);
  assert.deepEqual(transportContiguousGroupSizes(7, policy(3, 6), "arrival"), [3, 3, 1]);
  assert.deepEqual(transportContiguousGroupSizes(8, policy(3, 6), "arrival"), [3, 3, 2]);
  assert.deepEqual(transportContiguousGroupSizes(10, policy(3, 6), "arrival"), [3, 3, 3, 1]);
  assert.deepEqual(transportContiguousGroupSizes(3, policy(1, 6), "departure"), [1, 1, 1]);
  assert.deepEqual(transportContiguousGroupSizes(6, { ...policy(1, 6), targetGroupSize: 2 }, "arrival"), [2, 2, 2]);
  assert.deepEqual(transportContiguousGroupSizes(6, { ...policy(1, 6), targetGroupSize: 3 }, "departure"), [3, 3]);
});

test("terminal validation permits a final group below the legacy compatibility minimum", () => {
  const problem = validationProblem(7);
  const [a, b, c, d, e, f, g] = problem.tasks;
  const groups = [a, b, c].map((task) => scheduled(task!, 600))
    .concat([d, e, f].map((task) => scheduled(task!, 620)), [scheduled(g!, 640)]);
  assert.equal(validateTransportGrouping(problem, groups).violationCount, 0);
});

function validationProblem(count = 7): PlannerNextProblem {
  const transportTasks = tasks(count);
  return {
    ...mainFlowVocalScenario(),
    transportPolicy: {
      arrival: { ...policy(), taskIds: transportTasks.map(({ id }) => id) },
      departure: { ...policy(2, 4, 10), taskIds: [] },
    },
    tasks: transportTasks,
  };
}
const scheduled = (task: Task, start: number): ScheduledTask => ({ ...task, start, end: start + task.duration });

test("independent validation enforces coverage, synchronization, bounds, and consecutive-start gap", () => {
  const problem = validationProblem();
  const [a, b, c, d, e, f, g] = problem.tasks;
  const valid = [a, b, c].map((task) => scheduled(task!, 600)).concat([d, e, f, g].map((task) => scheduled(task!, 620)));
  assert.equal(validateTransportGrouping(problem, valid).violationCount, 0);
  assert.ok(validateTransportGrouping(problem, valid.slice(1)).violationCount > 0, "missing task");
  assert.ok(validateTransportGrouping(problem, valid.map((task) => task.id === c!.id ? { ...task, start: 605, end: 615 } : task)).violationCount > 0, "unsynchronized residual");
  assert.ok(validateTransportGrouping(problem, valid.map((task) => task.start === 620 ? { ...task, start: 615, end: 625 } : task)).violationCount > 0, "gap");
});

test("a materialized synchronized group obeys hard maximum even when configured gap is zero", () => {
  const zeroGap = validationProblem(6);
  zeroGap.transportPolicy!.arrival = { ...policy(2, 3, 0), taskIds: zeroGap.tasks.map(({ id }) => id) };
  const oversized = zeroGap.tasks.map((task) => scheduled(task, 600));
  assert.ok(validateTransportGrouping(zeroGap, oversized).violationCount > 0);

  const legal = validationProblem(3);
  legal.transportPolicy!.arrival = { ...policy(2, 3, 0), taskIds: legal.tasks.map(({ id }) => id) };
  assert.equal(validateTransportGrouping(legal, legal.tasks.map((task) => scheduled(task, 600))).violationCount, 0);
});

function exactProblem(orderReversed = false): PlannerNextProblem {
  const window = [{ start: 0, end: 120 }];
  const transportParticipants = Array.from({ length: 6 }, (_, index) => ({ id: `transport-p-${index}`, availability: window }));
  const transportTasks = transportParticipants.map((participant, index): Task => ({
    id: `arrival-${participant.id}`, kind: "auxiliary", participantId: participant.id,
    duration: 10, spaceId: `transport-${index}`, dependencies: [], availability: [{ start: index < 3 ? 0 : 20, end: index < 3 ? 10 : 30 }],
  }));
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 }, resources: [],
    spaces: ["main", "vocal", ...transportParticipants.map((_, index) => `transport-${index}`)]
      .map((id) => ({ id, availability: window })),
    participants: [{ id: "core", availability: window }, ...transportParticipants],
    coaches: [{ id: "coach", availability: window }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...transportTasks,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 20_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    transportPolicy: {
      arrival: { ...policy(3, 3, 20), taskIds: transportTasks.map(({ id }) => id) },
      departure: { ...policy(2, 4, 10), taskIds: [] },
    },
  };
  if (orderReversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse();
    problem.transportPolicy.arrival.taskIds.reverse();
  }
  return problem;
}

test("exact constructive jointly chooses conflict-free synchronized groups deterministically and order-invariantly", () => {
  const original = exactProblem(), snapshot = structuredClone(original);
  assert.deepEqual(preflight(original), []);
  const manual = original.tasks.map((task, index) => scheduled(task,
    task.id.startsWith("arrival-") ? (Number(task.id.at(-1)) < 3 ? 0 : 20) : task.id === "vocal" ? 80 : 90));
  assert.equal(validatePlan(original, manual).hardValid, true, JSON.stringify(validatePlan(original, manual)));
  const first = executePlannerNext(original), again = executePlannerNext(exactProblem()), reversed = executePlannerNext(exactProblem(true));
  assert.equal(first.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(again.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(reversed.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(first.result?.complete, true, JSON.stringify(first.result && { status: first.result.status, reasons: first.result.evidence.reasonCodes, coreReasons: first.result.evidence.coreReasonCodes, branches: first.result.evidence.branchesExplored }));
  assert.equal(first.result?.evidence.fullFingerprint, again.result?.evidence.fullFingerprint);
  assert.equal(first.result?.evidence.fullFingerprint, reversed.result?.evidence.fullFingerprint);
  assert.deepEqual(original, snapshot);
  const transport = first.result!.scheduledTasks.filter(({ id }) => id.startsWith("arrival-"));
  assert.equal(validateTransportGrouping(original, transport).violationCount, 0);
  assert.equal(new Set(transport.map(({ start }) => start)).size, 2);
});

function arrivalWorkStyleDepartureProblem(reverse = false, departureCount = 2): PlannerNextProblem {
  const window = [{ start: 0, end: 140 }];
  const people = Array.from({ length: departureCount }, (_, index) => `p-${index}`);
  const auxiliaryTasks: Task[] = people.flatMap((participantId, index) => {
    const departureStart = departureCount === 2 || index < departureCount / 2 ? 80 : 100;
    return [
      { id: `in-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `in-${index}`, dependencies: [], availability: [{ start: 0, end: 10 }] },
      { id: `work-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `work-${index}`, dependencies: [], availability: [{ start: 20, end: 30 }] },
      { id: `style-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `style-${index}`, dependencies: [], availability: [{ start: 40, end: 50 }] },
      { id: `out-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `out-${index}`, dependencies: [`style-${participantId}`], availability: [{ start: departureStart, end: departureStart + 10 }] },
    ];
  });
  const allSpaces = ["main", "vocal", ...auxiliaryTasks.map(({ spaceId }) => spaceId)];
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 140 }, protectedMeal: { start: 130, end: 140 }, resources: [],
    spaces: [...new Set(allSpaces)].map((id) => ({ id, availability: window })),
    participants: people.map((id) => ({ id, availability: window })),
    coaches: [{ id: "coach", availability: window }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "p-0", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: ["in-p-0"] },
      { id: "main", kind: "main", participantId: "p-0", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...auxiliaryTasks,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 100_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    transportPolicy: {
      arrival: { ...policy(1, Math.max(2, departureCount), 0), targetGroupSize: 2, taskIds: people.map((id) => `in-${id}`) },
      departure: { ...policy(1, departureCount === 2 ? 2 : 4, 20), targetGroupSize: 2, taskIds: people.map((id) => `out-${id}`) },
    },
  };
  if (reverse) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse();
    problem.transportPolicy!.arrival.taskIds.reverse(); problem.transportPolicy!.departure.taskIds.reverse();
  }
  return problem;
}

test("transport validation enforces IN as first and OUT as last participant obligations", () => {
  const problem = arrivalWorkStyleDepartureProblem();
  const timeline = problem.tasks
    .filter((task) => /^(in|work|style|out)-/.test(task.id))
    .map((task) => scheduled(task, task.id.startsWith("in-") ? 0 : task.id.startsWith("work-") ? 20 : task.id.startsWith("style-") ? 40 : 80));
  assert.equal(validateTransportGrouping(problem, timeline).violationCount, 0);

  const beforeIn = timeline.map((task) => task.id === "work-p-0" ? { ...task, start: 5, end: 15 } : task);
  assert.ok(validateTransportGrouping(problem, beforeIn).violationCount > 0, "IN must be the first participant obligation");

  const afterOut = timeline.map((task) => task.id === "work-p-0" ? { ...task, start: 85, end: 95 } : task);
  assert.ok(validateTransportGrouping(problem, afterOut).violationCount > 0, "OUT must be the last participant obligation");
});

test("final transport validation treats a materialized participant meal as a bounded obligation", () => {
  const problem = arrivalWorkStyleDepartureProblem();
  const timeline = problem.tasks
    .filter((task) => /^(in|work|style|out)-/.test(task.id))
    .map((task) => scheduled(task, task.id.startsWith("in-") ? 0 : task.id.startsWith("work-") ? 20 : task.id.startsWith("style-") ? 40 : 80));
  const meal = { id: "meal-p-0", sourceTaskId: "meal-source-p-0", participantId: "p-0", duration: 10, start: 95, end: 105 };
  assert.ok(validateTransportGrouping(problem, timeline, [meal]).violationCount > 0, "meal after OUT must violate OUT-last");
  const finalValidation = validatePlan(problem, timeline, [], [], [meal]);
  assert.ok((finalValidation.transportGroupingViolationCount ?? 0) > 0, "validatePlan must pass participant meals to transport validation");
});

test("exact continuation constructs IN, work, ESTILISMO_SALIDA, then dependent OUT immutably and order-invariantly", () => {
  const problem = arrivalWorkStyleDepartureProblem(), snapshot = structuredClone(problem);
  const first = executePlannerNext(problem), repeated = executePlannerNext(arrivalWorkStyleDepartureProblem());
  const reversed = executePlannerNext(arrivalWorkStyleDepartureProblem(true));
  assert.equal(first.kind, "EXACT_CONSTRUCTIVE"); assert.equal(first.result?.complete, true, JSON.stringify(first.result && { status: first.result.status, reasons: first.result.evidence.reasonCodes, coreReasons: first.result.evidence.coreReasonCodes, remaining: first.result.remainingTaskIds, branches: first.result.evidence.branchesExplored, coreBranches: first.result.evidence.coreBranchesExplored, standaloneBranches: first.result.evidence.standaloneBranchesExplored }));
  assert.equal(repeated.kind, "EXACT_CONSTRUCTIVE"); assert.equal(reversed.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(first.result!.evidence.fullFingerprint, repeated.result!.evidence.fullFingerprint);
  assert.equal(first.result!.evidence.fullFingerprint, reversed.result!.evidence.fullFingerprint);
  for (const out of first.result!.scheduledTasks.filter(({ id }) => id.startsWith("out-"))) {
    const style = first.result!.scheduledTasks.find(({ id }) => id === out.dependencies[0])!;
    assert.ok(out.start >= style.end);
  }
  const arrival = first.result!.scheduledTasks.find(({ id }) => id === "in-p-0")!;
  const vocal = first.result!.scheduledTasks.find(({ id }) => id === "vocal")!;
  assert.deepEqual(vocal.dependencies, ["in-p-0"]);
  assert.ok(arrival.end <= vocal.start);
  assert.deepEqual(problem, snapshot);
});
