import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHardFeasibilityRestorationAcceptance } from "./hardFeasibilityRestorationAcceptance";

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
