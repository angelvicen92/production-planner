import { evaluateProductionConceptNonRegressionGate } from "./productionConceptNonRegressionGate";
import { compareZoneTaskChangeAudits } from "./spaceTaskChangeLimit";
import { fingerprintORCPlanning } from "./finalMaterializedPlanningValidation";

export type ORCIncumbentSource = "active_repair_preflight" | "pre_macro_selection" | "post_macro_selection";

export interface ORCIncumbentCandidate {
  source: ORCIncumbentSource;
  selection: any;
  simulation: any;
  validation: any;
  value: any;
  candidateState: any;
  candidate: any;
  extractedPlanning: any;
  pendingTaskIds: number[];
  planningMaterialization: any;
  compositeSummary: any;
  productionConceptAlignment: any;
  canonicalHardValidation?: any;
  validatedPlanningFingerprint?: string | null;
  validationLineageConsistent?: boolean;
  operationalQualityMetrics: any;
  zoneTaskChangeAudit: any;
  safety?: {
    complete?: boolean;
    respectsLocks?: boolean;
    preservesDone?: boolean;
    preservesInProgress?: boolean;
    assignedSpaceContractValid?: boolean;
    lineageConsistent?: boolean;
  };
}

export function compactProductionConceptComparison(gate: any) {
  const pick = (x: any) => ({
    totalVisibleMainZoneIdleMinutes: Number(x?.totalVisibleMainZoneIdleMinutes ?? 0),
    largestVisibleMainZoneGapMinutes: Number(x?.largestVisibleMainZoneGapMinutes ?? 0),
    visibleMainZoneGapCount: Array.isArray(x?.visibleMainZoneGaps) ? x.visibleMainZoneGaps.length : 0,
    score: Number(x?.score ?? 0),
    verdict: x?.verdict ?? null,
  });
  return {
    baseline: pick(gate?.baseline),
    selected: pick(gate?.selected),
    deltas: gate?.deltas ?? {},
    passed: gate?.passed === true,
    verdict: gate?.passed === true ? "not_worse" : "regression",
    blockers: [...(gate?.blockers ?? [])],
    reason: gate?.reason ?? null,
    readOnly: true,
  };
}

export function getUnusableORCIncumbentReason(candidate: ORCIncumbentCandidate | null | undefined): string | null {
  if (!candidate?.simulation) return "candidate_missing_simulation";
  if (candidate.validation?.simulatedStateId !== candidate.simulation.id) return "candidate_validation_lineage_mismatch";
  const extracted = candidate.extractedPlanning?.plannedTasks ?? [];
  const simulationPlanning = candidate.simulation?.operationalStateSnapshot?.planning ?? [];
  if (fingerprintORCPlanning(extracted) !== fingerprintORCPlanning(simulationPlanning)) return "candidate_validation_planning_fingerprint_mismatch";
  if (candidate.canonicalHardValidation && candidate.canonicalHardValidation.finalGatePassed !== true) {
    if (candidate.canonicalHardValidation.validationBelongsToSimulation === false) return "candidate_validation_lineage_mismatch";
    if (candidate.canonicalHardValidation.planningFingerprintMatches === false) return "candidate_validation_planning_fingerprint_mismatch";
    return "candidate_canonical_hard_validation_invalid";
  }
  if (candidate.validation?.result !== "VALID") return "candidate_validation_invalid";
  if ((candidate.validation?.violatedConstraints?.length ?? 0) > 0) return "candidate_validation_violated_constraints";
  if ((candidate.pendingTaskIds?.length ?? 0) > 0) return "candidate_pending_tasks";
  if (candidate.safety?.complete === false) return "candidate_incomplete";
  if (candidate.safety?.respectsLocks === false) return "candidate_lock_violation";
  if (candidate.safety?.preservesDone === false) return "candidate_done_changed";
  if (candidate.safety?.preservesInProgress === false) return "candidate_in_progress_changed";
  if (candidate.safety?.assignedSpaceContractValid === false) return "candidate_assigned_space_contract_invalid";
  if (candidate.safety?.lineageConsistent === false) return "candidate_validation_lineage_mismatch";
  return null;
}

export function isUsableORCIncumbent(candidate: ORCIncumbentCandidate | null | undefined) {
  return getUnusableORCIncumbentReason(candidate) === null;
}

