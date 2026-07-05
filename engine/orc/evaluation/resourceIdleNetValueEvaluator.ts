import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { calculateOperationalPlanningQualityMetrics } from "../benchmark/operationalPlanningQualityMetrics";

export const ORC_RESOURCE_IDLE_NET_VALUE_CONTRACT_VERSION_ID234 = "ORC-RESOURCE-IDLE-NET-VALUE-ID234" as const;
export const RESOURCE_IDLE_NET_VALUE_REJECTION_REASON = "resource_idle_net_value_not_positive" as const;

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const nums = (v: unknown): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
const tm = (v: unknown): number | null => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? (()=>{ const [h,m]=v.split(":").map(Number); return h*60+m; })() : null;
function makespan(state: OperationalState | null | undefined): number | null { const ends=(state?.planning??[]).map((p:any)=>tm(p.endPlanned)).filter((v):v is number=>v!=null); return ends.length?Math.max(...ends):null; }
function assignments(state: OperationalState) { return (state.planning ?? []).map((p:any)=>({ taskId:p.taskId, startPlanned:p.startPlanned, endPlanned:p.endPlanned, assignedSpace:p.assignedSpace ?? p.spaceId ?? null, assignedResources:p.assignedResources ?? p.assignedResourceIds ?? [] })); }
function worstTalentDelta(before: Record<string, number>, after: Record<string, number>): number { return Math.max(0, ...[...new Set([...Object.keys(before), ...Object.keys(after)])].map(id => (after[id] ?? 0) - (before[id] ?? 0))); }

export interface ResourceIdleNetValueInput { originalState?: OperationalState | null; baseState: OperationalState; candidateState: OperationalState; baseSimulation?: SimulatedState | null; candidateSimulation?: SimulatedState | null; baseValidation?: ValidationResult | null; candidateValidation?: ValidationResult | null; basePlanningMaterialization?: Rec | null; candidatePlanningMaterialization?: Rec | null; selectedCandidateMetadata?: Rec | null; baseOverallScore?: number | null; candidateOverallScore?: number | null; opqmGateBypassedForBaselineRepair?: boolean | null; rawOpqmNotWorseThanV4?: boolean | null; }
export interface ResourceIdleNetValue { contractVersion: typeof ORC_RESOURCE_IDLE_NET_VALUE_CONTRACT_VERSION_ID234; baseSimulationId: string | null; candidateSimulationId: string | null; basePlanningKind: string | null; candidatePlanningKind: string | null; hardFeasibleBefore: boolean; hardFeasibleAfter: boolean; assignedSpaceContractBefore: boolean; assignedSpaceContractAfter: boolean; summaryContractBefore: boolean; summaryContractAfter: boolean; localGapReductionMinutes: number; resourceIdleDeltaMinutes: number; resourceFragmentationDelta: number; operationalCompactnessDelta: number; talentIdleWorstCaseDelta: number; mainFlowContinuityDelta: number; makespanDelta: number; baseCompositeOverallScore: number | null; resourceCompressionOverallScore: number | null; resourceCompressionScoreDelta: number | null; acceptedByNetValueGate: boolean; rejectionReason: string | null; readOnly: true; }
export interface ResourceIdleNetValueEvaluation { netValue: ResourceIdleNetValue; opqm: Rec; }

