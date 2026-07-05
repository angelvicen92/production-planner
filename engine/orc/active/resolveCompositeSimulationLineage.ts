import type { SimulatedState } from "../contracts";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const num = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? v : 0;
const sourceChanged = (sources: unknown, key: string): boolean => isRec(sources) && isRec(sources[key]) && num(sources[key].changedTaskCount) > 0;
const add = (set: Set<string>, v: unknown) => { if (typeof v === "string" && v.length) set.add(v); };

export interface CompositeSimulationLineage {
  finalSelectedSimulatedStateId: string | null;
  finalSelectedCandidateId: string | null;
  finalSelectedCandidateFamily: string | null;
  baseCompositeSimulationId: string | null;
  ancestorSimulationIds: string[];
  ancestorCandidateIds: string[];
  includesBaselineOverlapRepair: boolean;
  includesPostRepairMainZoneContinuity: boolean;
  includesCriticalResourceIdleCompression: boolean;
  baselineRepairReflectedInFinalSelection: boolean;
  postRepairContinuityReflectedInFinalSelection: boolean;
  criticalResourceIdleCompressionReflectedInFinalSelection: boolean;
  lineageWarnings: string[];
  readOnly: true;
}

export function resolveCompositeSimulationLineage(args: {
  selectedSimulation?: SimulatedState | null;
  simulationSelection?: Rec | null;
  baselineOverlapRepair?: Rec | null;
  postRepairMainZoneContinuityPass?: Rec | null;
  mainZoneGapResourceBlockSwap?: Rec | null;
  criticalResourceIdleCompression?: Rec | null;
  changeSources?: Rec | null;
}): CompositeSimulationLineage {
  const finalSimId = args.selectedSimulation?.id ?? str(args.simulationSelection?.selectedFinalSimulatedStateId) ?? str(args.simulationSelection?.selectedSimulatedStateId);
  const finalCandidateId = str(args.simulationSelection?.selectedFinalCandidateId) ?? str(args.simulationSelection?.selectedCandidateId) ?? str(args.criticalResourceIdleCompression?.selectedCandidateId) ?? str(args.postRepairMainZoneContinuityPass?.selectedCandidateId) ?? str(args.mainZoneGapResourceBlockSwap?.selectedCandidateId);
  const idleSelectedId = str(args.criticalResourceIdleCompression?.selectedSimulatedStateId);
  const postSelectedId = str(args.postRepairMainZoneContinuityPass?.selectedSimulatedStateId);
  const repairSelectedId = str(args.baselineOverlapRepair?.selectedSimulatedStateId) ?? str(args.mainZoneGapResourceBlockSwap?.baselineRepairSimulatedStateId);
  const baseCompositeSimulationId = str(args.simulationSelection?.baseCompositeSimulationId) ?? str(args.criticalResourceIdleCompression?.baseCompositeSimulationId) ?? str(args.criticalResourceIdleCompression?.sourceSimulationId);
  const ancestorSimulationIds = new Set<string>();
  const ancestorCandidateIds = new Set<string>();
  add(ancestorSimulationIds, baseCompositeSimulationId);
  add(ancestorSimulationIds, postSelectedId);
  add(ancestorSimulationIds, repairSelectedId);
  add(ancestorCandidateIds, args.postRepairMainZoneContinuityPass?.selectedCandidateId);
  add(ancestorCandidateIds, args.mainZoneGapResourceBlockSwap?.selectedCandidateId);
  add(ancestorCandidateIds, args.baselineOverlapRepair?.selectedCandidateId);
  const finalIsIdle = finalSimId != null && idleSelectedId === finalSimId;
  const finalIsPost = finalSimId != null && postSelectedId === finalSimId;
  const finalIsRepair = finalSimId != null && repairSelectedId === finalSimId;
  const postAsBase = postSelectedId != null && (baseCompositeSimulationId === postSelectedId || str(args.criticalResourceIdleCompression?.sourceSimulationId) === postSelectedId);
  const postChanged = sourceChanged(args.changeSources, "postRepairMainZoneContinuity");
  const repairChanged = sourceChanged(args.changeSources, "baselineOverlapRepair");
  const idleChanged = sourceChanged(args.changeSources, "criticalResourceIdleCompression");
  const baselineRepairReflectedInFinalSelection = finalIsRepair || repairChanged || (baseCompositeSimulationId != null && (postAsBase || postChanged));
  const postRepairContinuityReflectedInFinalSelection = finalIsPost || postAsBase || postChanged;
  const criticalResourceIdleCompressionReflectedInFinalSelection = finalIsIdle && idleChanged;
  const finalFamily = str(args.simulationSelection?.selectedFinalCandidateFamily) ?? (finalIsIdle ? "critical-resource-idle-compression" : finalIsPost ? "post-repair-main-zone-continuity" : finalIsRepair ? "baseline-overlap-repair" : null);
  const lineageWarnings: string[] = [];
  if (args.postRepairMainZoneContinuityPass?.selectedAsCommit === true && !postRepairContinuityReflectedInFinalSelection) lineageWarnings.push("post_repair_commit_not_reflected_in_simulation_selection");
  return { finalSelectedSimulatedStateId: finalSimId, finalSelectedCandidateId: finalCandidateId, finalSelectedCandidateFamily: finalFamily, baseCompositeSimulationId, ancestorSimulationIds: [...ancestorSimulationIds].filter((id) => id !== finalSimId).sort(), ancestorCandidateIds: [...ancestorCandidateIds].filter((id) => id !== finalCandidateId).sort(), includesBaselineOverlapRepair: baselineRepairReflectedInFinalSelection, includesPostRepairMainZoneContinuity: postRepairContinuityReflectedInFinalSelection, includesCriticalResourceIdleCompression: criticalResourceIdleCompressionReflectedInFinalSelection, baselineRepairReflectedInFinalSelection, postRepairContinuityReflectedInFinalSelection, criticalResourceIdleCompressionReflectedInFinalSelection, lineageWarnings, readOnly: true };
}
