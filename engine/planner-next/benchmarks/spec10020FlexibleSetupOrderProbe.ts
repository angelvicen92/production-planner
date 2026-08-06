import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { createExactSearchLedger } from "../exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "../exactSetupBlocks";
import { executePlannerNext } from "../executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import {
  createSpec10020FlexibleSetupOrderEngineInputFixture,
} from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import {
  hasSetupReentry,
  setupBlockCounts,
  setupFamilySequence,
} from "../setupGrouping";
import { preflight, validatePlan } from "../validate";

const compare = (left: string, right: string): number =>
  left.localeCompare(right, "en");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "runtimeMs")
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonical(value));

export interface Spec10020ExecutionRun {
  readonly inputSnapshot: EngineInput;
  readonly engineInputPreflightStatus: "SUPPORTED" | "UNSUPPORTED";
  readonly engineInputPreflightReasonCodes: readonly string[];
  readonly adapterStatus: "SUPPORTED" | "UNSUPPORTED";
  readonly adapterReasonCodes: readonly string[];
  readonly plannerNextPreflightReasonCodes: readonly string[];
  readonly executionKind: "EXACT_CONSTRUCTIVE";
  readonly exactStatus: string;
  readonly sourceFingerprint: string;
  readonly identityMapFingerprint: string;
  readonly problemFingerprint: string;
  readonly fullFingerprint: string | null;
  readonly complete: boolean;
  readonly hardValid: boolean;
  readonly setupViolationCount: number;
  readonly setupPreparationViolationCount: number;
  readonly allowedFamilyIds: readonly string[];
  readonly selectedFamilySequence: readonly string[];
  readonly observedFamilyOrders: readonly string[];
  readonly observedFamilyOrderCandidateCounts: Readonly<Record<string, number>>;
  readonly selectedPreparationIds: readonly string[];
  readonly selectedPreparationCount: number;
  readonly selectedPreparationMinutes: number;
  readonly preparationTargetsSecondFamily: boolean;
  readonly preparationBridgesFamilyBlocks: boolean;
  readonly oneBlockPerFamily: boolean;
  readonly reentryForbidden: boolean;
  readonly branchesExplored: number;
  readonly coreBranches: number;
  readonly standaloneBranches: number;
  readonly setupBlockBranchesExplored: number;
  readonly setupBlockSearchInvocations: number;
  readonly setupBlockCompleteCandidateCount: number;
  readonly setupBlockBudgetExhaustions: number;
  readonly sharedBudgetAccounting: boolean;
  readonly inputImmutable: boolean;
}

