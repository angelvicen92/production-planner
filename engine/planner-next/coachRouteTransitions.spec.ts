import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpec10019CoachRouteTransitionFixture,
  runSpec10019Probe,
} from "./benchmarks/runSpec10019CoachRouteTransitionBenchmark";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";

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
