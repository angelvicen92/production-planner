import type { EngineInput, TaskInput } from "../../types";
import { deepFreeze } from "../immutability";
import { isORCProtectedTask, resolveORCPlanningMode, type ORCPlanningMode } from "./resolveORCPlanningMode";
export interface ORCInitialConstructionInputDiagnostics { source:"original_engine_input"; planningMode: ORCPlanningMode; originalTaskCount:number; planifiableTaskCount:number; protectedPlanningCount:number; pendingPlanningClearedCount:number; pendingAssignedResourcesClearedCount:number; originPlanningCount:number; v4SeedUsed:false; externalPlanningUsedAsSeed:false; operationalIdentityPreserved:boolean; dependencyIdentityPreserved:boolean; resourceRequirementIdentityPreserved:boolean; lockIdentityPreserved:boolean; warnings:string[]; readOnly:true; }
export interface ORCInitialConstructionInputResult { input: EngineInput; diagnostics: ORCInitialConstructionInputDiagnostics; }
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
const depSig = (tasks:TaskInput[]) => JSON.stringify(tasks.map(t=>[t.id,t.dependsOnTaskId??null,t.dependsOnTaskIds??[],t.dependsOnTemplateId??null,t.dependsOnTemplateIds??[]]).sort((a:any,b:any)=>a[0]-b[0]));
const reqSig = (tasks:TaskInput[]) => JSON.stringify(tasks.map(t=>[t.id,t.resourceRequirements??null]).sort((a:any,b:any)=>a[0]-b[0]));
export function buildORCInitialConstructionInput(input: EngineInput): ORCInitialConstructionInputResult {
  const mode = resolveORCPlanningMode(input);
  let pendingPlanningClearedCount=0, pendingAssignedResourcesClearedCount=0, originPlanningCount=0;
  const cloned = clone(input);
  cloned.tasks = (cloned.tasks ?? []).map((task:any) => {
    if (isORCProtectedTask(task, cloned)) { if (task.startPlanned && task.endPlanned) originPlanningCount++; return task; }
    const out = { ...task };
    if (out.startPlanned != null || out.endPlanned != null) pendingPlanningClearedCount++;
    delete out.startPlanned; delete out.endPlanned; delete out.startReal; delete out.endReal;
    if (Array.isArray(out.assignedResourceIds) && out.assignedResourceIds.length) pendingAssignedResourcesClearedCount++;
    delete out.assignedResourceIds; delete out.seedSource;
    delete out.repairMetadata; delete out.improvementMetadata; delete out.v4Metadata;
    return out;
  });
  const diagnostics: ORCInitialConstructionInputDiagnostics = { source:"original_engine_input", planningMode: mode.planningMode, originalTaskCount: input.tasks?.length ?? 0, planifiableTaskCount: mode.planifiableTaskCount, protectedPlanningCount: mode.protectedPlanningCount, pendingPlanningClearedCount, pendingAssignedResourcesClearedCount, originPlanningCount, v4SeedUsed:false, externalPlanningUsedAsSeed:false, operationalIdentityPreserved: JSON.stringify((input.tasks??[]).map(t=>[t.id,t.durationOverrideMin,t.templateId,t.spaceId,t.zoneId,t.contestantId,t.itinerantTeamId]).sort()) === JSON.stringify((cloned.tasks??[]).map((t:any)=>[t.id,t.durationOverrideMin,t.templateId,t.spaceId,t.zoneId,t.contestantId,t.itinerantTeamId]).sort()), dependencyIdentityPreserved: depSig(input.tasks??[])===depSig(cloned.tasks??[]), resourceRequirementIdentityPreserved: reqSig(input.tasks??[])===reqSig(cloned.tasks??[]), lockIdentityPreserved: JSON.stringify(input.locks??[])===JSON.stringify(cloned.locks??[]), warnings: [], readOnly:true };
  return deepFreeze({ input: cloned, diagnostics }) as ORCInitialConstructionInputResult;
}
