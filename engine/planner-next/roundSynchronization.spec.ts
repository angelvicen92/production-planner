import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlannerNextProblem,
  ScheduledRoundPreparation,
  ScheduledTask,
} from "./contracts";
import { constructExactItinerantPlan } from "./exactItinerantPlan";
import {
  adaptEngineInputToPlannerNextProblem,
} from "./integration/engineInputAdapter";
import {
  createSpec10021RoundSynchronizationEngineInputFixture,
} from "./integration/engineInputAdapter.fixture";
import {
  preflightEngineInputForPlannerNext,
} from "./integration/engineInputPreflight";
import {
  roundPreparationId,
} from "./roundSynchronization";
import { preflight, validatePlan } from "./validate";

function supportedProblem(): PlannerNextProblem {
  const result = adaptEngineInputToPlannerNextProblem(
    createSpec10021RoundSynchronizationEngineInputFixture(),
  );
  assert.equal(
    result.status,
    "SUPPORTED",
    result.status === "UNSUPPORTED" ? result.reasonCodes.join(",") : "",
  );
  assert.ok(result.problem);
  return result.problem;
}

function scheduled(problem: PlannerNextProblem): ScheduledTask[] {
  const starts: Record<string, number> = {
    "task:102": 570,
    "task:104": 600,
    "task:101": 690,
    "task:103": 720,
    "task:401": 840,
    "task:403": 840,
    "task:402": 875,
    "task:404": 875,
  };
  return problem.tasks.map((task) => {
    const start = starts[task.id];
    assert.notEqual(start, undefined, task.id);
    return { ...task, start: start!, end: start! + task.duration };
  });
}

function roundPreparations(problem: PlannerNextProblem): ScheduledRoundPreparation[] {
  const policy = problem.roundSynchronizations?.[0];
  assert.ok(policy);
  return policy.lanes.map((lane) => ({
    id: roundPreparationId(policy.id, lane.spaceId, 2),
    kind: "round-preparation" as const,
    synchronizationId: policy.id,
    spaceId: lane.spaceId,
    roundIndex: 2,
    duration: lane.preparationMinutesBetweenRounds,
    start: 870,
    end: 875,
  }));
}

test("EngineInput projects the generic two-lane round contract deterministically", () => {
  const input = createSpec10021RoundSynchronizationEngineInputFixture();
  const snapshot = structuredClone(input);
  const enginePreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(enginePreflight.status, "SUPPORTED", enginePreflight.reasonCodes.join(","));
  const baseline = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(baseline.status, "SUPPORTED");
  assert.ok(baseline.problem);
  assert.deepEqual(preflight(baseline.problem), []);
  assert.equal(baseline.problem.roundSynchronizations?.length, 1);
  assert.deepEqual(
    baseline.problem.roundSynchronizations?.[0]?.lanes.map((lane) => lane.spaceId),
    ["space:304", "space:305"],
  );
  assert.deepEqual(input, snapshot);

  const inverted = createSpec10021RoundSynchronizationEngineInputFixture();
  inverted.tasks.reverse();
  inverted.planSpaceSettings?.reverse();
  inverted.planZoneSettings?.reverse();
  inverted.roundSynchronizations?.reverse();
  inverted.roundSynchronizations?.forEach((policy) => {
    policy.lanes.reverse();
    policy.lanes.forEach((lane) => lane.taskIds.reverse());
  });
  const invertedResult = adaptEngineInputToPlannerNextProblem(inverted);
  assert.equal(invertedResult.status, "SUPPORTED");
  assert.equal(invertedResult.sourceFingerprint, baseline.sourceFingerprint);
  assert.equal(invertedResult.identityMapFingerprint, baseline.identityMapFingerprint);
  assert.equal(invertedResult.problemFingerprint, baseline.problemFingerprint);
});

test("canonical validation accepts synchronized ordinal rounds and explicit preparations", () => {
  const problem = supportedProblem();
  const result = validatePlan(
    problem,
    scheduled(problem),
    [],
    [],
    [],
    [],
    [],
    roundPreparations(problem),
  );
  assert.equal(result.hardValid, true, result.reasonCodes.join(","));
  assert.equal(result.roundSynchronizationViolationCount, 0);
  assert.equal(result.roundPreparationViolationCount, 0);
});

test("canonical validation rejects desynchronization and missing preparation", () => {
  const problem = supportedProblem();
  const desynchronized = scheduled(problem).map((task) =>
    task.id === "task:404"
      ? { ...task, start: task.start + 5, end: task.end + 5 }
      : task);
  const invalidSync = validatePlan(
    problem,
    desynchronized,
    [],
    [],
    [],
    [],
    [],
    roundPreparations(problem),
  );
  assert.equal(invalidSync.hardValid, false);
  assert.ok((invalidSync.roundSynchronizationViolationCount ?? 0) > 0);
  assert.ok(invalidSync.reasonCodes.includes("ROUND_SYNCHRONIZATION_VIOLATION"));

  const missingPreparation = validatePlan(
    problem,
    scheduled(problem),
    [],
    [],
    [],
    [],
    [],
    roundPreparations(problem).slice(0, 1),
  );
  assert.equal(missingPreparation.hardValid, false);
  assert.ok((missingPreparation.roundPreparationViolationCount ?? 0) > 0);
  assert.ok(missingPreparation.reasonCodes.includes("ROUND_PREPARATION_VIOLATION"));
});

test("invalid EngineInput round contracts are rejected before adaptation", () => {
  const input = createSpec10021RoundSynchronizationEngineInputFixture();
  input.roundSynchronizations![0]!.lanes[1]!.taskIds = [401, 404];
  const result = preflightEngineInputForPlannerNext(input);
  assert.equal(result.status, "UNSUPPORTED");
  assert.ok(result.reasonCodes.includes("UNSUPPORTED_ROUND_SYNCHRONIZATION"));
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "UNSUPPORTED");
  assert.equal(adapted.problem, null);
});

test("the exact route rejects the new shape explicitly until search integration", () => {
  const problem = supportedProblem();
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "UNSUPPORTED_STANDALONE_SHAPE");
  assert.equal(result.complete, false);
  assert.deepEqual(result.scheduledTasks, []);
  assert.ok(result.evidence.reasonCodes.some((reason) =>
    reason.startsWith("UNSUPPORTED_STANDALONE_ROUND_SYNCHRONIZATION:")));
});
