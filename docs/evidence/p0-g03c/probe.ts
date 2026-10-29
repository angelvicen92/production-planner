import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {withDailyTechnicalChains,requiredPhaseCompositionSupported} from '../../../server/technicalChainStructure';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {validatePlan} from '../../../engine/planner-next/validate';
import type {EngineInput} from '../../../engine/types';
const read=(p:string)=>JSON.parse(gunzipSync(readFileSync(p)).toString());
const old=read('docs/evidence/p0-u01a/native/receipts.json.gz');
const g03b=read('docs/evidence/p0-g03b/native/receipts.json.gz');
const source:EngineInput=structuredClone(old['integrated-input.json']);
source.operationalMealPolicies=undefined;source.dailyOperationalMealsVersion=undefined;
source.mealMode='flexible_meal_window';source.meal={start:'11:00',end:'12:00'};source.globalHardBreaks=[];
source.mealTaskTemplateId=100;source.mealWindow={start:'11:00',end:'12:00'};
source.contestantMealDurationMinutes=15;source.contestantMealMaxSimultaneous=1;
const example=g03b['generic-input.json'].tasks.find((t:any)=>t.operationalRole==='meal_break_placeholder');
for(const id of [1,2,3])source.tasks.push({...structuredClone(example),id:100+id,planId:source.planId,templateId:100,templateName:'Individual meal',contestantId:id,contestantName:`Participant ${id}`,durationOverrideMin:15});
const input=withDailyTechnicalChains(source,{contractVersion:1,policies:[old['integrated-requested-policy.json']]});
const dir=process.argv[2]??'work/g03c-probe';mkdirSync(dir,{recursive:true});
const save=(n:string,v:unknown)=>writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2)+'\n');
save('input',input);save('admission',{joint:jointCombinationSupported(input),phase:requiredPhaseCompositionSupported(input)});
const a=adapt(input);save('adapter',a);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
for(const [label,ids] of [['joint',[4]],['competitor',[15]],['all',input.tasks.map(t=>t.id)]] as const){
 const scope=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[...ids]});save(label+'-scope',scope);
 const scoped=buildAssistedProblem(a.problem,scope.scope,[],analyticalFutureEligibleTaskIds(input,a.identityMap));save(label+'-problem',scoped);
 const run=executeAssistedPlanning(scoped);save(label+'-run',run);
 const proof=run.evidence.nominalPhysicalFutureWitness;
 const cert:ReturnType<typeof certifyDailyTechnicalChain>=proof?certifyDailyTechnicalChain(a.problem,[...run.proposal!],0,proof):null;save(label+'-certificate',cert);
 const validation:ReturnType<typeof validatePlan>|null=proof?validatePlan(a.problem,proof.tasks,[],[],proof.participantMeals as any):null;save(label+'-validation',validation);
 assert.ok(run.proposal);assert.equal(cert?.status,'WITNESS');assert.equal(cert?.consumed,0);assert.equal(validation?.hardValid,true);assert.equal(proof!.tasks.length,15);assert.equal((proof!.participantMeals as any[]).length,3);assert.deepEqual(run.evidence.acceptedSupportingPlacements,[]);
 console.log(JSON.stringify({label,proposal:run.proposal?.length,reason:run.evidence.reasonCodes,proofTasks:proof?.tasks.length,meals:(proof?.participantMeals as any[])?.length,certificate:cert?.status,consumed:cert?.consumed,valid:validation?.hardValid,branches:run.evidence.work.branchesExplored}));
}

const a2=adapt(input);assert.equal(a2.status,'SUPPORTED');if(a2.status!=='SUPPORTED')throw Error('adapter');
const scope=resolveAssistedScope(input,a2,{kind:'TASK_IDS',taskIds:[4]});
const run=executeAssistedPlanning(buildAssistedProblem(a2.problem,scope.scope,[],analyticalFutureEligibleTaskIds(input,a2.identityMap)));
const proof=run.evidence.nominalPhysicalFutureWitness!;
const results=[];
for(const mode of ['missing-meal','duplicate-meal','meal-window','meal-duration','meal-capacity','joint-time','joint-space','joint-team','joint-resource','third-party-resource','phase-gap','phase-order']){
 const bad=structuredClone(proof),meals=bad.participantMeals as any[],joint=bad.tasks.filter(t=>t.jointGroupId),peer=joint[1];
 if(mode==='missing-meal')meals.pop();
 if(mode==='duplicate-meal')meals.push(structuredClone(meals[0]));
 if(mode==='meal-window'){meals[0].start=600;meals[0].end=615;}
 if(mode==='meal-duration')meals[0].end-=5;
 if(mode==='meal-capacity')for(const m of meals){m.start=660;m.end=675;}
 if(mode==='joint-time'){peer.start+=5;peer.end+=5;}
 if(mode==='joint-space')peer.spaceId='space:4';
 if(mode==='joint-team')peer.itinerantUnitId='itinerant-team:forged';
 if(mode==='joint-resource')peer.requiredResourceIds=[];
 if(mode==='third-party-resource'){const rival=bad.tasks.find(t=>t.id==='task:15')!;rival.start=joint[0].start;rival.end=rival.start+rival.duration;}
 const chain=bad.tasks.filter(t=>a2.problem.technicalChains![0].orderedTaskIds.includes(t.id)).sort((a,b)=>a.start-b.start);
 if(mode==='phase-gap'){chain.at(-1)!.start+=5;chain.at(-1)!.end+=5;}
 if(mode==='phase-order'){
  const p=a2.problem.technicalChains![0].phases!,a=bad.tasks.find(t=>t.id===p[0][0])!,b=bad.tasks.find(t=>t.id===p[1][0])!;
  [a.start,b.start]=[b.start,a.start];a.end=a.start+a.duration;b.end=b.start+b.duration;
 }
 const c=certifyDailyTechnicalChain(a2.problem,[],0,bad);assert.equal(c?.status,'INVALID',mode);assert.equal(c?.consumed,0);
 results.push({mode,status:c!.status,consumed:c!.consumed,validation:'validation' in c!?c!.validation:null});
}
save('negatives',results);
const pending=input.tasks.filter(t=>!run.proposal!.some(p=>p.id===`task:${t.id}`)).map(t=>t.id);
const secondScope=resolveAssistedScope(input,a2,{kind:'TASK_IDS',taskIds:pending});
const second=executeAssistedPlanning(buildAssistedProblem(a2.problem,secondScope.scope,run.proposal!,analyticalFutureEligibleTaskIds(input,a2.identityMap)));
save('continuation',second);assert.ok(second.proposal);assert.equal(second.evidence.protectedPlacementsPreserved,true);
for(const fixed of run.proposal!)assert.deepEqual(second.evidence.nominalPhysicalFutureWitness!.tasks.find(t=>t.id===fixed.id),fixed);
console.log(JSON.stringify({negatives:results.length,continuation:'EXACT',sqlStage:false}));
