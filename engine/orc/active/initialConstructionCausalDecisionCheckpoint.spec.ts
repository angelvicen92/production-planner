import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionPartialPlanGraphIndex, resolveInitialConstructionCausalDecisionCheckpoint, selectGeneratedCausalSibling } from "./initialConstructionCausalDecisionCheckpoint";

const a=(taskId:number,start="08:00")=>({taskId,startPlanned:start,endPlanned:"08:10",spaceId:1,resourceIds:[1]});
const fp=(xs:any[])=>xs.map(x=>`${x.taskId}@${x.startPlanned}`).join("|");
const node=(id:string,parent:string|null,depth:number,assignments:any[],branch=`b${depth}`,extra:any={})=>({partialPlanId:id,parentPartialPlanId:parent,depth,assignments,assignmentsFingerprint:fp(assignments),decisionBranchFingerprint:branch,decisionPath:Array.from({length:depth},(_,i)=>`d${i+1}`),decisionLineage:Array.from({length:depth},(_,i)=>({decisionId:`d${i+1}`,decisionDepth:i+1,primaryGoalTaskId:i+1,executionTaskId:i+1,branchFingerprint:i===depth-1?branch:`b${i+1}`,introducedAssignments:i===depth-1?assignments.map(x=>({taskId:x.taskId,assignmentFingerprint:requireHash(x),readOnly:true})):[],readOnly:true})),status:"SUSPENDED",futureFeasibility:{residualProductiveTaskCount:1},readOnly:true,...extra});
const requireHash=(x:any)=>createHash("sha256").update(stableStringify({taskId:Number(x.taskId),startPlanned:x.startPlanned??null,endPlanned:x.endPlanned??null,spaceId:x.spaceId??null,resourceIds:[...(x.resourceIds??[])].sort((a:number,b:number)=>a-b)})).digest("hex");
const conflict=(taskId=4,decisionDepth=4)=>({evidenceComplete:true,fingerprint:"c",frontierTaskId:99,blockingAssignments:[{taskId,assignmentKey:requireHash(a(taskId)),decisionId:`d${decisionDepth}`,decisionDepth,assignment:a(taskId)}],causalDecisions:[{decisionId:`d${decisionDepth}`,decisionDepth,taskIds:[taskId]}]});

test("resolves exact parent checkpoint and does not confuse same-depth nodes",()=>{
 const n0=node("n0",null,0,[],"root"); const n1=node("n1","n0",1,[a(1)]); const n2=node("n2","n1",2,[a(1),a(2)]); const n3=node("n3","n2",3,[a(1),a(2),a(3)]); const dec=node("n4","n3",4,[a(1),a(2),a(3),a(4)],"blocked"); const cousin=node("c3","n0",3,[a(7),a(8),a(9)],"c");
 const r=resolveInitialConstructionCausalDecisionCheckpoint({failedPartialPlan:dec,conflict:conflict(),partialPlanGraphIndex:buildInitialConstructionPartialPlanGraphIndex([cousin,dec,n2,n0,n3,n1])});
 assert.equal(r.resolved,true); assert.equal(r.parentPartialPlanId,"n3"); assert.equal(r.checkpointParentDepth,3); assert.equal(r.introducedChildPartialPlanId,"n4"); assert.equal(r.decisionBranchFingerprint,"blocked");
});

test("selects suspended/generated causal sibling but rejects conserved blocker",()=>{
 const n0=node("n0",null,0,[],"root"); const parent=node("n3","n0",3,[a(1),a(2),a(3)]); const failed=node("bad","n3",4,[a(1),a(2),a(3),a(4)],"blocked"); const changed=node("changed","n3",4,[a(1),a(2),a(3),a(4,"09:00")],"alt"); const same=node("same","n3",4,[a(1),a(2),a(3),a(4)],"alt2");
 const graph=buildInitialConstructionPartialPlanGraphIndex([n0,parent,failed,changed,same]); const cp=resolveInitialConstructionCausalDecisionCheckpoint({failedPartialPlan:failed,conflict:conflict(),partialPlanGraphIndex:graph}); const sel=selectGeneratedCausalSibling({checkpoint:cp,conflict:conflict(),failedPartialPlan:failed,candidates:[same,changed],expandedFingerprints:new Set(),nogoodFingerprints:new Set()});
 assert.equal(sel.selected.partialPlanId,"changed"); assert.equal(sel.rejectedCount,1);
});

test("does not reopen with incomplete evidence",()=>{
 const n0=node("n0",null,0,[],"root"); const failed=node("bad","n0",1,[a(4)],"blocked"); const r=resolveInitialConstructionCausalDecisionCheckpoint({failedPartialPlan:failed,conflict:{...conflict(4,1),evidenceComplete:false},partialPlanGraphIndex:buildInitialConstructionPartialPlanGraphIndex([n0,failed])});
 assert.equal(r.resolved,false); assert.equal(r.reason,"INCOMPLETE_CAUSAL_EVIDENCE");
});
