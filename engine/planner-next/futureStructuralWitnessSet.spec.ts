import assert from "node:assert/strict";
import test from "node:test";
import { certifyFutureStructuralWitnessSet, type FutureWitnessContext, type FutureWitnessCandidate, type FutureWitnessUnit } from "./futureStructuralWitnessSet";
import type { FutureRoundSynchronizationWitnessV1 } from "./anonymousPipelineWitness";

const empty:FutureWitnessContext={tasks:[],roundPreparations:[],mealReservations:[]};
function fixture(options:{noPair?:boolean;prior?:boolean;budget?:number}={}){
  let branches=0,searchA=0;
  const witness=(identity:string,start:number):FutureRoundSynchronizationWitnessV1=>({kind:"ROUND_SYNCHRONIZATION",version:1,
    policyId:identity,fingerprint:`${identity}@${start}`,scheduledTaskPlacements:[{id:identity,start,end:start+10,spaceId:"shared"}],
    roundPreparations:[],operationalMealReservations:[],matchingWitness:{},futureFeasibility:{participant:"PASS",
      technicalChain:"NOT_APPLICABLE",participantMeals:"NOT_APPLICABLE",operationalMeals:"NOT_APPLICABLE"}});
  const candidate=(identity:string,start:number,context:FutureWitnessContext):FutureWitnessCandidate=>({witness:witness(identity,start),
    context:{...context,tasks:[...context.tasks,{id:identity,kind:"technical",duration:10,spaceId:"shared",dependencies:[],start,end:start+10}]}});
  const make=(identity:string,starts:number[],prior=false):FutureWitnessUnit=>({identity,ordering:[0],priorFound:prior,
    revalidate:context=>({status:"PASS",candidate:candidate(identity,starts[0]!,context)}),
    explore:(context,continuation)=>{if(identity==="A")searchA++;
      for(const start of starts){if(branches===(options.budget??Infinity))return "BUDGET_EXHAUSTED";branches++;
        const result=continuation(candidate(identity,start,context));if(result!=="DEAD_END")return result;}return "DEAD_END";}});
  const units=[make("A",[0,20],options.prior),make("B",options.noPair?[0,20]:[0])];
  const gate=(context:FutureWitnessContext)=>context.tasks.some(a=>context.tasks.some(b=>a.id!==b.id&&a.start<b.end&&b.start<a.end))
    ?"DEAD_END" as const:"FOUND" as const;
  if(options.noPair)units[0]=make("A",[0],options.prior),units[1]=make("B",[0]);
  return{units,gate,branches:()=>branches,searchA:()=>searchA,candidate};
}

test("individual feasibility and sequential first witnesses miss a compatible second witness",()=>{
  const f=fixture();
  assert.equal(f.gate(f.candidate("A",0,empty).context),"FOUND");
  assert.equal(f.gate(f.candidate("B",0,empty).context),"FOUND");
  assert.equal(f.gate(f.candidate("B",0,f.candidate("A",0,empty).context).context),"DEAD_END","sequential first-witness reproduction");
  const result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"FOUND");assert.deepEqual(result.witnesses.map(w=>w.fingerprint),["A@20","B@0"]);
  assert.ok(result.evidence.futureWitnessSetBacktracks>0);
});

test("exact exhaustion of all individually feasible pairs returns DEAD_END",()=>{
  const f=fixture({noPair:true}),result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"DEAD_END");assert.deepEqual(result.witnesses,[]);
});

test("a compatible revalidated prior avoids its structural explorer",()=>{
  const f=fixture({prior:true});f.units[1]={...f.units[1]!,explore:(context,continuation)=>continuation(f.candidate("B",20,context))};
  const result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"FOUND");assert.equal(f.searchA(),0);assert.equal(result.evidence.byIdentity.A!.priorReused,true);
});

test("a valid prior with rejected joint continuation falls back and is never marked reused",()=>{
  const f=fixture({prior:true}),result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"FOUND");assert.equal(f.searchA(),1);
  assert.equal(result.evidence.byIdentity.A!.priorRevalidation,"PASS");
  assert.equal(result.evidence.byIdentity.A!.priorJointContinuationFailed,true);
  assert.equal(result.evidence.byIdentity.A!.priorReused,false);
});

test("combination budget exhaustion never becomes infeasibility or prior reuse",()=>{
  const f=fixture({prior:true,budget:1}),result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"BUDGET_EXHAUSTED");assert.deepEqual(result.witnesses,[]);
  assert.equal(result.evidence.byIdentity.A!.priorReused,false);assert.equal(result.evidence.futureWitnessSetFound,0);
});

test("analytical placements never mutate the input or become proposal/protected state",()=>{
  const f=fixture(),snapshot=structuredClone(empty),result=certifyFutureStructuralWitnessSet(f.units,empty,f.gate,f.branches);
  assert.equal(result.outcome,"FOUND");assert.deepEqual(empty,snapshot);
  assert.equal("scheduledTasks" in result,false);assert.equal("proposal" in result,false);
  assert.equal(result.evidence.finalSet?.ephemeralContextCount,2);
});

test("cheap material ordering and stable identity preserve input-order invariance",()=>{
  const first=fixture(),second=fixture();second.units.reverse();
  const a=certifyFutureStructuralWitnessSet(first.units,empty,first.gate,first.branches);
  const b=certifyFutureStructuralWitnessSet(second.units,empty,second.gate,second.branches);
  assert.deepEqual(a,b);
  const material=fixture();material.units[0]={...material.units[0]!,ordering:[10]};material.units[1]={...material.units[1]!,ordering:[5]};
  const result=certifyFutureStructuralWitnessSet(material.units,empty,material.gate,material.branches);
  assert.equal(result.witnesses[0]?.kind,"ROUND_SYNCHRONIZATION");
  assert.equal((result.witnesses[0] as FutureRoundSynchronizationWitnessV1).policyId,"B");
});
