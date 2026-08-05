import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EngineInput } from "../../types";
import { preflight as preflightPlannerNextProblem } from "../validate";
import { preflightEngineInputForPlannerNext } from "./engineInputPreflight";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, fingerprintPlannerNextProblem, minuteToEngineTime } from "./engineInputAdapter";
import { createSpec10017JointGroupEngineInputFixture, createSupportedEngineInputAdapterFixture } from "./engineInputAdapter.fixture";
import { runSpec10017Probe } from "../benchmarks/runSpec10017JointGroupsBenchmark";
import { resolveEffectiveTaskFixedInterval } from "./effectiveTaskFixedInterval";
import { isFlexibleParticipantMealTask } from "./flexibleParticipantMealTasks";

const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(freeze); Object.freeze(value); } return value; };
const supported = (input: EngineInput = createSupportedEngineInputAdapterFixture()) => {
  const result = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(result.status, "SUPPORTED", result.status === "UNSUPPORTED" ? result.reasonCodes.join(",") : "");
  assert.ok(result.problem);
  return result as Extract<typeof result, { status: "SUPPORTED" }>;
};

test("strict time conversion round-trips every relevant boundary", () => {
  for (const value of ["00:00", "08:00", "08:05", "12:59", "13:00", "18:00", "23:59"]) assert.equal(minuteToEngineTime(engineTimeToMinute(value)), value);
  for (const invalid of ["8:00", "24:00", "12:60", "08:00:00"]) assert.throws(() => engineTimeToMinute(invalid), RangeError);
  for (const invalid of [-1, 1.5, 1440]) assert.throws(() => minuteToEngineTime(invalid), RangeError);
});

test("synthetic fixture is accepted by both canonical preflights", () => {
  const input = createSupportedEngineInputAdapterFixture();
  assert.equal(preflightEngineInputForPlannerNext(input).status, "SUPPORTED");
  const result = supported(input);
  assert.deepEqual(preflightPlannerNextProblem(result.problem), []);
  assert.equal(result.problem.tasks.length, 5);
  assert.deepEqual(result.problem.coaches.map((coach) => coach.id), ["plan-resource:501"]);
  for (const main of result.problem.tasks.filter((task) => task.kind === "main")) {
    const vocal = result.problem.tasks.find((task) => task.id === main.dependencies[0]);
    assert.equal(vocal?.kind, "vocal"); assert.equal(main.dependencies.length, 1); assert.equal(main.coachId, vocal?.coachId); assert.equal(main.blockKey, main.coachId);
  }
  assert.ok(result.problem.tasks.filter((task) => task.kind === "main").every((task) => !(task.requiredResourceIds ?? []).includes(task.coachId!)));
  assert.ok(result.problem.resources.every((resource) => !result.problem.coaches.some((coach) => coach.id === resource.id)));
  assert.equal(result.problem.tasks.filter((task) => task.kind === "main" || task.kind === "vocal").every((task) => task.coachId === "plan-resource:501"), true);
});

test("domain divergence guard never publishes an invalid adapted problem", () => {
  const input = createSupportedEngineInputAdapterFixture(); input.plannerNext!.mainFlow.preferredEnd = "14:30";
  assert.equal(preflightEngineInputForPlannerNext(input).status, "SUPPORTED");
  const result = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(result.status, "UNSUPPORTED"); assert.equal(result.problem, null); assert.equal(result.problemFingerprint, null);
  assert.deepEqual(result.reasonCodes, ["ADAPTED_PROBLEM_NOT_REPRESENTABLE"]);
  assert.deepEqual(result.issues.at(-1)?.details, { plannerNextReasonCodes: ["INVALID_PREFERRED_END"] });
  assert.ok(result.diagnostics.unsupportedCapabilityCodes.includes("ADAPTED_PROBLEM_NOT_REPRESENTABLE"));
});

