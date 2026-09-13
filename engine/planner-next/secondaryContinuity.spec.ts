import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { longSecondaryBlockScenario } from "./scenarios/longSecondaryBlockScenario";
import { canonicalSecondaryOccupations, hasRequiredSecondaryContinuity, secondaryBlockCount, secondaryGapMinutes } from "./secondaryContinuity";
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

test("a synchronized joint is one canonical REQUIRED-space occupation", () => {
  const problem = longSecondaryBlockScenario();
  for (const id of ["z-long-1", "y-long-2"]) problem.tasks.find((task) => task.id === id)!.jointGroupId = "joint-long";
  const before = structuredClone(problem);
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, true);
  const own = result.scheduledTasks.filter((task) => task.spaceId === "long-form-room");
  const joint = own.filter((task) => task.jointGroupId === "joint-long");
  assert.equal(joint.length, 2);
  assert.equal(new Set(joint.map((task) => `${task.start}:${task.end}`)).size, 1);
  const occupations = canonicalSecondaryOccupations(own);
  assert.equal(occupations.length, 3);
  assert.equal(hasRequiredSecondaryContinuity(occupations), true);
  assert.equal(validatePlan(problem, result.scheduledTasks).secondaryContinuityViolationCount, 0);

  const unsynchronized = result.scheduledTasks.map((task) => task.id === joint[1]!.id
    ? { ...task, start: task.start + 5, end: task.end + 5 } : task);
  const invalidJoint = validatePlan(problem, unsynchronized);
  assert.ok(invalidJoint.jointGroupViolationCount > 0);
  assert.ok(invalidJoint.secondaryContinuityViolationCount > 0);

  const foreign = { ...problem.tasks.find((task) => task.id === "x-long-3")!, id: "foreign-overlap", participantId: "participant-g", start: joint[0]!.start, end: joint[0]!.end };
  const foreignProblem = { ...problem, tasks: [...problem.tasks, foreign] };
  const foreignValidation = validatePlan(foreignProblem, [...result.scheduledTasks, foreign]);
  assert.ok(foreignValidation.overlapViolationCount > 0);
  assert.ok(foreignValidation.secondaryContinuityViolationCount > 0);

  const reversed = structuredClone(problem); reversed.tasks.reverse(); reversed.spaces.reverse();
  assert.equal(planMainFlowAndFeeders(reversed).metrics.planFingerprint, result.metrics.planFingerprint);
  assert.deepEqual(problem, before);
});

test("a real gap between canonical occupations still violates REQUIRED continuity", () => {
  const occupations = canonicalSecondaryOccupations([
    { id: "joint-a", jointGroupId: "joint", kind: "auxiliary", participantId: "p1", duration: 10, spaceId: "s", dependencies: [], start: 10, end: 20 },
    { id: "joint-b", jointGroupId: "joint", kind: "auxiliary", participantId: "p2", duration: 10, spaceId: "s", dependencies: [], start: 10, end: 20 },
    { id: "individual", kind: "auxiliary", participantId: "p3", duration: 10, spaceId: "s", dependencies: [], start: 25, end: 35 },
  ]);
  assert.equal(occupations.length, 2);
  assert.equal(secondaryGapMinutes(occupations), 5);
  assert.equal(hasRequiredSecondaryContinuity(occupations), false);
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