const scoreOf = (candidate: ORCIncumbentCandidate) => Number(candidate.value?.overallScore ?? candidate.value ?? 0);

export function selectORCIncumbent(args: { incumbent: ORCIncumbentCandidate | null; candidate: ORCIncumbentCandidate | null; mealBreakPolicy?: any }) {
  const incumbent = args.incumbent;
  const candidate = args.candidate;
  const candidateId = candidate?.candidate?.id ?? candidate?.candidateState?.candidateId ?? candidate?.simulation?.candidateStateId ?? candidate?.simulation?.id ?? null;
  const incumbentId = incumbent?.candidate?.id ?? incumbent?.candidateState?.candidateId ?? incumbent?.simulation?.candidateStateId ?? incumbent?.simulation?.id ?? null;
  if (!incumbent && isUsableORCIncumbent(candidate)) {
    return { incumbent: candidate, decision: "replace_incumbent", decisionReason: "first_usable_candidate", rejectedCandidateId: null, rejectedCandidateReason: null, productionConceptComparison: null, taskChangeComparison: null, deterministicTieBreakUsed: false, readOnly: true };
  }
  if (!incumbent) {
    return { incumbent: null, decision: "retain_incumbent", decisionReason: "no_usable_incumbent", rejectedCandidateId: candidateId, rejectedCandidateReason: getUnusableORCIncumbentReason(candidate) ?? "candidate_not_usable", productionConceptComparison: null, taskChangeComparison: null, deterministicTieBreakUsed: false, readOnly: true };
  }
  if (!isUsableORCIncumbent(candidate)) {
    const reason = getUnusableORCIncumbentReason(candidate) ?? "post_macro_candidate_not_usable";
    return { incumbent, decision: "retain_incumbent", decisionReason: "post_macro_candidate_not_usable", rejectedCandidateId: candidateId, rejectedCandidateReason: reason, productionConceptComparison: null, taskChangeComparison: null, deterministicTieBreakUsed: false, readOnly: true };
  }
  const conceptGate = evaluateProductionConceptNonRegressionGate({ baseline: incumbent.productionConceptAlignment, selected: candidate!.productionConceptAlignment, mealBreakPolicy: args.mealBreakPolicy });
  const taskChangeComparison = compareZoneTaskChangeAudits({ baseline: incumbent.zoneTaskChangeAudit, candidate: candidate!.zoneTaskChangeAudit });
  if (!conceptGate.passed) {
    return { incumbent, decision: "retain_incumbent", decisionReason: "post_macro_production_concept_regression", rejectedCandidateId: candidateId, rejectedCandidateReason: "post_macro_production_concept_regression", productionConceptComparison: compactProductionConceptComparison(conceptGate), taskChangeComparison, deterministicTieBreakUsed: false, readOnly: true };
  }
  if (!taskChangeComparison.passedNonRegression) {
    return { incumbent, decision: "retain_incumbent", decisionReason: "post_macro_task_change_regression", rejectedCandidateId: candidateId, rejectedCandidateReason: "post_macro_task_change_regression", productionConceptComparison: compactProductionConceptComparison(conceptGate), taskChangeComparison, deterministicTieBreakUsed: false, readOnly: true };
  }
  const candidateScore = scoreOf(candidate!);
  const incumbentScore = scoreOf(incumbent);
  if (candidateScore > incumbentScore || (candidateScore === incumbentScore && String(candidateId) < String(incumbentId))) {
    return { incumbent: candidate, decision: "replace_incumbent", decisionReason: candidateScore === incumbentScore ? "deterministic_tiebreak" : "operational_value_improved", rejectedCandidateId: incumbentId, rejectedCandidateReason: null, productionConceptComparison: compactProductionConceptComparison(conceptGate), taskChangeComparison, deterministicTieBreakUsed: candidateScore === incumbentScore, readOnly: true };
  }
  return { incumbent, decision: "retain_incumbent", decisionReason: "operational_value_not_improved", rejectedCandidateId: candidateId, rejectedCandidateReason: "operational_value_not_improved", productionConceptComparison: compactProductionConceptComparison(conceptGate), taskChangeComparison, deterministicTieBreakUsed: false, readOnly: true };
}
