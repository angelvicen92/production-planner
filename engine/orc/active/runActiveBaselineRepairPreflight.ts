import type { EngineInput } from "../../types";
import type { Candidate, CandidateState, CommitDecision, OperationalState, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import { buildBaselineOverlapRepairCandidates } from "../see/baselineOverlapRepairCandidateBuilder";
import { prefilterCandidatesByHardConstraints } from "../see/candidateHardPrefilter";
import { composePartialPlans } from "../see/partialPlanComposer";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { resolveCandidateLineage } from "../decision/candidateLineage";
import type { ORCBaselineSeedHardFeasibilityAudit } from "./orcBaselineSeedFeasibilityAudit";
import { ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225 } from "../simulation/materializeSimulatedPlanning";
import { ORC_MAIN_ZONE_RESOLUTION_CONTRACT_VERSION_ID228 } from "../state/mainZoneTargetResolver";
import { ORC_COMPOSITE_MATERIALIZATION_CONTRACT_VERSION_ID229, ORC_COMPOSITE_SUMMARY_CONTRACT_VERSION_ID229, ORC_FINAL_MAIN_ZONE_CONTINUITY_CONTRACT_VERSION_ID229, ORC_COMPOSITE_DESCENDANT_SUMMARY_CONTRACT_VERSION_ID233, ORC_REJECTED_OPTIONAL_IMPROVEMENT_MATERIALIZATION_CONTRACT_VERSION_ID236 } from "./buildFinalORCCompositeSummary";
import { ORC_PRODUCTION_WAVE_PLANNER_BLUEPRINT_CONTRACT_VERSION_ID237 } from "../macro/productionWavePlannerBlueprint";
import { materializeSimulatedPlanning } from "../simulation/materializeSimulatedPlanning";
import { validateFinalMaterializedORCPlanning, fingerprintORCPlanning, type FinalMaterializedPlanningValidationResult } from "./finalMaterializedPlanningValidation";

export const ORC_RUNTIME_CONTRACT_VERSION_ID224 = "ORC-RUNTIME-CONTRACT-ID224" as const;
export const BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224 = "BASELINE-OVERLAP-REPAIR-SUMMARY-ID224" as const;
export const ACTIVE_REPAIR_PREFLIGHT_SOURCE_ID224 = "active-hard-feasibility-repair-preflight" as const;

export interface ActiveBaselineRepairPreflightSummary {
  executed: boolean; reason: string | null; candidateIds: string[]; generatedCandidateCount: number; prefilterAcceptedCount: number; prefilterDiscardedCount: number; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number; selectedAsCommit: boolean; selectedSimulatedStateId: string | null; selectedCandidateId: string | null; repairAcceptanceSource: string | null; warnings: string[]; readOnly: true; candidatesSentToPrefilter?: number; prefilterRejectedCount?: number; simulatedCandidateCount?: number; decisionValidCandidateCount?: number; canonicalValidationExecutedCount?: number; canonicalValidCandidateCount?: number; canonicalInvalidCandidateCount?: number; selectedCandidateSource?: string | null; selectedAssignmentCount?: number | null; selectedMovedTaskIds?: number[] | null; selectedCanonicalValidationResult?: string | null; selectedPlanningFingerprint?: string | null; selectedViolationCodes?: string[] | null; noValidRepairReason?: string | null; deterministic?: true;
}

export interface CanonicalBaselineRepairEvaluation {
  candidate: Candidate; candidateState: CandidateState; simulation: SimulatedState; validation: ValidationResult; operationalValue: OperationalValue | null; commitDecision: CommitDecision | null; extractedPlanning: any; planningMaterialization: any; canonicalHardValidation: FinalMaterializedPlanningValidationResult; planningFingerprint: string; candidateSource: string | null; assignmentCount: number; totalDisplacementMinutes: number; maximumDisplacementMinutes: number; closureDepth: number; lineageConsistent: boolean; canonicalHardValid: boolean;
}

export interface ActiveBaselineRepairPreflightResult {
  summary: ActiveBaselineRepairPreflightSummary;
  baselineOverlapRepairSummary: Record<string, unknown>;
  candidates: Candidate[]; candidateStates: CandidateState[]; simulatedStates: SimulatedState[]; validationResults: ValidationResult[]; operationalValues: OperationalValue[]; commitDecisions: CommitDecision[];
  selected: (CanonicalBaselineRepairEvaluation & { value: OperationalValue | null }) | null;
}

const emptyActive = (executed: boolean, reason: string | null, warnings: string[] = []): ActiveBaselineRepairPreflightSummary => ({ executed, reason, candidateIds: [], generatedCandidateCount: 0, prefilterAcceptedCount: 0, prefilterDiscardedCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, selectedSimulatedStateId: null, selectedCandidateId: null, repairAcceptanceSource: null, warnings, readOnly: true });
const isRecord = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const ids = (v: unknown): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];

