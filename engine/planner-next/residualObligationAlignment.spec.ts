import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import type { ExactMainChoiceDescriptor } from "./exactMainAndFeederCore";
import { createResidualObligationMainOrderer, evaluateResidualObligationCandidate, evaluateResidualObligationCandidateWithTrace,
  measureResidualObligationIntervals, mergeResidualObligationIntervals, residualObligationAlignmentTuple,
  residualOrderingStateFingerprint } from "./residualObligationAlignment";

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

test("state fingerprints distinguish branch state and ignore incidental array order", () => {
  const a = { ...descriptor(80), placedTasks: [{ ...descriptor(80).operationTasks[0]!, id: "a" }, { ...descriptor(80).operationTasks[0]!, id: "b" }] };
  const equivalent = { ...a, placedTasks: [...a.placedTasks].reverse() };
  const sibling = { ...a, placedTasks: a.placedTasks.map((task) => task.id === "a" ? { ...task, start: task.start + 5, end: task.end + 5 } : task) };
  assert.equal(residualOrderingStateFingerprint([a]), residualOrderingStateFingerprint([equivalent]));
  assert.notEqual(residualOrderingStateFingerprint([a]), residualOrderingStateFingerprint([sibling]));
});

test("acceptance uses descriptor identity, never a sibling at the same depth", () => {
  const orderer = createResidualObligationMainOrderer(problem(), []), a = descriptor(80, "a"), sibling = descriptor(90, "a");
  orderer.options.onMainChoicesRanked!([a], [a]); orderer.options.onMainChoicesRanked!([sibling], [sibling]);
  orderer.options.onMainChoiceAccepted!(a);
  assert.equal(orderer.evidence.acceptedPathDecisions.length, 1);
  assert.equal(orderer.evidence.decisions[0]!.acceptedPath, true); assert.equal(orderer.evidence.decisions[1]!.acceptedPath, false);
  assert.equal(orderer.evidence.acceptedPathDecisions[0], orderer.evidence.decisions[0]);
  assert.equal(orderer.evidence.acceptedPathDecisions[0]!.selectedTrace!.candidateId, "a");
  assert.equal(orderer.evidence.acceptedPathDecisions[0]!.selectedTrace!.stateFingerprint,
    orderer.evidence.acceptedPathDecisions[0]!.stateFingerprint);
  assert.equal(orderer.evidence.decisions[1]!.selectedTrace, null);
});

test("evaluation with trace preserves the exact key and canonical static estimates", () => {
  const input = problem(), task = residual("z", [{ start: 10, end: 100 }]);
  task.requiredResourceIds = ["unit"];
  const candidate = descriptor(80), before = JSON.stringify({ input, task, candidate });
  const evaluation = evaluateResidualObligationCandidateWithTrace(input, [task], candidate);
  assert.deepEqual(evaluation.key, evaluateResidualObligationCandidate(input, [task], candidate));
  assert.equal(evaluation.trace.residualTasks[0]!.taskId, "z");
  assert.deepEqual(evaluation.trace.residualTasks[0]!.requiredResourceIds, ["unit"]);
  assert.equal(evaluation.trace.residualTasks[0]!.staticStartsEvaluated, 39);
  assert.equal(JSON.stringify({ input, task, candidate }), before);
});

test("diagnostic limit cannot remove accepted-path trace", () => {
  const orderer = createResidualObligationMainOrderer(problem(), []), descriptors = Array.from({ length: 45 }, (_, i) => ({ ...descriptor(i, `m-${i}`), depth: i }));
  for (const item of descriptors) orderer.options.onMainChoicesRanked!([item], [item]);
  orderer.options.onMainChoiceAccepted!(descriptors[44]!);
  assert.equal(orderer.evidence.decisions.length, 40); assert.equal(orderer.evidence.acceptedPathDecisions.length, 1);
  assert.equal(orderer.evidence.acceptedPathDecisions[0]!.selectedCandidateId, "m-44");
});

