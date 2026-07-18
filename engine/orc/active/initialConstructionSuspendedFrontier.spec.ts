import test from "node:test"; import assert from "node:assert/strict";
import { createInitialConstructionSuspendedFrontier, frontierFingerprint, offerInitialConstructionSuspendedAlternative, selectInitialConstructionBacktrackAlternative } from "./initialConstructionSuspendedFrontier";

const plan=(id:string,residual:number,depth=0,path:string[]=[],fp=id,status="FEASIBLE")=>({partialPlanId:id,assignmentsFingerprint:fp,assignments:Array.from({length:200-residual},(_,i)=>({taskId:i+1})),depth,decisionPath:path,futureFeasibility:{status,residualProductiveTaskCount:residual,futureFreedom:1,fingerprint:`ff:${residual}:${status}`},readOnly:true});
const offerAll=(plans:any[],max:number)=>plans.reduce((frontier,p,i)=>offerInitialConstructionSuspendedAlternative({frontier,candidate:p,maxSuspendedPartialPlans:max,activePartialPlan:null,admittedOrdinal:i}).frontier,createInitialConstructionSuspendedFrontier());

test("admits a better candidate into a full Best-K frontier and evicts the worst",()=>{
 const frontier=offerAll([plan("r100",100),plan("r90",90),plan("r80",80)],3);
 const result=offerInitialConstructionSuspendedAlternative({frontier,candidate:plan("r70",70),maxSuspendedPartialPlans:3,activePartialPlan:null,admittedOrdinal:4});
 assert.equal(result.candidateAdmitted,true); assert.equal(result.replacement,true); assert.equal(result.evictedEntry?.partialPlanId,"r100");
 assert.deepEqual(result.frontier.entries.map(e=>e.residualProductiveTaskCount),[70,80,90]);
});

test("rejects a worse candidate without mutating the full frontier",()=>{
 const frontier=offerAll([plan("r70",70),plan("r80",80),plan("r90",90)],3); const fp=frontierFingerprint(frontier);
 const result=offerInitialConstructionSuspendedAlternative({frontier,candidate:plan("r100",100),maxSuspendedPartialPlans:3,activePartialPlan:null,admittedOrdinal:4});
 assert.equal(result.candidateRejected,true); assert.equal(result.reason,"WORSE_THAN_RETAINED_FRONTIER"); assert.equal(result.evictedEntry,null); assert.equal(frontierFingerprint(result.frontier),fp);
});

test("does not blindly reject superior candidates at capacity",()=>{
 const frontier=offerAll([plan("r100",100),plan("r90",90),plan("r80",80)],3);
 const result=offerInitialConstructionSuspendedAlternative({frontier,candidate:plan("r70",70),maxSuspendedPartialPlans:3,activePartialPlan:null,admittedOrdinal:4});
 assert.equal(result.evidence.blindSuspendedFrontierRejection,false);
 assert.equal(result.candidateAdmitted,true);
});

test("is independent from offer arrival order",()=>{
 const plans=[plan("r100",100),plan("r70",70),plan("r90",90),plan("r80",80),plan("r60",60)];
 const a=offerAll(plans,3); const b=offerAll([...plans].reverse(),3);
 assert.equal(frontierFingerprint(a),frontierFingerprint(b));
 assert.deepEqual(a.entries.map(e=>e.partialPlanId),b.entries.map(e=>e.partialPlanId));
});

test("selects the nearest equivalent backtrack alternative",()=>{
 const failed=plan("failed",10,60,Array.from({length:60},(_,i)=>`d${i}`));
 const far=plan("far",10,8,[...failed.decisionPath.slice(0,8),"x"],"far");
 const near=plan("near",10,59,[...failed.decisionPath.slice(0,59),"x"],"near");
 const selection=selectInitialConstructionBacktrackAlternative({frontier:createInitialConstructionSuspendedFrontier([far,near]),failedPartialPlan:failed});
 assert.equal(selection.selectedEntry.partialPlanId,"near"); assert.equal(selection.evidence.backtrackDistance,1);
});

test("does not prefer locality over better operational quality",()=>{
 const failed=plan("failed",50,60,Array.from({length:60},(_,i)=>`d${i}`));
 const nearWorse=plan("near-worse",80,59,[...failed.decisionPath.slice(0,59),"x"],"near-worse");
 const farBetter=plan("far-better",40,8,[...failed.decisionPath.slice(0,8),"x"],"far-better");
 const selection=selectInitialConstructionBacktrackAlternative({frontier:createInitialConstructionSuspendedFrontier([nearWorse,farBetter]),failedPartialPlan:failed});
 assert.equal(selection.selectedEntry.partialPlanId,"far-better");
});

test("later better alternatives replace older shallow alternatives during a long trajectory",()=>{
 let frontier=createInitialConstructionSuspendedFrontier();
 for(let i=0;i<8;i++) frontier=offerInitialConstructionSuspendedAlternative({frontier,candidate:plan(`p${i}`,100-i*10,i,[`d${i}`]),maxSuspendedPartialPlans:3,activePartialPlan:null,admittedOrdinal:i}).frontier;
 assert.deepEqual(frontier.entries.map(e=>e.residualProductiveTaskCount),[30,40,50]);
 assert.equal(Math.min(...frontier.entries.map(e=>e.depth)),5);
});