export function hasRepairableBaselineSpaceOverlapGroup(audit: unknown): boolean {
  if (!isRecord(audit)) return false;
  const groups = Array.isArray(audit.spaceOverlapGroups) ? audit.spaceOverlapGroups : [];
  return groups.some((raw) => {
    if (!isRecord(raw)) return false;
    const taskIds = ids(raw.taskIds);
    const roles = Array.isArray(raw.roleLabels) ? raw.roleLabels.map(String) : [];
    const modes = Array.isArray(raw.occupancyModes) ? raw.occupancyModes.map(String) : Array.isArray(raw.spaceOccupancyModes) ? raw.spaceOccupancyModes.map(String) : [];
    return Number(raw.taskCount ?? taskIds.length) === 2 && taskIds.length === 2 && raw.spaceId != null && roles.length >= 2 && roles.every((r) => r === "productive_task") && modes.length >= 2 && modes.every((m) => m === "exclusive");
  });
}

export function buildORCRuntimeContractID224() {
  return { orcRuntimeContractVersion: ORC_RUNTIME_CONTRACT_VERSION_ID224, planningMaterializationContractVersion: ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225, mainZoneResolutionContractVersion: ORC_MAIN_ZONE_RESOLUTION_CONTRACT_VERSION_ID228, activeRepairPreflightAvailable: true, baselineOverlapRepairSummaryContractVersion: BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224, selectBestSimulationPolicy: "valid-committed-repair-first-v1", compositeSummaryContractVersion: ORC_COMPOSITE_SUMMARY_CONTRACT_VERSION_ID229, compositeMaterializationContractVersion: ORC_COMPOSITE_MATERIALIZATION_CONTRACT_VERSION_ID229, finalContinuitySummaryContractVersion: ORC_FINAL_MAIN_ZONE_CONTINUITY_CONTRACT_VERSION_ID229, criticalResourceIdleCompressionContractVersion: "ORC-CRITICAL-RESOURCE-IDLE-COMPRESSION-ID230", postContinuityResourceIdleCompressionPassVersion: "ORC-POST-CONTINUITY-RESOURCE-IDLE-PASS-ID231", resourceIdleCompositeSelectionPolicy: "valid-committed-continuity-and-net-positive-resource-compactness-first-v1", compositeDescendantSummaryContractVersion: ORC_COMPOSITE_DESCENDANT_SUMMARY_CONTRACT_VERSION_ID233, resourceIdleNetValueContractVersion: "ORC-RESOURCE-IDLE-NET-VALUE-ID234", productionConceptAlignmentContractVersion: "ORC-PRODUCTION-CONCEPT-ALIGNMENT-ID235", rejectedOptionalImprovementMaterializationContractVersion: ORC_REJECTED_OPTIONAL_IMPROVEMENT_MATERIALIZATION_CONTRACT_VERSION_ID236, productionWavePlannerBlueprintContractVersion: ORC_PRODUCTION_WAVE_PLANNER_BLUEPRINT_CONTRACT_VERSION_ID237, macroMainZoneBlockRelayoutContractVersion: "ORC-MACRO-MAIN-ZONE-BLOCK-RELAYOUT-ID238", macroMainZoneDependencyAwareRelayoutContractVersion: "ORC-MACRO-MAIN-ZONE-DEPENDENCY-AWARE-RELAYOUT-ID240", macroMainZoneGlobalNetValueContractVersion: "ORC-MACRO-MAIN-ZONE-GLOBAL-NET-VALUE-ID241", macroMainZoneMaterializationSourceContractVersion: "ORC-MACRO-MAIN-ZONE-MATERIALIZATION-SOURCE-ID241", macroMainZoneSuffixCompactionContractVersion: "ORC-MACRO-MAIN-ZONE-SUFFIX-COMPACTION-ID242", macroMainZoneDominanceGateContractVersion: "ORC-MACRO-MAIN-ZONE-DOMINANCE-GATE-ID243", macroMainZoneSuffixSummaryConsistencyContractVersion: "ORC-MACRO-MAIN-ZONE-SUFFIX-SUMMARY-CONSISTENCY-ID243", readOnly: true as const };
}

