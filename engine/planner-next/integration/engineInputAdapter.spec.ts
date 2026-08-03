import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EngineInput } from "../../types";
import { preflight as preflightPlannerNextProblem } from "../validate";
import { preflightEngineInputForPlannerNext } from "./engineInputPreflight";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, fingerprintPlannerNextProblem, minuteToEngineTime } from "./engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "./engineInputAdapter.fixture";
import { resolveEffectiveTaskFixedInterval } from "./effectiveTaskFixedInterval";

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
  assert.deepEqual(result.problem.coaches.map((coach) => coach.id), ["plan-resource:501", "plan-resource:502"]);
  for (const main of result.problem.tasks.filter((task) => task.kind === "main")) {
    const vocal = result.problem.tasks.find((task) => task.id === main.dependencies[0]);
    assert.equal(vocal?.kind, "vocal"); assert.equal(main.dependencies.length, 1); assert.equal(main.coachId, vocal?.coachId); assert.equal(main.blockKey, main.coachId);
  }
  assert.ok(result.problem.tasks.filter((task) => task.kind === "main").every((task) => !(task.requiredResourceIds ?? []).includes(task.coachId!)));
  assert.ok(result.problem.resources.every((resource) => !result.problem.coaches.some((coach) => coach.id === resource.id)));
});

test("domain divergence guard never publishes an invalid adapted problem", () => {
  const input = createSupportedEngineInputAdapterFixture(); input.plannerNext!.mainFlow.preferredEnd = "14:30";
  assert.equal(preflightEngineInputForPlannerNext(input).status, "SUPPORTED");
  const result = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(result.status, "UNSUPPORTED"); assert.equal(result.problem, null); assert.equal(result.problemFingerprint, null);
  assert.deepEqual(result.reasonCodes, ["ADAPTED_PROBLEM_NOT_REPRESENTABLE"]);
  assert.deepEqual(result.issues.at(-1)?.details, { plannerNextReasonCodes: ["INVALID_PREFERRED_END"] });
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
  for (const input of [missing, duplicate, wrong]) { assert.equal(preflightEngineInputForPlannerNext(input).status, "UNSUPPORTED"); assert.equal(adaptEngineInputToPlannerNextProblem(input).problem, null); }
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
  const equal = createSupportedEngineInputAdapterFixture(); const target = equal.tasks.find((task) => task.id === 105)!; Object.assign(target, { fixedWindowStart: "10:00", fixedWindowEnd: "10:30" }); equal.locks.push({ id: 1, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" });
  assert.deepEqual(supported(equal).problem.tasks.find((task) => task.id === "task:105")?.availability, [{ start: 600, end: 630 }]);
  const conflict = clone(equal); conflict.locks.push({ id: 2, planId: 701, taskId: 105, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" }); assert.equal(adaptEngineInputToPlannerNextProblem(conflict).problem, null);
  const protectedConflict = createSupportedEngineInputAdapterFixture(); Object.assign(protectedConflict.tasks.find((task) => task.id === 101), { status: "done", startReal: "10:00", endReal: "10:30" }); protectedConflict.locks.push({ id: 3, planId: 701, taskId: 101, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" }); assert.equal(adaptEngineInputToPlannerNextProblem(protectedConflict).problem, null);
});

test("resource locks deduplicate and cancelled tasks remain absent", () => {
  const input = createSupportedEngineInputAdapterFixture(); input.locks.push({ id: 1, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 }, { id: 2, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 }); input.tasks.push({ ...clone(input.tasks[4]!), id: 106, templateId: 906, status: "cancelled" });
  const task = supported(input).problem.tasks.find((entry) => entry.id === "task:105")!; assert.equal(task.requiredResourceIds?.filter((id) => id === "plan-resource:504").length, 1); assert.ok(!supported(input).problem.tasks.some((entry) => entry.id === "task:106"));
});

function withAnchor(): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  for (const id of [106, 107, 108, 109]) input.tasks.push({ id, planId: 701, templateId: 900 + id, status: "pending", durationOverrideMin: 30, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402, assignedResourceIds: [504] });
  input.anchoredAccompaniments = [{ id: "operation-a", anchorTaskId: 101, beforeTaskIds: [106, 107], afterTaskIds: [108, 109], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  return input;
}

test("typed anchored operations preserve semantic sequence order", () => {
  const input = withAnchor(); const first = supported(input); const operation = first.problem.anchoredAccompaniments![0]!;
  assert.deepEqual(operation.beforeTaskIds, ["task:106", "task:107"]); assert.deepEqual(operation.afterTaskIds, ["task:108", "task:109"]); assert.deepEqual(preflightPlannerNextProblem(first.problem), []);
  const before = clone(input); before.anchoredAccompaniments![0]!.beforeTaskIds.reverse(); const after = clone(input); after.anchoredAccompaniments![0]!.afterTaskIds.reverse();
  assert.notEqual(supported(before).problemFingerprint, first.problemFingerprint); assert.notEqual(supported(after).problemFingerprint, first.problemFingerprint);
});

test("anchored duplicate, incomplete and reused members block", () => {
  const duplicate = withAnchor(); duplicate.anchoredAccompaniments![0]!.beforeTaskIds = [106, 106];
  const reused = withAnchor(); reused.anchoredAccompaniments!.push({ ...clone(reused.anchoredAccompaniments![0]!), id: "operation-b" });
  for (const input of [duplicate, reused]) assert.equal(adaptEngineInputToPlannerNextProblem(input).problem, null);
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
