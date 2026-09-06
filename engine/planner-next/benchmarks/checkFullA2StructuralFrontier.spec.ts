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

test("A2-FULL-023 structural frontier passes", () => assert.doesNotThrow(() => checkFullA2StructuralFrontier(result())));

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
