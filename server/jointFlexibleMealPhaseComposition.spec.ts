import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {withDailyJointGroups,jointCombinationSupported} from './jointGroupStructure';
import {validateDailyTechnicalChains,requiredPhaseCompositionSupported} from './technicalChainStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from './assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../engine/planner-next/assistedPlanning';
import {certifyDailyTechnicalChain} from './technicalChainCertificate';
import {participantMealCandidates,scheduleParticipantMeals} from '../engine/planner-next/participantMeals';
import {createPlanningScope} from '../engine/planner-next/assistedPlanning';
const read=(p:string)=>JSON.parse(gunzipSync(readFileSync(p)).toString());
function fixture(){
 const old=read('docs/evidence/p0-u01a/native/receipts.json.gz'),base:EngineInput=structuredClone(old['integrated-input.json']);
 const groups={contractVersion:1 as const,groups:base.dailyJointGroups!};
 delete base.dailyJointGroups;delete base.dailyJointGroupsVersion;for(const t of base.tasks)delete t.jointGroupId;
 delete base.operationalMealPolicies;delete base.dailyOperationalMealsVersion;
 base.mealMode='flexible_meal_window';base.meal={start:'11:00',end:'12:00'};base.globalHardBreaks=[];
 base.mealTaskTemplateId=100;base.mealWindow={start:'11:00',end:'12:00'};base.contestantMealDurationMinutes=15;base.contestantMealMaxSimultaneous=1;
 const meal=read('docs/evidence/p0-g03b/native/receipts.json.gz')['generic-input.json'].tasks.find((t:any)=>t.operationalRole==='meal_break_placeholder');
 for(const id of [1,2,3])base.tasks.push({...structuredClone(meal),id:100+id,planId:base.planId,templateId:100,contestantId:id,durationOverrideMin:15});
 const structure={contractVersion:1 as const,policies:[old['integrated-requested-policy.json']]};
 const phased=validateDailyTechnicalChains(base,structure),input=validateDailyTechnicalChains(withDailyJointGroups(phased,groups),structure);
 return {base,structure,groups,input};
}
test('flexible joint authoring requires phases and preserves both obligations through reconstruction',()=>{
 const {base,structure,groups,input}=fixture();
 assert.equal(jointCombinationSupported(base),false);
 assert.throws(()=>withDailyJointGroups(base,groups),/UNSUPPORTED_JOINT_COMBINATION/);
 assert.ok(jointCombinationSupported(input)&&requiredPhaseCompositionSupported(input));
 assert.throws(()=>validateDailyTechnicalChains(input,{contractVersion:1,policies:[]}),/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);
 assert.equal(input.dailyJointGroups?.[0].taskIds.length,2);
 for(const mutate of [
  (b:EngineInput)=>{b.contestantMealMaxSimultaneous=0;},
  (b:EngineInput)=>{b.roundSynchronizations=[{}] as any;},
  (b:EngineInput)=>{b.transportSettings={} as any;},
  (b:EngineInput)=>{b.setupPolicies=[{}] as any;},
  (b:EngineInput)=>{b.anchoredAccompaniments=[{}] as any;},
  (b:EngineInput)=>{b.dailyTaskOperationScopes=[{}] as any;},
  (b:EngineInput)=>{b.operationalMealPolicies=[{}] as any;b.dailyOperationalMealsVersion=1;},
  (b:EngineInput)=>{b.resourceRouteTransitions=[{}] as any;},
 ]){const bad=structuredClone(input);mutate(bad);assert.equal(jointCombinationSupported(bad),false);assert.throws(()=>validateDailyTechnicalChains(bad,structure));}
});
test('both peers resolve to one complete unit; certificate consumes the same global meals without another search',()=>{
 const {input,groups}=fixture(),a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const original=structuredClone(input),scopes=groups.groups[0].taskIds.map(id=>resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[id]}));
 assert.deepEqual(scopes[0].productTaskIds,scopes[1].productTaskIds);assert.equal(scopes[0].productTaskIds.length,8);
 const runs=scopes.map(s=>executeAssistedPlanning(buildAssistedProblem(a.problem,s.scope,[],analyticalFutureEligibleTaskIds(input,a.identityMap))));
 assert.deepEqual(runs[0].proposal,runs[1].proposal);
 for(const run of runs){
  assert.equal(run.proposal?.length,8);const proof=run.evidence.nominalPhysicalFutureWitness!;
  assert.equal(proof.tasks.length,15);assert.equal((proof.participantMeals as any[]).length,3);
  const cert=certifyDailyTechnicalChain(a.problem,[...run.proposal!],0,proof);assert.equal(cert?.status,'WITNESS');assert.equal(cert?.consumed,0);
  const peers=proof.tasks.filter(t=>t.jointGroupId);assert.equal(peers.length,2);assert.equal(peers[0].start,peers[1].start);assert.equal(peers[0].end,peers[1].end);
  const bad=structuredClone(proof);bad.tasks.find(t=>t.id===peers[1].id)!.start+=5;assert.equal(certifyDailyTechnicalChain(a.problem,[],0,bad)?.status,'INVALID');
 }
 assert.deepEqual(input,original);
});
test('a synchronized pair cannot consume the last collective meal realization despite nonempty individual domains',()=>{
 const {input}=fixture(),a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const p=structuredClone(a.problem),peers=p.tasks.filter(t=>t.jointGroupId),people=new Set(peers.map(t=>t.participantId));
 const next=p.tasks.find(t=>!t.jointGroupId&&!people.has(t.participantId))!;
 p.tasks=[...peers,next].map(t=>({...t,dependencies:[],duration:t.jointGroupId?10:5}));
 p.technicalChains=[{...p.technicalChains![0],orderedTaskIds:[peers[0].id,next.id],phases:[[peers[0].id],[next.id]],requiredResourceIds:[]}];
 p.participantMeals=p.participantMeals!.filter(m=>people.has(m.participantId)).map(m=>({...m,duration:15,window:{start:660,end:690}}));
 const positions=(start:number)=>p.tasks.map(t=>({...t,start:t.jointGroupId?start:start+10,end:t.jointGroupId?start+10:start+15}));
 const bad=positions(675),good=positions(650);
 for(const meal of p.participantMeals)assert.ok(participantMealCandidates(p,meal,bad,[]).length);
 assert.equal(scheduleParticipantMeals(p,bad,10000).complete,false);assert.equal(scheduleParticipantMeals(p,good,10000).complete,true);
 const run=(placed:typeof bad)=>{
  const constrained=structuredClone(p);constrained.tasks.forEach(t=>{const fixed=placed.find(x=>x.id===t.id)!;t.availability=[{start:fixed.start,end:fixed.end}];});
  return executeAssistedPlanning(buildAssistedProblem(constrained,createPlanningScope({kind:'TASK_IDS',value:'unit'},{},p.tasks.map(t=>t.id)),[],new Set(p.tasks.map(t=>t.id))));
 };
 const denied=run(bad);assert.equal(denied.proposal,null);assert.ok(!denied.evidence.reasonCodes.some(c=>c.includes('BUDGET_EXHAUSTED')));
 assert.ok(run(good).proposal);
});
