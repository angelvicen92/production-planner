import type {EngineInput} from '../engine/types';
import {dailyTaskOperationScopesSchema,persistedDailyTaskOperationScopesSchema,type DailyTaskOperationScopes} from '../shared/dailyTaskOperationScopes';
import {resolveConcreteTaskResourceRequirements} from '../engine/concreteTaskResourceRequirements';
import {isDeepStrictEqual} from 'node:util';
const defect=(message:string)=>Object.assign(new Error(message),{status:422});
const ids=(values:readonly number[])=>[...new Set(values)].sort((a,b)=>a-b);
export function dailyTaskOperationScopesAuthority(row:Record<string,any>){
 if(row.daily_task_operation_scopes==null)return null;
 const parsed=persistedDailyTaskOperationScopesSchema.safeParse(row.daily_task_operation_scopes);
 if(!parsed.success||row.planner_next_configuration!=null||!row.planner_next_profile)throw defect('TASK_SCOPE_AUTHORITY_CONFLICT');
 return parsed.data;
}
export function taskOperationScopesSupported(input:EngineInput){
 return !!input.plannerNext&&!input.setupPolicies?.length&&!input.roundSynchronizations?.length&&!input.technicalChains?.length
  &&(!input.anchoredAccompaniments?.length||[1,2].includes(input.dailyAnchoredAccompanimentsVersion??0)
   &&input.anchoredAccompaniments.every(a=>a&&Array.isArray(a.beforeTaskIds)&&Array.isArray(a.afterTaskIds)
    &&input.tasks.some(t=>t.id===a.anchorTaskId&&t.plannerNextKind==='main')))
  &&!input.operationContinuityGroups?.length&&!input.operationalMealPolicies?.length
  &&!input.transportSettings&&!input.tasks.some(t=>t.jointGroupId||t.setupFamilyId);
}
/** Capture explicit requirements before materialization; never subtract team members. */
export function taskScopeDirectResources(input:EngineInput,t:EngineInput['tasks'][number]){
 const stored=input.dailyTaskOperationScopes?.find(p=>p.taskId===t.id);
 return stored?.declaredResourceIds??ids([...(t.declaredResourceIds??[]),...(t.assignedResourceIds??[]),...resolveConcreteTaskResourceRequirements(input,t).resourceIds]);
}
export function withDailyTaskOperationScopes(input:EngineInput,raw:DailyTaskOperationScopes):EngineInput{
 const structure=dailyTaskOperationScopesSchema.parse(raw);
 // A retired declaration owns no task fields and cannot constrain another structure.
 if(structure.policies.length&&!taskOperationScopesSupported(input))throw defect('UNSUPPORTED_TASK_SCOPE_COMBINATION');
 for(const p of structure.policies){
  if(input.anchoredAccompaniments?.some(a=>[...a.beforeTaskIds,a.anchorTaskId,...a.afterTaskIds].includes(p.taskId)))throw defect('TASK_SCOPE_ANCHORED_MEMBER');
  const t=input.tasks.find(t=>t.id===p.taskId&&t.planId===input.planId);
  const unit=p.itinerantUnitId==null?null:input.itinerantCompositionSnapshot?.units.find(u=>u.id===p.itinerantUnitId&&u.plan_id===input.planId);
  if(!t||t.status==='cancelled'||t.operationalRole!=='productive_task'||!['auxiliary','technical'].includes(t.plannerNextKind??'')
   ||!input.planSpaceSettings?.some(s=>s.spaceId===t.spaceId)||t.jointGroupId||t.setupFamilyId
   ||Object.keys(t.resourceRequirements?.byType??{}).length||t.resourceRequirements?.anyOf?.length)throw defect('TASK_SCOPE_INVALID_TASK');
  if(p.itinerantUnitId!=null&&(!unit?.members.length||unit.members.some(m=>!input.planResourceItems.some(r=>r.id===m.planResourceItemId))
   ||t.itinerantTeamRequirement==='specific'&&t.itinerantTeamId!==p.itinerantUnitId
   ||t.itinerantTeamRequirement==='any'&&!t.allowedItinerantTeamIds?.includes(p.itinerantUnitId)))throw defect('TASK_SCOPE_INVALID_UNIT');
  if(p.agendaScope==='ITINERANT_UNIT'&&p.itinerantUnitId==null&&t.itinerantTeamRequirement!=='any'&&t.itinerantTeamRequirement!=='specific')throw defect('TASK_SCOPE_UNIT_REQUIRED');
  if(p.declaredResourceIds.some(id=>!input.planResourceItems.some(r=>r.id===id))||!isDeepStrictEqual(p.declaredResourceIds,taskScopeDirectResources(input,t)))throw defect('TASK_SCOPE_DIRECT_RESOURCE_MISSING');
 }
 const byTask=new Map(structure.policies.map(p=>[p.taskId,p]));
 return {...input,dailyTaskOperationScopes:structure.policies.length?structure.policies:undefined,tasks:input.tasks.map(t=>{
  const p=byTask.get(t.id);if(!p)return t;
  return {...t,agendaScope:p.agendaScope,resourceInheritance:p.resourceInheritance,blocksSpace:p.blocksSpace,declaredResourceIds:[...p.declaredResourceIds],
   ...(p.itinerantUnitId==null?{}:{itinerantTeamRequirement:'specific' as const,itinerantTeamId:p.itinerantUnitId,allowedItinerantTeamIds:[p.itinerantUnitId]})};
 })};
}
export function applyDailyTaskOperationScopes(input:EngineInput,row:Record<string,any>,replay?:Record<string,any>):EngineInput{
 const raw=dailyTaskOperationScopesAuthority(row);if(!raw)return input;
 // Authored provenance is persisted in the authority itself, never inferred from
 // assigned_resource_ids after the solver has materialized a unit or location.
 const source={...input,dailyTaskOperationScopes:raw.policies};
 const effective=withDailyTaskOperationScopes(source,{contractVersion:1,policies:raw.policies});
 if(row.current_config_revision_id!=null){
  const authority=replay?.authorities?.plan_workday?.[0]?.plannerNextAuthorities;
  if(!isDeepStrictEqual(authority?.dailyTaskOperationScopes,raw.policies.length?raw.policies:undefined))throw defect('TASK_SCOPE_REVISION_NOT_MATERIALIZED');
  for(const p of raw.policies){
   const t=effective.tasks.find(t=>t.id===p.taskId)!;
   const ops=authority.taskOperations?.filter((op:any)=>op.taskId===p.taskId);
   if(ops?.length!==1||['agendaScope','resourceInheritance','blocksSpace','declaredResourceIds','itinerantTeamId','itinerantTeamRequirement','allowedItinerantTeamIds'].some(key=>!isDeepStrictEqual(ops[0][key],(t as any)[key])))throw defect('TASK_SCOPE_REVISION_NOT_MATERIALIZED');
  }
 }
 return effective;
}
