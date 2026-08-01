import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, PreferenceLevel, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";

const placed: ScheduledTask[] = [{ id: "obligation", kind: "main", participantId: "participant", duration: 20, start: 100, end: 120,
  spaceId: "main", dependencies: [] }];
const auxiliary: Task = { id: "auxiliary", kind: "auxiliary", participantId: "participant", duration: 20, spaceId: "auxiliary", dependencies: [] };
function problem(policy: PreferenceLevel): PlannerNextProblem { return { day: { start: 0, end: 300 }, protectedMeal: { start: 250, end: 260 },
  spaces: [{ id: "main", availability: [{ start: 0, end: 300 }] }, { id: "auxiliary", availability: [{ start: 0, end: 300 }] }], resources: [],
  participants: [{ id: "participant", availability: [{ start: 0, end: 300 }] }], coaches: [], tasks: [auxiliary],
  mainFlow: { spaceId: "main", preferredEnd: 240, continuity: "REQUIRED", maxBlocksByKey: 2, minTasksPerBlock: 1 },
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0, budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 100 },
  auxiliaryPolicy: { participantPresencePreference: policy } }; }

test("active presence policy only ranks two hard-valid alternatives by incremental span", () => {
  const far = 20, adjacent = 120;
  assert.equal(canPlaceTask(problem("OFF"), auxiliary, far, placed), true); assert.equal(canPlaceTask(problem("OFF"), auxiliary, adjacent, placed), true);
  const off = [far, adjacent].map(start => scoreAuxiliaryTask(problem("OFF"), auxiliary, start, placed));
  assert.equal(off[0]!.cost, off[1]!.cost); assert.deepEqual([...off].sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start).map(x => x.scheduled.start), [far, adjacent]);
  const active = [far, adjacent].map(start => scoreAuxiliaryTask(problem("HIGH"), auxiliary, start, placed));
  assert.ok(active[1]!.cost < active[0]!.cost); assert.deepEqual([...active].sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start).map(x => x.scheduled.start), [adjacent, far]);
  assert.equal(canPlaceTask(problem("HIGH"), auxiliary, far, placed), true); assert.equal(canPlaceTask(problem("HIGH"), auxiliary, adjacent, placed), true);
});

test("equal presence increments retain the stable start tie-break for every active level", () => {
  for (const policy of ["LOW", "MEDIUM", "HIGH", "MAXIMUM"] as const) {
    const candidates = [120, 80].map(start => scoreAuxiliaryTask(problem(policy), auxiliary, start, placed));
    assert.equal(candidates[0]!.cost, candidates[1]!.cost);
    assert.deepEqual(candidates.sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start).map(x => x.scheduled.start), [80, 120]);
  }
});