export function executeSpec10020Fixture(
  factory: () => EngineInput =
    createSpec10020FlexibleSetupOrderEngineInputFixture,
): Spec10020ExecutionRun {
  const input = factory();
  const inputSnapshot = structuredClone(input);
  const engineInputPreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(
    engineInputPreflight.status,
    "SUPPORTED",
    engineInputPreflight.reasonCodes.join(","),
  );

  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(
    adapter.status,
    "SUPPORTED",
    adapter.status === "UNSUPPORTED"
      ? adapter.reasonCodes.join(",")
      : "",
  );
  if (adapter.status !== "SUPPORTED" || !adapter.problem) {
    throw new Error("SPEC10-020 adapter did not publish a problem");
  }
  const problem = adapter.problem;
  const plannerNextPreflightReasonCodes = preflight(problem);
  assert.deepEqual(plannerNextPreflightReasonCodes, []);

  const execution = executePlannerNext(problem);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  if (execution.kind !== "EXACT_CONSTRUCTIVE") {
    throw new Error(`Unexpected execution kind ${execution.kind}`);
  }
  const result = execution.result;
  const validation = validatePlan(
    problem,
    result.scheduledTasks,
    result.scheduledSetupPreparations,
    result.scheduledSpaceMeals,
    result.scheduledParticipantMeals,
    result.scheduledResourceMeals,
    result.scheduledItinerantUnitMeals,
  );

  const setupSpace = problem.spaces.find(
    (space) => space.setupPolicy !== undefined,
  );
  assert.ok(setupSpace?.setupPolicy);
  const ownTasks = result.scheduledTasks.filter(
    (task) => task.spaceId === setupSpace.id,
  );
  const selectedFamilySequence = setupFamilySequence(ownTasks);
  const counts = setupBlockCounts(ownTasks);
  const allowedFamilyIds = [...setupSpace.setupPolicy.familyOrder].sort(compare);
  const observedFamilyOrderCandidateCounts = {
    ...(result.evidence
      .setupFamilyOrderCandidateCountsBySpaceId[setupSpace.id] ?? {}),
  };
  const observedFamilyOrders = Object.keys(
    observedFamilyOrderCandidateCounts,
  ).sort(compare);
  const preparations = result.scheduledSetupPreparations.filter(
    (item) => item.spaceId === setupSpace.id,
  );
  const preparation = preparations[0];
  const firstFamily = selectedFamilySequence[0];
  const secondFamily = selectedFamilySequence[1];
  const firstFamilyTasks = ownTasks
    .filter((task) => task.setupFamilyId === firstFamily)
    .sort((left, right) => left.end - right.end || compare(left.id, right.id));
  const secondFamilyTasks = ownTasks
    .filter((task) => task.setupFamilyId === secondFamily)
    .sort((left, right) => left.start - right.start || compare(left.id, right.id));

  return {
    inputSnapshot,
    engineInputPreflightStatus: engineInputPreflight.status,
    engineInputPreflightReasonCodes: [
      ...engineInputPreflight.reasonCodes,
    ],
    adapterStatus: adapter.status,
    adapterReasonCodes: [...adapter.reasonCodes],
    plannerNextPreflightReasonCodes,
    executionKind: execution.kind,
    exactStatus: result.status,
    sourceFingerprint: adapter.sourceFingerprint,
    identityMapFingerprint: adapter.identityMapFingerprint,
    problemFingerprint: adapter.problemFingerprint,
    fullFingerprint: result.evidence.fullFingerprint,
    complete: result.complete,
    hardValid: validation.hardValid,
    setupViolationCount: validation.setupViolationCount,
    setupPreparationViolationCount:
      validation.setupPreparationViolationCount,
    allowedFamilyIds,
    selectedFamilySequence,
    observedFamilyOrders,
    observedFamilyOrderCandidateCounts,
    selectedPreparationIds: preparations.map(({ id }) => id).sort(compare),
    selectedPreparationCount: preparations.length,
    selectedPreparationMinutes: preparations.reduce(
      (sum, item) => sum + item.duration,
      0,
    ),
    preparationTargetsSecondFamily:
      preparation?.setupFamilyId === secondFamily,
    preparationBridgesFamilyBlocks:
      preparation !== undefined
      && firstFamilyTasks.at(-1)?.end === preparation.start
      && preparation.end === secondFamilyTasks[0]?.start,
    oneBlockPerFamily:
      allowedFamilyIds.every((family) => counts[family] === 1),
    reentryForbidden: !hasSetupReentry(ownTasks),
    branchesExplored: result.evidence.branchesExplored,
    coreBranches: result.evidence.coreBranches,
    standaloneBranches: result.evidence.standaloneBranches,
    setupBlockBranchesExplored:
      result.evidence.setupBlockBranchesExplored,
    setupBlockSearchInvocations:
      result.evidence.setupBlockSearchInvocations,
    setupBlockCompleteCandidateCount:
      result.evidence.setupBlockCompleteCandidateCount,
    setupBlockBudgetExhaustions:
      result.evidence.setupBlockBudgetExhaustions,
    sharedBudgetAccounting:
      result.evidence.branchesExplored
      === result.evidence.coreBranches
        + result.evidence.standaloneBranches,
    inputImmutable:
      canonicalJson(input) === canonicalJson(inputSnapshot),
  };
}

