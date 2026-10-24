import type {EngineInput,TaskInput} from '../../types';
import {resolveConcreteResourceItem} from '../../concreteTaskResourceRequirements';
import {resolveEffectivePlanResourceAvailability} from './effectivePlanResourceAvailability';

/** Explicit opt-in: one physical choice in an ordinary standalone auxiliary. */
export function resolveNominalResourceRequirements(input:EngineInput,task:TaskInput){
  const groups=task.resourceRequirements?.anyOf;
  const resourceIds:number[]=[],availableResourceIds:number[]=[],issues:{reason:string;[key:string]:unknown}[]=[];
  if(!groups?.length)return {resourceIds,availableResourceIds,issues};
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
  if(groups.length!==1)issues.push({reason:'ANYOF_REQUIRES_SINGLE_GROUP'});
  const group=groups[0];
  if(!Array.isArray(group.resourceItemIds)||group.resourceItemIds.length===0)issues.push({reason:'EMPTY_NOMINAL_RESOURCE_DOMAIN'});
  if(group.quantity!==1)issues.push({reason:'UNREPRESENTABLE_QUANTITY',quantity:group.quantity});
  for(const id of [...new Set(group.resourceItemIds??[])]){
    const resolved=resolveConcreteResourceItem(input,String(id),group.quantity);
    if(resolved.issue){issues.push(resolved.issue);continue;}
    const resource=resolved.resource!;resourceIds.push(resource.id);
    if(Object.values(input.vocalCoachPlanResourceItemIdByContestantId??{}).includes(resource.id))issues.push({reason:'NOMINAL_COACH_SELECTION_UNSUPPORTED',resourceId:resource.id});
    const availability=resolveEffectivePlanResourceAvailability(input.workDay,resource);
    if(availability.status==='INVALID')issues.push({reason:'INVALID_NOMINAL_RESOURCE_AVAILABILITY',resourceId:resource.id,availability});
    if(availability.status==='AVAILABLE')availableResourceIds.push(resource.id);
    if(input.resourcePresenceConcentrationPolicies?.[resource.id]&&input.resourcePresenceConcentrationPolicies[resource.id]!=='OFF')
      issues.push({reason:'ANYOF_RESOURCE_MACRO_UNSUPPORTED',resourceId:resource.id});
  }
  const selected=(task.assignedResourceIds??[]).filter(id=>resourceIds.includes(id));
  if(new Set(selected).size>1)issues.push({reason:'MULTIPLE_NOMINAL_RESOURCE_ASSIGNMENTS',selected});
  if((task.status==='done'||task.status==='in_progress')&&selected.length!==1)issues.push({reason:'PROTECTED_NOMINAL_CHOICE_MISSING'});
  if(!availableResourceIds.length)issues.push({reason:'NO_AVAILABLE_NOMINAL_RESOURCE',resourceIds});
  return {resourceIds:resourceIds.sort((a,b)=>a-b),availableResourceIds:availableResourceIds.sort((a,b)=>a-b),
    selectedResourceId:selected[0],issues};
}
