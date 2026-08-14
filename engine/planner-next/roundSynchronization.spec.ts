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

function scheduled(
  problem: PlannerNextProblem,
  additionalStarts: Record<string, number> = {},
): ScheduledTask[] {
  const starts: Record<string, number> = {
    "task:102": 570,
    "task:104": 600,
    "task:101": 690,
    "task:103": 720,
    "task:401": 840,
    "task:403": 840,
    "task:402": 875,
    "task:404": 875,
    ...additionalStarts,
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

test("canonical validation permits residual rounds after the shorter lane is exhausted", () => {
  const problem = structuredClone(supportedProblem());
  const policy = problem.roundSynchronizations?.[0];
  assert.ok(policy);
  const longerLane = policy.lanes[0];
  assert.ok(longerLane);
  const template = problem.tasks.find(({ id }) => id === "task:402");
  assert.ok(template);

  const residualTask = { ...template, id: "task:405" };
  problem.tasks.push(residualTask);
  longerLane.taskIds.push(residualTask.id);
  assert.deepEqual(preflight(problem), []);

  const preparations = [
    ...roundPreparations(problem),
    {
      id: roundPreparationId(policy.id, longerLane.spaceId, 3),
      kind: "round-preparation" as const,
      synchronizationId: policy.id,
      spaceId: longerLane.spaceId,
      roundIndex: 3,
      duration: longerLane.preparationMinutesBetweenRounds,
      start: 905,
      end: 910,
    },
  ];
  const valid = validatePlan(
    problem,
    scheduled(problem, { "task:405": 910 }),
    [],
    [],
    [],
    [],
    [],
    preparations,
  );
  assert.equal(valid.hardValid, true, valid.reasonCodes.join(","));
  assert.equal(valid.roundSynchronizationViolationCount, 0);
  assert.equal(valid.roundPreparationViolationCount, 0);

  const missingResidualPreparation = validatePlan(
    problem,
    scheduled(problem, { "task:405": 910 }),
    [],
    [],
    [],
    [],
    [],
    preparations.filter(({ roundIndex }) => roundIndex !== 3),
  );
  assert.equal(missingResidualPreparation.hardValid, false);
  assert.ok((missingResidualPreparation.roundPreparationViolationCount ?? 0) > 0);
  assert.ok(missingResidualPreparation.reasonCodes.includes("ROUND_PREPARATION_VIOLATION"));
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

test("the exact route schedules synchronized rounds and explicit preparations", () => {
  const problem = supportedProblem();
  const snapshot = structuredClone(problem);
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.equal(result.complete, true);
  assert.equal(result.scheduledRoundPreparations.length, 2);
  const validation = validatePlan(
    problem,
    result.scheduledTasks,
    result.scheduledSetupPreparations,
    result.scheduledSpaceMeals,
    result.scheduledParticipantMeals,
    result.scheduledResourceMeals,
    result.scheduledItinerantUnitMeals,
    result.scheduledRoundPreparations,
  );
  assert.equal(validation.hardValid, true, validation.reasonCodes.join(","));
  assert.equal(validation.roundSynchronizationViolationCount, 0);
  assert.equal(validation.roundPreparationViolationCount, 0);
  assert.ok(result.evidence.roundSynchronizationAssignmentBranches > 0);
  assert.deepEqual(problem, snapshot);
});

test("exact synchronization supports a residual round after the shorter lane finishes", () => {
  const problem = structuredClone(supportedProblem());
  const policy = problem.roundSynchronizations![0]!;
  const lane = policy.lanes[0]!;
  problem.participants.push({ id: "participant:residual-round", availability: [{ ...problem.day }] });
  problem.tasks.push({
    id: "task:residual-round",
    kind: "auxiliary",
    participantId: "participant:residual-round",
    duration: 30,
    spaceId: lane.spaceId,
    dependencies: [],
  });
  lane.taskIds.push("task:residual-round");
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  const laneSchedules = policy.lanes.map((entry) => result.scheduledTasks
    .filter((task) => entry.taskIds.includes(task.id))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)));
  assert.equal(laneSchedules[0]!.length, 3);
  assert.equal(laneSchedules[1]!.length, 2);
  for (let index = 0; index < 2; index += 1) {
    assert.equal(laneSchedules[0]![index]!.start, laneSchedules[1]![index]!.start);
    assert.equal(laneSchedules[0]![index]!.end, laneSchedules[1]![index]!.end);
  }
  assert.ok(laneSchedules[0]![2]!.start > laneSchedules[1]![1]!.start);
  assert.equal(result.scheduledRoundPreparations.length, 3);
  const validation = validatePlan(
    problem,
    result.scheduledTasks,
    result.scheduledSetupPreparations,
    result.scheduledSpaceMeals,
    result.scheduledParticipantMeals,
    result.scheduledResourceMeals,
    result.scheduledItinerantUnitMeals,
    result.scheduledRoundPreparations,
  );
  assert.equal(validation.hardValid, true, validation.reasonCodes.join(","));
});

test("round synchronization is deterministic under task and eligible-set order changes", () => {
  const baselineProblem = supportedProblem();
  const baseline = constructExactItinerantPlan(baselineProblem);
  assert.equal(baseline.status, "COMPLETE");

  const reordered = structuredClone(baselineProblem);
  reordered.tasks.reverse();
  reordered.participants.reverse();
  reordered.roundSynchronizations?.forEach((policy) =>
    policy.lanes.forEach((lane) => lane.taskIds.reverse()));
  const again = constructExactItinerantPlan(reordered);
  assert.equal(again.status, "COMPLETE");
  assert.equal(again.evidence.fullFingerprint, baseline.evidence.fullFingerprint);
  assert.deepEqual(again.scheduledRoundPreparations, baseline.scheduledRoundPreparations);
});

test("round synchronization exhausts the shared budget atomically", () => {
  const complete = constructExactItinerantPlan(structuredClone(supportedProblem()));
  assert.equal(complete.status, "COMPLETE");
  const problem = structuredClone(supportedProblem());
  problem.budget.maxBranchExpansions = complete.evidence.coreBranches + 1;
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "BRANCH_BUDGET_EXHAUSTED");
  assert.equal(result.complete, false);
  assert.deepEqual(result.scheduledTasks, []);
  assert.deepEqual(result.scheduledSetupPreparations, []);
  assert.deepEqual(result.scheduledRoundPreparations, []);
  assert.deepEqual(result.scheduledSpaceMeals, []);
  assert.ok(result.evidence.reasonCodes.includes("STANDALONE_BRANCH_BUDGET_EXHAUSTED"));
});
