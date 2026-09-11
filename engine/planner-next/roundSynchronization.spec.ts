import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlannerNextProblem,
  ScheduledRoundPreparation,
  ScheduledTask,
} from "./contracts";
import { constructExactItinerantPlan } from "./exactItinerantPlan";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import type { PrerequisiteAwareSlotAuthority } from "./prerequisiteAwareSlotFeasibility";
import {
  exploreExactRoundSynchronizationPolicy,
  probeExactRoundSynchronizationMacroDomain,
} from "./exactRoundSynchronization";
import { operationalMealCandidates } from "./operationalMeals";
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

function roundArrivalAuthority(
  verdict: "PROVEN_IMPOSSIBLE" | "NOT_PROVEN_IMPOSSIBLE",
  checked = true,
): PrerequisiteAwareSlotAuthority {
  const authority = (() => "NOT_PROVEN_IMPOSSIBLE") as PrerequisiteAwareSlotAuthority;
  authority.arrivalInjectiveFeasible = (edges) => ({
    verdict,
    checked,
    edgeDeadlineChecks: checked ? edges.length : 0,
    maxMatchingChecks: checked ? 1 : 0,
    firstCertificate: verdict === "PROVEN_IMPOSSIBLE"
      ? { cutoff: 800, minimumDemand: 2, maximumPossible: 1 }
      : null,
    abstention: checked ? null : {
      reason: "ARRIVAL_CAPACITY_INCONCLUSIVE",
      taskCount: new Set(edges.map(({ task }) => task.id)).size,
      distinctParticipantCount: new Set(edges.map(({ task }) => task.participantId)).size,
    },
  });
  return authority;
}

test("round arrival capacity prunes a jointly impossible geometry before matching and branching", () => {
  const problem = supportedProblem();
  const policy = problem.roundSynchronizations![0]!;
  const snapshot = structuredClone(problem);
  const ledger = createExactSearchLedger(10_000);
  const result = exploreExactRoundSynchronizationPolicy(problem, policy, [], [], [], [], ledger,
    () => assert.fail("a certified impossible geometry must not reach the assignment continuation"),
    roundArrivalAuthority("PROVEN_IMPOSSIBLE"));
  assert.equal(result.outcome, "DEAD_END");
  assert.ok(result.evidence.arrivalInjectiveChecks > 0);
  assert.ok(result.evidence.arrivalInjectivePrunes > 0);
  assert.equal(result.evidence.matchingAttempts, 0);
  assert.equal(result.evidence.assignmentBranches, 0);
  assert.equal(ledger.branchesExplored, 0);
  assert.deepEqual(result.evidence.firstCertificate,
    { cutoff: 800, minimumDemand: 2, maximumPossible: 1 });
  assert.deepEqual(problem, snapshot);
});

test("round arrival capacity preserves sufficient and inconclusive geometries with intact accounting", () => {
  const problem = supportedProblem();
  const policy = problem.roundSynchronizations![0]!;
  for (const [authority, expectedChecks] of [
    [roundArrivalAuthority("NOT_PROVEN_IMPOSSIBLE"), 1],
    [roundArrivalAuthority("NOT_PROVEN_IMPOSSIBLE", false), 0],
  ] as const) {
    const ledger = createExactSearchLedger(10_000);
    const result = exploreExactRoundSynchronizationPolicy(problem, policy, [], [], [], [], ledger,
      () => "FOUND", authority);
    assert.equal(result.outcome, "FOUND");
    assert.equal(result.evidence.arrivalInjectiveChecks, expectedChecks);
    assert.equal(result.evidence.arrivalInjectivePrunes, 0);
    assert.equal(result.evidence.matchingAttempts, 1);
    assert.equal(result.evidence.assignmentBranches, 1);
    assert.equal(ledger.branchesExplored, 1);
    if (!expectedChecks) assert.deepEqual(result.evidence.firstAbstention, {
      reason: "ARRIVAL_CAPACITY_INCONCLUSIVE", taskCount: 4, distinctParticipantCount: 4,
    });
  }
});

test("round arrival pruning evidence is invariant to task input order", () => {
  const run = (problem: PlannerNextProblem) => exploreExactRoundSynchronizationPolicy(
    problem, problem.roundSynchronizations![0]!, [], [], [], [], createExactSearchLedger(10_000),
    () => "FOUND", roundArrivalAuthority("PROVEN_IMPOSSIBLE"),
  ).evidence;
  const problem = supportedProblem();
  const reversed = { ...problem, tasks: [...problem.tasks].reverse() };
  assert.deepEqual(run(reversed), run(problem));
});

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

