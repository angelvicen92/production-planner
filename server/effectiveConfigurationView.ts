import type { EngineInput } from "../engine/types";
import { buildEngineInput } from "../engine/buildInput";
import { configurabilityCounts, configurabilityRegistry, type ConfigurabilityCapability, type ConfigurationCategory } from "../shared/configurability";
import type { IStorage } from "./storage";

export type EffectiveValueAvailability = "AVAILABLE" | "UNKNOWN" | "UNAVAILABLE";
export type EffectiveValueSource = "INHERITED" | "DAY_OVERRIDE" | "INSTANCE_OVERRIDE" | "PROTECTED" | "UNKNOWN";
export type EffectiveValidationStatus = "VALID" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED" | "UNKNOWN";
export type ReadinessStatus = "READY" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED";
export interface EffectiveConfigurationValue { capabilityId:string; label:string; category:ConfigurationCategory; value:unknown; availability:EffectiveValueAvailability; unit:string; severity?:string; source:EffectiveValueSource; baseValue?:unknown; overrideState:"INHERITED"|"DAY"|"INSTANCE"|"PROTECTED"|"NONE"|"UNKNOWN"; effectiveRevision?:number; fingerprint?:string; validationStatus:EffectiveValidationStatus; requiresReplan:"YES"|"NO"|"UNKNOWN"; }
export interface ReadinessIssue { capabilityId:string; category:ConfigurationCategory; status:Exclude<ReadinessStatus,"READY">; message:string; navigationTarget:string; }
export interface EffectiveConfigurationView { contractVersion:1; planId:number; generatedFrom:"PRODUCTIVE_AUTHORITIES"; values:readonly EffectiveConfigurationValue[]; readiness:{status:ReadinessStatus;issues:readonly ReadinessIssue[]}; capabilityCounts:typeof configurabilityCounts; }

