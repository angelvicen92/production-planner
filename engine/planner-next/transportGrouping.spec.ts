import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import {
  emptyTransportGroupingExplorerEvidence,
  exploreTransportGroups,
  transportGroupCandidates,
  validateTransportGrouping,
} from "./transportGrouping";
import { preflight } from "./validate";
import { validatePlan } from "./validate";

const policy = (minimumGroupSize = 3, maximumGroupSize = 4, minGapMinutes = 20): TransportGroupingPolicy => ({
  taskIds: [], minimumGroupSize, maximumGroupSize, minGapMinutes, groupingWeight: 3,
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
      arrival: { ...policy(2, Math.max(2, departureCount), 0), taskIds: people.map((id) => `in-${id}`) },
      departure: { ...policy(2, departureCount === 2 ? 2 : 4, 20), taskIds: people.map((id) => `out-${id}`) },
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

test("an unusable preferred OUT grouping backtracks to a valid partition under the shared ledger", () => {
  const problem = arrivalWorkStyleDepartureProblem(false, 6);
  problem.transportPolicy!.departure = { ...policy(2, 4, 20), taskIds: problem.transportPolicy!.departure.taskIds };
  const result = executePlannerNext(problem);
  assert.equal(result.kind, "EXACT_CONSTRUCTIVE"); assert.equal(result.result?.complete, true, JSON.stringify(result.result && { status: result.result.status, reasons: result.result.evidence.reasonCodes, coreReasons: result.result.evidence.coreReasonCodes, remaining: result.result.remainingTaskIds, branches: result.result.evidence.branchesExplored, coreBranches: result.result.evidence.coreBranchesExplored, standaloneBranches: result.result.evidence.standaloneBranchesExplored }));
  assert.ok(result.result!.evidence.standaloneBacktracks > 0);
  const outs = result.result!.scheduledTasks.filter(({ id }) => id.startsWith("out-"));
  assert.deepEqual([...new Set(outs.map(({ start }) => start))], [80, 100]);
  assert.deepEqual([...new Set(outs.map(({ start }) => outs.filter((other) => other.start === start).length))], [3]);
});

function explorerProblem(memberTasks:Task[],end=100_000):PlannerNextProblem {
  const window=[{start:0,end}];
  return {...mainFlowVocalScenario(),day:{start:0,end},protectedMeal:undefined,
    participants:memberTasks.map(task=>({id:task.participantId!,availability:window})),
    spaces:memberTasks.map(task=>({id:task.spaceId,availability:window})),resources:[],tasks:memberTasks,
    participantTransitionMinutes:0,resourceTransitionMinutes:0};
}

test("lazy analytic transport explorer preserves the legacy logical group/start order",()=>{
  const members=tasks(4).map((task,index)=>({...task,availability:[{start:index===3?20:0,end:index===3?30:10}]}));
  const problem=explorerProblem(members,40),p=policy(2,2,10);
  const run=(mode:"LEGACY_COMBINATIONS_FULL_GRID"|"EXACT_LAZY_ANALYTIC")=>{
    const evidence=emptyTransportGroupingExplorerEvidence(),rows:string[]=[];let branches=0;
    const result=exploreTransportGroups(problem,members,[],[],p,()=>{branches+=1;return true;},evidence,
      (group,start)=>{rows.push(`${group.map(x=>x.id).join(",")}@${start}`);return "CONTINUE";},mode);
    return {result,rows,evidence,branches};
  };
  const legacy=run("LEGACY_COMBINATIONS_FULL_GRID"),analytic=run("EXACT_LAZY_ANALYTIC");
  assert.deepEqual(analytic.rows,legacy.rows);assert.equal(analytic.result,"COMPLETE");
  assert.equal(analytic.branches,analytic.evidence.transportGroupMembershipPartialsExpanded+analytic.evidence.transportGroupStartsEvaluated);
  assert.ok(analytic.evidence.transportGroupAnalyticallyEliminatedStarts>0);
});

test("a huge impossible temporal intersection prunes descendants without sweeping its grid",()=>{
  const members=tasks(3).map((task,index)=>({...task,availability:[{start:index===0?0:50_000,end:index===0?10:50_010}]}));
  const evidence=emptyTransportGroupingExplorerEvidence();let branches=0;
  exploreTransportGroups(explorerProblem(members),members,[],[],policy(3,3),()=>{branches+=1;return true;},evidence,()=>"CONTINUE");
  assert.equal(evidence.transportGroupStartsEvaluated,0);assert.equal(evidence.transportGroupMembershipCandidatesEvaluated,0);
  assert.ok(evidence.transportGroupMembershipDomainPrunes>0);
  assert.equal(branches,evidence.transportGroupMembershipPartialsExpanded);
});

test("an impossible residual count is pruned before any complete combination",()=>{
  const members=tasks(5),evidence=emptyTransportGroupingExplorerEvidence();
  exploreTransportGroups(explorerProblem(members,100),members,[],[],policy(3,4),()=>true,evidence,()=>"CONTINUE");
  assert.equal(evidence.transportGroupMembershipCandidatesEvaluated,0);
  assert.ok(evidence.transportGroupResidualCapacityPrunes>0);
});

test("analytic minGap removes exactly the forbidden starts",()=>{
  const members=tasks(2),evidence=emptyTransportGroupingExplorerEvidence(),starts:number[]=[];
  exploreTransportGroups(explorerProblem(members,40),members,[],[20],policy(2,2,10),()=>true,evidence,
    (_group,start)=>{starts.push(start);return "CONTINUE";});
  assert.deepEqual(starts,[0,5,10,30]);
  assert.equal(evidence.transportGroupFullGridStarts,evidence.transportGroupAnalyticEligibleStarts+evidence.transportGroupAnalyticallyEliminatedStarts);
});

test("membership construction exhausts atomically before evaluating the next extension",()=>{
  const members=tasks(3),evidence=emptyTransportGroupingExplorerEvidence();let branches=0;
  const result=exploreTransportGroups(explorerProblem(members,40),members,[],[],policy(3,3),()=>branches++<1,evidence,()=>"CONTINUE");
  assert.equal(result,"BUDGET_EXHAUSTED");assert.equal(branches,2);
  assert.equal(evidence.transportGroupMembershipPartialsExpanded,1);
  assert.equal(evidence.transportGroupMembershipCandidatesEvaluated,0);
  assert.equal(evidence.transportGroupStartsEvaluated,0);
});

test("start evaluation exhausts atomically without double-charging completed membership",()=>{
  const members=tasks(2),evidence=emptyTransportGroupingExplorerEvidence();let attempts=0,consumed=0;
  const result=exploreTransportGroups(explorerProblem(members,40),members,[],[],policy(2,2),()=>{attempts+=1;if(consumed===2)return false;consumed+=1;return true;},evidence,()=>"CONTINUE");
  assert.equal(result,"BUDGET_EXHAUSTED");assert.equal(attempts,3);assert.equal(consumed,2);
  assert.equal(evidence.transportGroupMembershipPartialsExpanded,1);
  assert.equal(evidence.transportGroupMembershipCandidatesEvaluated,1);
  assert.equal(evidence.transportGroupStartsEvaluated,1);
  assert.equal(consumed,evidence.transportGroupMembershipPartialsExpanded+evidence.transportGroupStartsEvaluated);
});