export function normalizeBaselineOverlapRepairSummaryID224(summary: Record<string, unknown> | null | undefined, activeRepairPreflight?: ActiveBaselineRepairPreflightSummary, warnings: string[] = [], invariant: string | null = null): Record<string, unknown> {
  const base = summary ?? {};
  return { ...base, summaryContractVersion: BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224, auditAvailable: base.auditAvailable ?? false, auditPassedToCandidateBuilder: base.auditPassedToCandidateBuilder ?? false, auditPassedToRepairBuilder: base.auditPassedToRepairBuilder ?? false, sourceOfTruth: base.sourceOfTruth ?? null, auditSpaceOverlapGroupCount: base.auditSpaceOverlapGroupCount ?? 0, auditRepairableGroupCount: base.auditRepairableGroupCount ?? 0, repairableGroupSelection: base.repairableGroupSelection ?? null, unsupportedGroupCount: base.unsupportedGroupCount ?? 0, unsupportedGroupsSample: base.unsupportedGroupsSample ?? [], fallbackSourceUsed: base.fallbackSourceUsed ?? null, runtimeWiringWarnings: [...(Array.isArray(base.runtimeWiringWarnings) ? base.runtimeWiringWarnings.map(String) : []), ...warnings], runtimeInvariant: base.runtimeInvariant ?? (invariant ? { ok: false, invariantViolationCode: invariant, readOnly: true } : null), lateAuditRepairPass: base.lateAuditRepairPass ?? { executed: false, reason: null, candidateIds: [], generatedCandidateCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, warnings: [], readOnly: true }, activeRepairPreflight: activeRepairPreflight ?? (isRecord(base.activeRepairPreflight) ? base.activeRepairPreflight : emptyActive(false, "not_required")), readOnly: true };
}

