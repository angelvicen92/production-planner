import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkFullA2Log, checkFullA2StructuralFrontier, FULL_A2_RESULT_MARKER } from "./checkFullA2StructuralFrontier";

const frontier = JSON.parse(readFileSync("docs/evidence/A2-FULL-023-collective-prerequisite-capacity.json", "utf8")).after;
const result = (overrides: Record<string, unknown> = {}) => ({
  execution: { complete: false, evidence: {
    branchesExplored: frontier.branchesExplored,
    coreBranches: frontier.coreBranches,
    standaloneBranches: frontier.standaloneBranches,
    coreCompleteLeafCount: 1,
    deepestPartialCoreTasksRemaining: 0,
    standaloneCompleteLeafCount: frontier.standaloneCompleteLeafCount,
    operationalMealFuturePrunes: 0,
    operationalMealFutureAnalyticChecks: 0,
    operationalMealFutureBranchesExplored: 0,
    operationalMealFutureFirstPrune: null,
    lastExhaustionPhase: frontier.lastExhaustionPhase,
  } },
  publishedCanonicalObligations: 0,
  targetCanonicalObligations: 1,
  fullHardValidEligible: false,
  maxBranchExpansions: frontier.branchesExplored,
  ...overrides,
});

test("A2-FULL-023 structural frontier passes", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(result())));

test("branch-free sound operational future frontier passes without terminal leaves", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(result({
  execution:{complete:false,evidence:{...result().execution.evidence,standaloneCompleteLeafCount:0,
    operationalMealFuturePrunes:1,operationalMealFutureAnalyticChecks:1,operationalMealFutureBranchesExplored:0,
    operationalMealFutureFirstPrune:{policyId:"configured-policy",requiredDuration:75,window:{start:780,end:990},
      cause:"ALL_SCOPED_TASKS_FIXED_WITHOUT_VALID_BETWEEN_TASK_INTERVAL"}}},
}))));

test("regressive #758 shape fails", () => assert.throws(() => checkFullA2StructuralFrontier(result({
  execution: { complete: false, evidence: { ...result().execution.evidence,
    coreCompleteLeafCount: 0, standaloneCompleteLeafCount: 0, lastExhaustionPhase: "CORE" } },
})), /frontier regressed/));

test("complete published FULL_HARD_VALID plan passes", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(result({
  execution: { ...result().execution, complete: true }, publishedCanonicalObligations: 1, fullHardValidEligible: true,
}))));

test("missing or malformed marker fails", () => {
  assert.throws(() => checkFullA2Log("ordinary test output"), /exactly one/);
  assert.throws(() => checkFullA2Log(`${FULL_A2_RESULT_MARKER} {broken`), /malformed JSON/);
});

test("inconsistent global accounting fails", () => assert.throws(() => checkFullA2StructuralFrontier(result({
  execution: { ...result().execution, evidence: { ...result().execution.evidence, branchesExplored: frontier.branchesExplored - 1 } },
})), /does not reconcile/));
