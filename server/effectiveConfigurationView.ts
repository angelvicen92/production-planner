import type { EngineInput } from "../engine/types";
import { buildEngineInput } from "../engine/buildInput";
import { configurabilityCounts, configurabilityRegistry, type ConfigurabilityCapability } from "../shared/configurability";
import type { EffectiveConfigurationValue, EffectiveConfigurationView, ReadinessIssue } from "../shared/effectiveConfigurationContracts";
import type { IStorage } from "./storage";

export type { EffectiveConfigurationValue, EffectiveConfigurationView } from "../shared/effectiveConfigurationContracts";

const absent = (c:ConfigurabilityCapability):EffectiveConfigurationValue => ({capabilityId:c.capabilityId,label:c.name,category:c.category,value:null,availability:c.status==="MISSING"?"UNAVAILABLE":"UNKNOWN",unit:c.unit,source:"UNKNOWN",validationStatus:c.status==="MISSING"?"UNSUPPORTED":"UNKNOWN",requiresReplan:"UNKNOWN",implementationStatus:c.status,blockers:c.blockers,requiredForDay:false});
function projected(c:ConfigurabilityCapability,input:EngineInput,revision?:number):EffectiveConfigurationValue {
  const common={capabilityId:c.capabilityId,label:c.name,category:c.category,unit:c.unit,effectiveRevision:revision,requiresReplan:"UNKNOWN" as const,implementationStatus:c.status,blockers:c.blockers,requiredForDay:false};
  switch(c.capabilityId){
    case "WORKDAY_WINDOW": return {...common,value:{start:input.workDay.start,end:input.workDay.end},availability:"AVAILABLE",source:"UNKNOWN",validationStatus:"VALID"};
    case "GLOBAL_MEAL_BREAK": return {...common,value:{mode:input.mealMode??"global_hard_break",window:input.meal},availability:"AVAILABLE",source:"UNKNOWN",validationStatus:"VALID"};
    case "PARTICIPANTS": return {...common,value:{count:new Set(input.tasks.map(t=>t.contestantId).filter(Boolean)).size,availabilityRules:Object.keys(input.contestantAvailabilityById??{}).length},availability:"AVAILABLE",source:"MIXED",validationStatus:"VALID"};
    case "TASKS_DEPENDENCIES": return {...common,value:{tasks:input.tasks.length,dependencies:input.tasks.reduce((n,t)=>n+(t.dependsOnTaskIds?.length??0),0)},availability:"AVAILABLE",source:"MIXED",fingerprint:input.taskTemplateSnapshotFingerprint,validationStatus:"VALID"};
    case "SPATIAL_AVAILABILITY": return {...common,value:{zones:input.planZoneSettings?.length??0,spaces:input.planSpaceSettings?.length??0},availability:"AVAILABLE",source:"DAY_SNAPSHOT",validationStatus:"VALID"};
    case "PLAN_RESOURCE_ASSIGNMENTS": return {...common,value:{items:input.planResourceItems.length,taskRequirements:input.tasks.filter(t=>t.resourceRequirements).length},availability:"AVAILABLE",source:"MIXED",validationStatus:"VALID"};
    case "OPTIMIZATION": return {...common,value:{editingMode:input.optimizerSnapshotEditingMode},availability:"AVAILABLE",source:input.optimizerSnapshotSource??"UNKNOWN",fingerprint:input.optimizerSnapshotFingerprint,validationStatus:(input.optimizerCompatibilityWarnings?.length??0)>0?"INCOMPATIBLE":"VALID"};
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
  const [input,session]=await Promise.all([inputBuilder(planId,storage),storage.getActiveAssistedPlanningSession(planId)]);
  const values=configurabilityRegistry.map(c=>projected(c,input,session?.currentConfigRevisionId));
  return Object.freeze({contractVersion:2,planId,generatedFrom:"PRODUCTIVE_AUTHORITIES",values:Object.freeze(values),readiness:deriveReadiness(values),productCoverage:configurabilityCounts});
}