export function runActiveBaselineRepairPreflight(args: { input: EngineInput; operationalState: OperationalState | null; baselineSeedHardFeasibility: ORCBaselineSeedHardFeasibilityAudit; createdAt?: string | null; maxCandidates?: number; warnings?: string[] }): ActiveBaselineRepairPreflightResult {
  const state = args.operationalState;
  if (!state) {
    const summary = emptyActive(false, "operational_state_unavailable", args.warnings ?? []);
    return { summary, baselineOverlapRepairSummary: normalizeBaselineOverlapRepairSummaryID224(null, summary), candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], selected: null };
  }
  if (!hasRepairableBaselineSpaceOverlapGroup(args.baselineSeedHardFeasibility)) {
    const summary = emptyActive(false, "no_repairable_audit_group", args.warnings ?? []);
    return { summary, baselineOverlapRepairSummary: normalizeBaselineOverlapRepairSummaryID224(null, summary), candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], selected: null };
  }
  const repair = buildBaselineOverlapRepairCandidates(state, { createdAt: args.createdAt ?? null, baselineSeedHardFeasibility: args.baselineSeedHardFeasibility, auditPassedToCandidateBuilder: true, maxCandidates: args.maxCandidates ?? 4 });
  const prefilter = prefilterCandidatesByHardConstraints(repair.candidates, state, { createdAt: args.createdAt ?? null });
  const partialPlan = composePartialPlans(prefilter.candidates, { createdAt: args.createdAt ?? null });
  const candidateResult = { candidates: prefilter.candidates, evidence: [...repair.evidence, ...prefilter.evidence, ...partialPlan.evidence], partialPlans: partialPlan.partialPlans, summary: { searchSpaceCount: 0, candidateCount: prefilter.candidates.length, baselineOverlapRepair: repair.summary, pruning: { generatedCount: repair.candidates.length, keptCount: prefilter.candidates.length, prunedCount: repair.candidates.length - prefilter.candidates.length, estimatedBudgetSaved: repair.candidates.length - prefilter.candidates.length, prunedItems: [] }, hardPrefilter: prefilter.summary } } as any;
  const decisionInput = buildDecisionInput(candidateResult);
  const pipeline = executeDecisionPipeline({ ...decisionInput, operationalState: state, createdAt: args.createdAt ?? null });
  const rawIds = new Set(repair.summary.candidateIds);
  const rankedBest = pipeline.ranking.rankedOperationalValues[0]?.simulatedStateId ?? null;
  const lineage = resolveCandidateLineage({ rawCandidateIds: rawIds, decisionInputCandidates: decisionInput.candidates, candidateStates: pipeline.transformation.candidateStates, simulatedStates: pipeline.simulation.simulatedStates, operationalValues: pipeline.evaluation.operationalValues, commitDecisions: pipeline.commit.commitDecisions, partialPlans: partialPlan.partialPlans, rankedBestSimulatedStateId: rankedBest });
  const lineageSimIds = new Set(lineage.simulatedStateIds);
  const valid = pipeline.validation.validationResults.filter((v) => lineageSimIds.has(v.simulatedStateId) && v.result === "VALID");
  const invalid = pipeline.validation.validationResults.filter((v) => lineageSimIds.has(v.simulatedStateId) && v.result === "INVALID");
  const committedIds = new Set(pipeline.commit.commitDecisions.filter((d) => d.decision === "COMMIT" && d.operationalValueId != null).map((d) => String(d.operationalValueId)));
  const evaluations: CanonicalBaselineRepairEvaluation[] = [];
  for (const validation of valid) {
    const simulation = pipeline.simulation.simulatedStates.find((s) => s.id === validation.simulatedStateId);
    const candidateState = simulation ? pipeline.transformation.candidateStates.find((cs) => cs.id === simulation.candidateStateId) : null;
    const candidate = candidateState ? decisionInput.candidates.find((c) => c.id === candidateState.candidateId) : null;
    if (!simulation || !candidateState || !candidate) continue;
    const materialized = materializeSimulatedPlanning(candidateState, state);
    const canonicalInput = Array.isArray((args.input as any)?.tasks) && (args.input as any).tasks.length > 0 ? args.input : state as any;
    const canonical = validateFinalMaterializedORCPlanning({ input: canonicalInput, simulation, planning: materialized.planning, candidate, validation, planningMaterialization: materialized.diagnostics, source: "active_baseline_repair_preflight" });
    const value = pipeline.evaluation.operationalValues.find((v) => v.simulatedStateId === simulation.id) ?? null;
    const commitDecision = pipeline.commit.commitDecisions.find((d) => d.decision === "COMMIT" && d.operationalValueId === simulation.id) ?? null;
    evaluations.push({ candidate, candidateState, simulation, validation, operationalValue: value, commitDecision, extractedPlanning: { plannedTasks: materialized.planning, pendingTaskIds: [] }, planningMaterialization: materialized.diagnostics, canonicalHardValidation: canonical, planningFingerprint: fingerprintORCPlanning(materialized.planning), candidateSource: (candidate.metadata as any)?.repairAdmission?.candidateSource ?? ((candidate.metadata as any)?.generationReason === "conflict_closure" ? "conflict_closure" : "simple_variant"), assignmentCount: candidate.assignments.length, totalDisplacementMinutes: Number((candidate.metadata as any)?.conflictClosure?.totalDisplacementMinutes ?? 0), maximumDisplacementMinutes: Number((candidate.metadata as any)?.conflictClosure?.maximumDisplacementMinutes ?? 0), closureDepth: Number((candidate.metadata as any)?.conflictClosure?.depthUsed ?? 0), lineageConsistent: canonical.validationBelongsToSimulation && canonical.planningFingerprintMatches, canonicalHardValid: canonical.finalGatePassed && canonical.result === "VALID" && canonical.violationCount === 0 });
  }
  const canonicalValid = evaluations.filter((e) => e.canonicalHardValid);
  canonicalValid.sort((a,b)=>a.assignmentCount-b.assignmentCount||a.totalDisplacementMinutes-b.totalDisplacementMinutes||a.maximumDisplacementMinutes-b.maximumDisplacementMinutes||a.closureDepth-b.closureDepth||Number(b.operationalValue?.overallScore??0)-Number(a.operationalValue?.overallScore??0)||a.candidate.id.localeCompare(b.candidate.id));
  const selected = canonicalValid[0] ?? null;
  const selectedCommit = selected?.commitDecision ?? null;
  const selectedValue = selected?.operationalValue ?? null;
  const noValidRepairReason = repair.candidates.length === 0 ? String(repair.summary.skippedReason ?? "no_candidates_generated") : valid.length === 0 ? "no_valid_simulation" : canonicalValid.length === 0 ? "no_canonical_hard_valid_repair" : null;
  const selectedMovedTaskIds = selected ? ([...new Set(((selected.candidate.metadata as any)?.movedTaskIds ?? selected.candidate.assignments.map((a:any)=>a.taskId)).map(Number).filter(Number.isFinite))] as number[]).sort((a:number,b:number)=>a-b) : null;
  const summary: ActiveBaselineRepairPreflightSummary = { executed: true, reason: selected ? "canonical_valid_repair_selected" : noValidRepairReason, candidateIds: [...repair.summary.candidateIds], generatedCandidateCount: repair.summary.generatedCandidateCount, prefilterAcceptedCount: prefilter.summary.acceptedCandidateCount, prefilterDiscardedCount: prefilter.summary.discardedCandidateCount, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, selectedAsCommit: selected != null, selectedSimulatedStateId: selected?.simulation.id ?? null, selectedCandidateId: selected?.candidate.id ?? null, repairAcceptanceSource: selected ? ACTIVE_REPAIR_PREFLIGHT_SOURCE_ID224 : null, warnings: args.warnings ?? [], candidatesSentToPrefilter: repair.candidates.length, prefilterRejectedCount: prefilter.summary.discardedCandidateCount, simulatedCandidateCount: lineage.simulatedStateIds.length, decisionValidCandidateCount: valid.length, canonicalValidationExecutedCount: evaluations.length, canonicalValidCandidateCount: canonicalValid.length, canonicalInvalidCandidateCount: evaluations.length - canonicalValid.length, selectedCandidateSource: selected?.candidateSource ?? null, selectedAssignmentCount: selected?.assignmentCount ?? null, selectedMovedTaskIds, selectedCanonicalValidationResult: selected?.canonicalHardValidation.result ?? null, selectedPlanningFingerprint: selected?.planningFingerprint ?? null, selectedViolationCodes: selected ? [...selected.canonicalHardValidation.violatedConstraints] : null, noValidRepairReason, deterministic: true, readOnly: true };
  const baselineOverlapRepairSummary = normalizeBaselineOverlapRepairSummaryID224({ ...repair.summary, candidatesSentToPrefilter: repair.candidates.length, prefilterAcceptedCount: prefilter.summary.acceptedCandidateCount, prefilterRejectedCount: prefilter.summary.discardedCandidateCount, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, decisionValidCandidateCount: valid.length, canonicalValidationExecutedCount: evaluations.length, canonicalValidCandidateCount: canonicalValid.length, canonicalInvalidCandidateCount: evaluations.length - canonicalValid.length, selectedAsCommit: summary.selectedAsCommit, selectedCandidateId: selected?.candidate.id ?? null, selectedCandidateSource: selected?.candidateSource ?? null, selectedAssignmentCount: selected?.assignmentCount ?? null, selectedMovedTaskIds: summary.selectedMovedTaskIds, selectedCanonicalValidationResult: selected?.canonicalHardValidation.result ?? null, selectedPlanningFingerprint: selected?.planningFingerprint ?? null, selectedViolationCodes: summary.selectedViolationCodes, noValidRepairReason, lineage: { rawCandidateIds: lineage.rawCandidateIds, syntheticCandidateIds: lineage.syntheticCandidateIds, partialPlanIds: lineage.partialPlanIds, candidateStateIds: lineage.candidateStateIds, simulatedStateIds: lineage.simulatedStateIds, committedSimulatedStateIds: lineage.committedSimulatedStateIds, readOnly: true } }, summary, args.warnings ?? []);
  return { summary, baselineOverlapRepairSummary, candidates: decisionInput.candidates, candidateStates: pipeline.transformation.candidateStates, simulatedStates: pipeline.simulation.simulatedStates, validationResults: pipeline.validation.validationResults, operationalValues: pipeline.ranking.rankedOperationalValues, commitDecisions: pipeline.commit.commitDecisions, selected: selected ? { ...selected, value: selectedValue } : null };
}
