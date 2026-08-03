import assert from "node:assert/strict";
import test from "node:test";
import { preflightEngineInputForPlannerNext } from "./engineInputPreflight";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, fingerprintPlannerNextProblem, minuteToEngineTime } from "./engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "./engineInputAdapter.fixture";

const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(freeze); Object.freeze(value); } return value; };

test("SPEC10-010 time conversion is strict, exact and round-trippable", () => {
  for (const value of ["00:00", "08:00", "08:05", "12:59", "13:00", "18:00", "23:59"]) {
    assert.equal(minuteToEngineTime(engineTimeToMinute(value)), value);
  }
  assert.equal(engineTimeToMinute("00:05"), 5);
  for (const invalid of ["8:00", "24:00", "12:60", "08:00:00"]) assert.throws(() => engineTimeToMinute(invalid), RangeError);
  for (const invalid of [-1, 1.5, 1440]) assert.throws(() => minuteToEngineTime(invalid), RangeError);
});

test("SPEC10-010 supported fixture maps the complete contract without executing a planner", () => {
  const source = createSupportedEngineInputAdapterFixture();
  assert.equal(preflightEngineInputForPlannerNext(source).status, "SUPPORTED");
  const result = adaptEngineInputToPlannerNextProblem(source);
  assert.equal(result.status, "SUPPORTED");
  if (result.status !== "SUPPORTED") return;
  assert.deepEqual(result.problem.day, { start: 480, end: 1080 });
  assert.deepEqual(result.problem.protectedMeal, { start: 780, end: 840 });
  assert.deepEqual(result.problem.budget, source.plannerNext!.searchBudget);
  assert.equal(result.problem.searchPolicy, source.plannerNext!.searchPolicy);
  assert.equal(result.problem.mainFlow.spaceId, "space:301");
  assert.deepEqual(result.problem.spaces.map((entry) => entry.id), ["space:301", "space:302"]);
  assert.deepEqual(result.problem.participants.map((entry) => entry.id), ["participant:201", "participant:202"]);
  assert.deepEqual(result.problem.resources.map((entry) => [entry.id, entry.presencePreference]), [["plan-resource:501", "OFF"], ["plan-resource:502", "OFF"], ["plan-resource:503", "OFF"]]);
  assert.deepEqual(result.problem.tasks.find((entry) => entry.id === "task:102")?.dependencies, ["task:101"]);
  assert.equal(result.problem.tasks.find((entry) => entry.id === "task:103")?.kind, "technical");
  assert.equal(result.problemFingerprint, fingerprintPlannerNextProblem(result.problem));
  for (const entry of result.identityMap) assert.equal(entry.canonicalId, `${entry.namespace}:${entry.sourceId}`);
});

test("SPEC10-010 unsupported gate preserves preflight and returns no partial problem", () => {
  const source = createSupportedEngineInputAdapterFixture();
  delete source.plannerNext;
  const preflight = preflightEngineInputForPlannerNext(source);
  const result = adaptEngineInputToPlannerNextProblem(source);
  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.problem, null);
  assert.equal(result.problemFingerprint, null);
  assert.deepEqual(result.reasonCodes, preflight.reasonCodes);
  assert.deepEqual(result.identityMap, preflight.identityMap);
  assert.deepEqual(result.diagnostics, preflight.diagnostics);
});

test("SPEC10-010 pending and interrupted discard prior planning; cancelled disappears", () => {
  const source = createSupportedEngineInputAdapterFixture();
  source.tasks[0].startPlanned = "10:00"; source.tasks[0].endPlanned = "10:30";
  source.tasks[1].status = "interrupted"; source.tasks[1].startPlanned = "11:00"; source.tasks[1].endPlanned = "11:30";
  source.tasks.push({ ...source.tasks[2], id: 104, templateId: 904, status: "cancelled" });
  const result = adaptEngineInputToPlannerNextProblem(source);
  assert.equal(result.status, "SUPPORTED");
  if (result.status !== "SUPPORTED") return;
  assert.equal(result.problem.tasks.length, 3);
  assert.equal(result.problem.tasks.some((entry) => entry.id === "task:104"), false);
  assert.equal(result.problem.tasks[0].availability, undefined);
  assert.equal(result.problem.tasks[1].availability, undefined);
});

