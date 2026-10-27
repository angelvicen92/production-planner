import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../types';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from './engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning as execute} from '../assistedPlanning';
import {validatePlan} from '../validate';
import {materializeItinerantUnitAssignment} from '../itinerantUnitAssignment';
import {mainOperationVariants,materializeAnchoredOperation} from '../anchoredAccompaniment';
import {nominalOperationEdgeKey} from '../nominalResourceChoice';
import {resolveAssistedScope,expandVisiblePrerequisites} from '../../../server/assistedScopeResolver';
const receipts=JSON.parse(gunzipSync(readFileSync(new URL('../../../docs/evidence/p0-u00w/diagnostic/before.json.gz',import.meta.url))).toString());
const source=(label='choice'):EngineInput=>structuredClone(receipts[`${label}-ordinary-input.json`]);
const day=(label='choice')=>receipts['integration.json'].journey.days.find((d:any)=>d.label===label);
const input=(label='choice')=>{
 const {policies,dailyUnits}=day(label);
 return withDailyAnchoredAccompaniments(source(label),{contractVersion:2,policies:policies.map(({itinerantUnitId,...p}:any)=>({...p,eligibleItinerantUnitIds:dailyUnits}))});
};
const solve=(i:EngineInput,ids?:number[])=>{
 const a=adapt(i);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 const scope=ids?expandVisiblePrerequisites(i,resolveAssistedScope(i,a,{kind:'TASK_IDS',taskIds:ids}),a).scope:createPlanningScope({kind:'TASK_IDS',value:'native-domain'},{},i.tasks.map(t=>`task:${t.id}`));
 const problem=buildAssistedProblem(a.problem,scope,[],new Set(a.problem.tasks.map(t=>t.id)));
 return {adapter:a,problem,result:execute(problem)};
};
test('same physical day: fixed A conflicts, fixed B works, automatic domain chooses B for all three segments',()=>{
 const {policies,dailyUnits}=day();
 const a=solve(withDailyAnchoredAccompaniments(source(),{contractVersion:2,policies}));assert.equal(a.result.proposal,null);
 const b=solve(withDailyAnchoredAccompaniments(source(),{contractVersion:2,policies:policies.map((p:any)=>({...p,itinerantUnitId:dailyUnits[1]}))}));assert.ok(b.result.proposal);
 const automatic=solve(input()),operation=automatic.result.proposal!.filter(t=>t.itinerantUnitId);
 assert.equal(operation.length,3);assert.ok(operation.every(t=>t.itinerantUnitId===`itinerant-team:${dailyUnits[1]}`));
 assert.equal(validatePlan(automatic.adapter.problem,[...automatic.result.proposal!]).hardValid,true);
 const placements=(tasks:NonNullable<typeof b.result.proposal>)=>tasks.map(t=>({id:t.id,start:t.start,end:t.end,unit:t.itinerantUnitId,resources:t.requiredResourceIds}));
 assert.deepEqual(placements(automatic.result.proposal!),placements(b.result.proposal!));
 assert.ok(!a.result.evidence.reasonCodes.some(c=>/BUDGET|EXHAUST/.test(c)));
});
test('three operations are solved jointly, while a partial proposal retains a complete unmaterialized future witness',()=>{
 const i=input('multi'),full=solve(i),partial=solve(i,[day('multi').policies[0].anchorTaskId]);
 assert.equal(full.result.proposal!.length,17);assert.equal(partial.result.proposal!.length,4);
 const proof=partial.result.evidence.nominalPhysicalFutureWitness!;assert.equal(proof.tasks.length,17);
 assert.equal(validatePlan(full.adapter.problem,[...proof.tasks]).hardValid,true);
 for(const c of full.adapter.problem.anchoredAccompaniments!){
  const members=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds].map(id=>proof.tasks.find(t=>t.id===id)!);
  assert.ok(members[0].itinerantUnitId);assert.ok(members.every(t=>t.itinerantUnitId===members[0].itinerantUnitId));
  assert.equal(members.at(-1)!.end-members[0].start,45);
 }
 assert.deepEqual(full.result.proposal,solve(i).result.proposal);
 assert.equal(full.result.evidence.fingerprint,solve(i).result.evidence.fingerprint);
});
test('matching and repair keys distinguish both physical variants of the same task and position',()=>{
 const {adapter,result}=solve(input()),p=adapter.problem,anchor=p.tasks.find(t=>t.kind==='main')!;
 const variants=mainOperationVariants(p,anchor);assert.equal(variants.length,2);
 const start=result.proposal!.find(t=>t.id===anchor.id)!.start;
 const operations=variants.map(t=>materializeAnchoredOperation(p,t,start,[])!);assert.ok(operations.every(Boolean));
 assert.notEqual(nominalOperationEdgeKey(anchor.id,0,operations[0].tasks),nominalOperationEdgeKey(anchor.id,0,operations[1].tasks));
 for(const o of operations)assert.equal(nominalOperationEdgeKey(anchor.id,0,o.tasks),nominalOperationEdgeKey(anchor.id,0,[o.anchor]),'bundle repair and residual matching must name the same compound decision');
 for(const o of operations)assert.ok(o.tasks.every(t=>t.itinerantUnitId===o.anchor.itinerantUnitId));
});
test('unit selection cannot be missing, outside its domain, split between phases or detached from its physical composition',()=>{
 const {adapter,result}=solve(input()),p=adapter.problem,valid=[...result.proposal!];
 for(const mode of ['missing','outside','split','physical','gap']){
  const fake=structuredClone(valid),members=fake.filter(t=>t.itinerantUnitId);
  if(mode==='missing')for(const t of members)delete t.itinerantUnitId;
  if(mode==='outside')for(const t of members)t.itinerantUnitId='itinerant-team:999999';
  if(mode==='split')Object.assign(members[0],materializeItinerantUnitAssignment(p,p.tasks.find(t=>t.id===members[0].id)!,'itinerant-team:1'));
  if(mode==='physical')members[0].requiredResourceIds=[];
  if(mode==='gap'){members[0].start+=5;members[0].end+=5;}
  assert.equal(validatePlan(p,fake).hardValid,false,mode);
 }
});
test('two identities sharing physical members do not add capacity; unit availability remains hard',()=>{
 const i=input(),b=i.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===2)!;
 b.planResourceItemIds=[...i.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===1)!.planResourceItemIds!];
 assert.equal(solve(i).result.proposal,null);
 const unavailable=input();unavailable.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===2)!.windows=[{start:'11:00',end:'12:00'}];
 assert.equal(solve(unavailable).result.proposal,null);
});
test('a mismatched domain and contradictory dependency are rejected before construction',()=>{
 const i=input();i.tasks.find(t=>t.id===day().policies[0].beforeTaskIds[0])!.allowedItinerantTeamIds=[1];assert.equal(adapt(i).status,'UNSUPPORTED');
 const bad=source();bad.tasks.find(t=>t.id===day().policies[0].beforeTaskIds[0])!.dependsOnTaskIds=[day().policies[0].afterTaskIds[0]];
 assert.throws(()=>withDailyAnchoredAccompaniments(bad,{contractVersion:2,policies:day().policies}),/CONTRADICTORY_ORDER/);
});
test('a complete operation fits the selected unit window even when it starts inside the broader task window',()=>{
 const i=input();i.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===2)!.windows=[{start:'09:20',end:'10:05'}];
 const {result}=solve(i);assert.ok(result.proposal);
 const members=result.proposal.filter(t=>t.itinerantUnitId);assert.equal(Math.min(...members.map(t=>t.start)),560);assert.equal(Math.max(...members.map(t=>t.end)),605);
});
test('continuation preserves a selected common unit and every protected phase from the first proposal',()=>{
 const i=input('multi'),first=solve(i,[day('multi').policies[0].anchorTaskId]),protectedPlacements=[...first.result.proposal!];
 const a=first.adapter,ids=i.tasks.filter(t=>!protectedPlacements.some(p=>p.id===`task:${t.id}`)).map(t=>t.id);
 const scope=expandVisiblePrerequisites(i,resolveAssistedScope(i,a,{kind:'TASK_IDS',taskIds:ids}),a).scope;
 const continued=execute(buildAssistedProblem(a.problem,scope,protectedPlacements,new Set(a.problem.tasks.map(t=>t.id))));
 assert.equal(continued.proposal!.length,13);
 assert.equal(validatePlan(a.problem,[...protectedPlacements,...continued.proposal!]).hardValid,true);
 assert.deepEqual(continued.evidence.nominalPhysicalFutureWitness!.tasks.filter(t=>protectedPlacements.some(p=>p.id===t.id)).sort((a,b)=>a.id.localeCompare(b.id)),protectedPlacements.sort((a,b)=>a.id.localeCompare(b.id)));
});
test('the declaration order does not impose a hard order between operations',()=>{
 const {policies,dailyUnits}=day('multi');
 const reversed=withDailyAnchoredAccompaniments(source('multi'),{contractVersion:2,policies:[...policies].reverse().map(({itinerantUnitId,...p}:any)=>({...p,eligibleItinerantUnitIds:dailyUnits}))});
 const a=solve(input('multi')).result,b=solve(reversed).result;assert.deepEqual(a.proposal,b.proposal);assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);
});
