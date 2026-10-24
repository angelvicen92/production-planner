import type {EngineInput,TaskInput} from '../../types';
import {resolveConcreteResourceItem} from '../../concreteTaskResourceRequirements';
import {resolveEffectivePlanResourceAvailability} from './effectivePlanResourceAvailability';

/** Explicit opt-in: one physical choice in an ordinary standalone auxiliary. */
export function resolveNominalResourceRequirements(input:EngineInput,task:TaskInput){
  const groups=task.resourceRequirements?.anyOf;
  const types=Object.entries(task.resourceRequirements?.byType??{});
  const typed=types.length>0;
  const requestedResourceTypeId=typed?types[0][0]:undefined;
  const compatibleResourceIds=typed?input.planResourceItems.filter(r=>String(r.typeId)===requestedResourceTypeId).map(r=>r.id).sort((a,b)=>a-b):[];
  const excludedResources:{resourceId:number;reason:string}[]=[];
  const resourceIds:number[]=[],availableResourceIds:number[]=[],issues:{reason:string;[key:string]:unknown}[]=[];
  if(!groups?.length&&!typed)return {resourceIds,availableResourceIds,issues};
  if(typed&&(types.length!==1||groups?.length)){
    issues.push({reason:types.length!==1?'BYTYPE_REQUIRES_SINGLE_TYPE':'BYTYPE_ANYOF_COMBINATION_UNSUPPORTED'});
    return {resourceIds,availableResourceIds,issues};
  }
  const structured=task.jointGroupId!=null||task.setupFamilyId!=null||task.itinerantTeamId!=null||!!task.allowedItinerantTeamIds?.length
    ||task.operationalRole!=null&&task.operationalRole!=='productive_task'
    ||input.operationContinuityGroups?.some(group=>group.taskIds.includes(task.id))
    ||input.setupPolicies?.some(policy=>policy.spaceId===task.spaceId)
    ||input.technicalChains?.some(policy=>policy.orderedTaskIds.includes(task.id))
    ||input.roundSynchronizations?.some(policy=>policy.lanes.some(lane=>lane.taskIds.includes(task.id)))
    ||input.anchoredAccompaniments?.some(anchor=>[anchor.anchorTaskId,...anchor.beforeTaskIds,...anchor.afterTaskIds].includes(task.id));
  if(input.plannerNext?.profile!=='STANDALONE_ONLY'||task.plannerNextKind!=='auxiliary'||structured)
    issues.push({reason:'ANYOF_REQUIRES_ORDINARY_STANDALONE_AUXILIARY'});
  if(input.plannerNext?.searchPolicy!=='EXACT_CONSTRUCTIVE')issues.push({reason:'ANYOF_REQUIRES_EXACT_ORDINARY_CONSTRUCTOR'});
  if(!typed&&groups!.length!==1){issues.push({reason:'ANYOF_REQUIRES_SINGLE_GROUP'});return {resourceIds,availableResourceIds,issues};}
  const group=typed?{quantity:types[0][1],resourceItemIds:[] as number[]}:groups![0];
  if(!typed&&(!Array.isArray(group.resourceItemIds)||group.resourceItemIds.length===0))issues.push({reason:'EMPTY_NOMINAL_RESOURCE_DOMAIN'});
  if(group.quantity!==1)issues.push({reason:'UNREPRESENTABLE_QUANTITY',quantity:group.quantity});
  const candidates=typed?input.planResourceItems.filter(r=>String(r.typeId)===requestedResourceTypeId):
    [...new Set(group.resourceItemIds??[])].sort((a,b)=>a-b).flatMap(id=>{
      const resolved=resolveConcreteResourceItem(input,String(id),group.quantity);
      if(resolved.issue){issues.push(resolved.issue);return[];}return[resolved.resource!];
    });
  if(typed&&!candidates.length)issues.push({reason:'NO_COMPATIBLE_DAILY_RESOURCE',requestedResourceTypeId});
  for(const resource of candidates){
    const reason=!(Number.isInteger(resource.id)&&resource.id>0)?'MISSING_DAILY_RESOURCE'
      :input.planResourceItems.filter(r=>r.id===resource.id).length!==1?'AMBIGUOUS_DAILY_RESOURCE'
      :resource.typeCode==='auxiliar'||resource.category==='auxiliar'?'UNREPRESENTABLE_AUXILIARY_CAPACITY'
      :resource.resourceItemId!=null&&input.resourceItemComponents?.[resource.resourceItemId]?.length?'NOMINAL_COMPOSITE_RESOURCE_UNSUPPORTED'
      :Object.values(input.vocalCoachPlanResourceItemIdByContestantId??{}).includes(resource.id)?'NOMINAL_COACH_SELECTION_UNSUPPORTED'
      :input.resourcePresenceConcentrationPolicies?.[resource.id]&&input.resourcePresenceConcentrationPolicies[resource.id]!=='OFF'?'ANYOF_RESOURCE_MACRO_UNSUPPORTED':undefined;
    if(reason){
      if(typed)excludedResources.push({resourceId:resource.id,reason});else issues.push({reason,resourceId:resource.id});
      continue;
    }
    resourceIds.push(resource.id);
    const availability=resolveEffectivePlanResourceAvailability(input.workDay,resource);
    if(availability.status==='INVALID')issues.push({reason:'INVALID_NOMINAL_RESOURCE_AVAILABILITY',resourceId:resource.id,availability});
    if(availability.status==='AVAILABLE')availableResourceIds.push(resource.id);
  }
  const selected=[...new Set((task.assignedResourceIds??[]).filter(id=>resourceIds.includes(id)))].sort((a,b)=>a-b);
  if(new Set(selected).size>1)issues.push({reason:'MULTIPLE_NOMINAL_RESOURCE_ASSIGNMENTS',selected});
  if((task.status==='done'||task.status==='in_progress')&&selected.length!==1)issues.push({reason:'PROTECTED_NOMINAL_CHOICE_MISSING'});
  if(typed&&candidates.length&&!resourceIds.length)issues.push({reason:'NO_ELIGIBLE_NOMINAL_RESOURCE',requestedResourceTypeId,excludedResources});
  if(!availableResourceIds.length)issues.push({reason:'NO_AVAILABLE_NOMINAL_RESOURCE',resourceIds});
  return {resourceIds:resourceIds.sort((a,b)=>a-b),availableResourceIds:availableResourceIds.sort((a,b)=>a-b),
    selectedResourceId:selected[0],requestedResourceTypeId,compatibleResourceIds,excludedResources,issues};
}
