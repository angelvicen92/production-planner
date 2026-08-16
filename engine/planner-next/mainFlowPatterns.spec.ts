import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { proveMainFeederArchitectureImpossible } from "./mainFlowPatterns";

const architecture = { pattern: ["a", "a", "b", "a", "a"], slots: [40, 50, 60, 80, 90] } as const;

function prefixProblem(feederDuration: number, coachAAvailability = [{ start: 0, end: 120 }]): {
  problem: PlannerNextProblem;
  mains: Task[];
  feeders: Map<string, Task>;
} {
  const participantIds = ["p4", "p1", "p3", "p2", "other"];
  const tasks: Task[] = participantIds.flatMap((participantId, index) => {
    const coachId = participantId === "other" ? "coach-b" : "coach-a";
    const blockKey = participantId === "other" ? "b" : "a";
    const feeder: Task = { id: `feeder-${participantId}`, kind: "vocal", participantId, coachId,
      duration: participantId === "other" ? 5 : feederDuration, spaceId: `feed-${coachId}`, dependencies: [] };
    const main: Task = { id: `main-${participantId}`, kind: "main", participantId, coachId,
      duration: 10, spaceId: "main", dependencies: [feeder.id], blockKey };
    return index % 2 === 0 ? [main, feeder] : [feeder, main];
  });
  const availability = [{ start: 0, end: 120 }];
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 120 }, resources: [],
    spaces: ["main", "feed-coach-a", "feed-coach-b"].map((id) => ({ id, availability })),
    participants: participantIds.map((id) => ({ id, availability })),
    coaches: [{ id: "coach-a", availability: coachAAvailability }, { id: "coach-b", availability }],
    tasks, mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED",
      maxBlocksByKey: 2, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 10, maxBranchExpansions: 100 },
  };
  const mains = tasks.filter(({ kind }) => kind === "main");
  return { problem, mains, feeders: new Map(mains.map((main) =>
    [main.id, tasks.find(({ id }) => id === main.dependencies[0])!])) };
}

const prove = (fixture: ReturnType<typeof prefixProblem>) =>
  proveMainFeederArchitectureImpossible(fixture.problem, fixture.mains, fixture.feeders, architecture);

test("rejects same-coach runs only when their cumulative feeder prefix exceeds capacity", () => {
  assert.equal(prove(prefixProblem(20)), "FEEDER_CAPACITY");
});

test("does not reuse capacity occupied by the first main run for the second feeder prefix", () => {
  const fixture = prefixProblem(20);
  assert.equal(2 * 20 <= architecture.slots[0], true, "the first run fits in isolation");
  assert.equal(2 * 20 <= architecture.slots[3], true, "the second run fits under the former isolated bound");
  assert.equal(prove(fixture), "FEEDER_CAPACITY");
});

test("an alternating coach preserves preparation time available to the first coach", () => {
  assert.equal(prove(prefixProblem(15)), null);
});

test("split coach availability contributes only its real available prefix capacity", () => {
  assert.equal(prove(prefixProblem(15, [{ start: 0, end: 30 }, { start: 40, end: 120 }])), "FEEDER_CAPACITY");
});

test("rejects a feeder block when total minutes suffice but every coach gap is too short", () => {
  const fixture = prefixProblem(15, [{ start: 0, end: 20 }, { start: 25, end: 120 }]);
  assert.equal(20 + 15 >= 2 * 15, true, "the first deadline has sufficient total capacity");
  assert.equal(prove(fixture), "FEEDER_CONTIGUOUS_CAPACITY");
});

test("a feasible cumulative architecture is not rejected", () => {
  assert.equal(prove(prefixProblem(10)), null);
});

test("participant and task IDs do not affect the cumulative proof", () => {
  const baseline = prefixProblem(20), renamed = prefixProblem(20);
  for (const task of renamed.problem.tasks) {
    task.id = `z-${task.id}`;
    if (task.participantId) task.participantId = `z-${task.participantId}`;
    task.dependencies = task.dependencies.map((id) => `z-${id}`);
  }
  for (const participant of renamed.problem.participants) participant.id = `z-${participant.id}`;
  renamed.mains = renamed.problem.tasks.filter(({ kind }) => kind === "main").reverse();
  renamed.feeders = new Map(renamed.mains.map((main) =>
    [main.id, renamed.problem.tasks.find(({ id }) => id === main.dependencies[0])!]));
  assert.equal(prove(baseline), "FEEDER_CAPACITY");
  assert.equal(prove(renamed), "FEEDER_CAPACITY");
});

function firstCoachRun(fixture: ReturnType<typeof prefixProblem>): {
  problem: PlannerNextProblem;
  mains: Task[];
  feeders: Map<string, Task>;
} {
  const mains = fixture.mains.filter(({ blockKey }) => blockKey === "a").slice(0, 2);
  const taskIds = new Set(mains.flatMap((main) => [main.id, main.dependencies[0]!]));
  return { problem: { ...fixture.problem, tasks: fixture.problem.tasks.filter(({ id }) => taskIds.has(id)) },
    mains, feeders: new Map(mains.map((main) => [main.id, fixture.feeders.get(main.id)!])) };
}

const twoSlotArchitecture = { pattern: ["a", "a"], slots: [40, 50] } as const;

test("coach transitions make the simple contiguous certificate inapplicable", () => {
  const fixture = firstCoachRun(prefixProblem(15, [{ start: 0, end: 20 }, { start: 25, end: 120 }]));
  const secondFeeder = fixture.feeders.get(fixture.mains[1]!.id)!;
  secondFeeder.spaceId = "feed-coach-a-2";
  fixture.problem.spaces.push({ id: secondFeeder.spaceId, availability: [{ start: 0, end: 120 }] });
  fixture.problem.coachRouteTransitions = [{ coachId: "coach-a", fromSpaceId: "feed-coach-a",
    toSpaceId: secondFeeder.spaceId, minutes: 5 }];
  assert.equal(proveMainFeederArchitectureImpossible(fixture.problem, fixture.mains, fixture.feeders,
    twoSlotArchitecture), null);
});

test("an authorized feeder-space meal makes the simple contiguous certificate inapplicable", () => {
  const fixture = firstCoachRun(prefixProblem(15, [{ start: 0, end: 20 }, { start: 25, end: 120 }]));
  fixture.problem.spaces.find(({ id }) => id === "feed-coach-a")!.mealPolicy = {
    window: { start: 15, end: 35 }, duration: 5,
  };
  assert.equal(proveMainFeederArchitectureImpossible(fixture.problem, fixture.mains, fixture.feeders,
    twoSlotArchitecture), null);
});

test("contiguous proof is invariant to task input order and renamed IDs", () => {
  const baseline = prefixProblem(15, [{ start: 0, end: 20 }, { start: 25, end: 120 }]);
  const renamed = structuredClone(baseline.problem);
  for (const task of renamed.tasks) {
    task.id = `renamed-${task.id}`;
    task.dependencies = task.dependencies.map((id) => `renamed-${id}`);
  }
  renamed.tasks.reverse();
  const mains = renamed.tasks.filter(({ kind }) => kind === "main");
  const feeders = new Map(mains.map((main) =>
    [main.id, renamed.tasks.find(({ id }) => id === main.dependencies[0])!]));
  assert.equal(prove(baseline), "FEEDER_CONTIGUOUS_CAPACITY");
  assert.equal(proveMainFeederArchitectureImpossible(renamed, mains, feeders, architecture),
    "FEEDER_CONTIGUOUS_CAPACITY");
});
