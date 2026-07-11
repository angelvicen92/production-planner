import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHardFeasibilityRestorationAcceptance, resolveBaselineHardViolationCodes } from "./hardFeasibilityRestorationAcceptance";

const base = {
  baselineHardFeasible: false,
  baselineViolationCodes: ["space_overlap"],
  finalSource: "active_repair_preflight",
  finalCandidateFamily: "baseline-overlap-repair",
  finalCanonicalHardValidation: { result: "VALID", violatedConstraints: [], finalGatePassed: true },
  complete: true,
  locksPreserved: true,
  donePreserved: true,
  inProgressPreserved: true,
  assignedSpaceContractValid: true,
  lineageConsistent: true,
  fingerprintConsistent: true,
  explainable: true,
  rawProductionConceptGatePassed: false,
  rawTaskChangeGatePassed: true,
  rawOPQMGatePassed: false,
};

test("accepts soft regressions only to restore hard feasibility from invalid baseline", () => {
  const result = evaluateHardFeasibilityRestorationAcceptance(base);
  assert.equal(result.applicable, true);
  assert.equal(result.accepted, true);
  assert.equal(result.acceptanceReason, "soft_regression_accepted_to_restore_hard_feasibility");
  assert.equal(result.softRegressionsAccepted, true);
});

test("does not apply to hard-feasible baselines", () => {
  const result = evaluateHardFeasibilityRestorationAcceptance({ ...base, baselineHardFeasible: true });
  assert.equal(result.applicable, false);
  assert.equal(result.accepted, false);
  assert.ok(result.rejectionReasons.includes("policy_not_applicable"));
});

test("rejects incoherent fingerprint even when candidate is hard valid", () => {
  const result = evaluateHardFeasibilityRestorationAcceptance({ ...base, fingerprintConsistent: false });
  assert.equal(result.accepted, false);
  assert.ok(result.rejectionReasons.includes("fingerprint_inconsistent"));
});


test("resolves baseline violations from real audit fields in deterministic order", () => {
  assert.deepEqual(resolveBaselineHardViolationCodes({ baselineSeedHardFeasibility: { violatedConstraints: [{ constraintCode: "b" }, { code: "a" }, "a"] } }).codes, ["a", "b"]);
  assert.deepEqual(resolveBaselineHardViolationCodes({ baselineSeedHardFeasibility: { dominantViolationCodes: ["dominant"] } }).codes, ["dominant"]);
  assert.deepEqual(resolveBaselineHardViolationCodes({ baselineSeedHardFeasibility: { violatedConstraintSummary: { zero: 0, two: 2 } } }).codes, ["two"]);
});

test("does not apply hard restoration when invalid baseline has no violation evidence", () => {
  const result = evaluateHardFeasibilityRestorationAcceptance({ ...base, baselineViolationCodes: [], baselineSeedHardFeasibility: { hardFeasible: false } });
  assert.equal(result.applicable, false);
  assert.ok(result.rejectionReasons.includes("baseline_hard_infeasible_without_violation_evidence"));
});

test("respects explicit false lineage over coherent diagnostic fallback", () => {
  const result = evaluateHardFeasibilityRestorationAcceptance({ ...base, lineageConsistent: false, selectionEvidenceCoherence: { coherent: true } });
  assert.equal(result.accepted, false);
  assert.ok(result.rejectionReasons.includes("lineage_inconsistent"));
});
