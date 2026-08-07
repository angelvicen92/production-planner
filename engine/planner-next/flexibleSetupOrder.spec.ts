import assert from "node:assert/strict";
import test from "node:test";
import { createSpec10020FlexibleSetupOrderEngineInputFixture } from "./integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { generateBlockCandidates } from "./placeAuxiliaryTasks";
import { setupFamilySequence } from "./setupGrouping";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { preflight, validatePlan } from "./validate";
import { analyzeCanonicalFullA2Representability, createCanonicalFullA2Template, expandCanonicalFullA2Template } from "./benchmarks/focal-a2/full-day/canonicalFullA2Template";

const projection = (input: ReturnType<typeof createSpec10020FlexibleSetupOrderEngineInputFixture>) => {
  const source = structuredClone(input);
  const enginePreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(enginePreflight.status, "SUPPORTED", enginePreflight.reasonCodes.join(","));
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED", adapter.status === "UNSUPPORTED" ? adapter.reasonCodes.join(",") : "");
  assert.ok(adapter.problem);
  assert.deepEqual(preflight(adapter.problem), []);
  const setupSpace = adapter.problem.spaces.find((space) => space.setupPolicy?.flexibleFamilyOrder === true);
  assert.ok(setupSpace?.setupPolicy);
  const setupTasks = adapter.problem.tasks.filter((task) => task.spaceId === setupSpace.id);
  const generated = generateBlockCandidates(adapter.problem, setupTasks, [], adapter.problem.budget.maxBranchExpansions);
  assert.equal(generated.exhausted, false);
  const orders = [...new Set(generated.candidates.map((candidate) => setupFamilySequence(candidate.tasks).join(">")))].sort();
  const expectedFamilies = [...setupSpace.setupPolicy.familyOrder].sort();
  assert.deepEqual(orders, [
    [expectedFamilies[0], expectedFamilies[1]].join(">"),
    [expectedFamilies[1], expectedFamilies[0]].join(">"),
  ].sort());
  for (const candidate of generated.candidates) {
    assert.equal(candidate.preparations.length, 1);
    assert.equal(candidate.preparations[0]?.duration, 10);
    assert.equal(candidate.preparations[0]?.setupFamilyId, setupFamilySequence(candidate.tasks)[1]);
  }
  const plan = planMainFlowAndFeeders(adapter.problem);
  const validation = validatePlan(adapter.problem, plan.scheduledTasks, plan.scheduledSetupPreparations, plan.scheduledSpaceMeals, plan.scheduledParticipantMeals, plan.scheduledResourceMeals, plan.scheduledItinerantUnitMeals);
  assert.equal(plan.complete, true);
  assert.equal(validation.hardValid, true, validation.reasonCodes.join(","));
  assert.deepEqual(input, source);
  return {
    sourceFingerprint: adapter.sourceFingerprint,
    identityMapFingerprint: adapter.identityMapFingerprint,
    problemFingerprint: adapter.problemFingerprint,
    planFingerprint: plan.metrics.planFingerprint,
    selectedOrder: plan.metrics.setupFamilySequenceBySpaceId[setupSpace.id],
    preparations: plan.scheduledSetupPreparations,
  };
};

test("UNSPECIFIED setup order remains flexible and explores both family orders", () => {
  const baseline = createSpec10020FlexibleSetupOrderEngineInputFixture();
  const repeated = projection(structuredClone(baseline));
  const inverted = structuredClone(baseline);
  inverted.tasks.reverse();
  inverted.locks.reverse();
  inverted.planResourceItems.reverse();
  inverted.planSpaceSettings?.reverse();
  inverted.planZoneSettings?.reverse();
  inverted.setupPolicies?.forEach((policy) => policy.families.reverse());
  inverted.setupPolicies?.reverse();
  assert.deepEqual(projection(structuredClone(baseline)), repeated);
  assert.deepEqual(projection(inverted), repeated);
});

test("invalid flexible setup contracts are rejected before adaptation", () => {
  const withOrder = createSpec10020FlexibleSetupOrderEngineInputFixture();
  withOrder.setupPolicies![0]!.familyOrder = ["sillon", "estrellas"];
  assert.equal(preflightEngineInputForPlannerNext(withOrder).reasonCodes.includes("UNSUPPORTED_SETUP_MAPPING"), true);
  const offGrid = createSpec10020FlexibleSetupOrderEngineInputFixture();
  offGrid.setupPolicies![0]!.preparationMinutesBetweenFamilies = 7;
  assert.equal(preflightEngineInputForPlannerNext(offGrid).reasonCodes.includes("UNSUPPORTED_SETUP_MAPPING"), true);
});

test("full A2 has no implementation blocker after exact flexible setup and round synchronization support", () => {
  const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));
  assert.equal(analysis.implementationBlockers.some((item) => item.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"), false);
  assert.deepEqual(analysis.implementationBlockers, []);
  assert.equal(analysis.nextImplementationBlocker, null);
});