export function evaluateResourceIdleNetValue(input: ResourceIdleNetValueInput): ResourceIdleNetValueEvaluation {
  const md = input.selectedCandidateMetadata ?? {};
  const targetResourceId = num(md.targetResourceId);
  const beforeGap = num(md.idleGapMinutesBefore);
  const afterGap = num(md.expectedIdleGapMinutesAfter);
  const localGapReductionMinutes = Math.max(0, (beforeGap ?? 0) - (afterGap ?? 0));
  const before = calculateOperationalPlanningQualityMetrics(input.baseState as any, assignments(input.baseState));
  const after = calculateOperationalPlanningQualityMetrics(input.candidateState as any, assignments(input.candidateState));
  const rid = targetResourceId != null ? String(targetResourceId) : "";
  const resourceIdleDeltaMinutes = (after.resourceIdleTime[rid] ?? 0) - (before.resourceIdleTime[rid] ?? 0);
  const resourceFragmentationDelta = (after.resourceFragmentation[rid] ?? 0) - (before.resourceFragmentation[rid] ?? 0);
  const operationalCompactnessDelta = after.operationalCompactness - before.operationalCompactness;
  const talentIdleWorstCaseDelta = worstTalentDelta(before.talentIdleTime, after.talentIdleTime);
  const mainFlowContinuityDelta = after.mainFlowContinuityQuality.gaps - before.mainFlowContinuityQuality.gaps;
  const makespanDelta = (makespan(input.candidateState) ?? 0) - (makespan(input.baseState) ?? 0);
  const matB=input.basePlanningMaterialization ?? input.baseSimulation?.planningMaterialization as Rec | undefined;
  const matA=input.candidatePlanningMaterialization ?? input.candidateSimulation?.planningMaterialization as Rec | undefined;
  const scoreDelta = input.candidateOverallScore != null && input.baseOverallScore != null ? input.candidateOverallScore - input.baseOverallScore : null;
  const hardFeasibleBefore = input.baseValidation?.result !== "INVALID";
  const hardFeasibleAfter = input.candidateValidation?.result === "VALID" || input.candidateValidation == null;
  const assignedSpaceContractBefore = matB?.assignedSpaceContractValid !== false;
  const assignedSpaceContractAfter = matA?.assignedSpaceContractValid !== false;
  const summaryContractBefore = matB?.summaryContractValid !== false;
  const summaryContractAfter = matA?.summaryContractValid !== false;
  const structuralOk = hardFeasibleBefore && hardFeasibleAfter && assignedSpaceContractBefore && assignedSpaceContractAfter && summaryContractBefore && summaryContractAfter && localGapReductionMinutes > 0 && mainFlowContinuityDelta <= 0 && makespanDelta <= 0 && (scoreDelta == null || scoreDelta >= 0);
  const hasPositiveOpqm = resourceIdleDeltaMinutes < 0 || (resourceFragmentationDelta < 0 && operationalCompactnessDelta >= 0) || (num(md.resourceCompactnessGain) != null && num(md.resourceCompactnessGain)! > 0 && talentIdleWorstCaseDelta <= 0 && mainFlowContinuityDelta <= 0);
  const bypassMisuse = input.opqmGateBypassedForBaselineRepair === true && input.rawOpqmNotWorseThanV4 === false;
  const acceptedByNetValueGate = structuralOk && hasPositiveOpqm && !bypassMisuse;
  const netValue: ResourceIdleNetValue = { contractVersion: ORC_RESOURCE_IDLE_NET_VALUE_CONTRACT_VERSION_ID234, baseSimulationId: input.baseSimulation?.id ?? null, candidateSimulationId: input.candidateSimulation?.id ?? null, basePlanningKind: str(matB?.source) ?? null, candidatePlanningKind: str(matA?.source) ?? null, hardFeasibleBefore, hardFeasibleAfter, assignedSpaceContractBefore, assignedSpaceContractAfter, summaryContractBefore, summaryContractAfter, localGapReductionMinutes, resourceIdleDeltaMinutes, resourceFragmentationDelta, operationalCompactnessDelta, talentIdleWorstCaseDelta, mainFlowContinuityDelta, makespanDelta, baseCompositeOverallScore: input.baseOverallScore ?? null, resourceCompressionOverallScore: input.candidateOverallScore ?? null, resourceCompressionScoreDelta: scoreDelta, acceptedByNetValueGate, rejectionReason: acceptedByNetValueGate ? null : RESOURCE_IDLE_NET_VALUE_REJECTION_REASON, readOnly: true };
  return { netValue, opqm: { opqmResourceIdleBefore: before.resourceIdleTime[rid] ?? null, opqmResourceIdleAfter: after.resourceIdleTime[rid] ?? null, opqmResourceIdleDelta: resourceIdleDeltaMinutes, opqmResourceFragmentationBefore: before.resourceFragmentation[rid] ?? null, opqmResourceFragmentationAfter: after.resourceFragmentation[rid] ?? null, opqmResourceFragmentationDelta: resourceFragmentationDelta, opqmOperationalCompactnessBefore: before.operationalCompactness, opqmOperationalCompactnessAfter: after.operationalCompactness, opqmOperationalCompactnessDelta: operationalCompactnessDelta, opqmMainFlowContinuityBefore: before.mainFlowContinuityQuality.gaps, opqmMainFlowContinuityAfter: after.mainFlowContinuityQuality.gaps, opqmTalentIdleDeltaSummary: { worstCaseDelta: talentIdleWorstCaseDelta }, opqmNetValueVerdict: acceptedByNetValueGate ? "accepted" : RESOURCE_IDLE_NET_VALUE_REJECTION_REASON, targetResourceIdleBefore: before.resourceIdleTime[rid] ?? null, targetResourceIdleAfter: after.resourceIdleTime[rid] ?? null, targetResourceIdleReductionMinutes: Math.max(0, -resourceIdleDeltaMinutes), readOnly: true } };
}
