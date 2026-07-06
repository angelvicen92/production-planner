import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { auditProductionConceptAlignment, type ProductionConceptAlignmentAudit } from "../analysis/productionConceptAlignmentAudit";
import { calculateOperationalPlanningQualityMetrics, type OperationalPlanningQualityMetrics } from "../benchmark/operationalPlanningQualityMetrics";
import { changedTaskIdsBetweenPlanning } from "../active/validateCompositeMaterializationChangeSources";

export const ORC_MACRO_MAIN_ZONE_GLOBAL_NET_VALUE_CONTRACT_VERSION_ID241 = "ORC-MACRO-MAIN-ZONE-GLOBAL-NET-VALUE-ID241" as const;
export const ORC_MACRO_MAIN_ZONE_MATERIALIZATION_SOURCE_CONTRACT_VERSION_ID241 = "ORC-MACRO-MAIN-ZONE-MATERIALIZATION-SOURCE-ID241" as const;
export const ORC_MACRO_MAIN_ZONE_DOMINANCE_GATE_CONTRACT_VERSION_ID243 = "ORC-MACRO-MAIN-ZONE-DOMINANCE-GATE-ID243" as const;
export const ORC_MACRO_MAIN_ZONE_SUFFIX_SUMMARY_CONSISTENCY_CONTRACT_VERSION_ID243 = "ORC-MACRO-MAIN-ZONE-SUFFIX-SUMMARY-CONSISTENCY-ID243" as const;

