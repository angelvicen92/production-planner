import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { constructExactItinerantPlan } from "../exactItinerantPlan";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSpec10021RoundSynchronizationEngineInputFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../validate";

const stable = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

export interface Spec10021ProbeRun {
  inputSnapshot: EngineInput;
  engineInputPreflightStatus: "SUPPORTED" | "UNSUPPORTED";
  adapterStatus: "SUPPORTED" | "UNSUPPORTED";
  plannerNextPreflightReasonCodes: readonly string[];
  sourceFingerprint: string;
  identityMapFingerprint: string;
  problemFingerprint: string;
  complete: boolean;
  hardValid: boolean;
  roundSynchronizationViolationCount: number;
  roundPreparationViolationCount: number;
  projectedSynchronizationCount: number;
  projectedLaneTaskCounts: readonly number[];
  scheduledRoundPreparationCount: number;
  synchronizedRoundCount: number;
  residualRoundCount: number;
  branchesExplored: number;
  roundSynchronizationAssignmentBranches: number;
  fullFingerprint: string | null;
  inputImmutable: boolean;
}

export function spec10021LogicalProjection(
  run: Spec10021ProbeRun,
): Omit<Spec10021ProbeRun, "inputSnapshot"> {
  const { inputSnapshot: _snapshot, ...projection } = run;
  return projection;
}

function scheduledByLane(problem: NonNullable<ReturnType<typeof adaptEngineInputToPlannerNextProblem>["problem"]>, result: ReturnType<typeof constructExactItinerantPlan>) {
  const policy = problem.roundSynchronizations?.[0];
  assert.ok(policy);
  return policy.lanes.map((lane) => {
    const ids = new Set(lane.taskIds);
    return result.scheduledTasks
      .filter((task) => ids.has(task.id))
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  });
}

export function runSpec10021Probe(
  factory: () => EngineInput = createSpec10021RoundSynchronizationEngineInputFixture,
): Spec10021ProbeRun {
  const input = factory();
  const snapshot = structuredClone(input);
  const engineInputPreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(engineInputPreflight.status, "SUPPORTED", engineInputPreflight.reasonCodes.join(","));
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED", adapted.status === "UNSUPPORTED" ? adapted.reasonCodes.join(",") : "");
  assert.ok(adapted.problem);
  const problem = adapted.problem;
  const plannerNextPreflightReasonCodes = preflightPlannerNextProblem(problem);
  assert.deepEqual(plannerNextPreflightReasonCodes, []);
  const result = constructExactItinerantPlan(problem);
  assert.equal(result.complete, true, result.evidence.reasonCodes.join(","));
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
  const lanes = scheduledByLane(problem, result);
  const synchronizedRoundCount = Math.min(...lanes.map((lane) => lane.length));
  const residualRoundCount = Math.max(...lanes.map((lane) => lane.length)) - synchronizedRoundCount;
  for (let index = 0; index < synchronizedRoundCount; index += 1) {
    assert.equal(lanes[0]![index]!.start, lanes[1]![index]!.start);
    assert.equal(lanes[0]![index]!.end, lanes[1]![index]!.end);
  }
  const probe: Spec10021ProbeRun = {
    inputSnapshot: snapshot,
    engineInputPreflightStatus: engineInputPreflight.status,
    adapterStatus: adapted.status,
    plannerNextPreflightReasonCodes,
    sourceFingerprint: adapted.sourceFingerprint,
    identityMapFingerprint: adapted.identityMapFingerprint,
    problemFingerprint: adapted.problemFingerprint,
    complete: result.complete,
    hardValid: validation.hardValid,
    roundSynchronizationViolationCount: validation.roundSynchronizationViolationCount ?? 0,
    roundPreparationViolationCount: validation.roundPreparationViolationCount ?? 0,
    projectedSynchronizationCount: problem.roundSynchronizations?.length ?? 0,
    projectedLaneTaskCounts: problem.roundSynchronizations?.[0]?.lanes.map((lane) => lane.taskIds.length) ?? [],
    scheduledRoundPreparationCount: result.scheduledRoundPreparations.length,
    synchronizedRoundCount,
    residualRoundCount,
    branchesExplored: result.evidence.branchesExplored,
    roundSynchronizationAssignmentBranches: result.evidence.roundSynchronizationAssignmentBranches,
    fullFingerprint: result.evidence.fullFingerprint,
    inputImmutable: JSON.stringify(input) === JSON.stringify(snapshot),
  };
  assert.equal(probe.hardValid, true);
  assert.equal(probe.roundSynchronizationViolationCount, 0);
  assert.equal(probe.roundPreparationViolationCount, 0);
  assert.equal(probe.projectedSynchronizationCount, 1);
  assert.ok(probe.projectedLaneTaskCounts.length >= 2);
  assert.ok(probe.projectedLaneTaskCounts.every((count) => count > 0));
  assert.ok(probe.scheduledRoundPreparationCount >= 0);
  assert.ok(probe.synchronizedRoundCount > 0);
  assert.ok(probe.residualRoundCount >= 0);
  assert.ok(probe.roundSynchronizationAssignmentBranches > 0);
  assert.ok(probe.fullFingerprint);
  assert.equal(probe.inputImmutable, true);
  return probe;
}

export function runSpec10021ResidualProbe(): Spec10021ProbeRun {
  const probe = runSpec10021Probe(() => {
    const input = createSpec10021RoundSynchronizationEngineInputFixture();
    input.contestantAvailabilityById = {
      ...input.contestantAvailabilityById,
      215: { start: "08:00", end: "17:00" },
    };
    input.tasks.push({
      ...structuredClone(input.tasks.find(({ id }) => id === 402)!),
      id: 405,
      contestantId: 215,
    });
    input.roundSynchronizations![0]!.lanes[0]!.taskIds.push(405);
    return input;
  });
  assert.deepEqual(probe.projectedLaneTaskCounts, [3, 2]);
  assert.equal(probe.scheduledRoundPreparationCount, 3);
  assert.equal(probe.synchronizedRoundCount, 2);
  assert.equal(probe.residualRoundCount, 1);
  return probe;
}

export function runSpec10021AtomicBudgetProbe() {
  const input = createSpec10021RoundSynchronizationEngineInputFixture();
  input.plannerNext!.searchBudget.maxBranchExpansions = 30;
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED");
  assert.ok(adapted.problem);
  const result = constructExactItinerantPlan(adapted.problem);
  const atomic = !result.complete
    && result.status === "BRANCH_BUDGET_EXHAUSTED"
    && result.scheduledTasks.length === 0
    && result.scheduledSetupPreparations.length === 0
    && result.scheduledRoundPreparations.length === 0
    && result.scheduledSpaceMeals.length === 0
    && result.scheduledParticipantMeals.length === 0
    && result.scheduledResourceMeals.length === 0
    && result.scheduledItinerantUnitMeals.length === 0;
  assert.equal(atomic, true);
  return {
    atomic,
    status: result.status,
    branchesExplored: result.evidence.branchesExplored,
    maxBranchExpansions: adapted.problem.budget.maxBranchExpansions,
  } as const;
}

export function spec10021ProjectionsEqual(left: Spec10021ProbeRun, right: Spec10021ProbeRun): boolean {
  return JSON.stringify(spec10021LogicalProjection(left)) === JSON.stringify(spec10021LogicalProjection(right));
}
