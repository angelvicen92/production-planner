import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { canPlaceTask, effectiveResourceTransitionMinutes } from "./placement";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { resourceRouteMetrics } from "./resourcePresence";
import { itinerantUnitsScenario } from "./scenarios/itinerantUnitsScenario";
import { preflight, validatePlan } from "./validate";

const auxiliary = (result: ReturnType<typeof planMainFlowAndFeeders>, unit: string) => result.scheduledTasks
  .filter((task) => task.requiredResourceIds?.includes(unit)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
const hasOverlap = (a: ScheduledTask[], b: ScheduledTask[]) => a.some((x) => b.some((y) => x.start < y.end && y.start < x.end));

test("NEXT-005 schedules two compact independent itinerant units deterministically", () => {
  const problem = itinerantUnitsScenario(), snapshot = JSON.stringify(problem);
  const result = planMainFlowAndFeeders(problem);
  assert.equal(JSON.stringify(problem), snapshot);
  assert.equal(result.complete, true); assert.equal(result.metrics.hardValid, true); assert.equal(result.scheduledTasks.length, 22);
  assert.deepEqual([result.metrics.mainFlowStart, result.metrics.mainFlowEnd, result.metrics.mainFlowGapMinutes], [780, 900, 0]);
  assert.deepEqual(result.metrics.reasonCodes, []);
  const a = auxiliary(result, "mobile-unit-a"), b = auxiliary(result, "mobile-unit-b");
  assert.equal(hasOverlap(a, b), true);
  for (const [tasks, unit, margin] of [[a, "mobile-unit-a", 10], [b, "mobile-unit-b", 20]] as const) {
    assert.equal(tasks.length, 3); assert.equal(result.metrics.resourceMoveCountById[unit], 1);
    assert.equal(result.metrics.resourceTransitionSlackMinutesById[unit], 0);
    const move = tasks.slice(1).map((task, i) => ({ previous: tasks[i]!, task })).find(({ previous, task }) => previous.spaceId !== task.spaceId)!;
    assert.equal(move.task.start - move.previous.end, margin);
    const same = tasks.slice(1).map((task, i) => ({ previous: tasks[i]!, task })).find(({ previous, task }) => previous.spaceId === task.spaceId)!;
    assert.equal(same.task.start, same.previous.end);
  }
  for (const suffix of ["a", "b"]) for (const resource of [`mobile-unit-${suffix}`, `camera-${suffix}`, `sound-${suffix}`]) {
    assert.deepEqual(auxiliary(result, resource).map(({ id, start, end }) => ({ id, start, end })), auxiliary(result, `mobile-unit-${suffix}`).map(({ id, start, end }) => ({ id, start, end })));
  }
  const again = planMainFlowAndFeeders(itinerantUnitsScenario());
  assert.equal(again.metrics.planFingerprint, result.metrics.planFingerprint);
  const reversed = itinerantUnitsScenario(); reversed.tasks.reverse(); reversed.resources.reverse(); reversed.spaces.reverse(); reversed.participants.reverse();
  const reordered = planMainFlowAndFeeders(reversed);
  assert.equal(reordered.metrics.planFingerprint, result.metrics.planFingerprint);
  assert.deepEqual(reordered.metrics.resourceMoveCountById, result.metrics.resourceMoveCountById);
  assert.deepEqual(reordered.metrics.resourceTransitionSlackMinutesById, result.metrics.resourceTransitionSlackMinutesById);
});

test("resource transition contract rejects invalid values crash-safely", () => {
  for (const value of [-1, 1.5, Infinity, "10"] as unknown[]) {
    const problem = itinerantUnitsScenario() as any; problem.resources[0].transitionMinutes = value;
    assert.ok(preflight(problem).includes("INVALID_RESOURCE_TRANSITION"));
    assert.deepEqual(planMainFlowAndFeeders(problem).scheduledTasks, []);
  }
  const absent = itinerantUnitsScenario(); delete absent.resources[0]!.transitionMinutes;
  assert.equal(preflight(absent).includes("INVALID_RESOURCE_TRANSITION"), false);
  assert.equal(effectiveResourceTransitionMinutes(absent, "mobile-unit-a"), absent.resourceTransitionMinutes);
  assert.equal(effectiveResourceTransitionMinutes(absent, "missing"), absent.resourceTransitionMinutes);
});

function transitionFixture(margin = 20): { problem: PlannerNextProblem; first: ScheduledTask; second: ScheduledTask } {
  const problem = itinerantUnitsScenario();
  const first = { ...problem.tasks.find(({ id }) => id === "unit-b-1")!, start: 540, end: 555 };
  const second = { ...problem.tasks.find(({ id }) => id === "unit-b-2")!, start: 575, end: 590 };
  problem.resources.find(({ id }) => id === "mobile-unit-b")!.transitionMinutes = margin;
  return { problem, first, second };
}

test("exact-resource transitions use maximum shared margin and validator counts a pair once", () => {
  const { problem, first, second } = transitionFixture();
  assert.equal(canPlaceTask(problem, second, 575, [first]), true);
  assert.equal(canPlaceTask(problem, second, 570, [first]), false);
  const short = { ...second, start: 570, end: 585 };
  assert.equal(validatePlan(problem, [first, short]).resourceTransitionViolationCount, 1);
  assert.equal(validatePlan(problem, [first, second]).resourceTransitionViolationCount, 0);
  const sameSpace = { ...second, spaceId: first.spaceId, start: first.end, end: first.end + second.duration };
  assert.equal(canPlaceTask(problem, sameSpace, sameSpace.start, [first]), true);
  assert.equal(validatePlan(problem, [first, sameSpace]).resourceTransitionViolationCount, 0);
  const metrics = resourceRouteMetrics(problem, [second, first]);
  assert.equal(metrics.moveCountById["mobile-unit-b"], 1); assert.equal(metrics.transitionSlackMinutesById["mobile-unit-b"], 0);
});

test("an impossible itinerant task publishes no partial plan", () => {
  const problem = itinerantUnitsScenario();
  problem.resources.find(({ id }) => id === "mobile-unit-a")!.availability = [{ start: 540, end: 550 }];
  const result = planMainFlowAndFeeders(problem); assert.equal(result.complete, false); assert.deepEqual(result.scheduledTasks, []);
});
