import type { Candidate, Evidence, OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { resolveCandidateLineage } from "../decision/candidateLineage";
import { buildCriticalResourceIdleCompressionCandidates, type CriticalResourceIdleCompressionSummary } from "../see/criticalResourceIdleCompressionCandidateBuilder";
import { prefilterCandidatesByHardConstraints } from "../see/candidateHardPrefilter";
import { composePartialPlans } from "../see/partialPlanComposer";

export const ORC_POST_CONTINUITY_RESOURCE_IDLE_PASS_VERSION_ID231 = "ORC-POST-CONTINUITY-RESOURCE-IDLE-PASS-ID231" as const;
export const ORC_RESOURCE_IDLE_COMPOSITE_SELECTION_POLICY_ID231 = "valid-committed-continuity-and-resource-compactness-first-v2" as const;

export type CriticalResourceIdleCompressionExecutionPhase = "initial-pass" | "post-continuity-pass" | "not-executed";
export type CriticalResourceIdleCompressionPassSummary = CriticalResourceIdleCompressionSummary & {
  readonly executionPhase: CriticalResourceIdleCompressionExecutionPhase;
  readonly sourceSimulationId: string | null;
  readonly sourcePlanningKind: string | null;
  readonly lineage: Record<string, unknown>;
  readonly validationRejectReasons: string[];
};

export interface CriticalResourceIdleCompressionPassResult {
  summary: CriticalResourceIdleCompressionPassSummary;
  candidates: Candidate[];
  evidence: Evidence[];
  pipeline: ReturnType<typeof executeDecisionPipeline> | null;
  decisionInputCandidates: Candidate[];
  partialPlans: ReturnType<typeof composePartialPlans>["partialPlans"];
  selectedSimulation: SimulatedState | null;
  selectedValidation: ValidationResult | null;
  baseState: OperationalState | null;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const nums = (v: unknown): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const tm = (v: unknown): number | null => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? (()=>{ const [h,m]=v.split(":").map(Number); return h*60+m; })() : null;

function makespan(state: OperationalState | null | undefined): number | null {
  const ends = (state?.planning ?? []).map((p) => tm(p.endPlanned)).filter((v): v is number => v != null);
  return ends.length ? Math.max(...ends) : null;
}
function empty(reason: string, extra: Partial<CriticalResourceIdleCompressionPassSummary> = {}): CriticalResourceIdleCompressionPassResult {
  const base = buildCriticalResourceIdleCompressionCandidates(null).summary;
  return { summary: { ...base, executed: false, reason, executionPhase: "not-executed", sourceSimulationId: null, sourcePlanningKind: null, candidateGenerationBlockers: [reason], lineage: { rawCandidateIds: [], syntheticCandidateIds: [], partialPlanIds: [], candidateStateIds: [], simulatedStateIds: [], committedSimulatedStateIds: [], readOnly: true }, readOnly: true, ...extra }, candidates: [], evidence: [], pipeline: null, decisionInputCandidates: [], partialPlans: [], selectedSimulation: null, selectedValidation: null, baseState: null };
}
function changedIds(a: OperationalState | null | undefined, b: OperationalState | null | undefined): number[] {
  const fp = (e: any) => JSON.stringify({ taskId: e.taskId, startPlanned: e.startPlanned, endPlanned: e.endPlanned, spaceId: e.spaceId ?? null, assignedResourceIds: [...(e.assignedResourceIds ?? [])].sort((x:number,y:number)=>x-y) });
  const am = new Map((a?.planning ?? []).map((e: any) => [Number(e.taskId), fp(e)]));
  const bm = new Map((b?.planning ?? []).map((e: any) => [Number(e.taskId), fp(e)]));
  return [...new Set([...am.keys(), ...bm.keys()].filter(Number.isFinite).filter((id) => am.get(id) !== bm.get(id)))].sort((x,y)=>x-y);
}
function withCompositeMaterialization(sim: SimulatedState, original: OperationalState, base: OperationalState, baseMat: Rec | null, selectedCandidate: Candidate | null): SimulatedState {
  const final = sim.operationalStateSnapshot as OperationalState;
  const moved = nums(selectedCandidate?.metadata?.movedTaskIds);
  const fromOriginal = changedIds(original, final);
  const fromBase = changedIds(base, final);
  return { ...sim, planningMaterialization: { ...(sim.planningMaterialization ?? {}), ...(baseMat ?? {}), source: "candidate_transformations", changedTaskCount: fromOriginal.length, changedTaskIds: fromOriginal, changedTaskCountFromOriginalBaseline: fromOriginal.length, changedTaskIdsFromOriginalBaseline: fromOriginal, changedTaskCountFromRepairedBaseline: nums(baseMat?.changedTaskIdsFromRepairedBaseline).length || fromOriginal.length, changedTaskIdsFromRepairedBaseline: nums(baseMat?.changedTaskIdsFromRepairedBaseline).length ? nums(baseMat?.changedTaskIdsFromRepairedBaseline) : fromOriginal, changedTaskCountFromPostRepairContinuityBaseline: fromBase.length, changedTaskIdsFromPostRepairContinuityBaseline: fromBase, changeSources: { ...(isRec(baseMat?.changeSources) ? baseMat?.changeSources as Rec : {}), criticalResourceIdleCompression: { changedTaskCount: moved.length || fromBase.length, changedTaskIds: moved.length ? moved : fromBase, readOnly: true } }, compositeTransformationsApplied: [...(Array.isArray(baseMat?.compositeTransformationsApplied) ? (baseMat?.compositeTransformationsApplied as unknown[]).map(String) : []), "critical-resource-idle-compression"].filter((v,i,a)=>a.indexOf(v)===i), readOnly: true } } as SimulatedState;
}

export function runCriticalResourceIdleCompressionPass(args: { originalState: OperationalState; baseSimulation: SimulatedState | null; baseValidation: ValidationResult | null; basePlanningMaterialization?: Rec | null; mainZoneContinuity?: Rec | null; postRepairMainZoneContinuityPass?: Rec | null; criticalResourceIdleCompressionSummaryFromInitialPass?: Rec | null; createdAt?: string | null; budget?: { maxCandidates?: number } }): CriticalResourceIdleCompressionPassResult {
  if (!args.baseSimulation) return empty("base_simulation_missing");
  if (args.baseValidation?.result !== "VALID") return empty("base_plan_hard_infeasible", { sourceSimulationId: args.baseSimulation.id });
  const mat = (args.basePlanningMaterialization ?? args.baseSimulation.planningMaterialization ?? {}) as Rec;
  if (mat.assignedSpaceContractValid === false || (num(mat.missingAssignedSpaceFieldCount) ?? 0) > 0) return empty("assigned_space_contract_invalid", { sourceSimulationId: args.baseSimulation.id });
  if (mat.summaryContractValid === false || args.mainZoneContinuity?.configured !== true) return empty(args.mainZoneContinuity?.configured !== true ? "main_zone_not_configured" : "summary_contract_invalid", { sourceSimulationId: args.baseSimulation.id });
  if (args.postRepairMainZoneContinuityPass && args.postRepairMainZoneContinuityPass.executed === true && args.postRepairMainZoneContinuityPass.selectedAsCommit !== true) return empty("post_repair_main_zone_continuity_not_selected", { sourceSimulationId: args.baseSimulation.id });
  if ((mat.source === "baseline_seed_preserved" || (num(mat.changedTaskCount) ?? 0) === 0) && args.baseValidation.violatedConstraints.length > 0) return empty("base_plan_hard_infeasible", { sourceSimulationId: args.baseSimulation.id });

  const baseState = args.postRepairMainZoneContinuityPass?.selectedAsCommit === true ? args.baseSimulation.operationalStateSnapshot as OperationalState : args.baseSimulation.operationalStateSnapshot as OperationalState;
  const built = buildCriticalResourceIdleCompressionCandidates(baseState, args.createdAt ?? null);
  const prefilter = prefilterCandidatesByHardConstraints(built.candidates, baseState, { createdAt: args.createdAt ?? null });
  const partial = composePartialPlans(prefilter.candidates, { createdAt: args.createdAt ?? null });
  const input = buildDecisionInput({ candidates: prefilter.candidates, evidence: [...built.evidence, ...prefilter.evidence, ...partial.evidence], partialPlans: partial.partialPlans, summary: { searchSpaceCount: 0, candidateCount: prefilter.candidates.length } } as any);
  const pipeline = executeDecisionPipeline({ ...input, operationalState: baseState, createdAt: args.createdAt ?? null });
  const rankedBest = pipeline.ranking.rankedOperationalValues[0]?.simulatedStateId ?? null;
  const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(built.candidates.map(c=>c.id)), decisionInputCandidates: input.candidates, candidateStates: pipeline.transformation.candidateStates, simulatedStates: pipeline.simulation.simulatedStates, operationalValues: pipeline.ranking.rankedOperationalValues, commitDecisions: pipeline.commit.commitDecisions, partialPlans: partial.partialPlans, rankedBestSimulatedStateId: rankedBest });
  const simIds = new Set(lineage.simulatedStateIds);
  const valid = pipeline.validation.validationResults.filter(v => simIds.has(v.simulatedStateId) && v.result === "VALID");
  const invalid = pipeline.validation.validationResults.filter(v => simIds.has(v.simulatedStateId) && v.result === "INVALID");
  const selectedSimId = lineage.committedSimulatedStateIds.find(id => valid.some(v => v.simulatedStateId === id)) ?? null;
  const rawSelected = selectedSimId ? pipeline.simulation.simulatedStates.find(s=>s.id===selectedSimId) ?? null : null;
  const selectedCandidateId = lineage.selectedRawCandidateIds.find(id => built.candidates.some(c=>c.id===id)) ?? null;
  const selectedCandidate = selectedCandidateId ? built.candidates.find(c=>c.id===selectedCandidateId) ?? null : null;
  const md = selectedCandidate?.metadata ?? built.candidates[0]?.metadata ?? {};
  const before = num(md.idleGapMinutesBefore) ?? built.summary.targetGapBeforeMinutes;
  const after = num(md.expectedIdleGapMinutesAfter) ?? built.summary.targetGapAfterMinutes;
  const reduction = before != null && after != null ? Math.max(0, before - after) : (num(md.resourceIdleReductionMinutes) ?? 0);
  const beforeSpan = makespan(baseState);
  const afterSpan = makespan(rawSelected?.operationalStateSnapshot as OperationalState | null);
  const commitOk = rawSelected != null && reduction > 0 && (afterSpan == null || beforeSpan == null || afterSpan <= beforeSpan);
  const selectedSimulation = commitOk ? withCompositeMaterialization(rawSelected!, args.originalState, baseState, mat, selectedCandidate) : null;
  const selectedValidation = commitOk && selectedSimId ? valid.find(v=>v.simulatedStateId===selectedSimId) ?? null : null;
  const discardDetails = prefilter.discardedCandidates.map(d => ({ candidateId: d.candidateId, reason: d.reason, conflictingTaskIds: (d as any).conflictingTaskIds ?? (d as any).affectedTaskIds ?? [] }));
  return { summary: { ...built.summary, executed: true, reason: commitOk ? "post_continuity_resource_idle_compression_committed" : (built.summary.reason ?? (built.candidates.length ? "no_valid_resource_idle_compression" : "no_resource_idle_compression_candidate")), executionPhase: "post-continuity-pass", sourceSimulationId: args.baseSimulation.id, sourcePlanningKind: str(mat.source) ?? "candidate_transformations", generatedCandidateCount: built.candidates.length, candidateIds: built.candidates.map(c=>c.id), prefilterAcceptedCount: prefilter.candidates.length, prefilterDiscardedCount: prefilter.discardedCandidates.length, candidateStateCount: lineage.candidateStateIds.length, simulatedStateCount: lineage.simulatedStateIds.length, validSimulationCount: valid.length, invalidSimulationCount: invalid.length, selectedAsCommit: commitOk, selectedCandidateId, selectedSimulatedStateId: commitOk ? selectedSimId : null, movedTaskIds: nums(md.movedTaskIds), targetResourceId: num(md.targetResourceId) ?? built.summary.targetResourceId, targetGapBeforeMinutes: before, targetGapAfterMinutes: after, targetResourceIdleReductionMinutes: commitOk ? reduction : 0, mainZoneContinuityPreserved: commitOk, makespanBefore: beforeSpan, makespanAfter: afterSpan, prefilterDiscardReasons: prefilter.summary.discardedByReason, prefilterDiscardDetails: discardDetails, validationRejectReasons: [...new Set(invalid.flatMap(v=>v.violatedConstraints))], warnings: commitOk ? [] : (built.candidates.length ? ["no_valid_post_continuity_resource_idle_compression_commit"] : []), lineage: { rawCandidateIds: lineage.rawCandidateIds, syntheticCandidateIds: lineage.syntheticCandidateIds, partialPlanIds: lineage.partialPlanIds, candidateStateIds: lineage.candidateStateIds, simulatedStateIds: lineage.simulatedStateIds, committedSimulatedStateIds: commitOk && selectedSimId ? [selectedSimId] : [], readOnly: true }, readOnly: true }, candidates: input.candidates, evidence: [...input.evidence, ...pipeline.evidence, ...pipeline.transformation.evidence, ...pipeline.simulation.evidence, ...pipeline.validation.evidence, ...pipeline.evaluation.evidence, ...pipeline.ranking.evidence, ...pipeline.commit.evidence], pipeline, decisionInputCandidates: input.candidates, partialPlans: partial.partialPlans, selectedSimulation, selectedValidation, baseState };
}
