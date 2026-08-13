import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpec10019CoachRouteTransitionFixture,
  runSpec10019Probe,
} from "./benchmarks/runSpec10019CoachRouteTransitionBenchmark";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, diagnoseTaskPlacement } from "./placement";

function coachPlacementFixture(): { problem: PlannerNextProblem; placed: ScheduledTask; candidate: Task } {
  const availability = [{ start: 0, end: 120 }];
  const candidate: Task = { id: "candidate", kind: "auxiliary", participantId: "candidate-participant",
    coachId: "coach", duration: 10, spaceId: "candidate-space", dependencies: [] };
  const placed: ScheduledTask = { id: "placed-blocker", kind: "auxiliary", participantId: "placed-participant",
    coachId: "coach", duration: 10, spaceId: "placed-space", dependencies: [], start: 20, end: 30 };
  const problem: PlannerNextProblem = { day: { start: 0, end: 120 }, participants: ["candidate-participant", "placed-participant"].map((id) => ({ id, availability })),
    coaches: [{ id: "coach", availability }], spaces: ["candidate-space", "placed-space", "main"].map((id) => ({ id, availability })), resources: [],
    tasks: [candidate, placed], mainFlow: { spaceId: "main", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 5,
    budget: { bestK: 1, maxBacktracks: 1, maxPatterns: 1, maxBranchExpansions: 100 } };
  return { problem, placed, candidate };
}

test("coach route transition rejects 29 minutes and accepts 30", () => {
  const result = runSpec10019Probe();
  assert.equal(result.complete, true);
  assert.equal(result.hardValid, true);
  assert.equal(result.scheduledGapMinutes, 30);
  assert.equal(result.rejectsTwentyNineMinutes, true);
  assert.equal(result.acceptsThirtyMinutes, true);
  assert.equal(result.validationAtTwentyNine.transitionViolationCount, 1);
  assert.equal(result.validationAtThirty.transitionViolationCount, 0);
});

test("coach route transition is directional and preserves fallback", () => {
  const result = runSpec10019Probe();
  assert.equal(result.routeMinutes, 30);
  assert.equal(result.reverseDirectionMinutes, 5);
  assert.equal(result.unrelatedCoachMinutes, 5);
});

test("invalid route is rejected before adaptation", () => {
  const input = createSpec10019CoachRouteTransitionFixture();
  input.coachRouteTransitions![0]!.minutes = 7;
  const preflight = preflightEngineInputForPlannerNext(input);
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(preflight.status, "UNSUPPORTED");
  assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_COACH_ROUTE_TRANSITION"));
  assert.equal(adapter.status, "UNSUPPORTED");
  assert.equal(adapter.problem, null);
  assert.equal(adapter.problemFingerprint, null);
});

test("placement diagnosis identifies the blocking coach overlap with canPlaceTask parity", () => {
  const { problem, placed, candidate } = coachPlacementFixture();
  const diagnostic = diagnoseTaskPlacement(problem, candidate, 25, [placed]);
  assert.equal(diagnostic.firstRejectionReason, "OVERLAP_COACH");
  assert.equal(diagnostic.blockingPlacedTaskId, placed.id);
  assert.equal(diagnostic.valid, canPlaceTask(problem, candidate, 25, [placed]));
});

test("placement diagnosis identifies the blocking coach transition without overlap", () => {
  const { problem, placed, candidate } = coachPlacementFixture();
  const diagnostic = diagnoseTaskPlacement(problem, candidate, 34, [placed]);
  assert.equal(diagnostic.firstRejectionReason, "TRANSITION_COACH");
  assert.equal(diagnostic.blockingPlacedTaskId, placed.id);
  assert.equal(diagnostic.valid, canPlaceTask(problem, candidate, 34, [placed]));
});
