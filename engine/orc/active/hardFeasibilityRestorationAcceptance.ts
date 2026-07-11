const codes = (items: any[] | undefined | null) => (Array.isArray(items) ? items.map((x) => String(x?.code ?? x?.constraintCode ?? x)).filter(Boolean) : []);

export function evaluateHardFeasibilityRestorationAcceptance(args: any) {
  const baselineHardFeasible = args.baselineHardFeasible ?? args.baselineSeedHardFeasibility?.hardFeasible ?? false;
  const baselineViolationCodes = args.baselineViolationCodes ?? codes(args.baselineSeedHardFeasibility?.violations ?? args.baselineSeedHardFeasibility?.hardViolations);
  const finalSource = args.finalSource ?? null;
  const finalFamily = args.finalCandidateFamily ?? args.selectionEvidenceCoherence?.diagnosticsSelectedFinalCandidateFamily ?? null;
  const candidateViolationCodes = args.candidateViolationCodes ?? codes(args.finalCanonicalHardValidation?.violatedConstraints);
  const candidateCanonicalHardValid = args.candidateCanonicalHardValid ?? (args.finalCanonicalHardValidation?.result === "VALID" && candidateViolationCodes.length === 0 && args.finalCanonicalHardValidation?.finalGatePassed !== false);
  const complete = args.complete === true;
  const locksPreserved = args.locksPreserved === true;
  const donePreserved = args.donePreserved === true;
  const inProgressPreserved = args.inProgressPreserved === true;
  const assignedSpaceContractValid = args.assignedSpaceContractValid === true;
  const lineageConsistent = args.lineageConsistent === true || args.selectionEvidenceCoherence?.coherent === true;
  const fingerprintConsistent = args.fingerprintConsistent === true;
  const explainable = args.explainable === true;
  const rawProductionConceptGatePassed = args.rawProductionConceptGatePassed === true;
  const rawTaskChangeGatePassed = args.rawTaskChangeGatePassed === true;
  const rawOPQMGatePassed = args.rawOPQMGatePassed === true;
  const applicable = baselineHardFeasible === false && baselineViolationCodes.length > 0 && finalSource === "active_repair_preflight" && finalFamily === "baseline-overlap-repair";
  const hardFeasibilityRestored = applicable && candidateCanonicalHardValid;
  const required: Array<[boolean, string]> = [
    [applicable, "policy_not_applicable"], [candidateCanonicalHardValid, "candidate_not_canonical_hard_valid"], [complete, "planning_incomplete"], [locksPreserved, "locks_not_preserved"], [donePreserved, "done_not_preserved"], [inProgressPreserved, "in_progress_not_preserved"], [assignedSpaceContractValid, "assigned_space_contract_invalid"], [lineageConsistent, "lineage_inconsistent"], [fingerprintConsistent, "fingerprint_inconsistent"], [explainable, "decision_not_explainable"],
  ];
  const rejectionReasons = required.filter(([ok]) => !ok).map(([, reason]) => reason);
  const accepted = rejectionReasons.length === 0;
  return {
    version: "ORC-HARD-FEASIBILITY-RESTORATION-ACCEPTANCE-V1",
    applicable,
    baselineHardFeasible,
    baselineViolationCodes,
    finalSource,
    candidateCanonicalHardValid,
    candidateViolationCodes,
    complete,
    locksPreserved,
    donePreserved,
    inProgressPreserved,
    assignedSpaceContractValid,
    lineageConsistent,
    fingerprintConsistent,
    explainable,
    rawProductionConceptGatePassed,
    rawTaskChangeGatePassed,
    rawOPQMGatePassed,
    hardFeasibilityRestored,
    accepted,
    acceptanceReason: accepted ? "soft_regression_accepted_to_restore_hard_feasibility" : null,
    rejectionReasons,
    softRegressionsAccepted: accepted && (!rawProductionConceptGatePassed || !rawTaskChangeGatePassed || !rawOPQMGatePassed),
    readOnly: true,
  };
}
