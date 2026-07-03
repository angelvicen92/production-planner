import type { Candidate, Evidence, OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { resolveCandidateLineage } from "../decision/candidateLineage";
import { buildMainZoneGapResourceBlockSwapCandidates } from "../see/mainZoneGapResourceBlockSwapCandidateBuilder";
import { prefilterCandidatesByHardConstraints } from "../see/candidateHardPrefilter";
import { composePartialPlans } from "../see/partialPlanComposer";

export interface PostRepairMainZoneContinuityPassSummary {
  executed: boolean; reason: string | null; mainZoneId: number | null; mainZoneConfigured: boolean; sourceSimulationId: string | null; sourceRepairCandidateId: string | null;
  generatedCandidateCount: number; candidateIds: string[]; prefilterAcceptedCount: number; prefilterDiscardedCount: number; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number;
  selectedAsCommit: boolean; selectedCandidateId: string | null; selectedSimulatedStateId: string | null; movedMainZoneTaskIds: number[]; movedBlockingTaskIds: number[]; sharedResourceIds: number[];
  mainZoneLargestGapBefore: number | null; mainZoneLargestGapAfter: number | null; mainZoneGapReductionMinutes: number; prefilterDiscardReasons: Record<string, number>; prefilterDiscardDetails: ReadonlyArray<Record<string, unknown>>; validationRejectReasons: Record<string, number>; warnings: string[]; readOnly: true;
}

export interface PostRepairMainZoneContinuityPassResult {
  summary: PostRepairMainZoneContinuityPassSummary; candidates: Candidate[]; evidence: Evidence[]; pipeline: ReturnType<typeof executeDecisionPipeline> | null; decisionInputCandidates: Candidate[]; partialPlans: ReturnType<typeof composePartialPlans>["partialPlans"]; repairedState: OperationalState | null;
}

const empty = (reason: string, extra: Partial<PostRepairMainZoneContinuityPassSummary> = {}): PostRepairMainZoneContinuityPassResult => ({ summary: { executed: false, reason, mainZoneId: null, mainZoneConfigured: false, sourceSimulationId: null, sourceRepairCandidateId: null, generatedCandidateCount: 0, candidateIds: [], prefilterAcceptedCount: 0, prefilterDiscardedCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, selectedCandidateId: null, selectedSimulatedStateId: null, movedMainZoneTaskIds: [], movedBlockingTaskIds: [], sharedResourceIds: [], mainZoneLargestGapBefore: null, mainZoneLargestGapAfter: null, mainZoneGapReductionMinutes: 0, prefilterDiscardReasons: {}, prefilterDiscardDetails: [], validationRejectReasons: {}, warnings: [], readOnly: true, ...extra }, candidates: [], evidence: [], pipeline: null, decisionInputCandidates: [], partialPlans: [], repairedState: null });
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown) => typeof v === "string" ? v : null;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const arr = <T>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];

