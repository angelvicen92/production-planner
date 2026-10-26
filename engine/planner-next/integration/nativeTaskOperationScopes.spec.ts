import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../types';
import {withDailyTaskOperationScopes,taskScopeDirectResources,applyDailyTaskOperationScopes,taskOperationScopesSupported} from '../../../server/dailyTaskOperationScopes';
import {dailyTaskOperationScopesSchema} from '../../../shared/dailyTaskOperationScopes';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
import {resolveEffectiveTaskResourceAssignments as assignments} from './effectiveTaskResourceAssignments';
import {adaptEngineInputToPlannerNextProblem as adapt} from './engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {diagnoseTaskPlacement} from '../placement';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
const source=():EngineInput=>JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00v/causal/input.json.gz')).toString());
const policy=(i:EngineInput)=>({taskId:i.tasks[0].id,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const,blocksSpace:true,itinerantUnitId:i.itinerantCompositionSnapshot!.units[0].id,declaredResourceIds:taskScopeDirectResources(i,i.tasks[0]) as number[]});
test('native standalone scope changes capacity, preserving physical location, members and direct resource',()=>{
 const input=source(),before=structuredClone(input),next=withDailyTaskOperationScopes(input,{contractVersion:1,policies:[policy(input)]});
 assert.deepEqual(input,before);const a=assignments(input).assignments[0],b=assignments(next).assignments[0];
 assert.deepEqual(a.spaceResourceIds,[1]);assert.deepEqual(b.spaceResourceIds,[]);assert.deepEqual(b.effectiveResourceIds,[2,3,4]);
 for(const [value,overlap] of [[input,false],[next,true]] as const){const adapted=adapt(value);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error();
  const p=adapted.problem,scope=createPlanningScope({kind:'TASK_IDS',value:p.tasks.map(t=>t.id).join(',')},{},p.tasks.map(t=>t.id)),r=executeAssistedPlanning(buildAssistedProblem(p,scope,[]));
  assert.ok(r.proposal);assert.equal(r.evidence.hardValid,true);const reality=r.proposal!.find(t=>t.id==='task:1')!,cam=r.proposal!.find(t=>t.id==='task:3')!;
  assert.equal(reality.start<cam.end&&cam.start<reality.end,overlap);assert.equal(r.evidence.work?.branchesExplored,5);
 }
});
test('agenda, inheritance and occupancy remain independent across all eight declarations',()=>{
 for(const agendaScope of ['PHYSICAL_SPACE','ITINERANT_UNIT'] as const)for(const resourceInheritance of ['LOCATION','OPERATION_ONLY'] as const)for(const blocksSpace of [false,true]){
  const input=source(),next=withDailyTaskOperationScopes(input,{contractVersion:1,policies:[{...policy(input),agendaScope,resourceInheritance,blocksSpace}]});
  assert.equal(next.tasks[0].blocksSpace,blocksSpace);assert.equal(next.tasks[0].agendaScope,agendaScope);assert.equal(next.tasks[0].spaceId,input.tasks[0].spaceId);
  const adapted=adapt(next);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error();const p=adapted.problem,real=p.tasks[0],corner=p.tasks[1],placement={...real,start:540,end:560};
  const d=diagnoseTaskPlacement(p,corner,540,[placement]);assert.equal(d.valid,!blocksSpace&&resourceInheritance==='OPERATION_ONLY');
  assert.equal(assignments(next).assignments[0].effectiveResourceIds.includes(1),resourceInheritance==='LOCATION');
 }
});
test('unselected eligible units remain unselected; fixed daily selection uses authentic identity',()=>{
 const i=source();i.tasks[0]={...i.tasks[0],itinerantTeamId:null,itinerantTeamRequirement:'any',allowedItinerantTeamIds:[1]};
 const next=withDailyTaskOperationScopes(i,{contractVersion:1,policies:[{...policy(i),itinerantUnitId:null}]});assert.equal(next.tasks[0].itinerantTeamId,null);assert.equal(next.tasks[0].itinerantTeamRequirement,'any');
});
test('retired empty declarations leave other structures untouched without advertising combination support',()=>{
 const input={...source(),anchoredAccompaniments:[{} as any]},before=structuredClone(input);
 const structure={contractVersion:1 as const,policies:[]},next=withDailyTaskOperationScopes(input,structure);
 assert.deepEqual(input,before);assert.deepEqual(next.tasks,input.tasks);assert.deepEqual(next.anchoredAccompaniments,input.anchoredAccompaniments);
 assert.equal(next.dailyTaskOperationScopes,undefined);assert.equal(taskOperationScopesSupported(next),false);
 assert.throws(()=>withDailyTaskOperationScopes(input,{contractVersion:1,policies:[policy(input)]}),/UNSUPPORTED/);
 const row={daily_task_operation_scopes:{...structure,by:'00000000-0000-0000-0000-000000000001',at:'2026-10-26'},planner_next_profile:{},current_config_revision_id:2};
 const replay={authorities:{plan_workday:projectEffectiveAuthoritiesFromEngineInputV1(next).plan_workday!.semanticValue}};
 assert.deepEqual(applyDailyTaskOperationScopes(input,row,replay),next);
});
test('invalid task, unit, provenance, duplicate and unsupported authorities fail closed',()=>{
 const i=source(),p=policy(i);for(const changed of [{...p,taskId:999},{...p,itinerantUnitId:999},{...p,declaredResourceIds:[]},{...p,declaredResourceIds:[999]}])assert.throws(()=>withDailyTaskOperationScopes(i,{contractVersion:1,policies:[changed]}));
 assert.equal(dailyTaskOperationScopesSchema.safeParse({contractVersion:1,policies:[p,p]}).success,false);
 assert.equal(dayConfigEditSchema.safeParse({taskOperationScopes:{contractVersion:1,policies:[p]}}).success,false);
 assert.equal(dayConfigEditSchema.safeParse({taskOperationScopes:{contractVersion:1,policies:[p]},expectedRevisionId:1,participantTransitionMinutes:0}).success,false);
 const empty=source();empty.itinerantCompositionSnapshot!.units[0].members=[];assert.throws(()=>withDailyTaskOperationScopes(empty,{contractVersion:1,policies:[p]}),/INVALID_UNIT/);
 const foreign=source();foreign.itinerantCompositionSnapshot!.units[0].plan_id=999;assert.throws(()=>withDailyTaskOperationScopes(foreign,{contractVersion:1,policies:[p]}),/INVALID_UNIT/);
 const space=source();space.tasks[0].spaceId=999;assert.throws(()=>withDailyTaskOperationScopes(space,{contractVersion:1,policies:[p]}),/INVALID_TASK/);
 const combined={...source(),anchoredAccompaniments:[{} as any]};assert.throws(()=>withDailyTaskOperationScopes(combined,{contractVersion:1,policies:[p]}),/UNSUPPORTED/);
});
test('revision reader checks material declaration and direct provenance after selected members persist',()=>{
 const i=source(),structure={contractVersion:1 as const,policies:[policy(i)]},next=withDailyTaskOperationScopes(i,structure);
 const row={daily_task_operation_scopes:{...structure,by:'00000000-0000-0000-0000-000000000001',at:'2026-10-26'},planner_next_profile:{},current_config_revision_id:2};
 const replay={authorities:{plan_workday:projectEffectiveAuthoritiesFromEngineInputV1(next).plan_workday!.semanticValue}};
 const persisted=source();persisted.tasks[0].assignedResourceIds=[2,3,4];const reloaded=applyDailyTaskOperationScopes(persisted,row,replay);assert.deepEqual(reloaded.tasks[0].declaredResourceIds,[4]);
 const forged=structuredClone(replay) as any;forged.authorities.plan_workday[0].plannerNextAuthorities.taskOperations[0].blocksSpace=false;
 assert.throws(()=>applyDailyTaskOperationScopes(persisted,row,forged),/REVISION_NOT_MATERIALIZED/);
 // A member may also be an explicit direct resource. It never disappears merely
 // because the materialized unit contains the same physical item.
 const direct=source();direct.tasks[0].assignedResourceIds=[2];const explicit=withDailyTaskOperationScopes(direct,{contractVersion:1,policies:[policy(direct)]});assert.deepEqual(explicit.tasks[0].declaredResourceIds,[2,4]);
});
