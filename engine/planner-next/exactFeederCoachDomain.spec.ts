import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { exactFeederStartDomain, runExactMainAndFeederSearch } from "./exactMainAndFeederCore";
import { canPlaceTask } from "./placement";

const availability = [{ start: 0, end: 120 }];

function problem(feeder: Task, blockers: ScheduledTask[] = []): PlannerNextProblem {
  const spaceIds = new Set(["main", feeder.spaceId, ...blockers.map(({ spaceId }) => spaceId)]);
  return {
    day: { start: 0, end: 120 }, spaces: [...spaceIds].map((id) => ({ id, availability })),
    participants: [{ id: "participant", availability }], coaches: [{ id: "coach", availability }],
    resources: [], tasks: [feeder], participantTransitionMinutes: 0, resourceTransitionMinutes: 10,
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 10, maxBranchExpansions: 20_000 },
  };
}

const feeder = (coachId: string | undefined = "coach"): Task => ({
  id: "feeder", kind: "vocal", participantId: "participant", coachId,
  duration: 10, spaceId: "feeder-space", dependencies: [],
});
const blocker = (start: number, end: number, spaceId = "blocker-space"): ScheduledTask => ({
  id: `blocker-${start}-${end}-${spaceId}`, kind: "technical", coachId: "coach",
  duration: end - start, start, end, spaceId, dependencies: [],
});

function starts(input: PlannerNextProblem, task: Task, placed: ScheduledTask[], mode: "COACH_DOMAIN" | "FULL_GRID" = "COACH_DOMAIN") {
  return [...exactFeederStartDomain(input, task, 90, placed, mode).starts()];
}

test("coach domain exactly removes overlap and both directional transition margins", () => {
  const task = feeder();
  const input = problem(task);
  input.coachRouteTransitions = [
    { coachId: "coach", fromSpaceId: "feeder-space", toSpaceId: "blocker-space", minutes: 15 },
    { coachId: "coach", fromSpaceId: "blocker-space", toSpaceId: "feeder-space", minutes: 5 },
  ];
  const placed = [blocker(40, 50)];
  const full = starts(input, task, placed, "FULL_GRID");
  const expected = full.filter((start) => canPlaceTask(input, task, start, placed));
  assert.deepEqual(starts(input, task, placed), expected);
  assert.ok(!expected.includes(20)); // feeder -> blocker transition boundary minus one grid step
  assert.ok(expected.includes(15)); // exact feeder -> blocker boundary
  assert.ok(!expected.includes(45)); // overlap
  assert.ok(expected.includes(55)); // exact blocker -> feeder boundary
});

test("coach domain uses zero in one space, route fallback, and ignores absent or different coaches", () => {
  const task = feeder();
  const input = problem(task);
  assert.deepEqual(starts(input, task, [blocker(40, 50, "feeder-space")]),
    starts(input, task, [blocker(40, 50, "feeder-space")], "FULL_GRID").filter((start) => start + task.duration <= 40 || start >= 50));
  assert.ok(!starts(input, task, [blocker(40, 50)]).includes(25));
  assert.ok(starts(input, task, [blocker(40, 50)]).includes(20));

  const noCoach = feeder();
  delete noCoach.coachId;
  assert.deepEqual(starts(problem(noCoach), noCoach, [blocker(40, 50)]), starts(problem(noCoach), noCoach, [blocker(40, 50)], "FULL_GRID"));
  assert.deepEqual(starts(input, task, [{ ...blocker(40, 50), coachId: "other" }]), starts(input, task, [], "FULL_GRID"));
});

test("coach domain is lazy, includes operation blockers, preserves grid boundaries and is deterministic", () => {
  const task = feeder(), operationBlocker = blocker(40, 50);
  const input = problem(task, [operationBlocker]);
  const domain = exactFeederStartDomain(input, task, 92, [operationBlocker]);
  const iterator = domain.starts();
  const first = iterator.next();
  assert.deepEqual(first, { value: 92, done: false });
  const remaining = [first.value!, ...iterator];
  assert.deepEqual(remaining, [...exactFeederStartDomain(input, task, 92, [operationBlocker]).starts()]);
  assert.ok(remaining.every((start) => (92 - start) % 5 === 0 && start >= input.day.start));
  assert.equal(remaining.at(-1), 2);
});

test("coach domain jumps analytically over a huge forbidden grid interval", () => {
  const task = feeder();
  const input = problem(task);
  input.day.end = 2_000_100;
  input.spaces.forEach((space) => { space.availability = [{ start: 0, end: input.day.end }]; });
  input.participants[0]!.availability = [{ start: 0, end: input.day.end }];
  input.coaches[0]!.availability = [{ start: 0, end: input.day.end }];
  const latestStart = 2_000_000;
  const domain = exactFeederStartDomain(input, task, latestStart, [blocker(500_000, 2_000_000)]);
  assert.equal(domain.fullGridStartCount, 400_001);
  assert.equal(domain.eligibleStartCount, 99_997);
  assert.equal(domain.coachEliminatedStartCount, 300_004);
  assert.deepEqual(domain.intervals, [{ start: 0, end: 499_980 }]);
  const progress: Array<[number, number]> = [];
  assert.deepEqual(domain.starts((considered, eliminated) => progress.push([considered, eliminated])).next(),
    { value: 499_980, done: false });
  assert.deepEqual(progress, [[300_005, 300_004]]);
});

test("FULL_GRID oracle preserves the first valid start and coach-domain accounting counts only evaluations", () => {
  const make = (): PlannerNextProblem => {
    const vocal: Task = { ...feeder(), availability: [{ start: 0, end: 80 }] };
    const main: Task = { id: "main-task", kind: "main", participantId: "participant", coachId: "coach",
      duration: 10, spaceId: "main", dependencies: [vocal.id], blockKey: "block" };
    const input = problem(vocal);
    input.tasks = [vocal, main];
    input.mainFlow.preferredEnd = 100;
    return input;
  };
  const full = runExactMainAndFeederSearch(make(), { causalDiagnostic: true, feederStartDomainMode: "FULL_GRID" });
  const derived = runExactMainAndFeederSearch(make(), { causalDiagnostic: true, feederStartDomainMode: "COACH_DOMAIN" });
  assert.equal(derived.status, full.status);
  assert.deepEqual(derived.scheduledTasks, full.scheduledTasks);
  const rows = Object.values(derived.evidence.causalDiagnostic!.feederByDepth);
  assert.equal(rows.reduce((sum, row) => sum + row.startsEvaluated, 0), derived.evidence.constructiveFeederStartChecks);
  assert.equal(rows.reduce((sum, row) => sum + row.startsConsidered, 0),
    rows.reduce((sum, row) => sum + row.startsEvaluated + row.startsCoachEliminated, 0));
  assert.ok(derived.evidence.branchesExplored <= full.evidence.branchesExplored);
});