const absent = (c:ConfigurabilityCapability):EffectiveConfigurationValue => ({capabilityId:c.capabilityId,label:c.name,category:c.category,value:null,availability:c.status==="MISSING"?"UNAVAILABLE":"UNKNOWN",unit:c.unit,source:"UNKNOWN",overrideState:"UNKNOWN",validationStatus:c.status==="MISSING"?"UNSUPPORTED":"UNKNOWN",requiresReplan:"UNKNOWN"});
function projected(c:ConfigurabilityCapability,input:EngineInput,revision?:number):EffectiveConfigurationValue {
  const common={capabilityId:c.capabilityId,label:c.name,category:c.category,unit:c.unit,effectiveRevision:revision,requiresReplan:"UNKNOWN" as const};
  switch(c.capabilityId){
    case "WORKDAY_GRID": return {...common,value:{start:input.workDay.start,end:input.workDay.end},availability:"AVAILABLE",source:"DAY_OVERRIDE",overrideState:"DAY",validationStatus:"VALID"};
    case "MEALS_BY_SCOPE": return {...common,value:{mode:input.mealMode??"global_hard_break",window:input.meal,participantDurationMinutes:input.contestantMealDurationMinutes,maxSimultaneous:input.contestantMealMaxSimultaneous},availability:"AVAILABLE",source:"DAY_OVERRIDE",overrideState:"DAY",validationStatus:"VALID"};
    case "PARTICIPANTS": return {...common,value:{count:new Set(input.tasks.map(t=>t.contestantId).filter(Boolean)).size,availabilityOverrides:Object.keys(input.contestantAvailabilityById??{}).length},availability:"AVAILABLE",source:"INSTANCE_OVERRIDE",overrideState:"INSTANCE",validationStatus:"VALID"};
    case "TASKS_DEPENDENCIES": return {...common,value:{tasks:input.tasks.length,dependencies:input.tasks.reduce((n,t)=>n+(t.dependsOnTaskIds?.length??0),0)},availability:"AVAILABLE",source:"INSTANCE_OVERRIDE",overrideState:"INSTANCE",fingerprint:input.taskTemplateSnapshotFingerprint,validationStatus:"VALID"};
    case "SPACES_CAPACITY": return {...common,value:{zones:input.planZoneSettings?.length??0,spaces:input.planSpaceSettings?.length??0,explicitCapacities:Object.keys(input.spaceCapacityById??{}).length},availability:"AVAILABLE",source:"DAY_OVERRIDE",overrideState:"DAY",validationStatus:"VALID"};
    case "RESOURCES": return {...common,value:{items:input.planResourceItems.length,taskRequirements:input.tasks.filter(t=>t.resourceRequirements).length},availability:"AVAILABLE",source:"DAY_OVERRIDE",overrideState:"DAY",validationStatus:"VALID"};
    case "ITINERANT_UNITS": return {...common,value:{availabilityRules:input.itinerantTeamAvailability?.length??0},availability:"AVAILABLE",source:"INSTANCE_OVERRIDE",overrideState:"INSTANCE",validationStatus:"VALID"};
    case "TRANSPORT": return input.transportSettings?{...common,value:input.transportSettings,availability:"AVAILABLE",source:"INHERITED",overrideState:"INHERITED",fingerprint:input.optimizerSnapshotFingerprint,validationStatus:"VALID"}:absent(c);
    case "OPTIMIZATION": return {...common,value:{editingMode:input.optimizerSnapshotEditingMode,source:input.optimizerSnapshotSource},availability:"AVAILABLE",source:input.optimizerSnapshotSource==="DAY_OVERRIDE"?"DAY_OVERRIDE":"INHERITED",overrideState:input.optimizerSnapshotSource==="DAY_OVERRIDE"?"DAY":"INHERITED",fingerprint:input.optimizerSnapshotFingerprint,validationStatus:(input.optimizerCompatibilityWarnings?.length??0)>0?"INCOMPATIBLE":"VALID"};
    case "PROTECTED_STATE_LOCKS": return {...common,value:{locks:input.locks.length,protectedTasks:input.tasks.filter(t=>t.status==="done"||t.status==="in_progress").length},availability:"AVAILABLE",source:"PROTECTED",overrideState:"PROTECTED",validationStatus:"VALID",requiresReplan:"NO"};
    default:return absent(c);
  }
}
export function deriveReadiness(values:readonly EffectiveConfigurationValue[]):EffectiveConfigurationView["readiness"]{
  const issues:ReadinessIssue[]=[];
  for(const value of values){
    if(value.validationStatus==="INCOMPATIBLE")issues.push({capabilityId:value.capabilityId,category:value.category,status:"INCOMPATIBLE",message:`${value.label} contiene incompatibilidades demostradas por su autoridad actual.`,navigationTarget:value.category});
    else if(value.validationStatus==="INCOMPLETE")issues.push({capabilityId:value.capabilityId,category:value.category,status:"INCOMPLETE",message:`Falta completar ${value.label}.`,navigationTarget:value.category});
  }
  for(const value of values)if(value.validationStatus==="UNSUPPORTED")issues.push({capabilityId:value.capabilityId,category:value.category,status:"UNSUPPORTED",message:`${value.label} aún no está soportado de extremo a extremo.`,navigationTarget:value.category});
  const status=issues.some(i=>i.status==="INCOMPATIBLE")?"INCOMPATIBLE":issues.some(i=>i.status==="INCOMPLETE")?"INCOMPLETE":issues.some(i=>i.status==="UNSUPPORTED")?"UNSUPPORTED":"READY";
  return {status,issues:Object.freeze(issues)};
}
export async function buildEffectiveConfigurationView(storage:IStorage,planId:number,inputBuilder:typeof buildEngineInput=buildEngineInput):Promise<EffectiveConfigurationView>{
  const plan=await storage.getPlan(planId); if(!plan)throw Object.assign(new Error("PLAN_NOT_FOUND"),{status:404});
  const [input,session]=await Promise.all([inputBuilder(planId,storage),storage.getActiveAssistedPlanningSession(planId)]);
  const values=configurabilityRegistry.map(c=>projected(c,input,session?.currentConfigRevisionId));
  return Object.freeze({contractVersion:1,planId,generatedFrom:"PRODUCTIVE_AUTHORITIES",values:Object.freeze(values),readiness:deriveReadiness(values),capabilityCounts:configurabilityCounts});
}
