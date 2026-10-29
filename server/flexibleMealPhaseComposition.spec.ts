import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {requiredPhaseCompositionSupported,validateDailyTechnicalChains} from './technicalChainStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from './assistedScopeResolver';
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
  (b:EngineInput)=>{b.dailyJointGroups=[{id:'joint',taskIds:structure.policies[0].orderedTaskIds.slice(0,2)}];},
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
