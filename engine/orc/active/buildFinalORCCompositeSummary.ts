import type { OperationalState, SimulatedState } from "../contracts";
import { buildMainZoneGapResourceBlockSwapCandidates } from "../see/mainZoneGapResourceBlockSwapCandidateBuilder";

export const ORC_COMPOSITE_SUMMARY_CONTRACT_VERSION_ID229 = "ORC-COMPOSITE-SUMMARY-ID229" as const;
export const ORC_COMPOSITE_MATERIALIZATION_CONTRACT_VERSION_ID229 = "ORC-COMPOSITE-MATERIALIZATION-ID229" as const;
export const ORC_FINAL_MAIN_ZONE_CONTINUITY_CONTRACT_VERSION_ID229 = "ORC-FINAL-MAIN-ZONE-CONTINUITY-ID229" as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const nums = (v: unknown): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite).sort((a,b)=>a-b) : [];
const str = (v: unknown): string | null => typeof v === "string" ? v : null;

function fp(e: any): string { return JSON.stringify({ taskId: e.taskId, startPlanned: e.startPlanned, endPlanned: e.endPlanned, spaceId: e.spaceId ?? e.assignedSpace ?? null, assignedResourceIds: [...(e.assignedResourceIds ?? e.assignedResources ?? [])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b) }); }
function changedIds(from?: OperationalState | null, to?: OperationalState | null): number[] {
  const a = new Map((from?.planning ?? []).map((e: any) => [Number(e.taskId), fp(e)]));
  const b = new Map((to?.planning ?? []).map((e: any) => [Number(e.taskId), fp(e)]));
  return [...new Set([...a.keys(), ...b.keys()].filter(Number.isFinite).filter((id) => a.get(id) !== b.get(id)))].sort((x,y)=>x-y);
}

function targeted(summary: Rec): Rec {
  const before = typeof summary.targetedGapBeforeMinutes === "number" ? summary.targetedGapBeforeMinutes : (typeof summary.mainZoneGapReductionMinutes === "number" && typeof summary.mainZoneLargestGapBefore === "number" ? summary.mainZoneLargestGapBefore : summary.gapMinutesBefore ?? null);
  const after = typeof summary.targetedGapAfterMinutes === "number" ? summary.targetedGapAfterMinutes : (summary.mainZoneLargestGapAfter ?? summary.expectedGapMinutesAfter ?? null);
  const reduction = typeof summary.targetedGapReductionMinutes === "number" ? summary.targetedGapReductionMinutes : (typeof before === "number" && typeof after === "number" ? Math.max(0, before - after) : (summary.mainZoneGapReductionMinutes ?? 0));
  return { targetedGapBeforeMinutes: before, targetedGapAfterMinutes: after, targetedGapReductionMinutes: reduction, targetedGapPreviousTaskId: summary.targetedGapPreviousTaskId ?? null, targetedGapNextTaskId: summary.targetedGapNextTaskId ?? null, targetedGapWindowBefore: summary.targetedGapWindowBefore ?? null, targetedGapWindowAfter: summary.targetedGapWindowAfter ?? null, continuityMetricScope: "targeted-gap", mainZoneGapReductionMinutes: reduction };
}

