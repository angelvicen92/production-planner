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
    lastExhaustionPhase: frontier.lastExhaustionPhase,
  } },
  publishedCanonicalObligations: 0,
  targetCanonicalObligations: 1,
  fullHardValidEligible: false,
  maxBranchExpansions: frontier.branchesExplored,
  ...overrides,
});
const certifiedEvidence = () => ({
  ...result().execution.evidence,
  standaloneBranches: 5,
  branchesExplored: frontier.coreBranches + 5,
  standaloneCompleteLeafCount: 0,
  lastExhaustionPhase: "CORE",
  operationalMealFutureChecks: 7,
  operationalMealFutureAnalyticChecks: 7,
  operationalMealFuturePrunes: 7,
  operationalMealFutureBranchesExplored: 0,
  operationalMealFutureFirstPrune: {
    policyId: "break:policy", requiredDuration: 30, window: { start: 10, end: 60 },
    cause: "ALL_SCOPED_TASKS_FIXED_WITHOUT_VALID_BETWEEN_TASK_INTERVAL",
  },
});
const certifiedResult = (evidenceOverrides: Record<string, unknown> = {}) => {
  const evidence = { ...certifiedEvidence(), ...evidenceOverrides };
  return result({ execution: { complete: false, evidence }, maxBranchExpansions: evidence.branchesExplored });
};

test("A2-FULL-023 structural frontier passes", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(result())));

test("analytically certified core frontier passes", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(certifiedResult())));

test("one prune among many checks does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  operationalMealFuturePrunes: 1,
})), /frontier regressed/));

test("partial analytic coverage does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  operationalMealFutureAnalyticChecks: 6,
})), /frontier regressed/));

test("probe branch exploration does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  operationalMealFutureBranchesExplored: 1,
})), /frontier regressed/));

test("missing first prune does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  operationalMealFutureFirstPrune: null,
})), /frontier regressed/));

test("wrong first-prune cause does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  operationalMealFutureFirstPrune: { ...certifiedEvidence().operationalMealFutureFirstPrune, cause: "OTHER" },
})), /frontier regressed/));

test("zero standalone branches do not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  standaloneBranches: 0, branchesExplored: frontier.coreBranches,
})), /frontier regressed/));

test("zero core complete leaves do not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  coreCompleteLeafCount: 0,
})), /frontier regressed/));

test("an incomplete core does not certify the core frontier", () => assert.throws(() => checkFullA2StructuralFrontier(certifiedResult({
  deepestPartialCoreTasksRemaining: 1,
})), /frontier regressed/));

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
