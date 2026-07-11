import { deepFreeze } from "../immutability";

const ids = (items: any[] | undefined | null) => (Array.isArray(items) ? items.map((x) => String(x?.id ?? x)).filter(Boolean).sort() : []);

export function buildActiveRepairORCSelection(args: { selected: any; preflightSummary?: any; globalDiagnostics?: any }) {
  const selected = args.selected;
  const simulation = selected?.simulation ?? null;
  const validation = selected?.validation ?? null;
  const candidate = selected?.candidate ?? null;
  const candidateState = selected?.candidateState ?? null;
  const warnings: string[] = [];
  if (!simulation?.id) warnings.push("active_repair_selection_missing_simulation");
  if (validation?.simulatedStateId !== simulation?.id) warnings.push("active_repair_selection_validation_lineage_mismatch");
  if (candidate?.id == null) warnings.push("active_repair_selection_missing_candidate");
  const candidateStateCandidateId = candidateState?.candidateId ?? candidateState?.candidate?.id ?? candidateState?.candidate?.candidateId ?? null;
  const candidateLineage = selected?.candidateLineage ?? null;
  const directMatch = candidateStateCandidateId != null && candidate?.id != null && String(candidateStateCandidateId) === String(candidate.id);
  const partialPlanMatch = candidateLineage?.lineageConsistent === true
    && candidateLineage?.resolutionKind === "single_candidate_partial_plan"
    && candidateLineage?.ambiguityReason == null
    && String(candidateLineage?.candidateStateCandidateId ?? "") === String(candidateStateCandidateId ?? "")
    && candidateLineage?.candidateStateMatchesPartialPlan === true
    && candidateLineage?.rawCandidateContainedInPartialPlan === true
    && Array.isArray(candidateLineage?.partialPlanCandidateIds)
    && candidateLineage.partialPlanCandidateIds.length === 1
    && candidate?.id != null
    && String(candidateLineage.rawCandidateId) === String(candidate.id)
    && String(candidateLineage.partialPlanCandidateIds[0]) === String(candidate.id);
  if (candidateStateCandidateId != null && candidate?.id != null && !directMatch && !partialPlanMatch) warnings.push("active_repair_selection_candidate_state_mismatch");
  const committedSimulationIds = simulation?.id && selected?.commitDecision?.committed === true ? [simulation.id] : simulation?.id ? [simulation.id] : [];
  const diagnostics = {
    selectionPolicy: "active-repair-preflight-canonical-baseline-repair-v1",
    selectedBucket: "valid-committed-baseline-repair-transformations-changed",
    validSimulationCount: Number(args.preflightSummary?.validSimulationCount ?? args.preflightSummary?.canonicalValidCount ?? 1),
    invalidSimulationCount: Number(args.preflightSummary?.invalidSimulationCount ?? 0),
    committedSimulationIds,
    baselineRepairSimulationIds: simulation?.id ? [simulation.id] : [],
    postRepairContinuitySimulationIds: [],
    criticalResourceIdleCompressionSimulationIds: [],
    postContinuityResourceCompressionSimulationIds: [],
    macroMainZoneRelayoutSimulationIds: [],
    macroProductionWaveDayShapeSimulationIds: [],
    pureMacroProductionWaveDayShapeSimulationIds: [],
    compositeMacroProductionWaveDayShapeSimulationIds: [],
    compositeMacroSimulationIds: [],
    macroPassSimulationIds: [],
    macroPassLineageFallbackUsed: false,
    macroPassLineageFallbackWarnings: [],
    macroMainZoneRelayoutAcceptedSimulationIds: [],
    macroMainZoneRelayoutRejectedSimulationIds: [],
    macroMainZoneRelayoutRejectReasons: {},
    macroMainZoneRelayoutAcceptedByMacroValueGate: false,
    macroMainZoneRelayoutAcceptedByGlobalMacroValueGate: false,
    macroMainZoneRelayoutGlobalRejectReasons: {},
    macroMainZoneRelayoutGlobalValueBySimulationId: {},
    macroMainZoneRelayoutScoreDelta: null,
    baseCompositeSimulationId: null,
    selectedBecause: "canonical_hard_valid_active_baseline_repair",
    selectedSimulatedStateId: simulation?.id ?? null,
    selectedFinalSimulatedStateId: simulation?.id ?? null,
    selectedFinalCandidateId: candidate?.id ?? null,
    selectedFinalCandidateFamily: "baseline-overlap-repair",
    candidateLineage,
    selectedCandidateStateCandidateId: candidateStateCandidateId,
    selectedRawCandidateId: candidate?.id ?? null,
    selectedPartialPlanId: candidateLineage?.partialPlanId ?? null,
    selectedPartialPlanCandidateIds: candidateLineage?.partialPlanCandidateIds ?? [],
    selectedCandidateLineageResolutionKind: candidateLineage?.resolutionKind ?? null,
    selectedCandidateStateMatchesPartialPlan: candidateLineage?.candidateStateMatchesPartialPlan ?? false,
    selectedRawCandidateContainedInPartialPlan: candidateLineage?.rawCandidateContainedInPartialPlan ?? false,
    selectedCandidateLineageConsistent: candidateLineage?.lineageConsistent ?? false,
    selectedFinalIncludesCompositeAncestors: false,
    resourceCompressionAcceptedByNetValueGate: false,
    resourceCompressionRejectedSimulationIds: [],
    resourceCompressionRejectReasons: {},
    baseCompositeOverallScore: null,
    resourceCompressionOverallScore: null,
    resourceCompressionScoreDelta: null,
    postMacroSelectionSource: "active-repair-preflight",
    activeRepairPreflightCandidateIds: ids(args.preflightSummary?.candidateIds),
    lineageConsistency: { ok: warnings.length === 0, warnings, readOnly: true },
    readOnly: true,
  };
  return deepFreeze({
    simulation,
    validation,
    value: selected?.value?.overallScore ?? selected?.value ?? null,
    candidateState,
    candidate,
    commitDecision: selected?.commitDecision ?? null,
    diagnostics,
  });
}
