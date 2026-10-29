import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {requiredPhaseCompositionSupported,validateDailyTechnicalChains} from './technicalChainStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from './assistedScopeResolver';
import {withDailyJointGroups,jointCombinationSupported} from './jointGroupStructure';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../engine/planner-next/assistedPlanning';
import {certifyDailyTechnicalChain} from './technicalChainCertificate';
import {validatePlan} from '../engine/planner-next/validate';
import {participantMealCandidates,scheduleParticipantMeals} from '../engine/planner-next/participantMeals';
import type {EngineInput} from '../engine/types';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-g03/native/receipts.json.gz')).toString());
function fixture(){
 const base:EngineInput=structuredClone(receipts['engine-input.json']);
 const structure=structuredClone(receipts['sql-readonly-rejection.json'].policy);
 const input=validateDailyTechnicalChains(base,structure),adapter=adapt(input);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 return {base,input,structure,adapter};
}
test('native flexible meals and phases preserve all authorities, guards and immutable input',()=>{
 const {base,input,structure,adapter}=fixture();
 assert.deepEqual(input.tasks,base.tasks);assert.equal(input.mealMode,'flexible_meal_window');
 assert.equal(adapter.problem.participantMeals!.length,19);assert.equal(adapter.problem.tasks.length,41);
 assert.ok(requiredPhaseCompositionSupported(base));
 for(const mutate of [
  (b:EngineInput)=>{b.contestantMealMaxSimultaneous=0;},
  (b:EngineInput)=>{b.tasks.find(t=>t.itinerantTeamId)!.itinerantTeamRequirement='any';},
  (b:EngineInput)=>{b.transportSettings={} as any;},
  (b:EngineInput)=>{b.roundSynchronizations=[{}] as any;},
  (b:EngineInput)=>{b.setupPolicies=[{}] as any;},
 ]){const bad=structuredClone(base);mutate(bad);assert.equal(requiredPhaseCompositionSupported(bad),false);}
});
test('phase-only scope certifies nineteen pending meals; missing, duplicate, shifted and overlapping meals fail certification',()=>{
 const {input,structure,adapter:a}=fixture();
 const scope=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[structure.policies[0].orderedTaskIds[0]]});
 const eligible=new Set([...a.problem.tasks.map(t=>t.id),...a.problem.participantMeals!.map(m=>m.sourceTaskId)]);
 const first=executeAssistedPlanning(buildAssistedProblem(a.problem,scope.scope,[],eligible));
 assert.equal(first.proposal?.length,3);const proof=first.evidence.nominalPhysicalFutureWitness!;
 assert.equal(proof.tasks.length,41);assert.equal((proof.participantMeals as any[]).length,19);
 assert.deepEqual(first.evidence.acceptedSupportingPlacements,[]);
 assert.equal(certifyDailyTechnicalChain(a.problem,[...first.proposal!],0,proof)?.status,'WITNESS');
 for(const mode of ['missing','duplicate','window','overlap','capacity']){
  const bad=structuredClone(proof),meals=bad.participantMeals as any[];
  if(mode==='missing')meals.pop();
  if(mode==='duplicate')meals.push(structuredClone(meals[0]));
  if(mode==='window'){meals[0].start=770;meals[0].end=810;}
  if(mode==='overlap'){const t=bad.tasks.find(t=>t.participantId===meals[0].participantId)!;meals[0].start=t.start;meals[0].end=t.start+40;}
  if(mode==='capacity')for(const meal of meals){meal.start=780;meal.end=820;}
  assert.equal(certifyDailyTechnicalChain(a.problem,[...first.proposal!],0,bad)?.status,'INVALID',mode);
 }
});
test('individually nonempty meal domains cannot justify losing the last collective realization',()=>{
 const {adapter:a}=fixture(),p=structuredClone(a.problem);
 p.profile='STANDALONE_ONLY';delete p.mainFlow;
 p.tasks=p.tasks.filter(t=>p.technicalChains![0].orderedTaskIds.includes(t.id)).slice(0,2);
 p.technicalChains![0].orderedTaskIds=p.tasks.map(t=>t.id);p.technicalChains![0].phases=[p.tasks.map(t=>t.id)];
 p.tasks.forEach(t=>{t.duration=20;t.dependencies=[];});
 p.participantMeals=p.participantMeals!.filter(m=>p.tasks.some(t=>t.participantId===m.participantId));
 p.participantMeals.forEach(m=>{m.window={start:780,end:860};});p.participantMealCapacity={maxSimultaneous:1};
 const prefix=p.tasks.map((t,i)=>({...t,start:780+i*20,end:800+i*20}));
 for(const meal of p.participantMeals)assert.ok(participantMealCandidates(p,meal,prefix,[]).length>0);
 assert.equal(scheduleParticipantMeals(p,prefix,10000).complete,false);
 const early=p.tasks.map((t,i)=>({...t,start:740+i*20,end:760+i*20}));
 assert.equal(scheduleParticipantMeals(p,early,10000).complete,true);
 assert.equal(validatePlan(p,prefix,[],[],[]).hardValid,false);
 const run=(placements:typeof prefix)=>{
  const constrained=structuredClone(p);
  constrained.tasks.forEach(t=>{const fixed=placements.find(x=>x.id===t.id)!;t.availability=[{start:fixed.start,end:fixed.end}];});
  return executeAssistedPlanning(buildAssistedProblem(constrained,createPlanningScope({kind:'TASK_IDS',value:'phase'},{},p.tasks.map(t=>t.id)),[],new Set(p.tasks.map(t=>t.id))));
 };
 const rejected=run(prefix);assert.equal(rejected.proposal,null);assert.ok(!rejected.evidence.reasonCodes.some(c=>c.includes('BUDGET_EXHAUSTED')));
 assert.ok(run(early).proposal);
});

const readJoint=(p:string)=>JSON.parse(gunzipSync(readFileSync(p)).toString());
function jointFixture(){
 const old=readJoint('docs/evidence/p0-u01a/native/receipts.json.gz'),base:EngineInput=structuredClone(old['integrated-input.json']);
 const groups={contractVersion:1 as const,groups:base.dailyJointGroups!};
 delete base.dailyJointGroups;delete base.dailyJointGroupsVersion;for(const t of base.tasks)delete t.jointGroupId;
 delete base.operationalMealPolicies;delete base.dailyOperationalMealsVersion;
 base.mealMode='flexible_meal_window';base.meal={start:'11:00',end:'12:00'};base.globalHardBreaks=[];
 base.mealTaskTemplateId=100;base.mealWindow={start:'11:00',end:'12:00'};base.contestantMealDurationMinutes=15;base.contestantMealMaxSimultaneous=1;
 const meal=readJoint('docs/evidence/p0-g03b/native/receipts.json.gz')['generic-input.json'].tasks.find((t:any)=>t.operationalRole==='meal_break_placeholder');
 for(const id of [1,2,3])base.tasks.push({...structuredClone(meal),id:100+id,planId:base.planId,templateId:100,contestantId:id,durationOverrideMin:15});
 const structure={contractVersion:1 as const,policies:[old['integrated-requested-policy.json']]};
 const phased=validateDailyTechnicalChains(base,structure),input=validateDailyTechnicalChains(withDailyJointGroups(phased,groups),structure);
 return {base,structure,groups,input};
}
test('flexible joint authoring requires phases and preserves both obligations through reconstruction',()=>{
 const {base,structure,groups,input}=jointFixture();
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
 const {input,groups}=jointFixture(),a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
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
 const {input}=jointFixture(),a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
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
