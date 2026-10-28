import { hasDailyRequiredPhases, requiredPhaseCompositionSupported } from "./technicalChainStructure";
import {isDeepStrictEqual} from 'node:util';
import type {EngineInput} from '../engine/types';
import {jointGroupStructureSchema,persistedJointGroupStructureSchema,type JointGroupStructure} from '../shared/jointGroupStructure';
import {resolveEffectiveTaskResourceAssignments} from '../engine/planner-next/integration/effectiveTaskResourceAssignments';
import { fixedItinerantCompositionSupported } from "./itinerantComposition";
const defect=(s:string)=>Object.assign(new Error(s),{status:422});
export function dailyJointAuthority(row:Record<string,any>){
 if(row.daily_joint_groups==null)return null;
 const parsed=persistedJointGroupStructureSchema.safeParse(row.daily_joint_groups);
 if(!parsed.success||row.planner_next_configuration!=null||!row.planner_next_profile)throw defect('JOINT_AUTHORITY_CONFLICT');
 return parsed.data;
}
/** Explicit boundary; existing consumers do not certify arbitrary composition. */
export function jointCombinationSupported(input:EngineInput){
 return !!input.plannerNext&&!input.setupPolicies?.length&&!input.roundSynchronizations?.length&&(!input.technicalChains?.length||(hasDailyRequiredPhases(input)&&requiredPhaseCompositionSupported(input)))
  &&((!input.anchoredAccompaniments?.length&&!input.dailyTaskOperationScopes?.length)||requiredPhaseCompositionSupported(input))&&!input.operationContinuityGroups?.length
  &&(!input.operationalMealPolicies?.length||input.dailyOperationalMealsVersion===1)&&!input.transportSettings&&input.mealMode==='global_hard_break'
  &&fixedItinerantCompositionSupported(input)
  &&!input.tasks.filter(t=>t.status!=='cancelled').some(t=>t.setupFamilyId
   ||Object.keys(t.resourceRequirements?.byType??{}).length||t.resourceRequirements?.anyOf?.length);
}
export function withDailyJointGroups(input:EngineInput,raw:JointGroupStructure):EngineInput{
 const structure=jointGroupStructureSchema.parse(raw);
 if(structure.groups.length&&!jointCombinationSupported(input))throw defect('UNSUPPORTED_JOINT_COMBINATION');
 const assignments=resolveEffectiveTaskResourceAssignments(input),byId=new Map(input.tasks.map(t=>[t.id,t]));
 for(const group of structure.groups){
  if(group.taskIds.some(id=>input.dailyTaskOperationScopes?.some(s=>s.taskId===id)||input.anchoredAccompaniments?.some(a=>[...a.beforeTaskIds,a.anchorTaskId,...a.afterTaskIds].includes(id))))throw defect('JOINT_INVALID_MEMBER');
  const tasks=group.taskIds.map(id=>byId.get(id));
  if(tasks.some(t=>!t||t.planId!==input.planId||t.status==='cancelled'||t.plannerNextKind!=='auxiliary'||t.operationalRole!=='productive_task'||t.contestantId==null||t.setupFamilyId||t.blocksSpace===false||t.jointGroupId))throw defect('JOINT_INVALID_MEMBER');
  const members=tasks as EngineInput['tasks'],first=members[0];
  if(new Set(members.map(t=>t.contestantId)).size!==members.length)throw defect('JOINT_DUPLICATE_PARTICIPANT');
  if(members.some(t=>t.durationOverrideMin!==first.durationOverrideMin)||!first.durationOverrideMin||first.durationOverrideMin%5)throw defect('JOINT_DURATION_MISMATCH');
  if(members.some(t=>t.spaceId!==first.spaceId)||!input.planSpaceSettings?.some(s=>s.spaceId===first.spaceId))throw defect('JOINT_SPACE_MISMATCH');
  if(members.some(t=>(t.itinerantTeamId??null)!==(first.itinerantTeamId??null)))throw defect('JOINT_UNIT_MISMATCH');
  const resources=members.map(t=>assignments.assignments.find(a=>a.taskId===t.id)?.effectiveResourceIds);
  if(resources.some(r=>!r||!isDeepStrictEqual(r,resources[0]))||members.some(t=>Object.values(t.resourceRequirements?.byItem??{}).some(q=>q!==1)))throw defect('JOINT_RESOURCE_MISMATCH');
  if(members.some(t=>(t.dependsOnTaskIds??[]).some(id=>group.taskIds.includes(id))))throw defect('JOINT_INTERNAL_DEPENDENCY');
  const windows=members.map(t=>input.contestantAvailabilityById?.[t.contestantId!]);
  if(windows.some(w=>!w)||Math.max(...windows.map(w=>minute(w!.start)))+first.durationOverrideMin>Math.min(...windows.map(w=>minute(w!.end))))throw defect('JOINT_NO_COMMON_AVAILABILITY');
 }
 const groups=new Map(structure.groups.flatMap(g=>g.taskIds.map(id=>[id,g.id] as const)));
 return {...input,dailyJointGroupsVersion:structure.groups.length?1:undefined,dailyJointGroups:structure.groups.length?structure.groups:undefined,tasks:input.tasks.map(t=>groups.has(t.id)?{...t,jointGroupId:groups.get(t.id)}:t)};
}
const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export function applyDailyJointGroups(input:EngineInput,row:Record<string,any>,replay?:Record<string,any>):EngineInput{
 const raw=dailyJointAuthority(row);if(!raw)return input;
 const effective=withDailyJointGroups(input,{contractVersion:1,groups:raw.groups});
 if(row.current_config_revision_id!=null){
  const authority=replay?.authorities?.plan_workday?.[0]?.plannerNextAuthorities;
  if(!isDeepStrictEqual(authority?.dailyJointGroups,effective.dailyJointGroups)||authority?.dailyJointGroupsVersion!==effective.dailyJointGroupsVersion
   ||effective.tasks.some(t=>authority?.taskOperations?.filter((o:any)=>o.taskId===t.id).length!==1
     ||authority.taskOperations.find((o:any)=>o.taskId===t.id).jointGroupId!==t.jointGroupId))throw defect('JOINT_REVISION_NOT_MATERIALIZED');
 }
 return effective;
}
