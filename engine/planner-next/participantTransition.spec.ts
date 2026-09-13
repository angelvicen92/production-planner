import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { effectiveParticipantTransitionMinutes } from "./participantTransition";
import { validatePlan } from "./validate";

const availability = [{ start: 0, end: 120 }];
function problem(tasks: Task[]): PlannerNextProblem {
  return { day: availability[0]!, spaces: ["same", "other"].map((id) => ({ id, availability })), resources: [],
    participants: [{ id: "p", availability }], coaches: [], tasks,
    mainFlow: { spaceId: "same", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 100 } };
}
const task = (id: string, spaceId = "same", overrides: Partial<Task> = {}): Task => ({
  id, kind: "auxiliary", participantId: "p", duration: 10, spaceId, dependencies: [], ...overrides,
});

test("participant boundary authority applies default five in same and different spaces", () => {
  for (const space of ["same", "other"]) {
    const a = task("a"), b = task("b", space), p = problem([a, b]);
    const placed: ScheduledTask = { ...a, start: 0, end: 10 };
    assert.equal(canPlaceTask(p, b, 10, [placed]), false);
    assert.equal(canPlaceTask(p, b, 15, [placed]), true);
  }
});

test("participant overrides preserve zero, select one override, and take max without summing", () => {
  const cases: Array<[Partial<Task>, Partial<Task>, number]> = [
    [{ participantMarginAfterMinutes: 0 }, {}, 0], [{}, { participantMarginBeforeMinutes: 0 }, 0],
    [{ participantMarginAfterMinutes: 30 }, {}, 30], [{}, { participantMarginBeforeMinutes: 30 }, 30],
    [{ participantMarginAfterMinutes: 0 }, { participantMarginBeforeMinutes: 30 }, 30],
  ];
  for (const [left, right, expected] of cases) assert.equal(effectiveParticipantTransitionMinutes(problem([]), task("a", "same", left), task("b", "other", right)), expected);
});

test("placement and validator agree and are invariant to input order", () => {
  const a = task("a", "same", { participantMarginAfterMinutes: 30 });
  const b = task("b", "other", { participantMarginBeforeMinutes: 0 });
  for (const tasks of [[a, b], [b, a]]) {
    const p = problem(tasks), placed: ScheduledTask = { ...a, start: 0, end: 10 };
    assert.equal(canPlaceTask(p, b, 35, [placed]), false);
    assert.equal(validatePlan(p, [placed, { ...b, start: 35, end: 45 }]).hardValid, false);
    assert.equal(canPlaceTask(p, b, 40, [placed]), true);
    assert.equal(validatePlan(p, [placed, { ...b, start: 40, end: 50 }]).hardValid, true);
  }
});
