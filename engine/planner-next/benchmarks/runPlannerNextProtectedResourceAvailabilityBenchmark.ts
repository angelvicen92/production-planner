import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";

const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(freeze); Object.freeze(value); } return value; };
const reverse = (source: EngineInput): EngineInput => { const copy = clone(source); copy.tasks.reverse(); copy.locks.reverse(); copy.planResourceItems.reverse(); return copy; };

function protectedFixture(taskId: number, status: "done" | "in_progress", resourceId: number, window: readonly [string | null, string | null]): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  Object.assign(input.tasks.find((task) => task.id === taskId), { status, startReal: "10:00", endReal: "10:30" });
  input.locks.push({ id: 20, planId: input.planId, taskId, lockType: "resource", lockedResourceId: resourceId });
  Object.assign(input.planResourceItems.find((resource) => resource.id === resourceId), { availabilityStart: window[0], availabilityEnd: window[1] });
  return input;
}

function evaluate(scenarioId: string, raw: EngineInput, taskId: number, resourceId: number, resourceChannel: "coach" | "generic", expected: "SUPPORTED" | "UNSUPPORTED") {
  const input = freeze(clone(raw)); const before = clone(input);
  const preflight = preflightEngineInputForPlannerNext(input); const result = adaptEngineInputToPlannerNextProblem(input);
  const repeated = adaptEngineInputToPlannerNextProblem(input); const inverted = adaptEngineInputToPlannerNextProblem(freeze(reverse(input)));
  assert.deepEqual(input, before); assert.deepEqual(result, repeated); assert.deepEqual(result, inverted); assert.equal(result.status, expected);
  const task = input.tasks.find((entry) => entry.id === taskId)!;
  const issue = preflight.issues.find((entry) => entry.code === "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE" && entry.details?.planResourceItemId === resourceId);
  const assignmentSources = issue?.details?.assignmentSources ?? [
    ...(task.assignedResourceIds?.includes(resourceId) ? ["direct"] : []),
    ...(task.spaceId != null && input.spaceResourceAssignments[task.spaceId]?.includes(resourceId) ? ["space"] : []),
    ...(task.zoneId != null && input.zoneResourceAssignments[task.zoneId]?.includes(resourceId) ? ["zone"] : []),
  ];
  const resourceLockIds = [...new Set(input.locks.filter((lock) => lock.taskId === taskId && (lock.lockType === "resource" || lock.lockType === "full") && lock.lockedResourceId === resourceId).map((lock) => lock.id))].sort((a, b) => a - b);
  return {
    scenarioId, status: result.status, reasonCodes: result.reasonCodes,
    protectedInterval: { start: task.startReal, end: task.endReal }, resourceId, resourceChannel,
    assignmentSources, resourceLockIds,
    conflictCount: preflight.diagnostics.protectedTaskResourceAvailabilityConflictCount,
    problemFingerprint: result.problemFingerprint, inputImmutable: true, repetitionIdentical: true, inversionIdentical: true,
  };
}

const compatible = protectedFixture(105, "done", 504, ["10:00", "10:30"]);
const outside = protectedFixture(105, "done", 504, ["11:00", "12:00"]);
const inProgressCoach = protectedFixture(101, "in_progress", 501, ["10:00", "10:30"]);
const outsideCoach = protectedFixture(101, "done", 501, ["11:00", "12:00"]);
const assignmentAndLock = protectedFixture(105, "done", 503, ["10:00", "10:30"]);
const cancelled = createSupportedEngineInputAdapterFixture();
cancelled.tasks.push({ ...clone(cancelled.tasks[4]!), id: 106, templateId: 906, status: "cancelled" });
cancelled.locks.push({ id: 20, planId: cancelled.planId, taskId: 106, lockType: "resource", lockedResourceId: 504 });

const scenarios = [
  evaluate("done-generic-lock-compatible", compatible, 105, 504, "generic", "SUPPORTED"),
  evaluate("done-generic-lock-outside-availability", outside, 105, 504, "generic", "UNSUPPORTED"),
  evaluate("in-progress-coach-lock-compatible", inProgressCoach, 101, 501, "coach", "SUPPORTED"),
  evaluate("done-coach-lock-outside-availability", outsideCoach, 101, 501, "coach", "UNSUPPORTED"),
  evaluate("done-assignment-and-lock-deduplicated", assignmentAndLock, 105, 503, "generic", "SUPPORTED"),
  evaluate("cancelled-lock-ignored", cancelled, 106, 504, "generic", "SUPPORTED"),
];

process.stdout.write(`${JSON.stringify({ benchmark: "SPEC10-011-protected-task-resource-availability", baseSha: "8dfd7595c42ee40676cc308d1ddc70352ef865c7", classification: "DB Safe Merge", scenarios }, null, 2)}\n`);