function withRoundOperationalMeal(problem: PlannerNextProblem, duration = 75): PlannerNextProblem {
  const copy = structuredClone(problem);
  const policy = copy.roundSynchronizations![0]!;
  copy.operationalMealPolicies = [{
    id: "round-operations-meal",
    window: { start: copy.day.start, end: copy.day.end },
    duration,
    resourceIds: [],
    spaceIds: policy.lanes.map(({ spaceId }) => spaceId),
  }];
  return copy;
}

test("exact synchronized rounds reserve a common operational boundary for terminal materialization", () => {
  const problem = withRoundOperationalMeal(supportedProblem());
  const snapshot = structuredClone(problem);
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.equal(result.scheduledOperationalMeals.length, 1);
  const meal = result.scheduledOperationalMeals[0]!;
  const policy = problem.roundSynchronizations![0]!;
  const lanes = policy.lanes.map((lane) => result.scheduledTasks.filter((task) => lane.taskIds.includes(task.id))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)));
  assert.equal(lanes[0]![0]!.start, lanes[1]![0]!.start);
  assert.equal(lanes[0]![1]!.start, lanes[1]![1]!.start);
  assert.equal(meal.start, lanes[0]![0]!.end);
  assert.ok(meal.end <= lanes[0]![1]!.start);
  assert.ok(result.scheduledRoundPreparations.every((preparation) =>
    preparation.end <= meal.start || meal.end <= preparation.start));
  const mealCandidates = operationalMealCandidates(problem, problem.operationalMealPolicies![0]!, result.scheduledTasks, []);
  assert.deepEqual(mealCandidates[0] && { start: mealCandidates[0].start, end: mealCandidates[0].end },
    { start: meal.start, end: meal.end });
  assert.ok(mealCandidates.length > 1, "free-window fallbacks remain hard-valid alternatives");
  assert.deepEqual(problem, snapshot);
});

test("round meal boundaries remain exact alternatives and partial macro scopes abstain", () => {
  const problem = withRoundOperationalMeal(supportedProblem(), 45);
  const policy = problem.roundSynchronizations![0]!;
  for (const lane of policy.lanes) {
    const template = problem.tasks.find(({ id }) => id === lane.taskIds[0]);
    assert.ok(template);
    const task = { ...template, id: `${template.id}:third`, participantId: `${template.participantId}:third` };
    problem.tasks.push(task);
    problem.participants.push({ id: task.participantId!, availability: [{ ...problem.day }] });
    lane.taskIds.push(task.id);
  }
  const candidates: ScheduledTask[][] = [];
  const explored = exploreExactRoundSynchronizationPolicy(problem, policy, [], [], [], [],
    createExactSearchLedger(10_000), (candidate) => {
      candidates.push(candidate.tasks);
      return candidates.length >= 2 ? "FOUND" : "DEAD_END";
    });
  assert.equal(explored.outcome, "FOUND");
  const mealStarts = candidates.map((tasks) => operationalMealCandidates(
    problem, problem.operationalMealPolicies![0]!, tasks, [])[0]?.start);
  assert.equal(new Set(mealStarts).size, 2);
  assert.equal(explored.evidence.assignmentBranches, 2);

  const partial = structuredClone(problem);
  partial.tasks.push({ id: "external-scope-task", kind: "auxiliary", duration: 5,
    spaceId: policy.lanes[0]!.spaceId, dependencies: [] });
  const withoutReservation: ScheduledTask[][] = [];
  exploreExactRoundSynchronizationPolicy(partial, partial.roundSynchronizations![0]!, [], [], [], [],
    createExactSearchLedger(10_000), (candidate) => { withoutReservation.push(candidate.tasks); return "FOUND"; });
  const firstLane = partial.roundSynchronizations![0]!.lanes[0]!;
  const laneTasks = withoutReservation[0]!.filter((task) => firstLane.taskIds.includes(task.id))
    .sort((left, right) => left.start - right.start);
  assert.equal(laneTasks[1]!.start - laneTasks[0]!.end, firstLane.preparationMinutesBetweenRounds);
});