export function buildFinalORCCompositeSummary(args: { originalState?: OperationalState | null; repairedState?: OperationalState | null; selectedSimulation?: SimulatedState | null; initialMainZoneContinuity?: Rec | null; mainZoneGapResourceBlockSwap?: Rec | null; postRepairMainZoneContinuityPass?: Rec | null; simulationSelection?: Rec | null; criticalResourceIdleCompression?: Rec | null; planningMaterialization?: Rec | null }): { mainZoneContinuity: Rec; mainZoneGapResourceBlockSwap: Rec; postRepairMainZoneContinuityPass: Rec; criticalResourceIdleCompression: Rec; planningMaterialization: Rec; summaryContractValid: boolean; summaryContractWarnings: string[]; finalSummaryBuiltFromSelectedSimulation: boolean } {
  const finalState = args.selectedSimulation?.operationalStateSnapshot ?? null;
  const selectedPost = isRec(args.postRepairMainZoneContinuityPass) && args.postRepairMainZoneContinuityPass.selectedAsCommit === true;
  const selectedSwap = isRec(args.mainZoneGapResourceBlockSwap) && args.mainZoneGapResourceBlockSwap.selectedAsCommit === true;
  const selectedIdle = isRec(args.criticalResourceIdleCompression) && args.criticalResourceIdleCompression.selectedAsCommit === true;
  const built = finalState ? buildMainZoneGapResourceBlockSwapCandidates(finalState) : null;
  const baseContinuity = built?.mainZoneContinuity ?? args.initialMainZoneContinuity ?? {};
  const finalGaps = Array.isArray((baseContinuity as any).gaps) ? [...(baseContinuity as any).gaps] : [];
  const mainZoneContinuity: Rec = {
    ...baseContinuity,
    summaryScope: "final-selected-planning",
    resolutionSource: selectedIdle || selectedPost || selectedSwap ? "selected-composite-simulation" : "selected-simulation",
    selectedSimulatedStateId: args.selectedSimulation?.id ?? null,
    selectedCandidateId: str(args.postRepairMainZoneContinuityPass?.selectedCandidateId) ?? str(args.mainZoneGapResourceBlockSwap?.selectedCandidateId),
    finalPlanningSource: selectedIdle ? "critical-resource-idle-compression" : selectedPost ? "post-repair-main-zone-continuity" : "selected-orc-simulation",
    finalMainZoneGapCount: finalGaps.length,
    finalLargestMainZoneGapMinutes: finalGaps.reduce((m, g: any) => Math.max(m, Number(g.gapMinutes ?? 0)), 0),
    finalGaps,
    gapComputationScope: "final-selected-planning",
    gapExclusionPolicy: "exclude-hard-break-covered-gaps-only",
    breakCoveragePolicy: "hard-breaks-cover-gaps;flexible-meal-windows-require-placeholder",
    readOnly: true,
  };
  const warnings: string[] = [];
  if ((selectedIdle || selectedPost || selectedSwap) && mainZoneContinuity.configured === false) warnings.push("main_zone_final_summary_inconsistent_with_selected_commit");
  if (selectedPost && args.simulationSelection && str(args.simulationSelection.selectedSimulatedStateId) != null && str(args.simulationSelection.selectedSimulatedStateId) !== str(args.postRepairMainZoneContinuityPass?.selectedSimulatedStateId)) warnings.push("post_repair_commit_not_reflected_in_simulation_selection");

  const fromOriginal = changedIds(args.originalState, finalState);
  const fromRepaired = changedIds(args.repairedState ?? null, finalState);
  const repairIds = nums(args.mainZoneGapResourceBlockSwap?.baselineRepairChangedTaskIds).length ? nums(args.mainZoneGapResourceBlockSwap?.baselineRepairChangedTaskIds) : changedIds(args.originalState, args.repairedState ?? null);
  const postIds = [...new Set([...nums(args.postRepairMainZoneContinuityPass?.movedMainZoneTaskIds), ...nums(args.postRepairMainZoneContinuityPass?.movedBlockingTaskIds)])].sort((a,b)=>a-b);
  const idleIds = nums(args.criticalResourceIdleCompression?.movedTaskIds);
  const compositeSelected = selectedIdle || selectedPost || selectedSwap;
  const effectiveChangedIds = compositeSelected ? fromOriginal : nums(args.planningMaterialization?.changedTaskIds);
  const effectiveChangedCount = compositeSelected ? fromOriginal.length : Number(args.planningMaterialization?.changedTaskCount ?? effectiveChangedIds.length);
  const planningMaterialization: Rec = { ...(args.planningMaterialization ?? {}), changedTaskCount: effectiveChangedCount, changedTaskIds: effectiveChangedIds, changedTaskCountFromOriginalBaseline: compositeSelected ? fromOriginal.length : effectiveChangedCount, changedTaskIdsFromOriginalBaseline: compositeSelected ? fromOriginal : effectiveChangedIds, changedTaskCountFromRepairedBaseline: compositeSelected ? fromRepaired.length : effectiveChangedCount, changedTaskIdsFromRepairedBaseline: compositeSelected ? fromRepaired : effectiveChangedIds, changeSources: { baselineOverlapRepair: { changedTaskCount: repairIds.length, changedTaskIds: repairIds, readOnly: true }, postRepairMainZoneContinuity: { changedTaskCount: postIds.length, changedTaskIds: postIds, readOnly: true }, ...(selectedIdle || idleIds.length ? { criticalResourceIdleCompression: { changedTaskCount: idleIds.length, changedTaskIds: idleIds, readOnly: true } } : {}) }, compositeTransformationsApplied: [repairIds.length ? "baseline-overlap-repair" : null, postIds.length ? "post-repair-main-zone-continuity" : null, idleIds.length ? "critical-resource-idle-compression" : null].filter(Boolean), compositeMaterializationContractVersion: ORC_COMPOSITE_MATERIALIZATION_CONTRACT_VERSION_ID229, summaryContractValid: warnings.length === 0, readOnly: true };
  if ((selectedIdle || selectedPost || selectedSwap) && fromOriginal.length && repairIds.length + postIds.filter((id) => !repairIds.includes(id)).length + idleIds.filter((id) => !repairIds.includes(id) && !postIds.includes(id)).length !== fromOriginal.length) warnings.push("composite_materialization_change_sources_do_not_explain_final_diff");
  if (selectedIdle && args.criticalResourceIdleCompression?.mainZoneContinuityPreserved === false) warnings.push("critical_resource_idle_compression_would_worsen_main_zone_continuity");
  if (selectedIdle && args.criticalResourceIdleCompression?.selectedAsCommit !== true) warnings.push("critical_resource_idle_compression_selected_but_summary_not_committed");
  return { mainZoneContinuity, mainZoneGapResourceBlockSwap: { ...(args.mainZoneGapResourceBlockSwap ?? {}), ...targeted(args.mainZoneGapResourceBlockSwap ?? {}) }, postRepairMainZoneContinuityPass: { ...(args.postRepairMainZoneContinuityPass ?? {}), ...targeted(args.postRepairMainZoneContinuityPass ?? {}) }, criticalResourceIdleCompression: { ...(args.criticalResourceIdleCompression ?? {}) }, planningMaterialization: { ...planningMaterialization, summaryContractValid: warnings.length === 0 }, summaryContractValid: warnings.length === 0, summaryContractWarnings: warnings, finalSummaryBuiltFromSelectedSimulation: finalState != null };
}
