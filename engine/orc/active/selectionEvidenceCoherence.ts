import { fingerprintORCPlanning } from "./finalMaterializedPlanningValidation";

export function evaluateSelectionEvidenceCoherence(args: { selectionSource?: string | null; selection: any; planning?: any[] | null; materializedPlanning?: any[] | null; planningFingerprint?: string | null; materializedPlanningFingerprint?: string | null }) {
  const selection = args.selection ?? {};
  const simulation = selection.simulation ?? null;
  const validation = selection.validation ?? null;
  const candidateState = selection.candidateState ?? null;
  const candidate = selection.candidate ?? null;
  const diagnostics = selection.diagnostics ?? {};
  const planningFingerprint = args.planningFingerprint ?? (Array.isArray(args.planning) ? fingerprintORCPlanning(args.planning) : null);
  const materializedPlanningFingerprint = args.materializedPlanningFingerprint ?? (Array.isArray(args.materializedPlanning) ? fingerprintORCPlanning(args.materializedPlanning) : planningFingerprint);
  const candidateStateCandidateId = candidateState?.candidateId ?? candidateState?.candidate?.id ?? candidateState?.candidate?.candidateId ?? null;
  const rawCandidateId = candidate?.id ?? null;
  const simulationMatchesValidation = simulation?.id != null && validation?.simulatedStateId === simulation.id;
  const simulationMatchesDiagnostics = simulation?.id != null && diagnostics.selectedSimulatedStateId === simulation.id && diagnostics.selectedFinalSimulatedStateId === simulation.id;
  const candidateMatchesDiagnostics = rawCandidateId != null && diagnostics.selectedFinalCandidateId === rawCandidateId && diagnostics.selectedFinalCandidateFamily === "baseline-overlap-repair";
  const candidateLineage = selection.candidateLineage ?? candidate?.candidateLineage ?? diagnostics.candidateLineage ?? null;
  const candidateStateDirectlyMatchesCandidate = rawCandidateId != null && candidateStateCandidateId != null && String(candidateStateCandidateId) === String(rawCandidateId);
  const candidateLineageResolutionKind = candidateLineage?.resolutionKind ?? null;
  const candidateLineageRawCandidateId = candidateLineage?.rawCandidateId ?? null;
  const candidateLineagePartialPlanId = candidateLineage?.partialPlanId ?? null;
  const candidateLineagePartialPlanCandidateIds = Array.isArray(candidateLineage?.partialPlanCandidateIds) ? [...candidateLineage.partialPlanCandidateIds].map(String).sort() : [];
  const candidateLineageAmbiguityReason = candidateLineage?.ambiguityReason ?? null;
  const candidateLineageResolutionAvailable = candidateLineageResolutionKind != null;
  const candidateLineageResolutionConsistent = candidateLineage?.lineageConsistent === true && candidateLineageAmbiguityReason == null;
  const candidateStateMatchesCandidateThroughPartialPlan = rawCandidateId != null && candidateStateCandidateId != null && candidateLineageResolutionConsistent && candidateLineageResolutionKind === "single_candidate_partial_plan" && String(candidateLineageRawCandidateId) === String(rawCandidateId) && String(candidateLineage?.candidateStateCandidateId ?? "") === String(candidateStateCandidateId) && candidateLineage?.candidateStateMatchesPartialPlan === true && candidateLineage?.rawCandidateContainedInPartialPlan === true && candidateLineagePartialPlanCandidateIds.length === 1 && candidateLineagePartialPlanCandidateIds[0] === rawCandidateId;
  const candidateStateMatchesCandidate = rawCandidateId != null && (candidateStateCandidateId == null || candidateStateDirectlyMatchesCandidate || candidateStateMatchesCandidateThroughPartialPlan);
  const fingerprintMatches = planningFingerprint != null && materializedPlanningFingerprint != null && planningFingerprint === materializedPlanningFingerprint;
  const checks: Array<[boolean, string]> = [
    [simulationMatchesValidation, "selection_simulation_validation_mismatch"],
    [simulationMatchesDiagnostics, "selection_simulation_diagnostics_mismatch"],
    [candidateMatchesDiagnostics, "selection_candidate_diagnostics_mismatch"],
    [candidateStateMatchesCandidate, "selection_candidate_state_mismatch"],
    [fingerprintMatches, "selection_planning_fingerprint_mismatch"],
  ];
  const warnings = checks.filter(([ok]) => !ok).map(([, warning]) => warning);
  return {
    version: "ORC-SELECTION-EVIDENCE-COHERENCE-V1",
    selectionSource: args.selectionSource ?? null,
    simulationId: simulation?.id ?? null,
    validationSimulatedStateId: validation?.simulatedStateId ?? null,
    candidateStateId: candidateState?.id ?? null,
    candidateStateCandidateId,
    rawCandidateId,
    diagnosticsSelectedSimulatedStateId: diagnostics.selectedSimulatedStateId ?? null,
    diagnosticsSelectedFinalSimulatedStateId: diagnostics.selectedFinalSimulatedStateId ?? null,
    diagnosticsSelectedFinalCandidateId: diagnostics.selectedFinalCandidateId ?? null,
    diagnosticsSelectedFinalCandidateFamily: diagnostics.selectedFinalCandidateFamily ?? null,
    planningFingerprint,
    materializedPlanningFingerprint,
    simulationMatchesValidation,
    simulationMatchesDiagnostics,
    candidateMatchesDiagnostics,
    candidateStateMatchesCandidate,
    candidateStateDirectlyMatchesCandidate,
    candidateStateMatchesCandidateThroughPartialPlan,
    candidateLineageResolutionAvailable,
    candidateLineageResolutionKind,
    candidateLineageRawCandidateId,
    candidateLineagePartialPlanId,
    candidateLineagePartialPlanCandidateIds,
    candidateLineageAmbiguityReason,
    candidateLineageResolutionConsistent,
    fingerprintMatches,
    coherent: warnings.length === 0,
    warnings,
    readOnly: true,
  };
}