for (const status of ["done", "in_progress"] as const) test(`SPEC10-010 ${status} is fixed in time, space and resources`, () => {
  const source = createSupportedEngineInputAdapterFixture();
  Object.assign(source.tasks[0], { status, startReal: "10:00", endReal: "10:30", durationOverrideMin: null });
  const result = adaptEngineInputToPlannerNextProblem(source);
  assert.equal(result.status, "SUPPORTED");
  if (result.status !== "SUPPORTED") return;
  assert.deepEqual(result.problem.tasks[0], { id: "task:101", kind: "main", participantId: "participant:201", duration: 30, spaceId: "space:301", dependencies: [], requiredResourceIds: ["plan-resource:501"], availability: [{ start: 600, end: 630 }] });
});

test("SPEC10-010 locks are hard task windows/resources or remain unsupported", () => {
  const source = createSupportedEngineInputAdapterFixture();
  source.locks.push({ id: 1, planId: 701, taskId: 103, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" });
  source.locks.push({ id: 2, planId: 701, taskId: 103, lockType: "resource", lockedResourceId: 501 });
  const result = adaptEngineInputToPlannerNextProblem(source);
  assert.equal(result.status, "SUPPORTED");
  if (result.status === "SUPPORTED") {
    const task = result.problem.tasks.find((entry) => entry.id === "task:103")!;
    assert.deepEqual(task.availability, [{ start: 600, end: 630 }]); assert.ok(task.requiredResourceIds?.includes("plan-resource:501"));
  }
  source.locks.push({ id: 3, planId: 701, taskId: 103, lockType: "space" });
  assert.equal(adaptEngineInputToPlannerNextProblem(source).problem, null);
});

test("SPEC10-010 determinism, set inversion, visual metadata and runtime immutability", () => {
  const source = createSupportedEngineInputAdapterFixture();
  const first = adaptEngineInputToPlannerNextProblem(source);
  const reversed = clone(source); reversed.tasks.reverse(); reversed.planResourceItems.reverse(); reversed.planSpaceSettings!.reverse(); reversed.planZoneSettings!.reverse(); Object.values(reversed.spaceResourceAssignments).forEach((ids) => ids.reverse());
  const inverse = adaptEngineInputToPlannerNextProblem(reversed);
  assert.deepEqual(first, inverse);
  const renamed = clone(source); renamed.planResourceItems.forEach((entry) => { entry.name += " changed"; });
  assert.equal(adaptEngineInputToPlannerNextProblem(renamed).problemFingerprint, first.problemFingerprint);
  const hard = clone(source); hard.plannerNext!.searchBudget.maxPatterns++;
  assert.notEqual(adaptEngineInputToPlannerNextProblem(hard).problemFingerprint, first.problemFingerprint);
  const immutable = freeze(clone(source)); const before = clone(immutable); const frozenResult = adaptEngineInputToPlannerNextProblem(immutable);
  assert.deepEqual(immutable, before); assert.ok(Object.isFrozen(frozenResult)); assert.ok(Object.isFrozen(frozenResult.identityMap));
  if (frozenResult.status === "SUPPORTED") { assert.ok(Object.isFrozen(frozenResult.problem)); assert.ok(Object.isFrozen(frozenResult.problem.tasks[0])); assert.ok(Object.isFrozen(frozenResult.problem.budget)); }
});

test("SPEC10-010 incompatible grid and partial-real stay unsupported", () => {
  const grid = createSupportedEngineInputAdapterFixture(); grid.plannerNext!.timeGridMinutes = 7;
  assert.equal(adaptEngineInputToPlannerNextProblem(grid).problem, null);
  const partial = createSupportedEngineInputAdapterFixture(); Object.assign(partial.tasks[0], { status: "done", startReal: "10:00", startPlanned: "10:00", endPlanned: "10:30" });
  assert.equal(adaptEngineInputToPlannerNextProblem(partial).problem, null);
});
