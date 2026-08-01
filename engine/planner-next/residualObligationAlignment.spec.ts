import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import type { ExactMainChoiceDescriptor } from "./exactMainAndFeederCore";
import { createResidualObligationMainOrderer, evaluateResidualObligationCandidate,
  residualObligationAlignmentTuple } from "./residualObligationAlignment";

const windows = [{ start: 0, end: 200 }];
function problem(): PlannerNextProblem { return { day: { start: 0, end: 200 }, protectedMeal: { start: 190, end: 200 },
  spaces: ["main", "vocal", "aux"].map((id) => ({ id, availability: windows })),
  resources: [{ id: "unit", availability: windows, presencePreference: "OFF" }],
  participants: [{ id: "p", availability: windows }, { id: "other", availability: windows }], coaches: [{ id: "coach", availability: windows }],
  tasks: [], mainFlow: { spaceId: "main", preferredEnd: 180, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 5, resourceTransitionMinutes: 10,
  budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 10, maxBranchExpansions: 1000 } }; }
const residual = (id = "residual", availability = windows, overrides: Partial<Task> = {}): Task =>
  ({ id, kind: "auxiliary", participantId: "p", duration: 10, spaceId: "aux", dependencies: [], availability, ...overrides } as Task);
function descriptor(slot: number, id = "main"): ExactMainChoiceDescriptor { return { mainTask: { id, kind: "main", participantId: "p", duration: 10,
  spaceId: "main", dependencies: ["vocal"], blockKey: "x" }, operationTasks: [{ id, kind: "main", participantId: "p", duration: 10,
  spaceId: "main", dependencies: ["vocal"], blockKey: "x", start: slot, end: slot + 10 }], feeder: { id: "vocal", kind: "vocal",
  participantId: "p", duration: 10, spaceId: "vocal", dependencies: [] }, placedTasks: [], meals: [], slot, depth: 0,
  pattern: ["x"], participantSlack: 20, firstObligation: slot }; }

test("a candidate without residual tasks has a neutral deterministic key", () => {
  const key = evaluateResidualObligationCandidate(problem(), [], descriptor(80));
  assert.equal(key.residualTaskCount, 0); assert.equal(key.projectedPresenceLowerBound, key.currentPresenceSpan);
  assert.equal(key.sumIndependentIdleExpansion, 0); assert.equal(key.emptyStaticDomainCount, 0);
});
test("a late-only residual obligation favours a later main position", () => {
  const input = problem(), task = residual("late", [{ start: 150, end: 180 }]);
  assert.ok(evaluateResidualObligationCandidate(input, [task], descriptor(140)).projectedPresenceLowerBound
    < evaluateResidualObligationCandidate(input, [task], descriptor(40)).projectedPresenceLowerBound);
});
test("an early-only residual obligation favours an early main position", () => {
  const input = problem(), task = residual("early", [{ start: 10, end: 40 }]);
  assert.ok(evaluateResidualObligationCandidate(input, [task], descriptor(40)).projectedPresenceLowerBound
    < evaluateResidualObligationCandidate(input, [task], descriptor(140)).projectedPresenceLowerBound);
});
test("an overlapping residual obligation adds no presence expansion", () => {
  assert.equal(evaluateResidualObligationCandidate(problem(), [residual()], descriptor(80)).sumIndependentPresenceExpansion, 0);
});
test("multiple windows select the nearest static alignment regardless of window order", () => {
  const input = problem(), a = residual("r", [{ start: 0, end: 20 }, { start: 90, end: 110 }]);
  const b = residual("r", [...a.availability!].reverse());
  assert.deepEqual(evaluateResidualObligationCandidate(input, [a], descriptor(80)), evaluateResidualObligationCandidate(input, [b], descriptor(80)));
});
test("multiple residual tasks aggregate deterministically regardless of task order", () => {
  const input = problem(), tasks = [residual("a", [{ start: 0, end: 20 }]), residual("b", [{ start: 150, end: 170 }])];
  assert.deepEqual(evaluateResidualObligationCandidate(input, tasks, descriptor(80)),
    evaluateResidualObligationCandidate(input, [...tasks].reverse(), descriptor(80)));
});
test("an empty static domain is recorded but remains rankable", () => {
  const key = evaluateResidualObligationCandidate(problem(), [residual("empty", [{ start: 0, end: 5 }])], descriptor(80));
  assert.equal(key.emptyStaticDomainCount, 1); assert.equal(residualObligationAlignmentTuple(key).length, 9);
});
for (const [name, mutate] of [
  ["participant", (p: PlannerNextProblem) => { p.participants[0]!.availability = [{ start: 0, end: 50 }]; }],
  ["space", (p: PlannerNextProblem) => { p.spaces.find(({ id }) => id === "aux")!.availability = [{ start: 0, end: 50 }]; }],
  ["resource", (p: PlannerNextProblem) => { p.resources[0]!.availability = [{ start: 0, end: 50 }]; }],
  ["coach", (p: PlannerNextProblem) => { p.coaches[0]!.availability = [{ start: 0, end: 50 }]; }],
] as const) test(`${name} availability limits the static domain`, () => {
  const input = problem(); mutate(input); const task = residual("limited", [{ start: 100, end: 120 }],
    name === "resource" ? { requiredResourceIds: ["unit"] } : name === "coach" ? { coachId: "coach" } : {});
  assert.equal(evaluateResidualObligationCandidate(input, [task], descriptor(80)).emptyStaticDomainCount, 1);
});
test("technical tasks and tasks for other participants are ignored", () => {
  const tasks: Task[] = [{ id: "technical", kind: "technical", duration: 10, spaceId: "aux", dependencies: [] },
    residual("other", windows, { participantId: "other" })];
  assert.equal(evaluateResidualObligationCandidate(problem(), tasks, descriptor(80)).residualTaskCount, 0);
});
test("the ideal latest feeder lower bound is included", () => {
  const key = evaluateResidualObligationCandidate(problem(), [], descriptor(80));
  assert.equal(key.currentPresenceSpan, 30); // feeder 50-70, transition 10, main 80-90
  assert.equal(createResidualObligationMainOrderer(problem(), []).evidence.usesIdealLatestFeederLowerBound, true);
});
test("evaluation does not mutate its inputs", () => {
  const input = problem(), tasks = [residual()], candidate = descriptor(80), before = structuredClone({ input, tasks, candidate });
  evaluateResidualObligationCandidate(input, tasks, candidate); assert.deepEqual({ input, tasks, candidate }, before);
});
test("stable id is the final tie-break", () => {
  const input = problem(), orderer = createResidualObligationMainOrderer(input, []);
  assert.ok(orderer.options.mainChoiceComparator!(descriptor(80, "a"), descriptor(80, "b")) < 0);
});
