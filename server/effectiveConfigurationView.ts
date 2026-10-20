import { effectiveTransportDirection } from "../shared/transportPolicy";
import { mainFlowPreferenceFromRow } from "../shared/mainFlowPreference";
import { mainFlowPreferenceGeometry } from "./mainFlowPreference";
import type { EngineInput } from "../engine/types";
import { buildEngineInput } from "../engine/buildInput";
import { configurabilityCounts, configurabilityRegistry, type ConfigurabilityCapability } from "../shared/configurability";
import type { EffectiveConfigurationValue, EffectiveConfigurationView, ReadinessIssue } from "../shared/effectiveConfigurationContracts";
import type { IStorage } from "./storage";

export type { EffectiveConfigurationValue, EffectiveConfigurationView } from "../shared/effectiveConfigurationContracts";

function transportView(input:EngineInput,optimizer:any,plan:any) {
  const effectiveTransport:Record<string,number|undefined>={vanCapacity:input.vanCapacity};
  const transportSources:Record<string,string>={};
  for(const direction of ['arrival','departure'] as const){
    const policy=effectiveTransportDirection(input,direction);
    const source=input.optimizerSnapshotSource==='DAY_OVERRIDE'?'Override del día':input.optimizerSnapshotSource==='LEGACY_BACKFILL'?'Snapshot histórico del día':'Snapshot heredado del día';
    effectiveTransport[`${direction}MinimumGroupSize`]=policy.minimumGroupSize;
    effectiveTransport[`${direction}GroupingTarget`]=policy.targetGroupSize??0;
    effectiveTransport[`${direction}MaximumGroupSize`]=policy.maximumGroupSize;
    effectiveTransport[`${direction}MinGapMinutes`]=policy.minGapMinutes;
    for(const suffix of ['GroupingTarget','MinGapMinutes'])transportSources[`${direction}${suffix}`]=source;
    const minimumOverride=plan.planner_next_configuration?.[`${direction}MinimumGroupSize`]??plan.plannerNextConfiguration?.[`${direction}MinimumGroupSize`];
    transportSources[`${direction}MinimumGroupSize`]=input.optimizerSnapshotSource==='DAY_OVERRIDE'&&optimizer?.transport?.[`${direction}MinimumGroupSize`]!=null?source:minimumOverride!=null?'Override explícito de configuración de la jornada':optimizer?.transport?.[`${direction}MinimumGroupSize`]!=null?source:'Compatibilidad histórica: mínimo HARD 1';
    const explicit=plan.planner_next_configuration?.[`${direction}MaximumGroupSize`]??plan.plannerNextConfiguration?.[`${direction}MaximumGroupSize`];
    transportSources[`${direction}MaximumGroupSize`]=input.optimizerSnapshotSource==='DAY_OVERRIDE'&&optimizer?.transport?.[`${direction}MaximumGroupSize`]!=null?source:explicit!=null?'Override explícito de configuración de la jornada':optimizer?.transport?.[`${direction}MaximumGroupSize`]!=null?source:'Capacidad de vehículo del snapshot del día';
  }
  return {effectiveTransport,transportSources};
}
const absent = (c:ConfigurabilityCapability):EffectiveConfigurationValue => ({capabilityId:c.capabilityId,label:c.name,category:c.category,value:null,availability:c.status==="MISSING"?"UNAVAILABLE":"UNKNOWN",unit:c.unit,source:"UNKNOWN",validationStatus:c.status==="MISSING"?"UNSUPPORTED":"UNKNOWN",requiresReplan:"UNKNOWN",implementationStatus:c.status,blockers:c.blockers,requiredForDay:false});
function projected(c:ConfigurabilityCapability,input:EngineInput,plan:any,general:any,revision?:number,fingerprint?:string,optimizer?:any,optimizerState?:any,geometry?:ReturnType<typeof mainFlowPreferenceGeometry>):EffectiveConfigurationValue {
  const common={capabilityId:c.capabilityId,label:c.name,category:c.category,unit:c.unit,effectiveRevision:revision,requiresReplan:"UNKNOWN" as const,implementationStatus:c.status,blockers:c.blockers,requiredForDay:false};
  switch(c.capabilityId){
    case "MAIN_FLOW": return input.plannerNext?{...common,value:{spaceName:input.planSpaceSettings?.find(s=>s.spaceId===input.plannerNext!.mainFlow.spaceId)?.name??"Flujo principal configurado",continuity:input.plannerNext.mainFlow.continuity},source:"DAY_SNAPSHOT",availability:"AVAILABLE",validationStatus:"VALID",fingerprint}:absent(c);
    case "BLOCK_COUNT_POLICY": if(!input.plannerNext)return {...absent(c),availability:"UNAVAILABLE",validationStatus:"UNSUPPORTED"}; return {...common,value:mainFlowPreferenceFromRow(plan),baseline:mainFlowPreferenceFromRow(plan,"main_baseline_"),defaultGeneral:mainFlowPreferenceFromRow(general),source:plan.main_preference_source??"LEGACY_BACKFILL",availability:input.plannerNext?"AVAILABLE":"UNAVAILABLE",validationStatus:!geometry?.available?"UNSUPPORTED":(mainFlowPreferenceFromRow(plan).blockCountPolicy.mode==="SOFT_PREFER_N"&&(!geometry.counts.includes(Number(plan.main_preferred_block_count))||(plan.main_before_meal_blocks!=null&&(!geometry.mealApplicable||(Number(plan.main_before_meal_blocks)===0&&!geometry.zeroBeforeRepresentable)))))?"INCOMPATIBLE":"VALID",canRestoreInherited:plan.main_preference_source==="DAY_OVERRIDE",fingerprint,overrideMetadata:{createdBy:plan.main_preference_override_by??null,createdAt:plan.main_preference_override_at??null}};
    case "WORKDAY_WINDOW": return {...common,value:{start:input.workDay.start,end:input.workDay.end},...(plan.work_config_source?{baseline:{start:plan.work_baseline_start,end:plan.work_baseline_end},defaultGeneral:{start:general.default_work_start,end:general.default_work_end},canRestoreInherited:plan.work_config_source==="DAY_OVERRIDE",overrideMetadata:{createdBy:plan.work_override_by??null,createdAt:plan.work_override_at??null},fingerprint}:{}),availability:"AVAILABLE",source:plan.work_config_source??"UNKNOWN",validationStatus:"VALID"};
    case "GLOBAL_MEAL_BREAK": return {...common,value:{mode:input.mealMode??"global_hard_break",window:input.meal},...(plan.meal_config_source?{baseline:{start:plan.meal_baseline_start,end:plan.meal_baseline_end,mode:plan.meal_baseline_mode},defaultGeneral:{start:general.meal_start,end:general.meal_end,mode:general.meal_mode},canRestoreInherited:plan.meal_config_source==="DAY_OVERRIDE",overrideMetadata:{createdBy:plan.meal_override_by??null,createdAt:plan.meal_override_at??null},fingerprint}:{}),availability:"AVAILABLE",source:plan.meal_config_source??"UNKNOWN",validationStatus:"VALID"};
    case "TRANSITIONS":return {...common,value:{participantTransitionMinutes:input.defaultParticipantTransitionMinutes},baseline:{participantTransitionMinutes:plan.participant_transition_baseline_minutes},defaultGeneral:{participantTransitionMinutes:general.default_participant_transition_minutes},canRestoreInherited:plan.participant_transition_config_source==="DAY_OVERRIDE",overrideMetadata:{createdBy:plan.participant_transition_override_by??null,createdAt:plan.participant_transition_override_at??null},availability:"AVAILABLE",source:plan.participant_transition_config_source??"UNKNOWN",validationStatus:"VALID"};
    case "PARTICIPANTS": return {...common,value:{count:new Set(input.tasks.map(t=>t.contestantId).filter(Boolean)).size,availabilityRules:Object.keys(input.contestantAvailabilityById??{}).length},availability:"AVAILABLE",source:"MIXED",validationStatus:"VALID"};
    case "TASKS_DEPENDENCIES": return {...common,value:{tasks:input.tasks.length,dependencies:input.tasks.reduce((n,t)=>n+(t.dependsOnTaskIds?.length??0),0)},availability:"AVAILABLE",source:"MIXED",fingerprint:input.taskTemplateSnapshotFingerprint,validationStatus:"VALID"};
    case "SPATIAL_AVAILABILITY": return {...common,value:{zones:input.planZoneSettings?.length??0,spaces:input.planSpaceSettings?.length??0},availability:"AVAILABLE",source:"DAY_SNAPSHOT",validationStatus:"VALID"};
    case "PLAN_RESOURCE_ASSIGNMENTS": return {...common,value:{items:input.planResourceItems.length,taskRequirements:input.tasks.filter(t=>t.resourceRequirements).length},availability:"AVAILABLE",source:"MIXED",validationStatus:"VALID"};
    case "OPTIMIZATION": return {...common,value:{...(optimizer??{editingMode:input.optimizerSnapshotEditingMode}),...transportView(input,optimizer,plan)},baseline:optimizerState?.baseline_snapshot??undefined,canRestoreInherited:input.optimizerSnapshotSource==="DAY_OVERRIDE"&&!!optimizerState?.baseline_snapshot,overrideMetadata:{createdBy:optimizerState?.override_by??null,createdAt:optimizerState?.override_at??null},availability:"AVAILABLE",source:input.optimizerSnapshotSource??"UNKNOWN",fingerprint:input.optimizerSnapshotFingerprint,validationStatus:(input.optimizerCompatibilityWarnings?.length??0)>0?"INCOMPATIBLE":"VALID"};
    case "PROTECTED_STATE_LOCKS": return {...common,value:{locks:input.locks.length,protectedTasks:input.tasks.filter(t=>t.status==="done"||t.status==="in_progress").length},availability:"AVAILABLE",source:"PROTECTED",validationStatus:"VALID",requiresReplan:"NO"};
    default:return absent(c);
  }
}
export function deriveReadiness(values:readonly EffectiveConfigurationValue[]):EffectiveConfigurationView["readiness"]{
  const issues:ReadinessIssue[]=[];
  for(const value of values){
    if(value.validationStatus==="INCOMPATIBLE")issues.push({capabilityId:value.capabilityId,category:value.category,status:"INCOMPATIBLE",message:`${value.label} contiene incompatibilidades demostradas por su autoridad actual.`,navigationTarget:value.category});
    else if(value.validationStatus==="INCOMPLETE")issues.push({capabilityId:value.capabilityId,category:value.category,status:"INCOMPLETE",message:`Falta completar ${value.label}.`,navigationTarget:value.category});
  }
  for(const value of values)if(value.requiredForDay&&value.validationStatus==="UNSUPPORTED")issues.push({capabilityId:value.capabilityId,category:value.category,status:"UNSUPPORTED",message:`${value.label} es necesaria para este día y aún no está soportada de extremo a extremo.`,navigationTarget:value.category});
  const status=issues.some(i=>i.status==="INCOMPATIBLE")?"INCOMPATIBLE":issues.some(i=>i.status==="INCOMPLETE")?"INCOMPLETE":issues.some(i=>i.status==="UNSUPPORTED")?"UNSUPPORTED":"READY";
  return {status,issues:Object.freeze(issues)};
}
export async function buildEffectiveConfigurationView(storage:IStorage,planId:number,inputBuilder:typeof buildEngineInput=buildEngineInput):Promise<EffectiveConfigurationView>{
  const plan=await storage.getPlan(planId); if(!plan)throw Object.assign(new Error("PLAN_NOT_FOUND"),{status:404});
  const hasProvenance=!!(plan as any).work_config_source;
  const [input,session,revisions,generalResult,optimizer,optimizerStateResult]=await Promise.all([inputBuilder(planId,storage),storage.getActiveAssistedPlanningSession(planId),typeof (storage as any).listPlanConfigRevisions==="function"?storage.listPlanConfigRevisions(planId):Promise.resolve([]),hasProvenance?import("./supabase").then(({supabaseAdmin})=>supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode,default_participant_transition_minutes,main_preferred_block_count,main_before_meal_blocks").eq("id",1).single()):Promise.resolve({data:{}} as any),typeof (storage as any).getPlanOptimizerSnapshot==="function"?storage.getPlanOptimizerSnapshot(planId):Promise.resolve(undefined),hasProvenance?import("./supabase").then(({supabaseAdmin})=>supabaseAdmin.from("plan_optimizer_snapshots").select("baseline_snapshot,override_by,override_at").eq("plan_id",planId).single()):Promise.resolve({data:{}} as any)]);
  // A failed provenance read is different from a legacy day with no provenance.
  // Schema drift must not silently turn an unknown authority into AUTO/defaults.
  if (generalResult.error) throw generalResult.error;
  if (optimizerStateResult.error) throw optimizerStateResult.error;
  const revision=revisions.at(-1); const rawPlan=plan as any; const general=generalResult.data??{};
  const geometry=mainFlowPreferenceGeometry(input);
  const values=configurabilityRegistry.map(c=>projected(c,input,rawPlan,general,Number(rawPlan.current_config_revision_id??revision?.id) || undefined,revision?.fingerprint,optimizer,optimizerStateResult.data,geometry));
  return Object.freeze({contractVersion:2,planId,generatedFrom:"PRODUCTIVE_AUTHORITIES",mainFlowPreference:{value:mainFlowPreferenceFromRow(rawPlan),baseline:mainFlowPreferenceFromRow(rawPlan,"main_baseline_"),defaultGeneral:mainFlowPreferenceFromRow(general),...geometry},values:Object.freeze(values),readiness:deriveReadiness(values),productCoverage:configurabilityCounts});
}
