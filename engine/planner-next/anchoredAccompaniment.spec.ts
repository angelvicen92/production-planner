import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { projectCombinedFocalA2ItinerantProblem } from "./benchmarks/focal-a2/focalA2RealityReference";
import { anchoredAccompanimentPreflight, materializeAnchoredOperation } from "./anchoredAccompaniment";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";

const anchoredContract = {
  id: "anchored-operation",
  anchorTaskId: "main",
  beforeTaskIds: ["before"],
  afterTaskIds: ["after"],
  adjacency: "REQUIRED" as const,
  internalTransition: "INCLUDED" as const,
  resourceContinuity: "REQUIRED" as const,
};

function focalAnchoredProblem(withContract = true): PlannerNextProblem {
  const availability = [{ start: 540, end: 660 }];
  const tasks: Task[] = [
    { id: "vocal", kind: "vocal", participantId: "participant", coachId: "coach", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "before", kind: "auxiliary", participantId: "participant", duration: 5, spaceId: "side-room", dependencies: [] },
    { id: "main", kind: "main", participantId: "participant", coachId: "coach", duration: 15, spaceId: "main-stage", dependencies: ["vocal"], blockKey: "coach" },
    { id: "after", kind: "auxiliary", participantId: "participant", duration: 5, spaceId: "side-room", dependencies: [] },
  ];
  return {
    day: { start: 540, end: 660 },
    spaces: ["main-stage", "vocal-room", "side-room"].map(id => ({ id, availability })),
    resources: [],
    participants: [{ id: "participant", availability }],
    coaches: [{ id: "coach", availability }],
    tasks,
    mainFlow: { spaceId: "main-stage", preferredEnd: 630, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 10, maxPatterns: 10, maxBranchExpansions: 100 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    anchoredAccompaniments: withContract ? [anchoredContract] : [],
  };
}

function withoutRuntime<T extends ReturnType<typeof planMainFlowAndFeeders>>(result: T): T {
  return { ...result, metrics: { ...result.metrics, runtimeMs: 0 } };
}

test("main anchored accompaniment is materialized atomically and preserves task identity", () => {
  const problem = focalAnchoredProblem();
  const before = structuredClone(problem);
  const result = planMainFlowAndFeeders(problem);
  assert.deepEqual(anchoredAccompanimentPreflight(problem), []);
  assert.equal(result.complete, true);
  assert.equal(result.metrics.hardValid, true);
  assert.equal(result.scheduledTasks.length, 4);
  assert.equal(result.metrics.anchoredAccompanimentCount, 1);
  assert.equal(result.metrics.anchoredAccompanimentPlannedCount, 1);
  assert.equal(result.metrics.anchoredAccompanimentScheduledSegmentCount, 2);
  assert.equal(result.metrics.anchoredAccompanimentCompleteById[anchoredContract.id], true);

  const sequence = ["before", "main", "after"].map(id => result.scheduledTasks.find(task => task.id === id)!);
  assert.ok(sequence.every(Boolean));
  assert.ok(sequence.slice(1).every((task, index) => sequence[index]!.end === task.start));
  for (const scheduled of sequence) {
    const original = problem.tasks.find(task => task.id === scheduled.id)!;
    const { start: _start, end: _end, ...scheduledIdentity } = scheduled;
    assert.deepEqual(scheduledIdentity, original);
  }
  assert.deepEqual(problem, before);
});

test("materializer permits an empty side and never publishes partial state", () => {
  const problem = focalAnchoredProblem();
  const contract = problem.anchoredAccompaniments![0]!;
  const anchor = problem.tasks.find(task => task.id === contract.anchorTaskId)!;
  contract.beforeTaskIds = [];
  const operation = materializeAnchoredOperation(problem, anchor, 570, []);
  assert.ok(operation);
  assert.deepEqual(operation.tasks.map(task => task.id), [contract.anchorTaskId, ...contract.afterTaskIds]);
  problem.tasks.find(task => task.id === contract.afterTaskIds[0])!.availability = [{ start: 0, end: 1 }];
  assert.equal(materializeAnchoredOperation(problem, anchor, 570, []), null);
});

test("invalid and non-main contracts retain deterministic explicit reasons", () => {
  const problem = focalAnchoredProblem();
  problem.anchoredAccompaniments![0]!.anchorTaskId = "vocal";
  const reasons = anchoredAccompanimentPreflight(problem);
  assert.ok(reasons.some(reason => reason.includes("UNSUPPORTED_ANCHOR_KIND")));
  assert.deepEqual(reasons, [...reasons].sort());
});

test("anchored planning is deterministic and invariant to task and contract order", () => {
  const firstProblem = focalAnchoredProblem();
  const secondProblem = focalAnchoredProblem();
  const reversed = focalAnchoredProblem();
  reversed.tasks.reverse();
  reversed.anchoredAccompaniments!.reverse();
  const first = planMainFlowAndFeeders(firstProblem);
  const second = planMainFlowAndFeeders(secondProblem);
  const reordered = planMainFlowAndFeeders(reversed);
  assert.deepEqual(withoutRuntime(first), withoutRuntime(second));
  assert.equal(first.metrics.planFingerprint, reordered.metrics.planFingerprint);
  assert.deepEqual(first.scheduledTasks, reordered.scheduledTasks);
});

test("absence of anchored contracts preserves valid planning with zero anchored metrics", () => {
  const result = planMainFlowAndFeeders(focalAnchoredProblem(false));
  assert.equal(result.complete, true);
  assert.equal(result.metrics.hardValid, true);
  assert.equal(result.metrics.anchoredAccompanimentCount, 0);
  assert.equal(result.metrics.anchoredAccompanimentPlannedCount, 0);
  assert.equal(result.metrics.anchoredAccompanimentScheduledSegmentCount, 0);
});

test("the real Focal A2 fixture retains its three valid anchored contracts without running search", () => {
  const problem = projectCombinedFocalA2ItinerantProblem();
  assert.deepEqual(anchoredAccompanimentPreflight(problem), []);
  assert.equal(problem.anchoredAccompaniments?.length, 3);
});
