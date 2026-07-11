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
  const candidateStateMatchesCandidate = rawCandidateId != null && (candidateStateCandidateId == null || String(candidateStateCandidateId) === String(rawCandidateId));
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
    fingerprintMatches,
    coherent: warnings.length === 0,
    warnings,
    readOnly: true,
  };
}
