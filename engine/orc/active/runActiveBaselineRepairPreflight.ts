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

export const ORC_RUNTIME_CONTRACT_VERSION_ID224 = "ORC-RUNTIME-CONTRACT-ID224" as const;
export const BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224 = "BASELINE-OVERLAP-REPAIR-SUMMARY-ID224" as const;
export const ACTIVE_REPAIR_PREFLIGHT_SOURCE_ID224 = "active-hard-feasibility-repair-preflight" as const;

export interface ActiveBaselineRepairPreflightSummary {
  executed: boolean; reason: string | null; candidateIds: string[]; generatedCandidateCount: number; prefilterAcceptedCount: number; prefilterDiscardedCount: number; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number; selectedAsCommit: boolean; selectedSimulatedStateId: string | null; selectedCandidateId: string | null; repairAcceptanceSource: string | null; warnings: string[]; readOnly: true;
}

export interface ActiveBaselineRepairPreflightResult {
  summary: ActiveBaselineRepairPreflightSummary;
  baselineOverlapRepairSummary: Record<string, unknown>;
  candidates: Candidate[]; candidateStates: CandidateState[]; simulatedStates: SimulatedState[]; validationResults: ValidationResult[]; operationalValues: OperationalValue[]; commitDecisions: CommitDecision[];
  selected: { simulation: SimulatedState; validation: ValidationResult; value: OperationalValue | null; candidateState: CandidateState | null; candidate: Candidate | null; commitDecision: CommitDecision | null } | null;
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
  return { orcRuntimeContractVersion: ORC_RUNTIME_CONTRACT_VERSION_ID224, planningMaterializationContractVersion: ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225, mainZoneResolutionContractVersion: ORC_MAIN_ZONE_RESOLUTION_CONTRACT_VERSION_ID228, activeRepairPreflightAvailable: true, baselineOverlapRepairSummaryContractVersion: BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224, selectBestSimulationPolicy: "valid-committed-repair-first-v1", compositeSummaryContractVersion: ORC_COMPOSITE_SUMMARY_CONTRACT_VERSION_ID229, compositeMaterializationContractVersion: ORC_COMPOSITE_MATERIALIZATION_CONTRACT_VERSION_ID229, finalContinuitySummaryContractVersion: ORC_FINAL_MAIN_ZONE_CONTINUITY_CONTRACT_VERSION_ID229, criticalResourceIdleCompressionContractVersion: "ORC-CRITICAL-RESOURCE-IDLE-COMPRESSION-ID230", postContinuityResourceIdleCompressionPassVersion: "ORC-POST-CONTINUITY-RESOURCE-IDLE-PASS-ID231", resourceIdleCompositeSelectionPolicy: "valid-committed-continuity-and-net-positive-resource-compactness-first-v1", compositeDescendantSummaryContractVersion: ORC_COMPOSITE_DESCENDANT_SUMMARY_CONTRACT_VERSION_ID233, resourceIdleNetValueContractVersion: "ORC-RESOURCE-IDLE-NET-VALUE-ID234", productionConceptAlignmentContractVersion: "ORC-PRODUCTION-CONCEPT-ALIGNMENT-ID235", rejectedOptionalImprovementMaterializationContractVersion: ORC_REJECTED_OPTIONAL_IMPROVEMENT_MATERIALIZATION_CONTRACT_VERSION_ID236, readOnly: true as const };
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
  const selectedValidation = valid.find((v) => committedIds.has(v.simulatedStateId)) ?? valid[0] ?? null;
  const selectedSimulation = selectedValidation ? pipeline.simulation.simulatedStates.find((s) => s.id === selectedValidation.simulatedStateId) ?? null : null;
  const selectedCandidateState = selectedSimulation ? pipeline.transformation.candidateStates.find((cs) => cs.id === selectedSimulation.candidateStateId) ?? null : null;
  const selectedCandidate = selectedCandidateState ? decisionInput.candidates.find((c) => c.id === selectedCandidateState.candidateId) ?? null : null;
  const selectedCommit = selectedSimulation ? pipeline.commit.commitDecisions.find((d) => d.decision === "COMMIT" && d.operationalValueId === selectedSimulation.id) ?? null : null;
  const selectedValue = selectedSimulation ? pipeline.evaluation.operationalValues.find((v) => v.simulatedStateId === selectedSimulation.id) ?? null : null;
  const summary: ActiveBaselineRepairPreflightSummary = { executed: true, reason: selectedSimulation ? "valid_repair_selected" : (repair.candidates.length === 0 ? String(repair.summary.skippedReason ?? "no_candidates_generated") : valid.length === 0 ? "no_valid_simulation" : "no_committed_valid_simulation"), candidateIds: [...repair.summary.candidateIds], generatedCandidateCount: repair.summary.generatedCandidateCount, prefilterAcceptedCount: prefilter.summary.acceptedCandidateCount, prefilterDiscardedCount: prefilter.summary.discardedCandidateCount, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, selectedAsCommit: selectedCommit != null, selectedSimulatedStateId: selectedSimulation?.id ?? null, selectedCandidateId: selectedCandidate?.id ?? null, repairAcceptanceSource: selectedSimulation ? ACTIVE_REPAIR_PREFLIGHT_SOURCE_ID224 : null, warnings: args.warnings ?? [], readOnly: true };
  const baselineOverlapRepairSummary = normalizeBaselineOverlapRepairSummaryID224({ ...repair.summary, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, selectedAsCommit: selectedCommit != null, selectedCandidateId: selectedCandidate?.id ?? null, lineage: { rawCandidateIds: lineage.rawCandidateIds, syntheticCandidateIds: lineage.syntheticCandidateIds, partialPlanIds: lineage.partialPlanIds, candidateStateIds: lineage.candidateStateIds, simulatedStateIds: lineage.simulatedStateIds, committedSimulatedStateIds: lineage.committedSimulatedStateIds, readOnly: true } }, summary, args.warnings ?? []);
  return { summary, baselineOverlapRepairSummary, candidates: decisionInput.candidates, candidateStates: pipeline.transformation.candidateStates, simulatedStates: pipeline.simulation.simulatedStates, validationResults: pipeline.validation.validationResults, operationalValues: pipeline.ranking.rankedOperationalValues, commitDecisions: pipeline.commit.commitDecisions, selected: selectedSimulation && selectedValidation ? { simulation: selectedSimulation, validation: selectedValidation, value: selectedValue, candidateState: selectedCandidateState, candidate: selectedCandidate, commitDecision: selectedCommit } : null };
}
