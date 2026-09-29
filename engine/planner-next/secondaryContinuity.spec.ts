import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { longSecondaryBlockScenario } from "./scenarios/longSecondaryBlockScenario";
import { hasRequiredSecondaryContinuity, secondaryBlockCount, secondaryGapMinutes } from "./secondaryContinuity";
import { preflight, validatePlan } from "./validate";
import type { PlannerNextProblem, ScheduledOperationalMeal, ScheduledTask } from "./contracts";

test("NEXT-006 schedules a required secondary space as one complete block", () => {
  const problem = longSecondaryBlockScenario();
  const before = JSON.stringify(problem);
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, true);
  assert.equal(result.metrics.plannedTaskCount, 22);
  assert.equal(result.metrics.auxiliaryWorkItemSelectionOrder[0], "space:long-form-room");
  assert.equal(result.metrics.secondarySpaceGapMinutesById["long-form-room"], 0);
  assert.equal(result.metrics.secondarySpaceBlockCountById["long-form-room"], 1);
  assert.ok((result.metrics.secondarySpaceStartById["long-form-room"] ?? 0) > 540);
  assert.equal((result.metrics.secondarySpaceEndById["long-form-room"] ?? 0) - (result.metrics.secondarySpaceStartById["long-form-room"] ?? 0), 120);
  assert.equal(JSON.stringify(problem), before);
  assert.equal(planMainFlowAndFeeders(longSecondaryBlockScenario()).metrics.planFingerprint, result.metrics.planFingerprint);
  const reversed = longSecondaryBlockScenario();
  reversed.tasks.reverse(); reversed.spaces.reverse(); reversed.participants.reverse(); reversed.coaches.reverse();
  const inverted = planMainFlowAndFeeders(reversed);
  assert.equal(inverted.metrics.planFingerprint, result.metrics.planFingerprint);
  assert.deepEqual(inverted.metrics.auxiliaryWorkItemSelectionOrder, result.metrics.auxiliaryWorkItemSelectionOrder);
});

test("pure continuity helpers accept unordered and mixed-duration tasks", () => {
  const tasks = [{ id:"b",kind:"auxiliary" as const,participantId:"p",duration:35,spaceId:"s",dependencies:[],start:570,end:605 }, { id:"a",kind:"auxiliary" as const,participantId:"q",duration:30,spaceId:"s",dependencies:[],start:540,end:570 }];
  assert.equal(hasRequiredSecondaryContinuity(tasks), true); assert.equal(secondaryGapMinutes(tasks), 0); assert.equal(secondaryBlockCount(tasks), 1);
});

test("validator reports one structural incidence for a secondary gap", () => {
  const problem = longSecondaryBlockScenario(), result = planMainFlowAndFeeders(problem);
  const tasks = result.scheduledTasks.map((task) => task.id === "z-long-1" ? { ...task, start: task.start + 5, end: task.end + 5 } : task);
  const validation = validatePlan(problem, tasks);
  assert.ok(validation.secondaryContinuityViolationCount > 0);
  assert.ok(validation.reasonCodes.includes("SECONDARY_CONTINUITY_VIOLATION"));
});

