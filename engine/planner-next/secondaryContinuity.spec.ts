import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { longSecondaryBlockScenario } from "./scenarios/longSecondaryBlockScenario";
import { hasRequiredSecondaryContinuity, secondaryBlockCount, secondaryGapMinutes } from "./secondaryContinuity";
import { preflight, validatePlan } from "./validate";

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
