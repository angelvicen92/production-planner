import assert from "node:assert/strict";
import test from "node:test";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { executePlannerNext } from "./executePlannerNext";
import { setupFamilySequence } from "./setupGrouping";
import { validatePlan } from "./validate";
import {
  createSpec10020FlexibleSetupOrderEngineInputFixture,
} from "./integration/engineInputAdapter.fixture";
import {
  adaptEngineInputToPlannerNextProblem,
} from "./integration/engineInputAdapter";
import {
  preflightEngineInputForPlannerNext,
} from "./integration/engineInputPreflight";
import {
  analyzeCanonicalFullA2Representability,
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
} from "./benchmarks/focal-a2/full-day/canonicalFullA2Template";

function invertedFixture() {
  const input = createSpec10020FlexibleSetupOrderEngineInputFixture();
  input.tasks.reverse();
  input.locks.reverse();
  input.planResourceItems.reverse();
  input.planSpaceSettings?.reverse();
  input.planZoneSettings?.reverse();
  input.setupPolicies?.forEach((policy) => policy.families.reverse());
  input.setupPolicies?.reverse();
  return input;
}

function executeFixture(
  input: ReturnType<typeof createSpec10020FlexibleSetupOrderEngineInputFixture>,
) {
  const source = structuredClone(input);
  const enginePreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(
    enginePreflight.status,
    "SUPPORTED",
    enginePreflight.reasonCodes.join(","),
  );
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(
    adapter.status,
    "SUPPORTED",
    adapter.status === "UNSUPPORTED"
      ? adapter.reasonCodes.join(",")
      : "",
  );
  assert.ok(adapter.problem);

  const execution = executePlannerNext(adapter.problem);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.ok(execution.result);
  const result = execution.result;
  assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
  assert.equal(result.complete, true);
  const validation = validatePlan(
    adapter.problem,
    result.scheduledTasks,
    result.scheduledSetupPreparations,
    result.scheduledSpaceMeals,
    result.scheduledParticipantMeals,
    result.scheduledResourceMeals,
    result.scheduledItinerantUnitMeals,
  );
  assert.equal(validation.hardValid, true, validation.reasonCodes.join(","));
  assert.deepEqual(input, source);

  const setupSpace = adapter.problem.spaces.find(
    (space) => space.setupPolicy !== undefined,
  );
  assert.ok(setupSpace?.setupPolicy);
  const sequence = setupFamilySequence(
    result.scheduledTasks.filter((task) => task.spaceId === setupSpace.id),
  );
  assert.equal(sequence.length, setupSpace.setupPolicy.familyOrder.length);
  assert.equal(result.scheduledSetupPreparations.length, 1);
  assert.equal(result.scheduledSetupPreparations[0]?.duration, 10);
  assert.equal(
    result.scheduledSetupPreparations[0]?.setupFamilyId,
    sequence[1],
  );
  assert.deepEqual(
    result.evidence.selectedSetupFamilySequenceBySpaceId[setupSpace.id],
    sequence,
  );

  return {
    sourceFingerprint: adapter.sourceFingerprint,
    identityMapFingerprint: adapter.identityMapFingerprint,
    problemFingerprint: adapter.problemFingerprint,
    fullFingerprint: result.evidence.fullFingerprint,
    scheduledTasks: result.scheduledTasks,
    scheduledSetupPreparations: result.scheduledSetupPreparations,
    selectedSequence: sequence,
    observedOrders:
      result.evidence.setupFamilyOrderCandidateCountsBySpaceId[setupSpace.id],
    branchesExplored: result.evidence.branchesExplored,
    setupBlockBranchesExplored:
      result.evidence.setupBlockBranchesExplored,
  };
}

test("EXACT_CONSTRUCTIVE explores both flexible setup orders and publishes preparation", () => {
  const baseline = executeFixture(
    createSpec10020FlexibleSetupOrderEngineInputFixture(),
  );
  const repeated = executeFixture(
    createSpec10020FlexibleSetupOrderEngineInputFixture(),
  );
  const inverted = executeFixture(invertedFixture());
  assert.deepEqual(repeated, baseline);
  assert.deepEqual(inverted, baseline);

  const observed = Object.keys(baseline.observedOrders ?? {}).sort();
  const families = [...new Set(observed.flatMap((key) => key.split(">")))].sort();
  assert.equal(families.length, 2);
  assert.deepEqual(observed, [
    `${families[0]}>${families[1]}`,
    `${families[1]}>${families[0]}`,
  ].sort());
  assert.ok(observed.every((key) => (baseline.observedOrders?.[key] ?? 0) > 0));
});

test("EXACT_CONSTRUCTIVE preserves historical explicit setup order", () => {
  const input = createSpec10020FlexibleSetupOrderEngineInputFixture();
  input.setupPolicies = input.setupPolicies?.map((policy) => ({
    ...policy,
    orderConstraint: "EXPLICIT" as const,
    familyOrder: ["estrellas", "sillon"],
  }));
  const projection = executeFixture(input);
  assert.ok(projection.selectedSequence[0]?.endsWith(":estrellas"));
  assert.ok(projection.selectedSequence[1]?.endsWith(":sillon"));
  assert.equal(Object.keys(projection.observedOrders ?? {}).length, 1);
});

test("exact setup enumeration is atomic on shared-ledger exhaustion", () => {
  const input = createSpec10020FlexibleSetupOrderEngineInputFixture();
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED");
  assert.ok(adapter.problem);
  const space = adapter.problem.spaces.find(
    (candidate) => candidate.setupPolicy !== undefined,
  );
  assert.ok(space);
  const tasks = adapter.problem.tasks.filter(
    (task) => task.spaceId === space.id,
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
  assert.equal(generated.outcome, "BUDGET_EXHAUSTED");
  assert.equal(ledger.branchesExplored, 1);
  assert.equal(generated.evidence.branchesExplored, 1);
});

test("full A2 advances to Totales only after exact flexible setup support", () => {
  const analysis = analyzeCanonicalFullA2Representability(
    expandCanonicalFullA2Template(createCanonicalFullA2Template()),
  );
  assert.equal(
    analysis.implementationBlockers.some(
      (item) =>
        item.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED",
    ),
    false,
  );
  assert.equal(
    analysis.nextImplementationBlocker?.code,
    "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED",
  );
});