test("only the canonical five-minute Planner Next grid is representable", () => {
  const five = createSupportedEngineInputAdapterFixture(); assert.equal(preflightEngineInputForPlannerNext(five).status, "SUPPORTED"); assert.equal(adaptEngineInputToPlannerNextProblem(five).status, "SUPPORTED");
  for (const grid of [10, 15]) { const input = createSupportedEngineInputAdapterFixture(); input.plannerNext!.timeGridMinutes = grid; const preflight = preflightEngineInputForPlannerNext(input); assert.equal(preflight.status, "UNSUPPORTED"); assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_TIME_GRID")); assert.deepEqual(preflight.issues.find((issue) => issue.code === "UNSUPPORTED_TIME_GRID")?.details, { incompatibleDurations: [], incompatibleTimes: [], requestedTimeGridMinutes: grid, supportedTimeGridMinutes: 5 }); const result = adaptEngineInputToPlannerNextProblem(input); assert.equal(result.problem, null); assert.equal(result.problemFingerprint, null); const inverted = clone(input); inverted.tasks.reverse(); inverted.planResourceItems.reverse(); assert.deepEqual(adaptEngineInputToPlannerNextProblem(inverted), result); }
  const invalid = createSupportedEngineInputAdapterFixture(); invalid.plannerNext!.timeGridMinutes = 0; assert.equal(adaptEngineInputToPlannerNextProblem(invalid).problem, null);
});

test("unsupported product gate preserves reason codes and creates no partial problem", () => {
  const input = createSupportedEngineInputAdapterFixture(); delete input.plannerNext;
  const before = preflightEngineInputForPlannerNext(input); const result = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(result.problem, null); assert.equal(result.problemFingerprint, null); assert.deepEqual(result.reasonCodes, before.reasonCodes); assert.deepEqual(result.identityMap, before.identityMap);
});

test("coach relation without effective assignment and effective assignment without relation block", () => {
  const missingAssignment = createSupportedEngineInputAdapterFixture(); missingAssignment.tasks.find((task) => task.id === 101)!.assignedResourceIds = [];
  assert.ok(preflightEngineInputForPlannerNext(missingAssignment).reasonCodes.includes("UNSUPPORTED_COACH_RESOURCE_MAPPING"));
  const missingRelation = createSupportedEngineInputAdapterFixture(); delete missingRelation.vocalCoachPlanResourceItemIdByContestantId![201];
  assert.ok(preflightEngineInputForPlannerNext(missingRelation).reasonCodes.includes("UNSUPPORTED_COACH_RESOURCE_MAPPING"));
  assert.equal(adaptEngineInputToPlannerNextProblem(missingRelation).problem, null);
});

test("vocal generic resources and cross-channel coach use remain unsupported", () => {
  const vocal = createSupportedEngineInputAdapterFixture(); vocal.tasks.find((task) => task.id === 102)!.assignedResourceIds = [501, 503];
  assert.ok(preflightEngineInputForPlannerNext(vocal).reasonCodes.includes("UNSUPPORTED_RESOURCE_REQUIREMENT"));
  const cross = createSupportedEngineInputAdapterFixture(); cross.tasks.find((task) => task.id === 105)!.assignedResourceIds = [501];
  assert.ok(preflightEngineInputForPlannerNext(cross).reasonCodes.includes("UNSUPPORTED_COACH_RESOURCE_MAPPING"));
});

test("missing, duplicate, or incorrectly linked feeders block before adaptation", () => {
  const missing = createSupportedEngineInputAdapterFixture(); missing.tasks = missing.tasks.filter((task) => task.id !== 102);
  const duplicate = createSupportedEngineInputAdapterFixture(); duplicate.tasks.push({ ...clone(duplicate.tasks.find((task) => task.id === 102)!), id: 106, templateId: 906 });
  const wrong = createSupportedEngineInputAdapterFixture(); wrong.tasks.find((task) => task.id === 101)!.dependsOnTaskIds = [105];
  const orphanVocal = createSupportedEngineInputAdapterFixture(); orphanVocal.tasks = orphanVocal.tasks.filter((task) => task.id !== 101);
  for (const input of [missing, duplicate, wrong, orphanVocal]) { assert.equal(preflightEngineInputForPlannerNext(input).status, "UNSUPPORTED"); assert.equal(adaptEngineInputToPlannerNextProblem(input).problem, null); }
});

test("auxiliary gets explicit neutral policy and technical dependencies remain typed", () => {
  const auxiliary = createSupportedEngineInputAdapterFixture(); auxiliary.tasks.push({ id: 106, planId: 701, templateId: 906, status: "pending", durationOverrideMin: 30, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402 });
  const adapted = supported(auxiliary); assert.deepEqual(adapted.problem.auxiliaryPolicy, { participantPresencePreference: "OFF" }); assert.deepEqual(preflightPlannerNextProblem(adapted.problem), []);
  const technical = createSupportedEngineInputAdapterFixture(); technical.tasks.find((task) => task.id === 105)!.dependsOnTaskIds = [101];
  assert.equal(preflightEngineInputForPlannerNext(technical).status, "UNSUPPORTED");
});

test("pending and interrupted discard old planned seeds", () => {
  for (const status of ["pending", "interrupted"] as const) { const input = createSupportedEngineInputAdapterFixture(); const task = input.tasks.find((entry) => entry.id === 102)!; Object.assign(task, { status, startPlanned: "10:00", endPlanned: "10:30" }); const result = supported(input); assert.equal(result.problem.tasks.find((entry) => entry.id === "task:102")?.availability, undefined); }
});

for (const status of ["done", "in_progress"] as const) test(`${status} remains exactly fixed`, () => {
  const input = createSupportedEngineInputAdapterFixture(); Object.assign(input.tasks.find((task) => task.id === 101), { status, startReal: "10:00", endReal: "10:30", durationOverrideMin: null });
  const task = supported(input).problem.tasks.find((entry) => entry.id === "task:101")!; assert.deepEqual(task.availability, [{ start: 600, end: 630 }]); assert.equal(task.duration, 30); assert.equal(task.spaceId, "space:301");
});

test("fixed interval resolver deduplicates equal sources and rejects conflicts order-independently", () => {
  const input = createSupportedEngineInputAdapterFixture(); const task = input.tasks.find((entry) => entry.id === 105)!;
  const equal = [{ id: 1, planId: 701, taskId: 105, lockType: "time" as const, lockedStart: "10:00", lockedEnd: "10:30" }, { id: 2, planId: 701, taskId: 105, lockType: "time" as const, lockedStart: "10:00", lockedEnd: "10:30" }];
  assert.equal(resolveEffectiveTaskFixedInterval(task, equal).status, "EXACT"); assert.deepEqual(resolveEffectiveTaskFixedInterval(task, equal), resolveEffectiveTaskFixedInterval(task, [...equal].reverse()));
  assert.equal(resolveEffectiveTaskFixedInterval(task, [{ ...equal[0]!, lockedEnd: "10:35" }]).status, "INVALID");
  assert.equal(resolveEffectiveTaskFixedInterval(task, [equal[0]!, { ...equal[1]!, lockedStart: "11:00", lockedEnd: "11:30" }]).status, "CONFLICT");
});

test("locks, fixed windows and protected intervals must describe one exact obligation", () => {
  const equal = createSupportedEngineInputAdapterFixture(); const target = equal.tasks.find((task) => task.id === 105)!; Object.assign(target, { fixedWindowStart: "10:00", fixedWindowEnd: "10:30" }); equal.locks.push({ id: 10, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" });
  assert.deepEqual(supported(equal).problem.tasks.find((task) => task.id === "task:105")?.availability, [{ start: 600, end: 630 }]);
  const conflict = clone(equal); conflict.locks.push({ id: 11, planId: 701, taskId: 105, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" }); assert.equal(adaptEngineInputToPlannerNextProblem(conflict).problem, null);
  const protectedConflict = createSupportedEngineInputAdapterFixture(); Object.assign(protectedConflict.tasks.find((task) => task.id === 101), { status: "done", startReal: "10:00", endReal: "10:30" }); protectedConflict.locks.push({ id: 12, planId: 701, taskId: 101, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" }); assert.equal(adaptEngineInputToPlannerNextProblem(protectedConflict).problem, null);
});

test("resource locks deduplicate and cancelled tasks remain absent", () => {
  const input = createSupportedEngineInputAdapterFixture(); input.locks.push({ id: 10, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 }, { id: 11, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 }); input.tasks.push({ ...clone(input.tasks[4]!), id: 106, templateId: 906, status: "cancelled" });
  const task = supported(input).problem.tasks.find((entry) => entry.id === "task:105")!; assert.equal(task.requiredResourceIds?.filter((id) => id === "plan-resource:504").length, 1); assert.ok(!supported(input).problem.tasks.some((entry) => entry.id === "task:106"));
});

test("SPEC10-011 audits projected locked resources for protected tasks exactly once", () => {
  const fixture = (status: "done" | "in_progress", start: string | null, end: string | null) => {
    const input = createSupportedEngineInputAdapterFixture();
    Object.assign(input.tasks.find((task) => task.id === 105), { status, startReal: "10:00", endReal: "10:30" });
    input.locks.push(
      { id: 12, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
      { id: 11, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
    );
    Object.assign(input.planResourceItems.find((resource) => resource.id === 504), { availabilityStart: start, availabilityEnd: end });
    return input;
  };

  for (const status of ["done", "in_progress"] as const) {
    const compatible = fixture(status, "10:00", "10:30");
    const adapted = supported(compatible);
    assert.equal(adapted.problem.tasks.find((task) => task.id === "task:105")?.requiredResourceIds?.filter((id) => id === "plan-resource:504").length, 1);

    const incompatible = fixture(status, "11:00", "12:00");
    const preflight = preflightEngineInputForPlannerNext(incompatible);
    const conflicts = preflight.issues.filter((entry) => entry.code === "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE" && entry.details?.planResourceItemId === 504);
    assert.equal(preflight.status, "UNSUPPORTED"); assert.equal(preflight.diagnostics.protectedTaskResourceAvailabilityConflictCount, 1);
    assert.equal(conflicts.length, 1); assert.deepEqual(conflicts[0]?.details?.resourceLockIds, [11, 12]);
    assert.equal(conflicts[0]?.details?.resourceChannel, "generic"); assert.deepEqual(conflicts[0]?.details?.assignmentSources, []);
    assert.equal(adaptEngineInputToPlannerNextProblem(incompatible).problem, null);
    const inverted = clone(incompatible); inverted.locks.reverse();
    assert.deepEqual(preflightEngineInputForPlannerNext(inverted), preflight);
  }
});

test("SPEC10-011 reports assignment and redundant coach-lock diagnostics without duplicate conflicts", () => {
  const generic = createSupportedEngineInputAdapterFixture();
  Object.assign(generic.tasks.find((task) => task.id === 105), { status: "done", startReal: "10:00", endReal: "10:30" });
  generic.locks.push({ id: 13, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 503 });
  Object.assign(generic.planResourceItems.find((resource) => resource.id === 503), { availabilityStart: "11:00", availabilityEnd: "12:00" });
  const genericResult = preflightEngineInputForPlannerNext(generic);
  const genericIssue = genericResult.issues.find((entry) => entry.code === "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE" && entry.details?.planResourceItemId === 503)!;
  assert.equal(genericResult.diagnostics.protectedTaskResourceAvailabilityConflictCount, 1);
  assert.deepEqual(genericIssue.details?.assignmentSources, ["direct", "zone"]); assert.deepEqual(genericIssue.details?.resourceLockIds, [13]);

  const coach = createSupportedEngineInputAdapterFixture();
  Object.assign(coach.tasks.find((task) => task.id === 101), { status: "done", startReal: "10:00", endReal: "10:30" });
  coach.locks.push({ id: 14, planId: 701, taskId: 101, lockType: "resource", lockedResourceId: 501 });
  Object.assign(coach.planResourceItems.find((resource) => resource.id === 501), { availabilityStart: "11:00", availabilityEnd: "12:00" });
  const coachResult = preflightEngineInputForPlannerNext(coach);
  const coachIssues = coachResult.issues.filter((entry) => entry.code === "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE" && entry.details?.planResourceItemId === 501);
  assert.equal(coachIssues.length, 1); assert.equal(coachIssues[0]?.details?.resourceChannel, "coach"); assert.deepEqual(coachIssues[0]?.details?.resourceLockIds, [1, 14]);
});

test("resource locks share the coach channel without duplicating the coach", () => {
  const input = createSupportedEngineInputAdapterFixture();
  const first = supported(input);
  const main = first.problem.tasks.find((task) => task.id === "task:101")!;
  assert.equal(first.problem.coaches.length, 1);
  assert.ok(!first.problem.resources.some((resource) => resource.id === main.coachId));
  assert.ok(!(main.requiredResourceIds ?? []).includes(main.coachId!));

  const duplicate = clone(input);
  duplicate.locks.push({ id: 10, planId: 701, taskId: 101, lockType: "resource", lockedResourceId: 501 });
  const duplicated = supported(duplicate);
  assert.deepEqual(duplicated.problem, first.problem);
  assert.equal(duplicated.problemFingerprint, first.problemFingerprint);
});

test("foreign coach resource locks block main, technical, and auxiliary tasks before adaptation", () => {
  const distinctCoaches = (): EngineInput => {
    const input = createSupportedEngineInputAdapterFixture();
    input.vocalCoachPlanResourceItemIdByContestantId![202] = 502;
    input.tasks.find((task) => task.id === 103)!.assignedResourceIds = [502];
    input.tasks.find((task) => task.id === 104)!.assignedResourceIds = [502];
    input.locks = input.locks.filter((lock) => lock.id !== 2);
    return input;
  };
  const cases = [
    { input: distinctCoaches(), taskId: 101 },
    { input: distinctCoaches(), taskId: 105 },
  ];
  const auxiliary = distinctCoaches();
  auxiliary.tasks.push({ id: 106, planId: 701, templateId: 906, status: "pending", durationOverrideMin: 30, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402 });
  cases.push({ input: auxiliary, taskId: 106 });
  for (const { input, taskId } of cases) {
    input.locks.push({ id: 20 + taskId, planId: 701, taskId, lockType: "resource", lockedResourceId: 502 });
    const preflight = preflightEngineInputForPlannerNext(input);
    assert.equal(preflight.status, "UNSUPPORTED");
    assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_COACH_RESOURCE_MAPPING"));
    const issue = preflight.issues.find((entry) => entry.code === "UNSUPPORTED_COACH_RESOURCE_MAPPING" && entry.entityId === String(taskId));
    assert.deepEqual(issue?.details, { taskId, participantId: taskId === 105 ? null : 201, relatedCoachResourceId: taskId === 105 ? null : 501, lockedCoachResourceId: 502, lockId: 20 + taskId, relatedParticipantIds: [202] });
    assert.equal(adaptEngineInputToPlannerNextProblem(input).problem, null);
  }
});

test("generic resource locks are projected once, preserve all distinct IDs, and ignore ordering and cancelled tasks", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.locks.push(
    { id: 10, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 502 },
    { id: 11, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
    { id: 12, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
  );
  input.tasks.push({ ...clone(input.tasks.find((task) => task.id === 105)!), id: 106, templateId: 906, status: "cancelled" });
  input.locks.push({ id: 13, planId: 701, taskId: 106, lockType: "resource", lockedResourceId: 501 });
  const first = supported(input);
  const technical = first.problem.tasks.find((task) => task.id === "task:105")!;
  assert.deepEqual(technical.requiredResourceIds, ["plan-resource:502", "plan-resource:503", "plan-resource:504"]);
  assert.equal(first.problem.resources.filter((resource) => resource.id === "plan-resource:504").length, 1);
  assert.equal(first.problem.coaches.some((coach) => first.problem.resources.some((resource) => resource.id === coach.id)), false);
  const reversed = clone(input); reversed.locks.reverse();
  assert.deepEqual(supported(reversed), first);
});

function withAnchor(): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  for (const id of [106, 107, 108, 109]) input.tasks.push({ id, planId: 701, templateId: 900 + id, status: "pending", durationOverrideMin: 30, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402, assignedResourceIds: [504] });
  input.anchoredAccompaniments = [{ id: "operation-a", anchorTaskId: 101, beforeTaskIds: [106, 107], afterTaskIds: [108, 109], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  input.tasks.find((task) => task.id === 106)!.assignedResourceIds = [504, 502];
  input.tasks.find((task) => task.id === 107)!.assignedResourceIds = [504, 503];
  return input;
}

test("typed anchored operations preserve semantic sequence order", () => {
  const input = withAnchor(); const first = supported(input); const operation = first.problem.anchoredAccompaniments![0]!;
  assert.deepEqual(operation.beforeTaskIds, ["task:106", "task:107"]); assert.deepEqual(operation.afterTaskIds, ["task:108", "task:109"]); assert.deepEqual(preflightPlannerNextProblem(first.problem), []);
  assert.deepEqual(first.problem.tasks.find((task) => task.id === "task:106")?.requiredResourceIds, ["plan-resource:502", "plan-resource:504"]);
  assert.deepEqual(first.problem.tasks.find((task) => task.id === "task:107")?.requiredResourceIds, ["plan-resource:503", "plan-resource:504"]);
  const before = clone(input); before.anchoredAccompaniments![0]!.beforeTaskIds.reverse(); const after = clone(input); after.anchoredAccompaniments![0]!.afterTaskIds.reverse();
  assert.notEqual(supported(before).problemFingerprint, first.problemFingerprint); assert.notEqual(supported(after).problemFingerprint, first.problemFingerprint);
});

test("anchored duplicate, incomplete and reused members block", () => {
  const duplicate = withAnchor(); duplicate.anchoredAccompaniments![0]!.beforeTaskIds = [106, 106];
  const reused = withAnchor(); reused.anchoredAccompaniments!.push({ ...clone(reused.anchoredAccompaniments![0]!), id: "operation-b" });
  for (const input of [duplicate, reused]) assert.equal(adaptEngineInputToPlannerNextProblem(input).problem, null);
});

test("anchored continuity requires a non-empty generic-resource intersection", () => {
  const empty = withAnchor(); empty.spaceResourceAssignments = {}; for (const task of empty.tasks.filter((task) => [106, 107, 108, 109].includes(task.id))) task.assignedResourceIds = [];
  assert.equal(adaptEngineInputToPlannerNextProblem(empty).problem, null);
  const disjoint = withAnchor(); disjoint.tasks.find((task) => task.id === 109)!.assignedResourceIds = [502]; assert.equal(adaptEngineInputToPlannerNextProblem(disjoint).problem, null);
  const missingMember = withAnchor(); missingMember.tasks.find((task) => task.id === 108)!.assignedResourceIds = [503]; assert.equal(adaptEngineInputToPlannerNextProblem(missingMember).problem, null);
});

test("anchored continuity uses the exact projected union of assignments and resource locks", () => {
  const lockOnly = withAnchor();
  lockOnly.spaceResourceAssignments = {};
  for (const task of lockOnly.tasks.filter((task) => [106, 107, 108, 109].includes(task.id))) task.assignedResourceIds = [];
  for (const taskId of [101, 106, 107, 108, 109]) lockOnly.locks.push({ id: 100 + taskId, planId: 701, taskId, lockType: "resource", lockedResourceId: 504 });
  const locked = supported(lockOnly);
  for (const taskId of [101, 106, 107, 108, 109]) assert.ok(locked.problem.tasks.find((task) => task.id === `task:${taskId}`)?.requiredResourceIds?.includes("plan-resource:504"));

  const mixed = withAnchor();
  mixed.spaceResourceAssignments = {};
  mixed.tasks.find((task) => task.id === 107)!.assignedResourceIds = [503];
  mixed.tasks.find((task) => task.id === 109)!.assignedResourceIds = [];
  for (const taskId of [101, 107, 109]) mixed.locks.push({ id: 200 + taskId, planId: 701, taskId, lockType: "resource", lockedResourceId: 504 });
  const mixedResult = supported(mixed);
  assert.ok(mixedResult.problem.tasks.find((task) => task.id === "task:106")?.requiredResourceIds?.includes("plan-resource:502"));
  assert.ok(mixedResult.problem.tasks.find((task) => task.id === "task:107")?.requiredResourceIds?.includes("plan-resource:503"));

  const coachOnly = clone(lockOnly);
  coachOnly.locks = coachOnly.locks.filter((lock) => lock.lockedResourceId !== 504);
  for (const taskId of [101, 106, 107, 108, 109]) coachOnly.locks.push({ id: 300 + taskId, planId: 701, taskId, lockType: "resource", lockedResourceId: 501 });
  assert.equal(preflightEngineInputForPlannerNext(coachOnly).status, "UNSUPPORTED");
  assert.equal(adaptEngineInputToPlannerNextProblem(coachOnly).problem, null);
});

test("malformed anchored runtime contracts never throw and remain unsupported", () => {
  const malformed: unknown[] = [null, 7, { id: "x", anchorTaskId: 101, afterTaskIds: [] }, { id: "x", anchorTaskId: 101, beforeTaskIds: [] }, { id: "x", anchorTaskId: 101, beforeTaskIds: [0], afterTaskIds: [] }];
  for (const operation of malformed) { const input = createSupportedEngineInputAdapterFixture() as EngineInput & { anchoredAccompaniments: unknown[] }; input.anchoredAccompaniments = [operation]; assert.doesNotThrow(() => preflightEngineInputForPlannerNext(input as EngineInput)); assert.equal(preflightEngineInputForPlannerNext(input as EngineInput).status, "UNSUPPORTED"); }
});

test("fingerprint is hard-sensitive, visual-insensitive, set-invariant and deeply frozen", () => {
  const input = createSupportedEngineInputAdapterFixture(); const first = supported(input);
  const visual = clone(input); visual.planResourceItems.forEach((resource) => { resource.name += " display"; }); assert.equal(supported(visual).problemFingerprint, first.problemFingerprint);
  const hard = clone(input); hard.plannerNext!.searchBudget.maxPatterns++; assert.notEqual(supported(hard).problemFingerprint, first.problemFingerprint);
  const reversed = clone(input); reversed.tasks.reverse(); reversed.planResourceItems.reverse(); reversed.planSpaceSettings!.reverse(); reversed.planZoneSettings!.reverse(); assert.deepEqual(supported(reversed), first);
  const immutable = freeze(clone(input)); const snapshot = clone(immutable); const output = supported(immutable); assert.deepEqual(immutable, snapshot); assert.ok(Object.isFrozen(output) && Object.isFrozen(output.problem) && Object.isFrozen(output.problem.tasks[0]));
  assert.equal(output.problemFingerprint, fingerprintPlannerNextProblem(output.problem));
});

test("versioned Evidence is pure parseable JSON with exact scenarios and no runtime", () => {
  const raw = readFileSync(new URL("../benchmarks/fixtures/spec10-010-engine-input-adapter-evidence.json", import.meta.url), "utf8"); const evidence = JSON.parse(raw);
  assert.equal(evidence.benchmark, "SPEC10-010-engine-input-adapter"); assert.deepEqual(evidence.scenarios.map((scenario: { scenarioId: string }) => scenario.scenarioId), ["synthetic-supported", "real-main-stage-with-backlog", "real-resource-lock-pressure", "real-protected-break-recovery"]); assert.ok(!raw.includes("npm run")); assert.ok(!/runtime|timestamp|generatedAt/i.test(raw));
});

test("participant-scoped meals split only the assigned participant and preserve break identity", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.protectedBreaks = [{ id: "meal-201", kind: "meal", contestantId: 201, start: "14:30", end: "15:00" }];
  const result = supported(input);
  assert.deepEqual(result.problem.participants.find((entry) => entry.id === "participant:201")?.availability, [{ start: 480, end: 870 }, { start: 900, end: 1020 }]);
  assert.deepEqual(result.problem.participants.find((entry) => entry.id === "participant:202")?.availability, [{ start: 540, end: 990 }]);
  assert.ok(result.identityMap.some((entry) => entry.namespace === "break" && entry.sourceId === "meal-201" && entry.canonicalId === "break:meal-201"));
  assert.deepEqual(result.problem.protectedMeal, { start: 780, end: 840 });
});

test("participant meal order is fingerprint-invariant while changing its interval is hard-sensitive", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.protectedBreaks = [
    { id: "late", kind: "meal", contestantId: 201, start: "15:00", end: "15:30" },
    { id: "early", kind: "meal", contestantId: 201, start: "11:00", end: "11:30" },
  ];
  const first = supported(input);
  const reversed = clone(input); reversed.protectedBreaks!.reverse();
  assert.equal(supported(reversed).problemFingerprint, first.problemFingerprint);
  assert.equal(supported(reversed).sourceFingerprint, first.sourceFingerprint);
  const changed = clone(input); changed.protectedBreaks![0].start = "15:30"; changed.protectedBreaks![0].end = "16:00";
  assert.notEqual(supported(changed).problemFingerprint, first.problemFingerprint);
  assert.notEqual(supported(changed).sourceFingerprint, first.sourceFingerprint);
});

test("flexible participant meal task adapts separately with reversible identity and no space or resources", () => {
    const input = createSupportedEngineInputAdapterFixture();
    input.mealMode = "flexible_meal_window"; input.mealWindow = { start: "14:00", end: "16:00" };
    input.mealTaskTemplateId = 999; input.contestantMealDurationMinutes = 45; input.contestantMealMaxSimultaneous = 1;
    input.tasks.push({ id: 106, planId: 701, templateId: 999, status: "pending", contestantId: 201, operationalRole: "meal_break_placeholder" });
    const before = structuredClone(input); const adapted = adaptEngineInputToPlannerNextProblem(input);
    assert.equal(adapted.status, "SUPPORTED", adapted.reasonCodes.join(",")); if (adapted.status !== "SUPPORTED") return;
    assert.equal(adapted.problem.tasks.some(task=>task.id==="task:106"),false);
    assert.deepEqual(adapted.problem.participantMeals?.map(meal=>({sourceTaskId:meal.sourceTaskId,participantId:meal.participantId,duration:meal.duration,window:meal.window})),[{sourceTaskId:"task:106",participantId:"participant:201",duration:45,window:{start:840,end:960}}]);
    assert.ok(adapted.identityMap.some(entry=>entry.namespace==="task"&&entry.sourceId==="106"&&entry.canonicalId==="task:106"));
    assert.deepEqual(input,before);
});

test("flexible meal classification requires explicit mode and never accepts generic breakKind meal",()=>{const input=createSupportedEngineInputAdapterFixture();const task={id:999,planId:701,templateId:999,status:"pending" as const,contestantId:201,operationalRole:"meal_break_placeholder" as const};input.mealMode="global_hard_break";input.mealTaskTemplateId=999;assert.equal(isFlexibleParticipantMealTask(input,task),false);input.mealMode="flexible_meal_window";assert.equal(isFlexibleParticipantMealTask(input,task),true);assert.equal(isFlexibleParticipantMealTask({...input,mealTaskTemplateId:undefined},{...task,operationalRole:"productive_task",breakKind:"meal"}),false);});

test("resource meal splits an explicit coach channel without generic duplication",()=>{const input=createSupportedEngineInputAdapterFixture(),coachId=input.vocalCoachPlanResourceItemIdByContestantId![201]!;input.tasks.push({id:999,planId:701,templateId:999,status:"pending",breakId:999,breakKind:"resource_meal",assignedResourceIds:[coachId],fixedWindowStart:"15:00",fixedWindowEnd:"15:30"});const adapted=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapted.status,"SUPPORTED");if(adapted.status!=="SUPPORTED")return;const coach=adapted.problem.coaches.find(item=>item.id===`plan-resource:${coachId}`)!;assert.deepEqual(coach.availability,[{start:480,end:900},{start:930,end:1080}]);assert.equal(adapted.problem.resources.some(item=>item.id===coach.id),false);assert.ok(adapted.problem.tasks.some(task=>task.coachId===coach.id));});

test("protected meal task deduplicates an explicitly linked assigned break and rejects an unlinked duplicate",()=>{const input=createSupportedEngineInputAdapterFixture();input.mealMode="flexible_meal_window";input.mealWindow={start:"14:00",end:"16:00"};input.mealTaskTemplateId=999;input.contestantMealDurationMinutes=30;input.contestantMealMaxSimultaneous=1;input.tasks.push({id:106,planId:701,templateId:999,status:"done",contestantId:201,operationalRole:"meal_break_placeholder",breakId:77,startReal:"14:30",endReal:"15:00"});input.protectedBreaks=[{id:77,kind:"meal",contestantId:201,start:"14:30",end:"15:00"}];const linked=adaptEngineInputToPlannerNextProblem(input);assert.equal(linked.status,"SUPPORTED");if(linked.status==="SUPPORTED"){assert.equal(linked.problem.participantMeals?.length,1);assert.deepEqual(linked.problem.participantMeals?.[0].fixedInterval,{start:870,end:900});assert.deepEqual(linked.problem.participants.find(x=>x.id==="participant:201")?.availability,[{start:480,end:1020}]);}const unlinked=structuredClone(input);unlinked.tasks.at(-1)!.breakId=undefined;const rejected=adaptEngineInputToPlannerNextProblem(unlinked);assert.equal(rejected.status,"UNSUPPORTED");assert.ok(rejected.reasonCodes.includes("PARTICIPANT_MEAL_IDENTITY_CONFLICT"));});


test("SPEC10-017 projects EngineInput jointGroupId losslessly and deterministically", () => {
  const input = createSpec10017JointGroupEngineInputFixture();
  const snapshot = clone(input);
  const pre = preflightEngineInputForPlannerNext(input);
  assert.equal(pre.status, "SUPPORTED");
  assert.deepEqual(pre.identityMap.filter(e => e.namespace === "joint-group").map(e => e.canonicalId), ["joint-group:a2-c06-c10-alfombra-roja", "joint-group:a2-c06-c10-totales-post"]);
  const result = supported(input);
  const tasks = result.problem.tasks;
  assert.deepEqual(preflightPlannerNextProblem(result.problem), []);
  assert.equal(tasks.find(t => t.id === "task:201")?.jointGroupId, "joint-group:a2-c06-c10-alfombra-roja");
  assert.equal(tasks.find(t => t.id === "task:202")?.jointGroupId, "joint-group:a2-c06-c10-alfombra-roja");
  assert.equal(tasks.find(t => t.id === "task:203")?.jointGroupId, "joint-group:a2-c06-c10-totales-post");
  assert.equal(tasks.find(t => t.id === "task:204")?.jointGroupId, "joint-group:a2-c06-c10-totales-post");
  assert.notEqual(tasks.find(t => t.id === "task:201")?.jointGroupId, tasks.find(t => t.id === "task:203")?.jointGroupId);
  assert.deepEqual(tasks.find(t => t.id === "task:203")?.dependencies, ["task:201"]);
  assert.deepEqual(tasks.find(t => t.id === "task:204")?.dependencies, ["task:202"]);
  assert.equal(fingerprintPlannerNextProblem(result.problem), result.problemFingerprint);
  const renamed = createSpec10017JointGroupEngineInputFixture(); renamed.tasks.find(t => t.id === 201)!.templateName = "visual only";
  assert.equal(preflightEngineInputForPlannerNext(renamed).sourceFingerprint, pre.sourceFingerprint);
  const changed = createSpec10017JointGroupEngineInputFixture(); changed.tasks.find(t => t.id === 201)!.jointGroupId = "changed";
  assert.notEqual(preflightEngineInputForPlannerNext(changed).sourceFingerprint, pre.sourceFingerprint);
  const reversed = createSpec10017JointGroupEngineInputFixture(); reversed.tasks.reverse();
  assert.equal(preflightEngineInputForPlannerNext(reversed).sourceFingerprint, pre.sourceFingerprint);
  assert.equal(preflightEngineInputForPlannerNext(reversed).identityMapFingerprint, pre.identityMapFingerprint);
  assert.equal(supported(reversed).problemFingerprint, result.problemFingerprint);
  assert.deepEqual(input, snapshot);
  assert.equal(tasks.find(t => t.id === "task:205")?.jointGroupId, undefined);
  assert.equal(tasks.find(t => t.id === "task:206")?.jointGroupId, undefined);
});

test("SPEC10-017 rejects invalid jointGroupId mappings without partial problems", () => {
  for (const mutate of [
    (i: EngineInput) => { (i.tasks.find(t => t.id === 201) as any).jointGroupId = " "; },
    (i: EngineInput) => { (i.tasks.find(t => t.id === 201) as any).jointGroupId = " x"; },
    (i: EngineInput) => { (i.tasks.find(t => t.id === 201) as any).jointGroupId = 7; },
    (i: EngineInput) => { i.tasks.find(t => t.id === 206)!.jointGroupId = "bad"; },
    (i: EngineInput) => { i.tasks.find(t => t.id === 201)!.plannerNextKind = "main"; },
    (i: EngineInput) => { i.tasks.find(t => t.id === 201)!.contestantId = null; },
  ]) {
    const input = createSpec10017JointGroupEngineInputFixture(); mutate(input);
    const pre = preflightEngineInputForPlannerNext(input), adapted = adaptEngineInputToPlannerNextProblem(input);
    assert.equal(pre.status, "UNSUPPORTED"); assert.ok(pre.reasonCodes.includes("UNSUPPORTED_JOINT_GROUP_MAPPING"));
    assert.equal(adapted.status, "UNSUPPORTED"); assert.equal(adapted.problem, null); assert.equal(adapted.problemFingerprint, null);
  }
  const cancelled = createSpec10017JointGroupEngineInputFixture(); cancelled.tasks.find(t => t.id === 201)!.status = "cancelled";
  assert.equal(adaptEngineInputToPlannerNextProblem(cancelled).status, "UNSUPPORTED");
});


function recursiveCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(recursiveCanonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, recursiveCanonical(item)]));
  return value;
}

function spec10017LogicalProjection(run: ReturnType<typeof runSpec10017Probe>) {
  return recursiveCanonical({
    sourceFingerprint: run.sourceFingerprint,
    identityMapFingerprint: run.identityMapFingerprint,
    problemFingerprint: run.problemFingerprint,
    planFingerprint: run.planFingerprint,
    complete: run.complete,
    hardValid: run.hardValid,
    jointGroupViolationCount: run.jointGroupViolationCount,
    adaptedTasksByGroup: run.adaptedTasksByGroup,
    plannedTasksByGroup: run.plannedTasksByGroup,
    dependenciesByMember: run.dependenciesByMember,
    plannedTaskCount: run.plannedTaskCount,
    unplannedTaskCount: run.unplannedTaskCount,
  });
}

test("SPEC10-017 plans dependent EngineInput joint groups end-to-end from adapter.problem", () => {
  const input = createSpec10017JointGroupEngineInputFixture();
  const snapshot = clone(input);
  const run = runSpec10017Probe(() => input);
  assert.equal(run.engineInputPreflightStatus, "SUPPORTED");
  assert.equal(run.adapterStatus, "SUPPORTED");
  assert.deepEqual(run.plannerNextPreflightReasonCodes, []);
  assert.equal(run.complete, true);
  assert.equal(run.hardValid, true);
  assert.equal(run.projectedMemberCount, 4);
  assert.equal(run.projectedGroupCount, 2);
  assert.equal(Object.values(run.plannedTasksByGroup).every((members) => members.length === 2), true);
  assert.equal(run.synchronization.firstGroupSynchronized, true);
  assert.equal(run.synchronization.secondGroupSynchronized, true);
  assert.equal(run.dependenciesPreserved, true);
  assert.deepEqual(run.dependenciesByMember, { "task:201": [], "task:202": [], "task:203": ["task:201"], "task:204": ["task:202"] });
  assert.equal(run.precedence.sequencePreserved, true);
  assert.equal(run.jointGroupViolationCount, 0);
  assert.equal(run.inputImmutable, true);
  assert.deepEqual(input, snapshot);
  const adapted = supported(createSpec10017JointGroupEngineInputFixture());
  assert.equal(adapted.problem.tasks.find((task) => task.id === "task:205")?.jointGroupId, undefined);
  assert.equal(adapted.problem.tasks.filter((task) => task.kind === "technical").every((task) => task.jointGroupId === undefined), true);

  const inverted = runSpec10017Probe(() => {
    const fixture = createSpec10017JointGroupEngineInputFixture();
    fixture.tasks.reverse(); fixture.planResourceItems.reverse(); fixture.planSpaceSettings.reverse(); fixture.planZoneSettings.reverse(); fixture.locks.reverse();
    return fixture;
  });
  assert.deepEqual(spec10017LogicalProjection(inverted), spec10017LogicalProjection(run));
});

test("jointGroupId null, undefined and absence preserve historical individual-task source semantics", () => {
  const historicalIndividualFingerprint = "d001c32ea3bbbe5a1701c7b8276bd87987464cd06dda116fd463249434e74408";
  const withIndividual = (mode: "absent" | "undefined" | "null") => {
    const input = createSupportedEngineInputAdapterFixture();
    const target = input.tasks.find((task) => task.id === 101) as any;
    if (mode === "undefined") target.jointGroupId = undefined;
    if (mode === "null") target.jointGroupId = null;
    return input;
  };
  const withAux = (value: unknown) => {
    const input = createSupportedEngineInputAdapterFixture();
    input.tasks.push({ id: 106, planId: 701, templateId: 9106, status: "pending", durationOverrideMin: 5, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402, jointGroupId: value } as any);
    return input;
  };

  const absent = preflightEngineInputForPlannerNext(withIndividual("absent"));
  const undefinedValue = preflightEngineInputForPlannerNext(withIndividual("undefined"));
  const nullValue = preflightEngineInputForPlannerNext(withIndividual("null"));
  assert.equal(absent.sourceFingerprint, historicalIndividualFingerprint);
  assert.equal(undefinedValue.sourceFingerprint, historicalIndividualFingerprint);
  assert.equal(nullValue.sourceFingerprint, historicalIndividualFingerprint);
  for (const input of [withIndividual("absent"), withIndividual("undefined"), withIndividual("null")]) {
    const preflight = preflightEngineInputForPlannerNext(input);
    assert.equal(preflight.identityMap.some((entry) => entry.namespace === "joint-group"), false);
    assert.equal(supported(input).problem.tasks.some((task) => task.jointGroupId !== undefined), false);
  }

  const first = preflightEngineInputForPlannerNext(withAux("source-group-a"));
  const second = preflightEngineInputForPlannerNext(withAux("source-group-b"));
  assert.notEqual(first.sourceFingerprint, historicalIndividualFingerprint);
  assert.notEqual(second.sourceFingerprint, first.sourceFingerprint);

  for (const invalid of [7, " source-group-a"]) {
    const input = withAux(invalid);
    const preflight = preflightEngineInputForPlannerNext(input);
    assert.equal(preflight.status, "UNSUPPORTED");
    assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_JOINT_GROUP_MAPPING"));
    const adapted = adaptEngineInputToPlannerNextProblem(input);
    assert.equal(adapted.status, "UNSUPPORTED");
    assert.ok(adapted.reasonCodes.includes("UNSUPPORTED_JOINT_GROUP_MAPPING"));
    assert.equal(adapted.problem, null);
    assert.equal(adapted.problemFingerprint, null);
  }
});
