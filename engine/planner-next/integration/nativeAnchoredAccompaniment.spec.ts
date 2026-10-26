import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../types';
import {applyDailyAnchoredAccompaniments,withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {canPlaceTask} from '../placement';
import {validatePlan} from '../validate';
const source=():EngineInput=>JSON.parse(gunzipSync(readFileSync(new URL('../../../docs/evidence/p0-u00u/diagnostic/input.json.gz',import.meta.url))).toString());
const structure={contractVersion:1 as const,policies:[{id:'explicit-identity',anchorTaskId:2,beforeTaskIds:[3],afterTaskIds:[4],itinerantUnitId:1,adjacency:'REQUIRED' as const,internalTransition:'INCLUDED' as const,resourceContinuity:'REQUIRED' as const}]};
test('native nominal operation survives adaptation, plans 45 continuous minutes and preserves distinct locations',()=>{
 const input=source(),original=structuredClone(input),projected=withDailyAnchoredAccompaniments(input,structure),a=adapt(projected);
 assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 const scope=createPlanningScope({kind:'DAY',value:'native'},{},a.problem.tasks.map(t=>t.id));
 const result=executeAssistedPlanning(buildAssistedProblem(a.problem,scope,[]));assert.ok(result.proposal);
 const operation=[3,2,4].map(id=>result.proposal!.find(t=>t.id===`task:${id}`)!);
 assert.equal(operation[0].end,operation[1].start);assert.equal(operation[1].end,operation[2].start);
 assert.equal(operation[2].end-operation[0].start,45);assert.equal(new Set(operation.map(t=>t.spaceId)).size,3);
 assert.ok(operation.every(t=>t.requiredResourceIds?.length===2));assert.equal(validatePlan(a.problem,[...result.proposal!]).hardValid,true);
 const probe={id:'independent-physical',kind:'technical' as const,duration:15,spaceId:operation[1].spaceId,dependencies:[]};
 assert.equal(canPlaceTask(a.problem,probe,operation[0].start,[...result.proposal!]),true);
 assert.equal(canPlaceTask(a.problem,probe,operation[1].start,[...result.proposal!]),false);
 for(const phase of operation)assert.equal(canPlaceTask(a.problem,{...probe,spaceId:'space:5',itinerantUnitId:phase.itinerantUnitId,requiredResourceIds:[...phase.requiredResourceIds!]},phase.start,[...result.proposal!]),false);
 assert.deepEqual(input,original);
});
test('unit materialization stays separate from direct requirements and virtual location inheritance',()=>{
 const input=source();input.planResourceItems.push({...input.planResourceItems[0],id:999,resourceItemId:999,name:'Physical facility'});
 input.spaceResourceAssignments={...input.spaceResourceAssignments,1:[999],3:[999],4:[999]};
 const projected=withDailyAnchoredAccompaniments(input,structure),a=adapt(projected);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 assert.ok(a.problem.tasks.find(t=>t.id==='task:2')!.requiredResourceIds!.includes('plan-resource:999'));
 for(const id of [3,4]){assert.deepEqual(projected.tasks.find(t=>t.id===id)!.declaredResourceIds,[]);assert.ok(!a.problem.tasks.find(t=>t.id===`task:${id}`)!.requiredResourceIds!.includes('plan-resource:999'));}
});
test('audited persisted authority reloads without passing audit fields to the operational parser',()=>{
 const input=source();const row={planner_next_profile:{},daily_anchored_accompaniments:{...structure,by:'00000000-0000-4000-8000-000000000001',at:'2026-10-26T00:00:00.000Z'}};
 assert.deepEqual(applyDailyAnchoredAccompaniments(input,row),withDailyAnchoredAccompaniments(input,structure));
});
test('reload keeps an explicit direct unit member without reclassifying materialized members as declarations',()=>{
 const input=source();input.tasks.find(t=>t.id===3)!.assignedResourceIds=[1];
 const projected=withDailyAnchoredAccompaniments(input,structure);
 const replay={authorities:{plan_workday:[{plannerNextAuthorities:{anchoredAccompaniments:projected.anchoredAccompaniments,taskOperations:projected.tasks.map(t=>({taskId:t.id,itinerantTeamId:t.itinerantTeamId,declaredResourceIds:t.declaredResourceIds}))}}]}};
 const persisted=structuredClone(input);for(const t of persisted.tasks.filter(t=>[2,3,4].includes(t.id)))t.assignedResourceIds=[1,2,...(t.id===2?[3]:[])];
 const row={planner_next_profile:{},current_config_revision_id:1,daily_anchored_accompaniments:{...structure,by:'00000000-0000-4000-8000-000000000001',at:'2026-10-26T00:00:00.000Z'}};
 const restored=applyDailyAnchoredAccompaniments(persisted,row,replay);
 assert.deepEqual(restored.tasks.find(t=>t.id===3)!.declaredResourceIds,[1]);
 assert.deepEqual(restored.tasks.find(t=>t.id===4)!.declaredResourceIds,[]);
 assert.deepEqual(restored.tasks.find(t=>t.id===2)!.declaredResourceIds,[3]);
 assert.throws(()=>applyDailyAnchoredAccompaniments(persisted,row),/REVISION_NOT_MATERIALIZED/);
});
test('unknown, foreign, duplicate, absent and contradictory references are rejected rather than renamed or dropped',()=>{
 for(const change of [
  (p:any)=>p.beforeTaskIds=[],(p:any)=>p.afterTaskIds=p.beforeTaskIds,(p:any)=>p.anchorTaskId=999,
  (p:any)=>p.itinerantUnitId=999,(p:any)=>p.beforeTaskIds=[999],
 ]){const bad=structuredClone(structure);change(bad.policies[0]);assert.throws(()=>withDailyAnchoredAccompaniments(source(),bad));}
 const input=source();input.tasks.find(t=>t.id===3)!.dependsOnTaskIds=[4];assert.throws(()=>withDailyAnchoredAccompaniments(input,structure),/CONTRADICTORY_ORDER/);
 const foreign=source();foreign.tasks.find(t=>t.id===3)!.planId=2;assert.throws(()=>withDailyAnchoredAccompaniments(foreign,structure),/INVALID_MEMBER/);
});
