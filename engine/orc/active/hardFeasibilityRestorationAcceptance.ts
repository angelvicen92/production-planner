const normalizeCode = (x: any): string | null => {
  const value = typeof x === "string" ? x : x?.code ?? x?.constraintCode ?? x?.constraint;
  const code = value == null ? "" : String(value).trim();
  return code.length > 0 ? code : null;
};
const uniqueSorted = (items: any[] | undefined | null): string[] => [...new Set((Array.isArray(items) ? items : []).map(normalizeCode).filter((x): x is string => x != null))].sort();
const codes = uniqueSorted;

export function resolveBaselineHardViolationCodes(args: any): { codes: string[]; source: string | null; evidenceAvailable: boolean; readOnly: true } {
  const explicitProvided = Object.prototype.hasOwnProperty.call(args ?? {}, "baselineViolationCodes");
  const sources: Array<[string, any]> = [
    ["baselineViolationCodes", args?.baselineViolationCodes],
    ["violatedConstraints", args?.baselineSeedHardFeasibility?.violatedConstraints],
    ["dominantViolationCodes", args?.baselineSeedHardFeasibility?.dominantViolationCodes],
  ];
  for (const [source, value] of sources) {
    const resolved = codes(value);
    if ((source !== "baselineViolationCodes" || explicitProvided) && resolved.length > 0) return { codes: resolved, source, evidenceAvailable: true, readOnly: true };
  }
  const summary = args?.baselineSeedHardFeasibility?.violatedConstraintSummary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const resolved = Object.entries(summary).filter(([, v]) => Number(v) > 0).map(([k]) => k).sort();
    if (resolved.length > 0) return { codes: resolved, source: "violatedConstraintSummary", evidenceAvailable: true, readOnly: true };
  }
  for (const [source, value] of [["violationDetailsSample", args?.baselineSeedHardFeasibility?.violationDetailsSample], ["violations", args?.baselineSeedHardFeasibility?.violations], ["hardViolations", args?.baselineSeedHardFeasibility?.hardViolations]] as Array<[string, any]>) {
    const resolved = codes(value);
    if (resolved.length > 0) return { codes: resolved, source, evidenceAvailable: true, readOnly: true };
  }
  return { codes: [], source: null, evidenceAvailable: false, readOnly: true };
}

export function evaluateHardFeasibilityRestorationAcceptance(args: any) {
  const baselineHardFeasible = args.baselineHardFeasible ?? args.baselineSeedHardFeasibility?.hardFeasible ?? false;
  const baselineViolationResolution = resolveBaselineHardViolationCodes(args);
  const baselineViolationCodes = baselineViolationResolution.codes;
  const baselineViolationCodeSource = baselineViolationResolution.source;
  const baselineViolationEvidenceAvailable = baselineViolationResolution.evidenceAvailable;
  const finalSource = args.finalSource ?? null;
  const finalFamily = args.finalCandidateFamily ?? args.selectionEvidenceCoherence?.diagnosticsSelectedFinalCandidateFamily ?? null;
  const candidateViolationCodes = Object.prototype.hasOwnProperty.call(args, "candidateViolationCodes") ? codes(args.candidateViolationCodes) : codes(args.finalCanonicalHardValidation?.violatedConstraints);
  const candidateCanonicalHardValid = typeof args.candidateCanonicalHardValid === "boolean" ? args.candidateCanonicalHardValid : (args.finalCanonicalHardValidation?.result === "VALID" && candidateViolationCodes.length === 0 && args.finalCanonicalHardValidation?.finalGatePassed !== false);
  const complete = args.complete === true;
  const locksPreserved = args.locksPreserved === true;
  const donePreserved = args.donePreserved === true;
  const inProgressPreserved = args.inProgressPreserved === true;
  const assignedSpaceContractValid = args.assignedSpaceContractValid === true;
  const lineageConsistent = typeof args.lineageConsistent === "boolean" ? args.lineageConsistent : args.selectionEvidenceCoherence?.coherent === true;
  const fingerprintConsistent = typeof args.fingerprintConsistent === "boolean" ? args.fingerprintConsistent : args.selectionEvidenceCoherence?.fingerprintMatches === true;
  const explainable = args.explainable === true;
  const rawProductionConceptGatePassed = args.rawProductionConceptGatePassed === true;
  const rawTaskChangeGatePassed = args.rawTaskChangeGatePassed === true;
  const rawOPQMGatePassed = args.rawOPQMGatePassed === true;
  const applicable = baselineHardFeasible === false && baselineViolationCodes.length > 0 && finalSource === "active_repair_preflight" && finalFamily === "baseline-overlap-repair";
  const hardFeasibilityRestored = applicable && candidateCanonicalHardValid;
  const policyReason = baselineHardFeasible === false && baselineViolationCodes.length === 0 ? "baseline_hard_infeasible_without_violation_evidence" : "policy_not_applicable";
  const required: Array<[boolean, string]> = [
    [applicable, policyReason], [candidateCanonicalHardValid, "candidate_not_canonical_hard_valid"], [complete, "planning_incomplete"], [locksPreserved, "locks_not_preserved"], [donePreserved, "done_not_preserved"], [inProgressPreserved, "in_progress_not_preserved"], [assignedSpaceContractValid, "assigned_space_contract_invalid"], [lineageConsistent, "lineage_inconsistent"], [fingerprintConsistent, "fingerprint_inconsistent"], [explainable, "decision_not_explainable"],
  ];
  const rejectionReasons = required.filter(([ok]) => !ok).map(([, reason]) => reason);
  const accepted = rejectionReasons.length === 0;
  const softRegressionCodes = [[rawProductionConceptGatePassed, "production_concept"], [rawTaskChangeGatePassed, "task_change"], [rawOPQMGatePassed, "opqm"]].filter(([ok]) => !ok).map(([, code]) => String(code));
  return {
    version: "ORC-HARD-FEASIBILITY-RESTORATION-ACCEPTANCE-V1", applicable, baselineHardFeasible, baselineViolationCodeSource, baselineViolationCodes, baselineViolationEvidenceAvailable, finalSource, candidateCanonicalHardValid, candidateViolationCodes, complete, locksPreserved, donePreserved, inProgressPreserved, assignedSpaceContractValid, lineageConsistent, candidateLineageResolutionKind: args.candidateLineageResolutionKind ?? args.selectionEvidenceCoherence?.candidateLineageResolutionKind ?? null, candidateLineageConsistent: lineageConsistent, fingerprintConsistent, explainable, rawProductionConceptGatePassed, rawTaskChangeGatePassed, rawOPQMGatePassed, effectiveProductionConceptGatePassed: rawProductionConceptGatePassed || accepted, effectiveTaskChangeGatePassed: rawTaskChangeGatePassed || accepted, effectiveOPQMGatePassed: rawOPQMGatePassed || accepted, softRegressionCodes, hardFeasibilityRestored, accepted, acceptanceReason: accepted ? "soft_regression_accepted_to_restore_hard_feasibility" : null, rejectionReasons, softRegressionsAccepted: accepted && softRegressionCodes.length > 0, readOnly: true,
  };
}
