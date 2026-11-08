/** Offline validation and falsification. These certificates are not product proposals or Stages. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
import {fingerprintJointCompletionWitness,revalidateJointCompletionWitness} from '../../../engine/planner-next/jointCompletionWitness';
import {participantGapMinutes} from '../../../engine/planner-next/participantTransition';
const [projection,geometry,out]=process.argv.slice(2),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const {problem:p}=read(projection),r=read(geometry).result;
assert.equal(r.complete,true);assert.equal(r.scheduledTasks.length,122);assert.equal(r.scheduledParticipantMeals.length,19);
const validation=(tasks=r.scheduledTasks,meals=r.scheduledParticipantMeals,source=p)=>validatePlan(source,tasks,r.scheduledSetupPreparations,r.scheduledSpaceMeals,meals,r.scheduledResourceMeals,r.scheduledItinerantUnitMeals,r.scheduledRoundPreparations,r.scheduledOperationalMeals);
const base=validation();assert.equal(base.hardValid,true);assert.deepEqual(base.violations,[]);assert.deepEqual(base.reasonCodes,[]);
const witness=r.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(witness);
let consumed=0;assert.equal(revalidateJointCompletionWitness(p,witness,[],()=>{consumed++;return true;}),'PASS');
const arrivals=new Set(p.transportPolicy.arrival.taskIds),departures=new Set(p.transportPolicy.departure.taskIds);
const entries=p.tasks.filter((t:any)=>t.kind==='auxiliary'&&t.dependencies.some((id:string)=>arrivals.has(id))&&p.tasks.some((m:any)=>m.kind==='main'&&m.participantId===t.participantId&&m.dependencies.includes(t.id)));
const exits=p.tasks.filter((t:any)=>t.participantMarginAfterMinutes===0&&!departures.has(t.id));
assert.equal(entries.length,19);assert.equal(exits.length,19);
const byId=new Map(r.scheduledTasks.map((t:any)=>[t.id,t]));
for(const exit of exits){const departure=p.tasks.find((t:any)=>departures.has(t.id)&&t.participantId===exit.participantId),main=p.tasks.find((t:any)=>t.kind==='main'&&t.participantId===exit.participantId);assert.equal(participantGapMinutes(p,exit,departure),0);assert.equal(participantGapMinutes(p,main,exit),5);}
const attacks=[];
for(const mode of ['serial-capacity','entry-after-main','exit-before-meal','missing-meal','meal-window','meal-capacity','out-before-exit','transport-gap','source-identity']){
 const tasks=structuredClone(r.scheduledTasks),meals=structuredClone(r.scheduledParticipantMeals),source=structuredClone(p);
 const e=tasks.find((t:any)=>t.id===entries[0].id),exit=tasks.find((t:any)=>t.id===exits[0].id);
 if(mode==='serial-capacity'){const b=tasks.find((t:any)=>t.id===entries[1].id);b.start=e.start;b.end=b.start+b.duration;}
 if(mode==='entry-after-main'){const main=tasks.find((t:any)=>t.kind==='main'&&t.participantId===e.participantId);e.start=main.end;e.end=e.start+e.duration;}
 if(mode==='exit-before-meal'){const meal=meals.find((m:any)=>m.participantId===exit.participantId);exit.start=meal.start;exit.end=exit.start+exit.duration;}
 if(mode==='missing-meal')meals.pop();
 if(mode==='meal-window'){meals[0].start=source.participantMeals[0].window.end;meals[0].end=meals[0].start+meals[0].duration;}
 if(mode==='meal-capacity'){source.participantMealCapacity.maxSimultaneous=1;for(const m of meals){m.start=780;m.end=m.start+m.duration;}}
 if(mode==='out-before-exit'){const out=tasks.find((t:any)=>departures.has(t.id)&&t.participantId===exit.participantId);out.start=exit.start-5;out.end=out.start+out.duration;}
 if(mode==='transport-gap'){const group=tasks.filter((t:any)=>arrivals.has(t.id)).sort((a:any,b:any)=>a.start-b.start);const changed=group.find((t:any)=>t.start>group[0].start);changed.start=group[0].start+5;changed.end=changed.start+changed.duration;}
 if(mode==='source-identity')e.id='task:2147483647';
 const v=validation(tasks,meals,source),forged={...structuredClone(witness),tasks,participantMeals:meals};
 const {fingerprint:_,...body}=forged;forged.fingerprint=fingerprintJointCompletionWitness(body);
 const replay=revalidateJointCompletionWitness(source,forged,[],()=>true);
 assert.equal(replay,'STALE',mode);
 if(mode!=='source-identity')assert.equal(v.hardValid,false,mode);
 if(mode==='serial-capacity')assert.ok(v.overlapViolationCount>0);
 if(mode==='entry-after-main'||mode==='exit-before-meal')assert.ok(v.dependencyViolationCount>0);
 attacks.push({mode,hashRecomputed:true,replay,validation:v,scope:'OFFLINE_ONLY',productWrites:0});
}
const result={status:'PASS_OFFLINE_ONLY',completePhysicalWitness:true,obligations:141,ordinaryTasks:122,meals:19,validation:base,replayVerticesCharged:consumed,attacks,acceptedStages:0,authenticProposals:0};
writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,obligations:141,negativeCount:attacks.length,acceptedStages:0,authenticProposals:0}));