test("an unavailable operational window creates no false synchronized-round solution", () => {
  const problem = withRoundOperationalMeal(supportedProblem());
  problem.operationalMealPolicies![0]!.window = { start: problem.day.start, end: problem.day.start + 30 };
  const result = constructExactItinerantPlan(problem);
  assert.notEqual(result.status, "COMPLETE");
  assert.equal(result.scheduledOperationalMeals.length, 0);
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

test("a closed operational meal can occupy the 3/2 residual boundary", () => {
  const problem = withRoundOperationalMeal(supportedProblem());
  const policy = problem.roundSynchronizations![0]!;
  const longerLane = policy.lanes[0]!;
  const template = problem.tasks.find(({ id }) => id === longerLane.taskIds[0]);
  assert.ok(template);
  problem.tasks.push({ ...template, id: "task:residual-meal-round" });
  longerLane.taskIds.push("task:residual-meal-round");
  problem.operationalMealPolicies![0]!.window = { start: 545, end: 620 };
  for (const spaceId of policy.lanes.map(({ spaceId }) => spaceId)) {
    problem.spaces.find(({ id }) => id === spaceId)!.availability = [{ start: 480, end: 655 }];
  }

  const result = constructExactItinerantPlan(problem);
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  const meal = result.scheduledOperationalMeals[0]!;
  const lanes = policy.lanes.map((lane) => result.scheduledTasks
    .filter(({ id }) => lane.taskIds.includes(id)).sort((left, right) => left.start - right.start));
  assert.equal(lanes[0]!.length, 3);
  assert.equal(lanes[1]!.length, 2);
  assert.equal(lanes[0]![0]!.start, lanes[1]![0]!.start);
  assert.equal(lanes[0]![1]!.start, lanes[1]![1]!.start);
  assert.equal(meal.start, lanes[0]![1]!.end);
  assert.equal(meal.start, lanes[1]![1]!.end);
  assert.ok(meal.end <= lanes[0]![2]!.start);
  const residualPreparation = result.scheduledRoundPreparations.find(({ roundIndex }) => roundIndex === 3);
  assert.ok(residualPreparation);
  assert.ok(residualPreparation.start >= meal.end);
  assert.equal(residualPreparation.end, lanes[0]![2]!.start);
});

test("round macro-domain probing is conservative and matching remains ledger-accounted", () => {
  const problem = supportedProblem();
  const policy = problem.roundSynchronizations![0]!;
  const probe = probeExactRoundSynchronizationMacroDomain(problem, policy, [], [], [], []);
  assert.ok(probe.domainSize > 0);
  assert.equal(probe.domainExact, false);

  const impossible = structuredClone(problem);
  impossible.roundSynchronizations![0]!.lanes[0]!.taskIds.push("missing-task");
  assert.equal(probeExactRoundSynchronizationMacroDomain(
    impossible, impossible.roundSynchronizations![0]!, [], [], [], [],
  ).domainSize, 0);

  let consumed = 0;
  const explored = exploreExactRoundSynchronizationPolicy(problem, policy, [], [], [], [], {
    get remaining() { return 10_000 - consumed; },
    consume: () => { consumed += 1; return true; },
  }, () => "FOUND");
  assert.equal(explored.outcome, "FOUND");
  assert.equal(consumed, explored.evidence.assignmentBranches);
  assert.equal(explored.evidence.matchingAttempts, explored.evidence.assignmentBranches);
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

test("synchronized geometries are prerequisite-filtered before assignment branching",()=>{
  const run=(reverse:boolean)=>{const problem=structuredClone(supportedProblem());const policy=problem.roundSynchronizations![0]!;
    if(reverse){problem.tasks.reverse();for(const lane of policy.lanes)lane.taskIds.reverse();}
    const first=problem.day.start+20;
    return exploreExactRoundSynchronizationPolicy(problem,policy,[],[],[],[],createExactSearchLedger(10_000),
      ()=>"FOUND",(_task,start)=>start<first?"PROVEN_IMPOSSIBLE":"NOT_PROVEN_IMPOSSIBLE");};
  const baseline=run(false),reversed=run(true);
  assert.equal(baseline.outcome,"FOUND");
  assert.equal(baseline.evidence.firstPrerequisiteAwareStart,baseline.evidence.startCandidates>1
    ? supportedProblem().day.start+20:null);
  assert.equal(baseline.evidence.assignmentBranches,1);
  assert.equal(baseline.evidence.prerequisiteAwareGeometriesEliminated,4);
  assert.deepEqual(reversed,baseline);
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
