import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { auditProductionConceptAlignment, type ProductionConceptAlignmentAudit } from "../analysis/productionConceptAlignmentAudit";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics } from "../benchmark/operationalPlanningQualityMetrics";
import { changedTaskIdsBetweenPlanning } from "../active/validateCompositeMaterializationChangeSources";

export const ORC_MACRO_MAIN_ZONE_GLOBAL_NET_VALUE_CONTRACT_VERSION_ID241 = "ORC-MACRO-MAIN-ZONE-GLOBAL-NET-VALUE-ID241" as const;
export const ORC_MACRO_MAIN_ZONE_MATERIALIZATION_SOURCE_CONTRACT_VERSION_ID241 = "ORC-MACRO-MAIN-ZONE-MATERIALIZATION-SOURCE-ID241" as const;

export type MacroMainZoneGlobalRejectionReason =
  | "macro_global_visible_idle_not_reduced"
  | "macro_global_visible_idle_worse"
  | "macro_main_flow_fragmentation_worse"
  | "macro_operational_compactness_worse"
  | "macro_new_visible_gaps_offset_local_gain"
  | "macro_materialization_source_incomplete"
  | "macro_makespan_increase"
  | "macro_hard_feasibility_failed"
  | "macro_assigned_space_contract_failed";

export interface MacroMainZoneGlobalNetValue {
  contractVersion: typeof ORC_MACRO_MAIN_ZONE_GLOBAL_NET_VALUE_CONTRACT_VERSION_ID241;
  globalVisibleMainZoneIdleBefore: number;
  globalVisibleMainZoneIdleAfter: number;
  globalVisibleMainZoneIdleDelta: number;
  globalVisibleMainZoneGapCountBefore: number;
  globalVisibleMainZoneGapCountAfter: number;
  globalVisibleMainZoneGapCountDelta: number;
  largestVisibleMainZoneGapBefore: number;
  largestVisibleMainZoneGapAfter: number;
  largestVisibleMainZoneGapDelta: number;
  mainFlowContinuityQualityBefore: number;
  mainFlowContinuityQualityAfter: number;
  mainFlowContinuityQualityDelta: number;
  operationalCompactnessBefore: number;
  operationalCompactnessAfter: number;
  operationalCompactnessDelta: number;
  localTargetGapReductionMinutes: number;
  newVisibleGapsIntroduced: number;
  movedTaskIdsExplainedByMacroSource: boolean;
  macroMaterializationSourceComplete: boolean;
  changedTaskIds: number[];
  declaredMovedTaskIds: number[];
  inferredChangedTaskIds: number[];
  additionalChangedTaskIdsFromSimulationDiff: number[];
  acceptedByGlobalMacroValueGate: boolean;
  globalMacroRejectionReason: MacroMainZoneGlobalRejectionReason | null;
  rejectionReasons: MacroMainZoneGlobalRejectionReason[];
  readOnly: true;
}

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const nums = (v: unknown): number[] => Array.isArray(v) ? [...new Set(v.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b) : [];
const tm = (v: unknown): number | null => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? (() => { const [h,m]=v.split(":").map(Number); return h*60+m; })() : null;
function makespan(state?: OperationalState | null): number | null { const ends=(state?.planning??[]).map((p:any)=>tm(p.endPlanned)).filter((v):v is number=>v!=null); return ends.length?Math.max(...ends):null; }
function assignments(state: OperationalState) { return (state.planning ?? []).map((p:any)=>({ taskId:p.taskId, startPlanned:p.startPlanned, endPlanned:p.endPlanned, assignedSpace:p.assignedSpace ?? p.spaceId ?? null, assignedResources:p.assignedResources ?? p.assignedResourceIds ?? [] })); }
function alignment(state: OperationalState, provided?: ProductionConceptAlignmentAudit | Rec | null): ProductionConceptAlignmentAudit | Rec { return provided ?? auditProductionConceptAlignment({ operationalState: state, planningSource: "macro-main-zone-global-net-value-id241" }); }
function opqm(state: OperationalState, provided?: OperationalPlanningQualityMetrics | Rec | null): OperationalPlanningQualityMetrics | Rec { return provided ?? calculateOperationalPlanningQualityMetrics(state as any, assignments(state)); }

export function evaluateMacroMainZoneGlobalNetValue(input: { baseSimulation?: SimulatedState | null; candidateSimulation?: SimulatedState | null; baseState?: OperationalState | null; candidateState?: OperationalState | null; baseValidation?: ValidationResult | null; candidateValidation?: ValidationResult | null; productionConceptAlignmentBefore?: ProductionConceptAlignmentAudit | Rec | null; productionConceptAlignmentAfter?: ProductionConceptAlignmentAudit | Rec | null; opqmBefore?: OperationalPlanningQualityMetrics | Rec | null; opqmAfter?: OperationalPlanningQualityMetrics | Rec | null; candidateMetadata?: Rec | null; macroConfig?: Rec | null; macroMaterializationSourceComplete?: boolean | null; declaredMovedTaskIds?: number[] | null; changedTaskIds?: number[] | null; }): MacroMainZoneGlobalNetValue {
  const base = input.baseState ?? input.baseSimulation?.operationalStateSnapshot ?? null;
  const cand = input.candidateState ?? input.candidateSimulation?.operationalStateSnapshot ?? null;
  const md = input.candidateMetadata ?? {};
  const declaredMovedTaskIds = nums(input.declaredMovedTaskIds ?? md.movedTaskIds);
  const changedTaskIds = input.changedTaskIds ? nums(input.changedTaskIds) : changedTaskIdsBetweenPlanning(base, cand);
  const changedSet = new Set(changedTaskIds), declaredSet = new Set(declaredMovedTaskIds);
  const additional = changedTaskIds.filter(id => !declaredSet.has(id));
  const inferred = changedTaskIds;
  const macroMaterializationSourceComplete = input.macroMaterializationSourceComplete ?? changedTaskIds.every(id => declaredSet.has(id) || changedSet.has(id));
  const movedTaskIdsExplainedByMacroSource = declaredMovedTaskIds.every(id => changedSet.has(id) || declaredSet.has(id));
  const beforeAlign = base ? alignment(base, input.productionConceptAlignmentBefore) : {};
  const afterAlign = cand ? alignment(cand, input.productionConceptAlignmentAfter) : {};
  const beforeOpqm = base ? opqm(base, input.opqmBefore) : {};
  const afterOpqm = cand ? opqm(cand, input.opqmAfter) : {};
  const globalVisibleMainZoneIdleBefore = num((beforeAlign as any).totalVisibleMainZoneIdleMinutes) ?? 0;
  const globalVisibleMainZoneIdleAfter = num((afterAlign as any).totalVisibleMainZoneIdleMinutes) ?? 0;
  const beforeGaps = Array.isArray((beforeAlign as any).visibleMainZoneGaps) ? (beforeAlign as any).visibleMainZoneGaps.length : 0;
  const afterGaps = Array.isArray((afterAlign as any).visibleMainZoneGaps) ? (afterAlign as any).visibleMainZoneGaps.length : 0;
  const largestBefore = num((beforeAlign as any).largestVisibleMainZoneGapMinutes) ?? 0;
  const largestAfter = num((afterAlign as any).largestVisibleMainZoneGapMinutes) ?? 0;
  const mainFlowBefore = num((beforeOpqm as any).mainFlowContinuityQuality?.gaps) ?? beforeGaps;
  const mainFlowAfter = num((afterOpqm as any).mainFlowContinuityQuality?.gaps) ?? afterGaps;
  const compactBefore = num((beforeOpqm as any).operationalCompactness) ?? 0;
  const compactAfter = num((afterOpqm as any).operationalCompactness) ?? 0;
  const localBefore = num(md.targetGapMinutesBefore) ?? 0;
  const localAfter = num(md.expectedTargetGapMinutesAfter) ?? localBefore;
  const localTargetGapReductionMinutes = Math.max(0, localBefore - localAfter);
  const makespanDelta = (makespan(cand) ?? 0) - (makespan(base) ?? 0);
  const hardFeasibleAfter = input.candidateValidation?.result === "VALID" || input.candidateValidation == null;
  const assignedSpaceOk = (input.candidateSimulation?.planningMaterialization as any)?.assignedSpaceContractValid !== false;
  const rejectionReasons: MacroMainZoneGlobalRejectionReason[] = [];
  if (!hardFeasibleAfter) rejectionReasons.push("macro_hard_feasibility_failed");
  if (!assignedSpaceOk) rejectionReasons.push("macro_assigned_space_contract_failed");
  if (makespanDelta > 0) rejectionReasons.push("macro_makespan_increase");
  const idleDelta = globalVisibleMainZoneIdleAfter - globalVisibleMainZoneIdleBefore;
  if (idleDelta > 0) rejectionReasons.push("macro_global_visible_idle_worse");
  else if (idleDelta >= 0) rejectionReasons.push("macro_global_visible_idle_not_reduced");
  if (mainFlowAfter - mainFlowBefore > 0) rejectionReasons.push("macro_main_flow_fragmentation_worse");
  if (compactAfter - compactBefore < -0.000001) rejectionReasons.push("macro_operational_compactness_worse");
  const newVisibleGapsIntroduced = Math.max(0, afterGaps - beforeGaps);
  if (localTargetGapReductionMinutes > 0 && (newVisibleGapsIntroduced > 0 || idleDelta >= 0)) rejectionReasons.push("macro_new_visible_gaps_offset_local_gain");
  if (!macroMaterializationSourceComplete) rejectionReasons.push("macro_materialization_source_incomplete");
  const uniqueReasons = [...new Set(rejectionReasons)];
  return { contractVersion: ORC_MACRO_MAIN_ZONE_GLOBAL_NET_VALUE_CONTRACT_VERSION_ID241, globalVisibleMainZoneIdleBefore, globalVisibleMainZoneIdleAfter, globalVisibleMainZoneIdleDelta: idleDelta, globalVisibleMainZoneGapCountBefore: beforeGaps, globalVisibleMainZoneGapCountAfter: afterGaps, globalVisibleMainZoneGapCountDelta: afterGaps - beforeGaps, largestVisibleMainZoneGapBefore: largestBefore, largestVisibleMainZoneGapAfter: largestAfter, largestVisibleMainZoneGapDelta: largestAfter - largestBefore, mainFlowContinuityQualityBefore: mainFlowBefore, mainFlowContinuityQualityAfter: mainFlowAfter, mainFlowContinuityQualityDelta: mainFlowAfter - mainFlowBefore, operationalCompactnessBefore: compactBefore, operationalCompactnessAfter: compactAfter, operationalCompactnessDelta: compactAfter - compactBefore, localTargetGapReductionMinutes, newVisibleGapsIntroduced, movedTaskIdsExplainedByMacroSource, macroMaterializationSourceComplete, changedTaskIds, declaredMovedTaskIds, inferredChangedTaskIds: inferred, additionalChangedTaskIdsFromSimulationDiff: additional, acceptedByGlobalMacroValueGate: uniqueReasons.length === 0, globalMacroRejectionReason: uniqueReasons[0] ?? null, rejectionReasons: uniqueReasons, readOnly: true };
}