export type MacroMainZoneGlobalRejectionReason =
  | "macro_global_visible_idle_not_reduced"
  | "macro_global_visible_idle_worse"
  | "macro_main_flow_fragmentation_worse"
  | "macro_operational_compactness_worse"
  | "macro_main_zone_idle_reduction_below_dominance_threshold"
  | "macro_main_zone_new_gap_count_exceeded"
  | "macro_operational_compactness_worse_beyond_threshold"
  | "macro_talent_wait_worse_beyond_threshold"
  | "macro_resource_idle_worse_beyond_threshold"
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
  dominanceGate: Record<string, unknown>;
  primaryMainZoneGain: Record<string, unknown>;
  secondaryMetricImpact: Record<string, unknown>;
  acceptedByDominanceGate: boolean;
  dominanceGateReason: string | null;
  dominanceGateWarnings: string[];
  secondaryRegressionsAllowedByDominance: string[];
  secondaryRegressionsBlocking: string[];
  mainFlowContinuityMetricSemantics: Record<string, unknown>;
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
function cfg(input: Rec | null | undefined, key: string, fallback: number | boolean): any {
  const bags=[input,(input as any)?.constraints?.optimizer,(input as any)?.optimizer,(input as any)?.optimizerWeights,(input as any)?.operationalPolicy,(input as any)?.engineConfig,(input as any)?.planningSettings].filter(Boolean) as Rec[];
  for (const b of bags) { const v=(b as any)[key]; if (typeof fallback === "boolean" ? typeof v === "boolean" : typeof v === "number" && Number.isFinite(v)) return v; }
  return fallback;
}

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
  const cfgIn = input.macroConfig ?? {};
  const dominantIdleMinutes = cfg(cfgIn, "macroMainZoneDominantIdleReductionMinutes", 30);
  const dominantIdleRatio = cfg(cfgIn, "macroMainZoneDominantIdleReductionRatio", 0.33);
  const maxCompactDrop = cfg(cfgIn, "macroMainZoneMaxAllowedCompactnessDrop", 0.08);
  const maxTalentWait = cfg(cfgIn, "macroMainZoneMaxAllowedTalentWaitWorstCaseIncreaseMinutes", 45);
  const maxResourceIdle = cfg(cfgIn, "macroMainZoneMaxAllowedResourceIdleIncreaseMinutes", 45);
  const allowedGapIncrease = cfg(cfgIn, "macroMainZoneAllowedGapCountIncrease", 0);
  const maxNewGaps = cfg(cfgIn, "macroMainZoneMaxNewGapCount", 1);
  const allowCompactDrop = cfg(cfgIn, "macroMainZoneDominanceAllowsSecondaryCompactnessDrop", true);
  const rejectionReasons: MacroMainZoneGlobalRejectionReason[] = [];
  const dominanceWarnings: string[] = [];
  const allowedSecondary: string[] = [];
  const blockingSecondary: string[] = [];
  if (!hardFeasibleAfter) rejectionReasons.push("macro_hard_feasibility_failed");
  if (!assignedSpaceOk) rejectionReasons.push("macro_assigned_space_contract_failed");
  if (makespanDelta > 0) rejectionReasons.push("macro_makespan_increase");
  const idleDelta = globalVisibleMainZoneIdleAfter - globalVisibleMainZoneIdleBefore;
  const idleReduction = -idleDelta;
  const ratioOk = globalVisibleMainZoneIdleBefore <= 0 || idleReduction / globalVisibleMainZoneIdleBefore >= dominantIdleRatio;
  const dominantPrimary = idleDelta < 0 && idleReduction >= dominantIdleMinutes && ratioOk && largestAfter < largestBefore && afterGaps <= beforeGaps + allowedGapIncrease;
  const newVisibleGapsIntroduced = Math.max(0, afterGaps - beforeGaps);
  if (idleDelta > 0) rejectionReasons.push("macro_global_visible_idle_worse");
  else if (idleDelta >= 0) rejectionReasons.push("macro_global_visible_idle_not_reduced");
  if (!dominantPrimary) rejectionReasons.push("macro_main_zone_idle_reduction_below_dominance_threshold");
  if (newVisibleGapsIntroduced > maxNewGaps || afterGaps > beforeGaps + allowedGapIncrease) rejectionReasons.push("macro_main_zone_new_gap_count_exceeded");
  const rawDelta = mainFlowAfter - mainFlowBefore;
  const primaryClearlyImproves = idleReduction >= dominantIdleMinutes && largestAfter < largestBefore && newVisibleGapsIntroduced === 0 && afterGaps <= beforeGaps;
  const mainFlowAmbiguous = rawDelta > 0 && primaryClearlyImproves;
  if (mainFlowAmbiguous) dominanceWarnings.push("macro_main_flow_continuity_raw_metric_ambiguous");
  else if (rawDelta > 0) rejectionReasons.push("macro_main_flow_fragmentation_worse");
  const compactDelta = compactAfter - compactBefore;
  if (compactDelta < -0.000001) {
    if (allowCompactDrop && Math.abs(compactDelta) <= maxCompactDrop && dominantPrimary) {
      dominanceWarnings.push("macro_operational_compactness_regression_allowed_by_main_zone_dominance");
      allowedSecondary.push("operationalCompactness");
    } else { rejectionReasons.push("macro_operational_compactness_worse_beyond_threshold"); blockingSecondary.push("operationalCompactness"); }
  }
  const talentWaitWorst = num((afterOpqm as any).talentWaitDeltaSummary?.worstCaseIncreaseMinutes ?? (md as any).talentWaitWorstCaseIncreaseMinutes) ?? 0;
  if (talentWaitWorst > maxTalentWait) { rejectionReasons.push("macro_talent_wait_worse_beyond_threshold"); blockingSecondary.push("talentWait"); }
  else if (talentWaitWorst > 0) { dominanceWarnings.push("macro_release_wave_recommended_after_main_zone_compaction"); allowedSecondary.push("talentWait"); }
  const resourceIdleIncrease = num((afterOpqm as any).resourceIdleDeltaSummary?.increaseMinutes ?? (md as any).resourceIdleIncreaseMinutes) ?? 0;
  if (resourceIdleIncrease > maxResourceIdle) { rejectionReasons.push("macro_resource_idle_worse_beyond_threshold"); blockingSecondary.push("resourceIdle"); }
  if (localTargetGapReductionMinutes > 0 && (newVisibleGapsIntroduced > maxNewGaps || idleDelta >= 0)) rejectionReasons.push("macro_new_visible_gaps_offset_local_gain");
  if (!macroMaterializationSourceComplete) rejectionReasons.push("macro_materialization_source_incomplete");
  const uniqueReasons = [...new Set(rejectionReasons)];
  const positiveReasons = [idleDelta < 0 ? "macro_main_zone_dominant_visible_idle_reduction" : null, largestAfter < largestBefore ? "macro_main_zone_largest_gap_reduced" : null, newVisibleGapsIntroduced === 0 ? "macro_main_zone_no_new_visible_gaps" : null, blockingSecondary.length === 0 ? "macro_secondary_regressions_within_threshold" : null].filter(Boolean) as string[];
  const accepted = uniqueReasons.length === 0;
  const mainFlowContinuityMetricSemantics = { rawBefore: mainFlowBefore, rawAfter: mainFlowAfter, rawDelta, interpretation: mainFlowAmbiguous ? "ambiguous_not_gate_blocking" : "lower_is_better", normalizedBefore: mainFlowBefore, normalizedAfter: mainFlowAfter, normalizedDelta: rawDelta, usedForGate: !mainFlowAmbiguous, gateRole: mainFlowAmbiguous ? "diagnostic_warning_only" : "secondary_metric" };
  const primaryMainZoneGain = { globalVisibleMainZoneIdleBefore, globalVisibleMainZoneIdleAfter, globalVisibleMainZoneIdleDelta: idleDelta, largestVisibleMainZoneGapBefore: largestBefore, largestVisibleMainZoneGapAfter: largestAfter, largestVisibleMainZoneGapDelta: largestAfter - largestBefore, globalVisibleMainZoneGapCountBefore: beforeGaps, globalVisibleMainZoneGapCountAfter: afterGaps, newVisibleGapsIntroduced, mainZoneProductiveMinutesMovedEarlier: localTargetGapReductionMinutes, readOnly: true };
  const secondaryMetricImpact = { operationalCompactnessBefore: compactBefore, operationalCompactnessAfter: compactAfter, operationalCompactnessDelta: compactDelta, mainFlowContinuityMetricSemantics, talentWaitWorstCaseIncreaseMinutes: talentWaitWorst, resourceIdleIncreaseMinutes: resourceIdleIncrease, coachSwitchDelta: num((md as any).coachSwitchDelta) ?? null, readOnly: true };
  const dominanceGate = { contractVersion: ORC_MACRO_MAIN_ZONE_DOMINANCE_GATE_CONTRACT_VERSION_ID243, config: { macroMainZoneDominantIdleReductionMinutes: dominantIdleMinutes, macroMainZoneDominantIdleReductionRatio: dominantIdleRatio, macroMainZoneMaxAllowedCompactnessDrop: maxCompactDrop, macroMainZoneMaxAllowedTalentWaitWorstCaseIncreaseMinutes: maxTalentWait, macroMainZoneMaxAllowedResourceIdleIncreaseMinutes: maxResourceIdle, macroMainZoneAllowedGapCountIncrease: allowedGapIncrease, macroMainZoneMaxNewGapCount: maxNewGaps, macroMainZoneDominanceAllowsSecondaryCompactnessDrop: allowCompactDrop, readOnly: true }, primaryMainZoneGain, secondaryMetricImpact, positiveReasons, blockers: uniqueReasons, warnings: [...new Set(dominanceWarnings)], acceptedByDominanceGate: accepted, readOnly: true };
  return { contractVersion: ORC_MACRO_MAIN_ZONE_GLOBAL_NET_VALUE_CONTRACT_VERSION_ID241, globalVisibleMainZoneIdleBefore, globalVisibleMainZoneIdleAfter, globalVisibleMainZoneIdleDelta: idleDelta, globalVisibleMainZoneGapCountBefore: beforeGaps, globalVisibleMainZoneGapCountAfter: afterGaps, globalVisibleMainZoneGapCountDelta: afterGaps - beforeGaps, largestVisibleMainZoneGapBefore: largestBefore, largestVisibleMainZoneGapAfter: largestAfter, largestVisibleMainZoneGapDelta: largestAfter - largestBefore, mainFlowContinuityQualityBefore: mainFlowBefore, mainFlowContinuityQualityAfter: mainFlowAfter, mainFlowContinuityQualityDelta: rawDelta, operationalCompactnessBefore: compactBefore, operationalCompactnessAfter: compactAfter, operationalCompactnessDelta: compactDelta, localTargetGapReductionMinutes, newVisibleGapsIntroduced, movedTaskIdsExplainedByMacroSource, macroMaterializationSourceComplete, changedTaskIds, declaredMovedTaskIds, inferredChangedTaskIds: inferred, additionalChangedTaskIdsFromSimulationDiff: additional, dominanceGate, primaryMainZoneGain, secondaryMetricImpact, acceptedByDominanceGate: accepted, dominanceGateReason: accepted ? "macro_main_zone_dominant_visible_idle_reduction" : uniqueReasons[0] ?? null, dominanceGateWarnings: [...new Set(dominanceWarnings)], secondaryRegressionsAllowedByDominance: [...new Set(allowedSecondary)], secondaryRegressionsBlocking: [...new Set(blockingSecondary)], mainFlowContinuityMetricSemantics, acceptedByGlobalMacroValueGate: accepted, globalMacroRejectionReason: uniqueReasons[0] ?? null, rejectionReasons: uniqueReasons, readOnly: true };
}