test("descriptor-state cache never reuses a key across backtracked branch states", () => {
  const input = problem(), task = residual("late", [{ start: 150, end: 170 }]);
  const placed = (id: string, start: number, end: number) => ({ id, kind: "auxiliary" as const, participantId: "p",
    duration: end - start, spaceId: "aux", dependencies: [], start, end });
  const a = { ...descriptor(80), placedTasks: [placed("placed-a", 0, 20)] };
  const b = { ...descriptor(80), placedTasks: [placed("placed-b", 120, 140)] };
  const run = (first: ExactMainChoiceDescriptor, second: ExactMainChoiceDescriptor) => {
    const orderer = createResidualObligationMainOrderer(input, [task]);
    orderer.options.mainChoiceComparator!(first, first);
    const afterFirst = orderer.evidence.staticStartEvaluations;
    orderer.options.mainChoiceComparator!(first, first);
    assert.equal(orderer.evidence.staticStartEvaluations, afterFirst);
    orderer.options.mainChoiceComparator!(second, second);
    assert.equal(orderer.evidence.staticStartEvaluations, afterFirst * 2);
    orderer.options.onMainChoicesRanked!([first, second], [first, second]);
    return orderer.evidence.decisions[0]!.keys.map(({ currentPresenceSpan, projectedPresenceLowerBound }) =>
      ({ currentPresenceSpan, projectedPresenceLowerBound }));
  };
  const ab = run(a, b), ba = run(b, a);
  assert.notDeepEqual(ab[0], ab[1]);
  assert.deepEqual(ab, [ba[1], ba[0]]);
  assert.deepEqual(ab, [
    { currentPresenceSpan: 90, projectedPresenceLowerBound: 160 },
    { currentPresenceSpan: 80, projectedPresenceLowerBound: 100 },
  ]);
});

test("canonical interval union ignores invalid intervals and does not mutate input", () => {
  const input = [{ start: 20, end: 50 }, { start: 0, end: 30 }, { start: 60, end: 70 }, { start: 5, end: 5 }];
  const before = structuredClone(input);
  assert.deepEqual(mergeResidualObligationIntervals(input), [{ start: 0, end: 50 }, { start: 60, end: 70 }]);
  assert.deepEqual(input, before);
});

test("contained residual uses union productive time and preserves the real ten-minute gap", () => {
  const measured = measureResidualObligationIntervals([{ start: 0, end: 100 }, { start: 110, end: 120 }], { start: 10, end: 20 });
  assert.deepEqual(measured, { span: 120, productive: 110, idle: 10, maximumGap: 10, nearestDistance: 0 });
  const candidate = { ...descriptor(0), feeder: { ...descriptor(0).feeder, duration: 0 },
    operationTasks: [{ ...descriptor(0).operationTasks[0]!, duration: 100, start: 0, end: 100 }],
    placedTasks: [{ id: "placed", kind: "auxiliary" as const, participantId: "p", duration: 10, spaceId: "aux",
      dependencies: [], start: 110, end: 120 }] };
  const key = evaluateResidualObligationCandidate(problem(), [residual("inside", [{ start: 10, end: 20 }])], candidate);
  assert.equal(key.currentPresenceSpan, 120); assert.equal(key.projectedPresenceLowerBound, 120);
  assert.equal(key.projectedMaximumGapLowerBound, 10); assert.equal(key.sumIndependentIdleExpansion, 0);
});

test("partially overlapping intervals produce canonical productive idle and gap", () => {
  assert.deepEqual(measureResidualObligationIntervals([{ start: 0, end: 30 }, { start: 20, end: 50 }, { start: 60, end: 70 }]),
    { span: 70, productive: 60, idle: 10, maximumGap: 10, nearestDistance: 0 });
});

test("adjacent intervals are one productive union without idle or gap", () => {
  assert.deepEqual(measureResidualObligationIntervals([{ start: 0, end: 20 }], { start: 20, end: 40 }),
    { span: 40, productive: 40, idle: 0, maximumGap: 0, nearestDistance: 0 });
});

test("an ideal feeder contained in an existing obligation is not double-counted", () => {
  const input = problem(), candidate = { ...descriptor(80), placedTasks: [{ id: "wide", kind: "auxiliary" as const,
    participantId: "p", duration: 100, spaceId: "aux", dependencies: [], start: 0, end: 100 }] };
  const key = evaluateResidualObligationCandidate(input, [], candidate);
  assert.equal(key.currentPresenceSpan, 100); assert.equal(key.projectedMaximumGapLowerBound, 0);
});

for (const [name, mutate] of [
  ["participant", (input: PlannerNextProblem, task: Task) => { input.participants = input.participants.filter(({ id }) => id !== task.participantId); }],
  ["space", (input: PlannerNextProblem, task: Task) => { task.spaceId = "missing-space"; }],
  ["resource", (_input: PlannerNextProblem, task: Task) => { task.requiredResourceIds = ["missing-resource"]; }],
  ["coach", (_input: PlannerNextProblem, task: Task) => { if (task.kind !== "technical") task.coachId = "missing-coach"; }],
] as const) test(`an explicit missing ${name} reference creates an empty static domain without throwing`, () => {
  const input = problem(), task = residual("missing"); mutate(input, task);
  const evidence = createResidualObligationMainOrderer(input, [task]);
  evidence.options.mainChoiceComparator!(descriptor(80), descriptor(80, "other-main"));
  assert.equal(evidence.evidence.emptyStaticDomains, 2);
  assert.equal(evidence.evidence.staticStartsFound, 0);
});
