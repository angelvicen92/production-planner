import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { assessMainResidualMatching, type MainResidualPosition } from "./mainResidualMatching";
import type { RequiredCompositeBlock, RequiredCompositePosition } from "./requiredCompositeBlock";

const positions: MainResidualPosition[] = [{ position: 0, slot: 600 }, { position: 1, slot: 615 }];
const composite: RequiredCompositePosition = { startIndexByResourceId: {}, signature: "" };
const main = (id: string, participantId = id, blockKey = "block", extra: Partial<Task> = {}): Task => ({
  id, kind: "main", participantId, duration: 15, spaceId: "main", dependencies: [], blockKey, ...extra,
});
function problem(tasks: Task[]): PlannerNextProblem {
  const participantIds = [...new Set(tasks.map(task => task.participantId).filter((id): id is string => Boolean(id)))];
  return {
    day: { start: 540, end: 720 }, protectedMeal: { start: 690, end: 720 },
    resources: [], spaces: [{ id: "main", availability: [{ start: 540, end: 720 }] }, { id: "side", availability: [{ start: 540, end: 720 }] }],
    participants: participantIds.map(id => ({ id, availability: [{ start: 540, end: 720 }] })), coaches: [], tasks,
    mainFlow: { spaceId: "main", preferredEnd: 630, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 5,
    budget: { bestK: 5, maxBacktracks: 20, maxPatterns: 100, maxBranchExpansions: 300_000 },
  };
}
function assess(p: PlannerNextProblem, tasks: Task[], slots = positions, pattern = ["block", "block"], blocks: RequiredCompositeBlock[] = [], position = composite, placed: ScheduledTask[] = [], meals: ScheduledSpaceMeal[] = []) {
  return assessMainResidualMatching(p, tasks, slots, pattern, undefined, blocks, position, placed, meals);
}

test("deterministic matching completes two tasks and ignores non-main work", () => {
  const tasks = [main("main-b"), main("main-a"), { id: "vocal", kind: "vocal", participantId: "v", duration: 15, spaceId: "side", dependencies: [] } satisfies Task];
  const p = problem(tasks); const before = JSON.stringify(p);
  const first = assess(p, tasks); const reversed = assess(p, [...tasks].reverse(), [...positions].reverse());
  assert.equal(first.feasible, true); assert.equal(first.matchingSize, 2); assert.equal(first.edgeCount, 4);
  assert.deepEqual(first.feasibleSlotCountByTaskId, { "main-a": 2, "main-b": 2 });
  assert.deepEqual(first, reversed); assert.equal(JSON.stringify(p), before);
});

test("zero-edge and shared-only-slot graphs are infeasible", () => {
  const unavailable = main("unavailable", "unavailable"); const p1 = problem([unavailable]);
  p1.participants[0]!.availability = [{ start: 540, end: 590 }];
  const none = assess(p1, [unavailable], positions.slice(0, 1), ["block"]);
  assert.equal(none.feasible, false); assert.deepEqual(none.unmatchedTaskIds, ["unavailable"]); assert.equal(none.edgeCount, 0);

  const a = main("a", "shared"), b = main("b", "shared"), p2 = problem([a, b]);
  p2.participants[0]!.availability = [{ start: 600, end: 615 }];
  const shared = assess(p2, [a, b]);
  assert.equal(shared.feasible, false); assert.equal(shared.matchingSize, 1); assert.equal(shared.edgeCount, 2);
});

test("block and required composite incompatibility do not create edges", () => {
  const task = main("a"); const p = problem([task]);
  assert.equal(assess(p, [task], positions.slice(0, 1), ["other"]).edgeCount, 0);
  const block: RequiredCompositeBlock = { resourceId: "required", memberTaskIds: [task.id], productiveDurationMinutes: 15, assignedSpaceId: undefined, taskBoundaryOffsets: [0, 15], authorizedMealSplitOffsets: [], canonicalSignature: "required" };
  const wrongPosition = { startIndexByResourceId: { required: 1 }, signature: "required:1" };
  assert.equal(assess(p, [task], positions.slice(0, 1), ["block"], [block], wrongPosition).edgeCount, 0);
});

test("canonical availability, occupied resource, transition, and meals remove edges", () => {
  const cases: Array<(p: PlannerNextProblem, task: Task) => { placed?: ScheduledTask[]; meals?: ScheduledSpaceMeal[] }> = [
    (p) => { p.spaces[0]!.availability = [{ start: 540, end: 590 }]; return {}; },
    (p, task) => { p.resources.push({ id: "unit", availability: [{ start: 540, end: 720 }] }); task.requiredResourceIds = ["unit"]; return { placed: [{ ...main("occupied", "other", "block", { requiredResourceIds: ["unit"] }), start: 600, end: 615 }] }; },
    (_p, task) => ({ placed: [{ ...main("previous", task.participantId, "block", { spaceId: "side" }), start: 580, end: 597 }] }),
    (_p) => ({ meals: [{ id: "meal:main", spaceId: "main", start: 600, end: 615, duration: 15 }] }),
  ];
  for (const configure of cases) {
    const task = main("candidate"); const p = problem([task]); const configured = configure(p, task);
    assert.equal(assess(p, [task], positions.slice(0, 1), ["block"], [], composite, configured.placed, configured.meals).edgeCount, 0);
  }
});

test("AnchoredAccompaniment creates an edge only when its complete operation fits", () => {
  const anchor = main("anchor", "participant");
  const before: Task = { id: "before", kind: "auxiliary", participantId: "participant", duration: 15, spaceId: "side", dependencies: [] };
  const p = problem([anchor, before]);
  p.anchoredAccompaniments = [{ id: "operation", anchorTaskId: anchor.id, beforeTaskIds: [before.id], afterTaskIds: [], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  assert.equal(assess(p, [anchor], positions.slice(0, 1), ["block"]).edgeCount, 1);
  p.spaces.find(space => space.id === "side")!.availability = [{ start: 540, end: 580 }];
  assert.equal(assess(p, [anchor], positions.slice(0, 1), ["block"]).edgeCount, 0);
});
