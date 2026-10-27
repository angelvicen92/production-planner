import type {EngineInput} from '../engine/types';
import {anchoredAccompanimentStructureSchema,persistedAnchoredAccompanimentStructureSchema,anchoredPolicyUnitIds,type AnchoredAccompanimentStructure} from '../shared/anchoredAccompanimentStructure';
const defect=(s:string)=>Object.assign(new Error(s),{status:422});
export function dailyAnchoredAuthority(row:Record<string,any>){
 if(row.daily_anchored_accompaniments==null)return null;
 const parsed=persistedAnchoredAccompanimentStructureSchema.safeParse(row.daily_anchored_accompaniments);
 if(!parsed.success||row.planner_next_configuration!=null||!row.planner_next_profile)throw defect('ANCHORED_AUTHORITY_CONFLICT');
 return parsed.data;
}
export function anchoredCombinationSupported(input:EngineInput){
 return !input.dailyTaskOperationScopes?.length&&input.plannerNext?.profile!=='STANDALONE_ONLY'&&!!input.plannerNext?.mainFlow&&!input.setupPolicies?.length
  &&!input.roundSynchronizations?.length&&!input.technicalChains?.length&&!input.operationContinuityGroups?.length
  &&!input.operationalMealPolicies?.length&&!input.transportSettings&&!input.tasks.some(t=>t.jointGroupId||t.setupFamilyId);
}
export function withDailyAnchoredAccompaniments(input:EngineInput,raw:AnchoredAccompanimentStructure,declarations?:ReadonlyMap<number,number[]>):EngineInput{
 const structure=anchoredAccompanimentStructureSchema.parse(raw);
 if(!anchoredCombinationSupported(input))throw defect('UNSUPPORTED_ANCHORED_COMBINATION');
 const used=new Set<number>(),identities=new Set<string>();
 for(const policy of structure.policies){
  const ids=[...policy.beforeTaskIds,policy.anchorTaskId,...policy.afterTaskIds],domain=anchoredPolicyUnitIds(policy);
  if(identities.has(policy.id))throw defect('ANCHORED_DUPLICATE_OPERATION');identities.add(policy.id);
  if(ids.some(id=>used.has(id))||new Set(ids).size!==ids.length)throw defect('ANCHORED_DUPLICATE_MEMBER');ids.forEach(id=>used.add(id));
  const anchor=input.tasks.find(t=>t.id===policy.anchorTaskId&&t.planId===input.planId);
  if(domain.some(id=>!input.itinerantCompositionSnapshot?.units.some(u=>u.id===id&&u.plan_id===input.planId&&u.members.length))||!anchor||anchor.plannerNextKind!=='main'||anchor.spaceId!==input.plannerNext!.mainFlow!.spaceId||anchor.contestantId==null)throw defect('ANCHORED_INVALID_ANCHOR_OR_UNIT');
  for(const id of ids){
   const t=input.tasks.find(t=>t.id===id&&t.planId===input.planId);
   if(!t||t.status==='cancelled'||t.operationalRole!=='productive_task'||t.contestantId!==anchor.contestantId||t.plannerNextKind!==(id===anchor.id?'main':'auxiliary')
    ||!input.planSpaceSettings?.some(s=>s.spaceId===t.spaceId)||!t.durationOverrideMin||t.durationOverrideMin%5!==0
    ||t.itinerantTeamRequirement==='specific'&&domain.some(id=>t.itinerantTeamId!==id)
    ||t.itinerantTeamRequirement==='any'&&domain.some(id=>!t.allowedItinerantTeamIds?.includes(id))
    ||Object.keys(t.resourceRequirements?.byType??{}).length||(t.resourceRequirements?.anyOf?.length??0))throw defect('ANCHORED_INVALID_MEMBER');
   const deps=t.dependsOnTaskIds??(t.dependsOnTaskId?[t.dependsOnTaskId]:[]),position=ids.indexOf(id);
   if(deps.some(dep=>ids.indexOf(dep)>=position))throw defect('ANCHORED_CONTRADICTORY_ORDER');
  }
 }
 const member=new Map(structure.policies.flatMap(p=>[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds].map(id=>[id,p] as const)));
 const tasks=input.tasks.map(t=>{const p=member.get(t.id);if(!p)return t;
  const domain=anchoredPolicyUnitIds(p),fixed='itinerantUnitId' in p?p.itinerantUnitId:null;
  const direct=declarations?.get(t.id)??[...new Set([...(t.declaredResourceIds??[]),...(t.assignedResourceIds??[])])].sort((a,b)=>a-b);
  const members=new Set(input.itinerantTeamAvailability?.filter(u=>domain.includes(u.itinerantTeamId)).flatMap(u=>u.planResourceItemIds??[]));
  return {...t,declaredResourceIds:direct,
   // Accepted composition members are observations, not newly authored direct resources.
   ...(fixed===null?{assignedResourceIds:(t.assignedResourceIds??[]).filter(id=>!members.has(id)||direct.includes(id))}:{}),
   itinerantTeamRequirement:fixed===null?'any' as const:'specific' as const,itinerantTeamId:fixed,allowedItinerantTeamIds:domain,
   ...(t.id===p.anchorTaskId?{agendaScope:'PHYSICAL_SPACE' as const,resourceInheritance:'LOCATION' as const}:{blocksSpace:false,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const})};
 });
 return {...input,tasks,dailyAnchoredAccompanimentsVersion:structure.policies.length?structure.contractVersion:undefined,
  anchoredAccompaniments:structure.policies.length?structure.policies.map(p=>({id:p.id,anchorTaskId:p.anchorTaskId,beforeTaskIds:p.beforeTaskIds,afterTaskIds:p.afterTaskIds,adjacency:p.adjacency,internalTransition:p.internalTransition,resourceContinuity:p.resourceContinuity})):undefined,
  // The only UNSUPPORTED_TASK_ROLE issue on a real Main is this profile's unit gate.
  // All other role, resource, dependency and coach defects remain authoritative.
  plannerNextMaterializationIssues:input.plannerNextMaterializationIssues?.filter(i=>!(i.code==='UNSUPPORTED_TASK_ROLE'&&structure.policies.some(p=>p.anchorTaskId===i.taskId))),
 };
}
export function applyDailyAnchoredAccompaniments(input:EngineInput,row:Record<string,any>,replay?:Record<string,any>):EngineInput{
 const raw=dailyAnchoredAuthority(row);if(!raw)return input;
 let declarations:Map<number,number[]>|undefined;
 if(raw.policies.length&&row.current_config_revision_id!=null){
  const authority=replay?.authorities?.plan_workday?.[0]?.plannerNextAuthorities;
  declarations=new Map();
  for(const p of raw.policies){const contract=authority?.anchoredAccompaniments?.find((c:any)=>c.id===p.id&&c.anchorTaskId===p.anchorTaskId&&JSON.stringify(c.beforeTaskIds)===JSON.stringify(p.beforeTaskIds)&&JSON.stringify(c.afterTaskIds)===JSON.stringify(p.afterTaskIds));
   if(!contract)throw defect('ANCHORED_REVISION_NOT_MATERIALIZED');
   for(const id of [...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds]){const op=authority.taskOperations?.find((o:any)=>o.taskId===id);
    const fixed='itinerantUnitId' in p?p.itinerantUnitId:null;
    if(!op||op.itinerantTeamId!==fixed||!Array.isArray(op.declaredResourceIds)
      ||raw.contractVersion===2&&JSON.stringify(op.allowedItinerantTeamIds)!==JSON.stringify(anchoredPolicyUnitIds(p)))throw defect('ANCHORED_RESOURCE_PROVENANCE_MISSING');
    declarations.set(id,[...op.declaredResourceIds]);
   }
  }
 }
 return withDailyAnchoredAccompaniments(input,anchoredAccompanimentStructureSchema.parse({contractVersion:raw.contractVersion,policies:raw.policies}),declarations);
}