export function runPostRepairMainZoneContinuityPass(args: { originalState: OperationalState; selectedRepairSimulation: SimulatedState | null; selectedRepairValidation: ValidationResult | null; selectedRepairedPlanning?: readonly unknown[]; baselineOverlapRepair: unknown; createdAt?: string | null; budget?: { maxCandidates?: number } }): PostRepairMainZoneContinuityPassResult {
  const repair = rec(args.baselineOverlapRepair) ? args.baselineOverlapRepair : {};
  if (args.selectedRepairSimulation == null) return empty("baseline_repair_not_selected");
  if (args.selectedRepairValidation?.result !== "VALID") return empty("baseline_repair_not_valid", { sourceSimulationId: args.selectedRepairSimulation.id });
  if (repair.selectedAsCommit !== true) return empty("baseline_repair_not_committed", { sourceSimulationId: args.selectedRepairSimulation.id });
  const mat = args.selectedRepairSimulation.planningMaterialization;
  if (mat?.source !== "candidate_transformations" || (mat.changedTaskCount ?? 0) <= 0) return empty("baseline_repair_not_materialized", { sourceSimulationId: args.selectedRepairSimulation.id });
  if (mat.assignedSpaceContractValid === false || (mat.missingAssignedSpaceFieldCount ?? 0) > 0) return empty("assigned_space_contract_invalid", { sourceSimulationId: args.selectedRepairSimulation.id });
  const repairedState = args.selectedRepairSimulation.operationalStateSnapshot;
  const built = buildMainZoneGapResourceBlockSwapCandidates(repairedState, args.createdAt ?? null, { maxCandidates: args.budget?.maxCandidates ?? 6 });
  const before = built.mainZoneContinuity.largestMainZoneGapMinutes;
  if (!built.mainZoneContinuity.mainZoneConfigured) return empty("main_zone_not_configured", { sourceSimulationId: args.selectedRepairSimulation.id, mainZoneId: built.mainZoneContinuity.mainZoneId, mainZoneConfigured: false });
  const prefilter = prefilterCandidatesByHardConstraints(built.candidates, repairedState, { createdAt: args.createdAt ?? null });
  const partial = composePartialPlans(prefilter.candidates, { createdAt: args.createdAt ?? null });
  const candidateResult = { candidates: prefilter.candidates, evidence: [...built.evidence, ...prefilter.evidence, ...partial.evidence], partialPlans: partial.partialPlans, summary: { searchSpaceCount: 0, candidateCount: prefilter.candidates.length } } as any;
  const input = buildDecisionInput(candidateResult);
  const pipeline = executeDecisionPipeline({ ...input, operationalState: repairedState, createdAt: args.createdAt ?? null });
  const candidateIds = built.candidates.map(c => c.id);
  const rankedBest = pipeline.ranking.rankedOperationalValues[0]?.simulatedStateId ?? null;
  const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(candidateIds), decisionInputCandidates: input.candidates, candidateStates: pipeline.transformation.candidateStates, simulatedStates: pipeline.simulation.simulatedStates, operationalValues: pipeline.ranking.rankedOperationalValues, commitDecisions: pipeline.commit.commitDecisions, partialPlans: partial.partialPlans, rankedBestSimulatedStateId: rankedBest });
  const simIds = new Set(lineage.simulatedStateIds);
  const valid = pipeline.validation.validationResults.filter(v => simIds.has(v.simulatedStateId) && v.result === "VALID");
  const invalid = pipeline.validation.validationResults.filter(v => simIds.has(v.simulatedStateId) && v.result === "INVALID");
  const selectedSimId = lineage.committedSimulatedStateIds.find(id => valid.some(v => v.simulatedStateId === id)) ?? null;
  const selectedSim = selectedSimId ? pipeline.simulation.simulatedStates.find(s => s.id === selectedSimId) ?? null : null;
  const selectedCandidateId = lineage.selectedRawCandidateIds.find(id => candidateIds.includes(id)) ?? lineage.selectedRawCandidateIds[0] ?? null;
  const meta = selectedCandidateId ? built.candidates.find(c => c.id === selectedCandidateId)?.metadata ?? {} : built.candidates[0]?.metadata ?? {};
  const after = selectedSimId != null ? num(meta.expectedGapMinutesAfter) : null;
  const reduction = selectedSimId != null && after != null ? Math.max(0, before - after) : 0;
  const validationRejectReasons = invalid.reduce<Record<string, number>>((m, v) => { for (const r of v.violatedConstraints ?? []) m[r] = (m[r] ?? 0) + 1; return m; }, {});
  const discardedDetails = prefilter.discardedCandidates.map(d => ({ candidateId: d.candidateId, reason: d.reason, conflictingTaskIds: d.conflictingTaskIds ?? d.affectedTaskIds ?? [] }));
  return { summary: { executed: true, reason: selectedSimId ? "post_repair_swap_committed" : (built.summary.skippedReason ?? "no_valid_post_repair_swap"), mainZoneId: built.mainZoneContinuity.mainZoneId, mainZoneConfigured: true, sourceSimulationId: args.selectedRepairSimulation.id, sourceRepairCandidateId: str(repair.selectedCandidateId), generatedCandidateCount: built.candidates.length, candidateIds, prefilterAcceptedCount: prefilter.candidates.length, prefilterDiscardedCount: prefilter.discardedCandidates.length, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, selectedAsCommit: selectedSimId != null && reduction > 0, selectedCandidateId, selectedSimulatedStateId: selectedSimId, movedMainZoneTaskIds: arr<number>(meta.movedMainZoneTaskIds), movedBlockingTaskIds: arr<number>(meta.movedBlockingTaskIds), sharedResourceIds: arr<number>(meta.sharedResourceIds), mainZoneLargestGapBefore: before, mainZoneLargestGapAfter: after, mainZoneGapReductionMinutes: reduction, prefilterDiscardReasons: prefilter.summary.discardedByReason, prefilterDiscardDetails: discardedDetails, validationRejectReasons, warnings: reduction <= 0 && selectedSimId ? ["post_repair_swap_did_not_reduce_main_zone_gap"] : [], readOnly: true }, candidates: input.candidates, evidence: [...input.evidence, ...pipeline.evidence, ...pipeline.transformation.evidence, ...pipeline.simulation.evidence, ...pipeline.validation.evidence, ...pipeline.evaluation.evidence, ...pipeline.ranking.evidence, ...pipeline.commit.evidence], pipeline, decisionInputCandidates: input.candidates, partialPlans: partial.partialPlans, repairedState };
}
