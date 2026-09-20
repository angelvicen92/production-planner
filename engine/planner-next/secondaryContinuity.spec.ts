import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { longSecondaryBlockScenario } from "./scenarios/longSecondaryBlockScenario";
import { hasRequiredSecondaryContinuity, secondaryBlockCount, secondaryGapMinutes } from "./secondaryContinuity";
import { preflight, validatePlan } from "./validate";
import { generateBlockCandidates } from "./placeAuxiliaryTasks";

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

test("required continuity treats a synchronized joint as one atomic physical occupation",()=>{
  const make=()=>{const problem=longSecondaryBlockScenario();const own=problem.tasks.filter(task=>task.spaceId==="long-form-room");
    own[0]!.duration=20;own[1]!.duration=10;own[1]!.jointGroupId="required-joint";
    own[2]!.duration=10;own[2]!.jointGroupId="required-joint";own[3]!.duration=10;own[3]!.dependencies=[own[1]!.id,own[2]!.id];
    return {problem,prior:{...own[0]!,start:problem.day.start,end:problem.day.start+20},pending:own.slice(1)};};
  const first=make();assert.ok(!preflight(first.problem).includes("JOINT_GROUP_IN_STRUCTURED_SPACE_UNSUPPORTED"));
  const generated=generateBlockCandidates(first.problem,first.pending,[first.prior],first.problem.budget.maxBranchExpansions);
  const candidate=generated.candidates[0]!;const joint=candidate.tasks.filter(task=>task.jointGroupId==="required-joint");
  assert.equal(joint.length,2);assert.equal(joint[0]!.start,first.prior.end);assert.equal(joint[0]!.start,joint[1]!.start);assert.equal(joint[0]!.end,joint[1]!.end);
  const later=candidate.tasks.find(task=>task.jointGroupId===undefined)!;assert.equal(later.start,joint[0]!.end);
  assert.equal(Math.max(...candidate.tasks.map(task=>task.end))-first.prior.end,20);
  const validation=validatePlan(first.problem,[first.prior,...candidate.tasks]);
  assert.equal(validation.jointGroupViolationCount,0);assert.equal(validation.secondaryContinuityViolationCount,0);
  const desynchronized=structuredClone(candidate.tasks);desynchronized.find(task=>task.id===joint[1]!.id)!.start+=5;desynchronized.find(task=>task.id===joint[1]!.id)!.end+=5;
  const invalid=validatePlan(first.problem,[first.prior,...desynchronized]);assert.equal(invalid.jointGroupViolationCount,1);assert.equal(invalid.secondaryContinuityViolationCount,1);
  const reversed=make();const again=generateBlockCandidates(reversed.problem,[...reversed.pending].reverse(),[reversed.prior],reversed.problem.budget.maxBranchExpansions);
  assert.deepEqual(again.candidates[0]?.tasks,candidate.tasks);assert.deepEqual(generateBlockCandidates(first.problem,first.pending,[first.prior],first.problem.budget.maxBranchExpansions).candidates[0]?.tasks,candidate.tasks);
  const setup=make();setup.problem.spaces.find(space=>space.id==="long-form-room")!.setupPolicy={familyOrder:["family"],reentry:"FORBIDDEN"};
  setup.problem.tasks.filter(task=>task.spaceId==="long-form-room").forEach(task=>{task.setupFamilyId="family";});
  assert.ok(preflight(setup.problem).includes("JOINT_GROUP_IN_STRUCTURED_SPACE_UNSUPPORTED"));
});
