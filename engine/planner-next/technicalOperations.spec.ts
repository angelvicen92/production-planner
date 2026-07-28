import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { canPlaceTask } from "./placement";
import { jointAuxiliaryTasksScenario } from "./scenarios/jointAuxiliaryTasksScenario";
import { technicalOperationScenario } from "./scenarios/technicalOperationScenario";
import { preflight, validatePlan } from "./validate";

const operation = (overrides: Record<string, unknown> = {}): Task => ({ id: "technical-camera-positioning", kind: "technical", duration: 20, spaceId: "technical-room", dependencies: [], requiredResourceIds: ["technical-unit"], ...overrides } as Task);
const malformed = (overrides: Record<string, unknown>): PlannerNextProblem => { const problem = technicalOperationScenario(); problem.tasks = problem.tasks.map((task) => task.kind === "technical" ? operation(overrides) : task); return problem; };

test("plans a participant-free technical operation without mutating input", () => {
  const problem = technicalOperationScenario(), snapshot = structuredClone(problem), result = planMainFlowAndFeeders(problem), technical = result.scheduledTasks.find(({ kind }) => kind === "technical");
  assert.deepEqual(problem, snapshot); assert.equal(result.complete, true); assert.equal(result.metrics.hardValid, true); assert.equal(result.metrics.plannedTaskCount, 27);
  assert.deepEqual(technical, { id: "technical-camera-positioning", kind: "technical", duration: 20, spaceId: "technical-room", dependencies: [], requiredResourceIds: ["technical-unit"], start: technical?.start, end: technical?.end });
  assert.equal(result.metrics.technicalOperationCandidateCountWhenSelectedById["technical-camera-positioning"], 3);
  assert.equal(result.metrics.auxiliaryWorkItemSelectionOrder[0], "task:technical-camera-positioning");
  assert.equal(result.metrics.resourcePresenceMinutesById["technical-unit"], 20); assert.equal(result.metrics.resourceInternalGapMinutesById["technical-unit"], 0);
  assert.equal(result.metrics.technicalOperationViolationCount, 0);
  const control = planMainFlowAndFeeders(jointAuxiliaryTasksScenario());
  assert.deepEqual(result.metrics.participantPresenceMinutesById, control.metrics.participantPresenceMinutesById);
  const ids = new Set(control.scheduledTasks.map(({ id }) => id));
  const project = (tasks: ScheduledTask[]) => tasks.filter(({ id }) => ids.has(id)).map(({ id, start, end, spaceId }) => ({ id, start, end, spaceId })).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(project(result.scheduledTasks), project(control.scheduledTasks));
  const reversed = technicalOperationScenario(); reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.resources.reverse();
  reversed.tasks.find(({ kind }) => kind === "technical")!.requiredResourceIds?.reverse();
  assert.equal(planMainFlowAndFeeders(reversed).metrics.planFingerprint, result.metrics.planFingerprint);
});

test("technical preflight reasons are specific, crash-safe and deterministic", () => {
  const cases: Array<[Record<string, unknown>, string]> = [[{ participantId: "participant-a" }, "TECHNICAL_PARTICIPANT_UNSUPPORTED"], [{ participantId: null }, "TECHNICAL_PARTICIPANT_UNSUPPORTED"], [{ coachId: "coach-a" }, "TECHNICAL_COACH_UNSUPPORTED"], [{ dependencies: ["vocal-a"] }, "TECHNICAL_DEPENDENCY_UNSUPPORTED"], [{ jointGroupId: "x" }, "TECHNICAL_GROUPING_UNSUPPORTED"], [{ setupFamilyId: "x" }, "TECHNICAL_GROUPING_UNSUPPORTED"], [{ blockKey: "x" }, "TECHNICAL_GROUPING_UNSUPPORTED"], [{ requiredResourceIds: ["missing"] }, "MISSING_RESOURCE_REFERENCE"], [{ spaceId: "missing" }, "MISSING_SPACE_REFERENCE"]];
  for (const [change, reason] of cases) assert.ok(preflight(malformed(change)).includes(reason), reason);
  const structured = technicalOperationScenario().spaces.filter((space) => space.secondaryContinuity === "REQUIRED" || space.setupPolicy).map(({ id }) => id);
  for (const spaceId of [...structured, technicalOperationScenario().mainFlow.spaceId]) assert.ok(preflight(malformed({ spaceId })).includes("TECHNICAL_IN_STRUCTURED_SPACE_UNSUPPORTED"));
  const reasons = preflight(malformed({ participantId: null, coachId: "x", dependencies: ["missing"], jointGroupId: "" }));
  assert.deepEqual(reasons, [...new Set(reasons)].sort());
});

test("technical operations share only hard spaces and resources", () => {
  const problem = technicalOperationScenario(), first = operation(), base = { ...first, start: 540, end: 560 } as ScheduledTask;
  problem.spaces.push({ id: "other-room", availability: [{ start: 540, end: 570 }] }); problem.resources.push({ id: "other-unit", availability: [{ start: 540, end: 570 }], presencePreference: "OFF" });
  assert.equal(canPlaceTask(problem, operation({ id: "independent", spaceId: "other-room", requiredResourceIds: ["other-unit"] }), 540, [base]), true);
  assert.equal(canPlaceTask(problem, operation({ id: "same-space", requiredResourceIds: ["other-unit"] }), 540, [base]), false);
  assert.equal(canPlaceTask(problem, operation({ id: "same-resource", spaceId: "other-room" }), 540, [base]), false);
  const normal = { ...jointAuxiliaryTasksScenario().tasks.find(({ kind }) => kind === "auxiliary")!, requiredResourceIds: ["technical-unit"], start: 540, end: 560 } as ScheduledTask;
  assert.equal(canPlaceTask(problem, operation({ spaceId: normal.spaceId, requiredResourceIds: [] }), 540, [normal]), false);
  assert.equal(canPlaceTask(problem, operation({ spaceId: "other-room", requiredResourceIds: normal.requiredResourceIds }), 540, [normal]), false);
});

test("impossible technical operation fails atomically", () => { const problem = malformed({ duration: 35 }); const result = planMainFlowAndFeeders(problem); assert.equal(result.complete, false); assert.deepEqual(result.scheduledTasks, []); assert.deepEqual(result.scheduledSetupPreparations, []); });

test("final validation counts one violation per affected technical id", () => {
  const problem = technicalOperationScenario(), result = planMainFlowAndFeeders(problem), changed = result.scheduledTasks.map((task) => task.kind === "technical" ? ({ ...task, participantId: "participant-a", spaceId: "joint-room" } as unknown as ScheduledTask) : task);
  assert.equal(validatePlan(problem, changed, result.scheduledSetupPreparations).technicalOperationViolationCount, 1);
  const unknown = operation({ id: "unknown", spaceId: "other-room", requiredResourceIds: [] }) as ScheduledTask; problem.spaces.push({ id: "other-room", availability: [{ start: 540, end: 570 }] }); (unknown as any).start = 540; (unknown as any).end = 560;
  assert.equal(validatePlan(problem, [...result.scheduledTasks, unknown], result.scheduledSetupPreparations).technicalOperationViolationCount, 1);
});
