import type { OperationalState, SimulatedState } from "../contracts";
import type { ORCCandidateLineageResolution } from "./orcCandidateLineageResolver";

type Rec = Record<string, any>;
const nums = (v: unknown): number[] => Array.isArray(v) ? [...new Set(v.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b) : [];
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
function fp(e: any): string { return JSON.stringify({ taskId:e.taskId, startPlanned:e.startPlanned, endPlanned:e.endPlanned, spaceId:e.spaceId ?? e.assignedSpace ?? null, assignedResourceIds:[...(e.assignedResourceIds ?? e.assignedResources ?? [])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b) }); }
function changedIds(a?: OperationalState | null, b?: OperationalState | null): number[] { const am=new Map((a?.planning??[]).map((e:any)=>[Number(e.taskId),fp(e)])); const bm=new Map((b?.planning??[]).map((e:any)=>[Number(e.taskId),fp(e)])); return [...new Set([...am.keys(),...bm.keys()].filter(Number.isFinite).filter(id=>am.get(id)!==bm.get(id)))].sort((x,y)=>x-y); }
function collectTaskIds(value: unknown): number[] {
  const out = new Set<number>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) { for (const item of v) visit(item); return; }
    if (!isRec(v)) return;
    for (const key of ["taskId", "id"]) { const n=Number(v[key]); if (Number.isFinite(n)) out.add(n); }
    for (const key of ["taskIds", "movedTaskIds", "movedMainZoneTaskIds", "movedPrerequisiteTaskIds", "changedTaskIds", "inferredChangedTaskIds", "lanePlan", "assignments", "candidateAssignments"]) visit(v[key]);
  };
  visit(value);
  return [...out].sort((a,b)=>a-b);
}

export function buildORCMaterializationSourceSummary(args: { originalBaseline?: OperationalState | null; repairedBaseline?: OperationalState | null; postRepairContinuityBaseline?: OperationalState | null; selectedSimulatedState: SimulatedState | null; selectedLineage: ORCCandidateLineageResolution | null; selectedCandidateMetadata?: Rec | null; candidateAssignments?: unknown; sourceSummaries?: Rec | null; basePlanningMaterialization?: Rec | null }) {
  const finalState = args.selectedSimulatedState?.operationalStateSnapshot as OperationalState | null | undefined;
  const changedTaskIds = changedIds(args.originalBaseline, finalState);
  const postIds = changedIds(args.postRepairContinuityBaseline ?? args.repairedBaseline ?? args.originalBaseline, finalState);
  const declared = new Set<number>([...nums(args.selectedCandidateMetadata?.movedTaskIds), ...nums(args.selectedCandidateMetadata?.movedMainZoneTaskIds), ...nums(args.selectedCandidateMetadata?.movedPrerequisiteTaskIds), ...collectTaskIds(args.selectedCandidateMetadata?.lanePlan), ...collectTaskIds(args.candidateAssignments)]);
  const changeSources: Rec = { ...(isRec(args.basePlanningMaterialization?.changeSources) ? args.basePlanningMaterialization!.changeSources : {}) };
  const sourceKey = args.selectedLineage?.containsMacroProductionWaveDayShape ? "macroProductionWaveDayShape" : args.selectedLineage?.containsProductionWaveDependencyBundle ? "productionWaveDependencyBundle" : args.selectedLineage?.containsMacroMainZoneBlockRelayout ? "macroMainZoneBlockRelayout" : "selectedSimulation";
  const explained = new Set<number>();
  for (const source of Object.values(changeSources)) for (const id of nums((source as Rec)?.changedTaskIds)) explained.add(id);
  for (const id of postIds) if (declared.has(id)) explained.add(id);
  const additional = postIds.filter((id) => !declared.has(id));
  changeSources[sourceKey] = { changedTaskCount: postIds.length, changedTaskIds: postIds, declaredMovedTaskIds: [...declared].sort((a,b)=>a-b), inferredChangedTaskIds: postIds.filter((id)=>declared.has(id)), additionalChangedTaskIdsFromSimulationDiff: additional, selectedMacroSimulationId: args.selectedSimulatedState?.id ?? null, readOnly: true };
  const unexplainedChangedTaskIds = changedTaskIds.filter((id) => !explained.has(id) && !declared.has(id));
  return { changedTaskIds, changedTaskIdsFromOriginalBaseline: changedTaskIds, changedTaskIdsFromRepairedBaseline: changedIds(args.repairedBaseline ?? args.originalBaseline, finalState), changedTaskIdsFromPostRepairContinuityBaseline: postIds, changeSources, declaredMovedTaskIds: [...declared].sort((a,b)=>a-b), inferredChangedTaskIds: postIds.filter((id)=>declared.has(id)), additionalChangedTaskIdsFromSimulationDiff: additional, unexplainedChangedTaskIds, materializationDiffContractValid: unexplainedChangedTaskIds.length === 0, materializationSourceCoverage: { explainedChangedTaskIds: changedTaskIds.filter((id)=>!unexplainedChangedTaskIds.includes(id)), unexplainedChangedTaskIds, readOnly: true }, selectedLineage: args.selectedLineage, selectedCandidateFamilies: args.selectedLineage?.candidateFamilies ?? [], readOnly: true as const };
}
