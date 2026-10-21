import assert from "node:assert/strict";
import test from "node:test";
import { dayConfigEditSchema, dayConfigRestoreSchema, dayConfigRefreshSchema } from "../shared/dayConfig";
import { applyEffectiveRoundPreparations, candidateRoundPreparations, roundPreparationValues } from "./roundPreparation";
import { buildA2ImportRows } from "../script/demo/a2ImportRows";
import { a2ImportStorageFixture } from "../script/demo/a2ImportStorageFixture";
import { buildEngineInput } from "../engine/buildInput";
import { createSpec10021RoundSynchronizationEngineInputFixture } from "../engine/planner-next/integration/engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "../engine/planner-next/integration/engineInputAdapter";
import { constructExactItinerantPlan } from "../engine/planner-next/exactItinerantPlan";
import { validatePlan } from "../engine/planner-next/validate";
import { projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";

const actor = "00000000-0000-0000-0000-000000000001";
function generic() {
  const input = createSpec10021RoundSynchronizationEngineInputFixture();
  const configuration = { ...buildA2ImportRows("2026-10-30").configuration, roundSynchronizations: structuredClone(input.roundSynchronizations) };
  return { input, row: { planner_next_configuration: configuration }, target: { policyId: input.roundSynchronizations![0].id, spaceId: input.roundSynchronizations![0].lanes[0].spaceId } };
}

test("round edit is narrow, revision-aware, and preserves explicit zero", () => {
  const roundPreparation = { policyId: "operation-x", spaceId: 81, preparationMinutesBetweenRounds: 0 };
  assert.equal(dayConfigEditSchema.parse({ roundPreparation, expectedRevisionId: null }).roundPreparation?.preparationMinutesBetweenRounds, 0);
  for (const minutes of [-1, 1.5, null, "10", 2147483648]) assert.equal(dayConfigEditSchema.safeParse({ roundPreparation: { ...roundPreparation, preparationMinutesBetweenRounds: minutes }, expectedRevisionId: 2 }).success, false);
  for (const body of [{ roundPreparation }, { roundPreparation, expectedRevisionId: 2, workday: { start: "09:00", end: "18:00" } }, { roundPreparation: { ...roundPreparation, lanes: [] }, expectedRevisionId: 2 }]) assert.equal(dayConfigEditSchema.safeParse(body).success, false);
  assert.equal(dayConfigRestoreSchema.safeParse({ capability: "SYNCHRONIZED_ROUNDS" }).success, false);
  assert.equal(dayConfigRefreshSchema.safeParse({ capabilities: ["SYNCHRONIZED_ROUNDS"] }).success, false);
});

test("historical EngineInput is unchanged; the real builder reads the daily overlay", async () => {
  const { tables, storage } = a2ImportStorageFixture(buildA2ImportRows("2026-10-30"));
  const baseline = await buildEngineInput(Number(tables.plans[0].id), storage);
  assert.equal(applyEffectiveRoundPreparations(baseline, tables.plans[0]), baseline);
  const original = structuredClone(tables.plans[0].planner_next_configuration);
  const policy = original.roundSynchronizations[0], lane = policy.lanes[0];
  tables.plans[0].round_preparation_overrides = [{ policyId: policy.id, spaceId: lane.spaceId, preparationMinutesBetweenRounds: 10, by: actor, at: "2026-10-21T12:00:00Z" }];
  const edited = await buildEngineInput(baseline.planId, storage);
  assert.equal(edited.roundSynchronizations![0].lanes[0].preparationMinutesBetweenRounds, 10);
  assert.deepEqual(edited.roundSynchronizations![0].lanes[1], baseline.roundSynchronizations![0].lanes[1]);
  assert.notDeepEqual(projectEffectiveAuthoritiesFromEngineInputV1(edited).plan_workday, projectEffectiveAuthoritiesFromEngineInputV1(baseline).plan_workday);
  assert.deepEqual(tables.plans[0].planner_next_configuration, original);
  // Returning numerically to baseline does not silently erase an explicit override.
  tables.plans[0].round_preparation_overrides[0].preparationMinutesBetweenRounds = lane.preparationMinutesBetweenRounds;
  const equalOverride = await buildEngineInput(baseline.planId, storage);
  assert.equal(roundPreparationValues(equalOverride, tables.plans[0])[0].source, "DAY_OVERRIDE");
  assert.deepEqual(candidateRoundPreparations(equalOverride, tables.plans[0], { policyId: policy.id, spaceId: lane.spaceId }, undefined, actor), baseline);
  tables.plans[0].round_preparation_overrides = [];
  assert.deepEqual(await buildEngineInput(baseline.planId, storage), baseline);
});

test("unknown, ambiguous and inconsistent daily references fail closed", () => {
  const { input, row, target } = generic();
  for (const bad of [{ ...target, policyId: "unknown" }, { ...target, spaceId: 9999 }]) assert.throws(() => candidateRoundPreparations(input, row, bad, 10, actor), /CONFIGURATION_CONFLICT/);
  const duplicate = structuredClone(row);
  duplicate.planner_next_configuration.roundSynchronizations.push(structuredClone(duplicate.planner_next_configuration.roundSynchronizations[0]));
  assert.throws(() => candidateRoundPreparations(input, duplicate, target, 10, actor), /CONFIGURATION_CONFLICT/);
  const inconsistent = structuredClone(row);
  inconsistent.planner_next_configuration.roundSynchronizations[0].lanes[0].taskIds = [403];
  assert.throws(() => candidateRoundPreparations(input, inconsistent, target, 10, actor), /CONFIGURATION_CONFLICT/);
});

test("generic two-lane 5/10/0 preparations change valid occupations deterministically; validator rejects stale durations", () => {
  const { input, row } = generic();
  const before = structuredClone(input);
  const run = (minutes: number) => {
    let candidate = input;
    for (const lane of input.roundSynchronizations![0].lanes) candidate = candidateRoundPreparations(candidate,
      { ...row, round_preparation_overrides: input.roundSynchronizations![0].lanes.filter(l => l.spaceId !== lane.spaceId && candidate.roundSynchronizations![0].lanes.find(c => c.spaceId === l.spaceId)!.preparationMinutesBetweenRounds === minutes).map(l => ({ policyId: input.roundSynchronizations![0].id, spaceId: l.spaceId, preparationMinutesBetweenRounds: minutes, by: actor, at: "2026-10-21T12:00:00Z" })) },
      { policyId: input.roundSynchronizations![0].id, spaceId: lane.spaceId }, minutes, actor);
    const adapted = adaptEngineInputToPlannerNextProblem(candidate);
    assert.equal(adapted.status, "SUPPORTED");
    if (adapted.status !== "SUPPORTED") throw Error("unsupported test input");
    const result = constructExactItinerantPlan(adapted.problem);
    assert.equal(result.status, "COMPLETE", result.evidence.reasonCodes.join(","));
    const validation = validatePlan(adapted.problem, result.scheduledTasks, result.scheduledSetupPreparations, result.scheduledSpaceMeals,
      result.scheduledParticipantMeals, result.scheduledResourceMeals, result.scheduledItinerantUnitMeals, result.scheduledRoundPreparations, result.scheduledOperationalMeals);
    assert.equal(validation.hardValid, true); assert.deepEqual(validation.violations, []);
    assert.ok(result.scheduledRoundPreparations.every(preparation => preparation.duration === minutes));
    return { problem: adapted.problem, result };
  };
  // Canonical baseline uses no mutation.
  const baselineProblem = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(baselineProblem.status, "SUPPORTED");
  if (baselineProblem.status !== "SUPPORTED") throw Error("unsupported baseline");
  const baseline = constructExactItinerantPlan(baselineProblem.problem);
  const ten = run(10), zero = run(0), repeat = run(10);
  assert.deepEqual(ten.result.scheduledRoundPreparations, repeat.result.scheduledRoundPreparations);
  assert.equal(ten.result.evidence.fullFingerprint, repeat.result.evidence.fullFingerprint);
  assert.notDeepEqual(ten.result.scheduledRoundPreparations, baseline.scheduledRoundPreparations);
  assert.equal(zero.result.scheduledRoundPreparations.length, 0);
  const stale = validatePlan(ten.problem, baseline.scheduledTasks, baseline.scheduledSetupPreparations, baseline.scheduledSpaceMeals,
    baseline.scheduledParticipantMeals, baseline.scheduledResourceMeals, baseline.scheduledItinerantUnitMeals, baseline.scheduledRoundPreparations, baseline.scheduledOperationalMeals);
  assert.equal(stale.hardValid, false); assert.ok((stale.roundPreparationViolationCount ?? 0) > 0);
  assert.deepEqual(input, before);
});