export function spec10020LogicalProjection(
  run: Spec10020ExecutionRun,
): Omit<Spec10020ExecutionRun, "inputSnapshot"> {
  const { inputSnapshot: _inputSnapshot, ...projection } = run;
  return projection;
}

export function runSpec10020Probe(
  factory: () => EngineInput =
    createSpec10020FlexibleSetupOrderEngineInputFixture,
): Spec10020ExecutionRun {
  const result = executeSpec10020Fixture(factory);
  assert.equal(result.executionKind, "EXACT_CONSTRUCTIVE");
  assert.equal(result.exactStatus, "COMPLETE");
  assert.equal(result.complete, true);
  assert.equal(result.hardValid, true);
  assert.equal(result.setupViolationCount, 0);
  assert.equal(result.setupPreparationViolationCount, 0);
  assert.equal(result.allowedFamilyIds.length, 2);
  assert.equal(result.selectedFamilySequence.length, 2);
  assert.equal(result.oneBlockPerFamily, true);
  assert.equal(result.reentryForbidden, true);
  assert.equal(result.selectedPreparationCount, 1);
  assert.equal(result.selectedPreparationMinutes, 10);
  assert.equal(result.preparationTargetsSecondFamily, true);
  assert.equal(result.preparationBridgesFamilyBlocks, true);
  assert.equal(result.setupBlockSearchInvocations > 0, true);
  assert.equal(result.setupBlockBranchesExplored > 0, true);
  assert.equal(result.setupBlockCompleteCandidateCount > 0, true);
  assert.equal(result.setupBlockBudgetExhaustions, 0);
  assert.equal(result.sharedBudgetAccounting, true);
  assert.equal(result.inputImmutable, true);

  const [first, second] = result.allowedFamilyIds;
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(
    result.observedFamilyOrders,
    [`${first}>${second}`, `${second}>${first}`].sort(compare),
  );
  assert.ok(
    result.observedFamilyOrders.every(
      (key) => (result.observedFamilyOrderCandidateCounts[key] ?? 0) > 0,
    ),
  );
  return result;
}

export interface Spec10020AtomicBudgetProbe {
  readonly outcome: "COMPLETE" | "BUDGET_EXHAUSTED";
  readonly ledgerBranchesExplored: number;
  readonly generatedBranchesExplored: number;
  readonly completeCandidateCount: number;
  readonly publishedCandidateCount: number;
  readonly atomic: boolean;
}

export function runSpec10020AtomicBudgetProbe():
  Spec10020AtomicBudgetProbe {
  const adapter = adaptEngineInputToPlannerNextProblem(
    createSpec10020FlexibleSetupOrderEngineInputFixture(),
  );
  assert.equal(adapter.status, "SUPPORTED");
  assert.ok(adapter.problem);
  const setupSpace = adapter.problem.spaces.find(
    (space) => space.setupPolicy !== undefined,
  );
  assert.ok(setupSpace);
  const tasks = adapter.problem.tasks.filter(
    (task) => task.spaceId === setupSpace.id,
  );
  const ledger = createExactSearchLedger(1);
  const generated = generateExactSetupBlockCandidates(
    adapter.problem,
    tasks,
    [],
    [],
    [],
    ledger,
  );
  const result = {
    outcome: generated.outcome,
    ledgerBranchesExplored: ledger.branchesExplored,
    generatedBranchesExplored:
      generated.evidence.branchesExplored,
    completeCandidateCount:
      generated.evidence.completeCandidateCount,
    publishedCandidateCount: generated.candidates.length,
    atomic:
      generated.outcome === "BUDGET_EXHAUSTED"
      && ledger.branchesExplored === 1
      && generated.evidence.branchesExplored === 1
      && generated.candidates.length === 0,
  } as const;
  assert.equal(result.atomic, true);
  return result;
}