function operationalBridgeFixture():{problem:PlannerNextProblem;tasks:ScheduledTask[];meal:(start:number,end:number,spaceIds?:string[])=>ScheduledOperationalMeal}{
  const problem:PlannerNextProblem={day:{start:0,end:100},spaces:[{id:"required",availability:[{start:0,end:100}],secondaryContinuity:"REQUIRED"},{id:"other",availability:[{start:0,end:100}]}],resources:[],
    participants:[{id:"a",availability:[{start:0,end:100}]},{id:"b",availability:[{start:0,end:100}]}],coaches:[],tasks:[],
    mainFlow:{spaceId:"other",preferredEnd:100,continuity:"PREFERRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
    budget:{maxBranchExpansions:100,bestK:2},searchPolicy:"EXACT_CONSTRUCTIVE",
    operationalMealPolicies:[{id:"pause",duration:10,window:{start:0,end:100},resourceIds:[],spaceIds:["required","other"]}]};
  const base=[{id:"a",kind:"auxiliary" as const,participantId:"a",duration:10,spaceId:"required",dependencies:[]},{id:"b",kind:"auxiliary" as const,participantId:"b",duration:10,spaceId:"required",dependencies:[]}];
  problem.tasks=base;
  return {problem,tasks:[{...base[0]!,start:20,end:30},{...base[1]!,start:30,end:40}],meal:(start,end,spaceIds=["required","other"])=>({id:"pause",duration:end-start,start,end,resourceIds:[],spaceIds})};
}

test("operational meals outside a REQUIRED occupation span do not extend it",()=>{
  const {problem,tasks,meal}=operationalBridgeFixture();
  assert.equal(validatePlan(problem,tasks,[],[],[],[],[],[],[meal(0,10)]).secondaryContinuityViolationCount,0);
  assert.equal(validatePlan(problem,tasks,[],[],[],[],[],[],[meal(50,60)]).secondaryContinuityViolationCount,0);
});

test("an authorized operational meal bridges only an exactly adjacent internal interruption",()=>{
  const {problem,tasks,meal}=operationalBridgeFixture();
  const bridged=[tasks[0]!,{...tasks[1]!,start:40,end:50}];
  assert.equal(validatePlan(problem,bridged,[],[],[],[],[],[],[meal(30,40)]).secondaryContinuityViolationCount,0);
  const gapBefore=[tasks[0]!,{...tasks[1]!,start:45,end:55}];
  const gapAfter=[{...tasks[0]!,start:15,end:25},{...tasks[1]!,start:40,end:50}];
  assert.equal(validatePlan(problem,gapBefore,[],[],[],[],[],[],[meal(30,40)]).secondaryContinuityViolationCount,1);
  assert.equal(validatePlan(problem,gapAfter,[],[],[],[],[],[],[meal(25,35)]).secondaryContinuityViolationCount,1);
});

test("a multi-space operational meal does not widen a REQUIRED block whose work is on one side",()=>{
  const {problem,tasks,meal}=operationalBridgeFixture();
  const after=[{...tasks[0]!,start:40,end:50},{...tasks[1]!,start:50,end:60}];
  assert.equal(validatePlan(problem,after,[],[],[],[],[],[],[meal(30,40)]).secondaryContinuityViolationCount,0);
});

test("preflight rejects unsupported required-secondary configurations stably", () => {
  const preferred = longSecondaryBlockScenario(); (preferred.spaces.at(-2) as any).secondaryContinuity = "PREFERRED";
  assert.ok(preflight(preferred).includes("INVALID_SECONDARY_CONTINUITY"));
  const main = longSecondaryBlockScenario(); main.spaces[0]!.secondaryContinuity = "REQUIRED";
  assert.deepEqual(preflight(main).filter((x) => x.startsWith("REQUIRED_SECONDARY")), ["REQUIRED_SECONDARY_ON_MAIN_FLOW_UNSUPPORTED", "REQUIRED_SECONDARY_SPACE_EMPTY", "REQUIRED_SECONDARY_WITH_NON_AUXILIARY_TASK"]);
});

test("an impossible block publishes no partial tasks", () => {
  const problem = longSecondaryBlockScenario();
  problem.spaces.find(({ id }) => id === "long-form-room")!.availability = [{ start: 540, end: 600 }];
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, false); assert.deepEqual(result.scheduledTasks, []);
});

test("secondary block branch exhaustion is explicit and atomic", () => {
  const problem = longSecondaryBlockScenario(); problem.budget.maxBranchExpansions = 5_000;
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, false); assert.deepEqual(result.scheduledTasks, []);
  assert.equal(result.metrics.searchStopReason, "SECONDARY_BLOCK_BRANCH_BUDGET_EXHAUSTED");
});
