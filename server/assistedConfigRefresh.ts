import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { normalizeTaskTemplateCatalogEntry, type TaskTemplateOperationalSnapshotV1 } from "./taskTemplateSnapshot";
import { buildPlanOptimizerRefreshPreviewV1 } from "./planOptimizerSnapshotRefreshPreview";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1, type EffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { buildEngineInput } from "../engine/buildInput";
import type { AssistedConfigRefreshChangeV1, AssistedConfigRefreshLocalOverrideV1, AssistedConfigRefreshPreviewV1 } from "../shared/assistedConfigRefreshContracts";

/**
 * Focused General -> day audit (074-082 and buildEngineInput): these authorities
 * are effective daily projections assembled from several plan-scoped tables. There
 * is no single General source plus lossless atomic writer for any of them. Keep the
 * coverage gap explicit rather than pretending that an EngineInput projection is
 * a writable General mapping.
 */
const unsupported: AssistedConfigRefreshPreviewV1["unsupportedAuthorities"] = Object.freeze([
  Object.freeze({authority:"plan_workday",label:"Horario de la jornada",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
  Object.freeze({authority:"contestant_availability",label:"Disponibilidad de concursantes",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
  Object.freeze({authority:"spatial_configuration",label:"Configuración de espacios y zonas",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
  Object.freeze({authority:"resource_configuration",label:"Configuración de recursos",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
  Object.freeze({authority:"resource_assignments_and_requirements",label:"Asignaciones y necesidades de recursos",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
  Object.freeze({authority:"resource_bundles",label:"Agrupaciones de recursos",reason:"NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION"}),
]);
const stable = (value: unknown) => JSON.stringify(value);
const provenance = (authority:string)=>({authority,authorityContractVersion:1});
export class AssistedConfigRefreshError extends Error {
  constructor(readonly code:"SESSION_NOT_FOUND"|"STALE_CONFIG_REVISION"|"INVALID_SELECTION"|"REFRESH_BLOCKED"|"NO_CHANGES",readonly status:404|409|422){super(code);}
}

export interface ConfigRefreshCandidate { preview: AssistedConfigRefreshPreviewV1; currentReplay: EffectivePlanConfigReplaySnapshotV1; candidateReplay: EffectivePlanConfigReplaySnapshotV1; }

/** Compare only canonical operational fields; source is audit provenance. */
export function sameTaskTemplateOperationalSemantics(left:TaskTemplateOperationalSnapshotV1,right:TaskTemplateOperationalSnapshotV1){
  const {source:_leftSource,sourceFingerprint:_leftFingerprint,...leftOperational}=left;
  const {source:_rightSource,sourceFingerprint:_rightFingerprint,...rightOperational}=right;
  return stable(leftOperational)===stable(rightOperational);
}

export const isAuthoritativeLocalTemplateOverride=(row:TaskTemplateOperationalSnapshotV1)=>row.source==="ad_hoc_from_default";

export function buildLocalOverrideProjection(current:readonly TaskTemplateOperationalSnapshotV1[],optimizerSource:string):AssistedConfigRefreshLocalOverrideV1[]{
  const overrides:AssistedConfigRefreshLocalOverrideV1[]=current.filter(isAuthoritativeLocalTemplateOverride).map(row=>({key:`task_templates:${row.sourceTemplateId}`,authority:"task_templates",label:row.templateName,source:"ad_hoc_from_default"}));
  if(optimizerSource==="DAY_OVERRIDE")overrides.push({key:"optimizer:settings",authority:"optimizer",label:"Preferencias de optimización",source:"DAY_OVERRIDE"});
  return overrides.sort((a,b)=>a.key.localeCompare(b.key));
}

export function buildOptimizerRefreshChange(optimizerPreview:ReturnType<typeof buildPlanOptimizerRefreshPreviewV1>):AssistedConfigRefreshChangeV1|null{
  if(optimizerPreview.status!=="READY"||!optimizerPreview.diff.hasSemanticChanges)return null;
  return {key:"optimizer:settings",authority:"optimizer",kind:"MODIFIED",label:"Preferencias de optimización",localOverride:optimizerPreview.current.source==="DAY_OVERRIDE"};
}

export function buildTaskTemplateRefreshChanges(current:readonly TaskTemplateOperationalSnapshotV1[],candidate:readonly TaskTemplateOperationalSnapshotV1[]){
  const changes:AssistedConfigRefreshChangeV1[]=[];
  const oldById=new Map(current.map(row=>[row.sourceTemplateId,row])),nextById=new Map(candidate.map(row=>[row.sourceTemplateId,row]));
  for(const row of candidate){const old=oldById.get(row.sourceTemplateId);if(!old||!sameTaskTemplateOperationalSemantics(old,row))changes.push({key:`task_templates:${row.sourceTemplateId}`,authority:"task_templates",kind:old?"MODIFIED":"NEW",label:row.templateName,localOverride:Boolean(old&&isAuthoritativeLocalTemplateOverride(old))});}
  for(const row of current)if(!nextById.has(row.sourceTemplateId))changes.push({key:`task_templates:${row.sourceTemplateId}`,authority:"task_templates",kind:"REMOVED",label:row.templateName,localOverride:isAuthoritativeLocalTemplateOverride(row)});
  return changes;
}

/** General→daily mapping audit: only versioned task-template and optimizer snapshots have safe writable projections. */
export async function buildConfigRefreshCandidate(storage:IStorage,planId:number):Promise<ConfigRefreshCandidate>{
  const session=await storage.getActiveAssistedPlanningSession(planId);
  if(!session)throw new AssistedConfigRefreshError("SESSION_NOT_FOUND",404);
  const revision=await storage.getPlanConfigRevision(session.currentConfigRevisionId);
  if(!revision||revision.planId!==planId)throw new AssistedConfigRefreshError("STALE_CONFIG_REVISION",409);
  const [templates,settings,currentTemplates,currentOptimizer,input]=await Promise.all([
    storage.getTaskTemplates(),storage.getOptimizerSettings(),storage.getPlanTaskTemplateSnapshots(planId),storage.getPlanOptimizerSnapshot(planId),buildEngineInput(planId,storage),
  ]);
  const candidateTemplates=templates.map(row=>normalizeTaskTemplateCatalogEntry(row,"inherited")).sort((a,b)=>a.sourceTemplateId-b.sourceTemplateId);
  const optimizerPreview=buildPlanOptimizerRefreshPreviewV1({currentSnapshot:currentOptimizer,globalOptimizerSettings:settings,
    dailyTemplateSnapshots:currentTemplates.map(row=>({sourceTemplateId:row.sourceTemplateId,templateName:row.templateName,planTemplateSnapshotId:row.planTemplateSnapshotId})),
    dailyZoneIds:(input.planZoneSettings??[]).map(row=>row.zoneId)});
  if(optimizerPreview.status!=="READY")throw new AssistedConfigRefreshError("REFRESH_BLOCKED",422);
  const changes:AssistedConfigRefreshChangeV1[]=buildTaskTemplateRefreshChanges(currentTemplates,candidateTemplates);
  const optimizerChange=buildOptimizerRefreshChange(optimizerPreview);if(optimizerChange)changes.push(optimizerChange);
  changes.sort((a,b)=>a.key.localeCompare(b.key));
  const currentReplay=revision.replaySnapshotJson as unknown as EffectivePlanConfigReplaySnapshotV1;
  const candidateInput={taskTemplateSnapshots:candidateTemplates,optimizerSnapshot:optimizerPreview.candidate,authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
  return {preview:Object.freeze({contractVersion:1,expectedConfigRevisionId:session.currentConfigRevisionId,changes:Object.freeze(changes),localOverrides:Object.freeze(buildLocalOverrideProjection(currentTemplates,currentOptimizer.source)),unsupportedAuthorities:unsupported}),currentReplay,candidateReplay:buildEffectivePlanConfigReplaySnapshotV1(candidateInput)};
}

export class AssistedConfigRefreshService {
  constructor(private storage:IStorage,private rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:any}>=(name,args)=>supabaseAdmin.rpc(name,args),private candidateBuilder=buildConfigRefreshCandidate){}
  preview(planId:number){return this.candidateBuilder(this.storage,planId).then(x=>x.preview);}
  async apply(planId:number,userId:string,expected:number,keys:readonly string[]){
    const candidate=await this.candidateBuilder(this.storage,planId);
    if(candidate.preview.expectedConfigRevisionId!==expected)throw new AssistedConfigRefreshError("STALE_CONFIG_REVISION",409);
    const allowed=new Set(candidate.preview.changes.map(x=>x.key));if(keys.some(key=>!allowed.has(key)))throw new AssistedConfigRefreshError("INVALID_SELECTION",422);
    const selected=new Set(keys);if(!selected.size)throw new AssistedConfigRefreshError("NO_CHANGES",422);
    const templates=new Map(candidate.currentReplay.taskTemplateSnapshots.map(x=>[x.sourceTemplateId,x]));
    for(const change of candidate.preview.changes.filter(x=>selected.has(x.key)&&x.authority==="task_templates")){const id=Number(change.key.split(":")[1]);const next=candidate.candidateReplay.taskTemplateSnapshots.find(x=>x.sourceTemplateId===id);if(next)templates.set(id,next);else templates.delete(id);}
    const replayAuthorities=Object.fromEntries(Object.entries(candidate.currentReplay.authorities).map(([authority,semanticValue])=>[authority,{semanticValue,provenance:provenance(authority)}])) as any;
    const replay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[...templates.values()] as TaskTemplateOperationalSnapshotV1[],optimizerSnapshot:selected.has("optimizer:settings")?candidate.candidateReplay.optimizerSnapshot:candidate.currentReplay.optimizerSnapshot,authorities:replayAuthorities});
    const identity=buildEffectivePlanConfigRevisionV1({planId,taskTemplateSnapshots:replay.taskTemplateSnapshots,optimizerSnapshot:replay.optimizerSnapshot,taskTemplateProvenance:provenance("plan_task_template_snapshots"),optimizerProvenance:provenance("plan_optimizer_snapshots"),authorities:Object.fromEntries(Object.entries(replay.authorities).map(([authority,semanticValue])=>[authority,{semanticValue,provenance:provenance(authority)}])) as any});
    const diff={contractVersion:1,selectedChanges:candidate.preview.changes.filter(x=>selected.has(x.key))};
    const {data,error}=await this.rpc("assisted_apply_config_refresh",{p_plan_id:planId,p_user_id:userId,p_expected_revision:expected,p_identity:identity,p_replay:replay,p_diff:diff});
    if(error){if(String((error as any).message).includes("STALE_CONFIG_REVISION"))throw new AssistedConfigRefreshError("STALE_CONFIG_REVISION",409);throw error;}
    return {revisionId:Number(data),identity,replay,diff};
  }
}
