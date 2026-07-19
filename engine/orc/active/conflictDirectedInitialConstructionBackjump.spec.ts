import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionCausalConflict, evaluateInitialConstructionCausalAlternative, selectConflictDirectedInitialConstructionBackjump, buildInitialConstructionDecisionAssignmentIndex } from "./conflictDirectedInitialConstructionBackjump";
import { createInitialConstructionSuspendedFrontier } from "./initialConstructionSuspendedFrontier";

const h=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
const a=(taskId:number,start=taskId)=>({taskId,startPlanned:`2026-01-01T${String(start).padStart(2,"0")}:00:00Z`,endPlanned:`2026-01-01T${String(start).padStart(2,"0")}:30:00Z`,spaceId:1,resourceIds:[]});
const ak=(x:any)=>h({taskId:Number(x.taskId),startPlanned:x.startPlanned??null,endPlanned:x.endPlanned??null,spaceId:x.spaceId??null,resourceIds:[...(x.resourceIds??[])].map(Number).sort((m,n)=>m-n)});
const lineage=(assignments:any[])=>assignments.map((x,i)=>{const p={decisionId:`decision-${x.taskId}`,decisionDepth:i+1,primaryGoalTaskId:x.taskId,executionTaskId:x.taskId,branchFingerprint:`b-${x.taskId}`,introducedAssignments:[{taskId:x.taskId,assignmentFingerprint:ak(x),previousAssignmentFingerprint:null,readOnly:true}],parentAssignmentsFingerprint:`p-${i}`,resultingAssignmentsFingerprint:`r-${i}`}; return {...p,fingerprint:h(p),readOnly:true};});
const plan=(id:string,assignments:any[],extra:any={})=>({partialPlanId:id,assignments,assignmentsFingerprint:id,decisionPath:extra.decisionPath??assignments.map((x:any)=>`unparsed/${x.taskId}`),decisionLineage:extra.decisionLineage??lineage(assignments),rootAssignmentTaskIds:extra.rootAssignmentTaskIds??[],depth:assignments.length,futureFeasibility:{status:"FEASIBLE",residualProductiveTaskCount:extra.residual??10},constructiveTargetAssignmentCount:assignments.length,readOnly:true});
const expansion=(blockers:number[]=[],task=99,complete=true)=>({frontierFailureEvidence:[{executionTaskId:task,primaryGoalTaskId:task,supportedGoalTaskIds:[task],retainedValidBranchCount:0,rejectionReasonCodes:["NO_RETAINED_VALID_BRANCH"],causalConflictTaskIds:blockers,contestantConflictTaskIds:blockers,spaceConflictTaskIds:[],resourceConflictTaskIds:[],dependencyLowerBoundTaskIds:[],dependencyUpperBoundTaskIds:[],protectedIntervalConflictIds:[],attemptedTemporalCandidateFingerprints:[`candidate-${task}`],attemptedIntervals:[{startPlanned:"2026-01-01T09:00:00Z",endPlanned:"2026-01-01T10:00:00Z"}],evidenceComplete:complete,incompleteReasonCodes:complete?[]:["INCOMPLETE_SOURCE_DIAGNOSTICS"],sourceDiagnosticsFingerprint:`diag-${task}-${blockers.join("-")}-${complete}`,fingerprint:h({task,blockers,complete}),readOnly:true}],frontierExhaustionReasonCounts:{NO_RETAINED_VALID_BRANCH:1},stopReason:"ALL_ELIGIBLE_FRONTIER_CANDIDATES_EXHAUSTED"});

test("no inventa causalidad: solo blockers respaldados por Evidence",()=>{
 const failed=plan("failed",Array.from({length:10},(_,i)=>a(i+1))); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2,7])});
 assert.deepEqual(conflict.blockingAssignments.map((b:any)=>b.taskId),[2,7]);
 assert.equal(conflict.blockingAssignments.length,2);
});

test("cambio no causal se clasifica como CHANGES_ONLY_NON_BLOCKING_DECISIONS",()=>{
 const failed=plan("failed",[a(1),a(2),a(3)]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2])});
 const ev=evaluateInitialConstructionCausalAlternative({conflict,failedPartialPlan:failed,alternative:plan("alt",[a(1,8),a(2),a(3)])});
 assert.equal(ev.causallyUseful,false); assert.equal(ev.reason,"CHANGES_ONLY_NON_BLOCKING_DECISIONS");
});

test("lineage estructurado no depende del formato textual de decisionPath",()=>{
 const failed=plan("failed",[a(1),a(2)],{decisionPath:["texto libre","otro formato"]}); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2])});
 assert.equal(conflict.causalDecisions[0].decisionId,"decision-2");
 const failed2={...failed,decisionPath:["xxx","yyy"]}; const conflict2=buildInitialConstructionCausalConflict({failedPartialPlan:failed2,expansion:expansion([2])});
 assert.equal(conflict.fingerprint,conflict2.fingerprint);
});

test("evidence incompleta fuerza fallback y no inventa blockers",()=>{
 const failed=plan("failed",[a(1)]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([1],99,false)});
 assert.equal(conflict.evidenceComplete,false); assert.equal(conflict.blockingAssignments.length,0);
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:plan("alt",[])}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry,null); assert.equal(sel.evidence.fallbackReason,"INCOMPLETE_CAUSAL_EVIDENCE");
});

test("blocker protegido o externo no crea decisión reversible",()=>{
 let c=buildInitialConstructionCausalConflict({failedPartialPlan:plan("failed",[a(1)],{rootAssignmentTaskIds:[1]}),expansion:expansion([1])});
 assert.equal(c.blockingAssignments.length,0); assert.equal(c.classifiedConflictTaskIds[0].classification,"PROTECTED_BY_LOCK_OR_STATE");
 c=buildInitialConstructionCausalConflict({failedPartialPlan:plan("failed",[a(1)]),expansion:expansion([9])});
 assert.equal(c.causalConflictTaskIdMissingFromActiveAssignmentsCount,1); assert.equal(c.classifiedConflictTaskIds[0].classification,"EXTERNAL_ORIGIN");
});

test("alternativa causal antigua gana sobre alternativa cercana no causal",()=>{
 const failed=plan("failed",[a(1),a(2),a(3),a(4),a(5)]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2])});
 const near=plan("near",[a(1),a(2),a(3),a(4,8),a(5)],{residual:1}); const causal=plan("causal",[a(1),a(20),a(3)],{residual:9});
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:near},{partialPlan:causal}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry.partialPlanId,"causal");
});

test("assignment blocker modificado cuenta como cambio causal",()=>{
 const failed=plan("failed",[a(1),a(2)]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2])});
 const ev=evaluateInitialConstructionCausalAlternative({conflict,failedPartialPlan:failed,alternative:plan("alt",[a(1),a(2,8)])});
 assert.equal(ev.reason,"CAUSALLY_USEFUL"); assert.deepEqual(ev.blockersModified,[2]);
});

test("fingerprint mínimo ignora assignments irrelevantes y cambia con blockers",()=>{
 const c1=buildInitialConstructionCausalConflict({failedPartialPlan:plan("p1",[a(1),a(2),a(3)]),expansion:expansion([2])});
 const c2=buildInitialConstructionCausalConflict({failedPartialPlan:plan("p2",[a(1,8),a(2),a(3,9)]),expansion:expansion([2])});
 const c3=buildInitialConstructionCausalConflict({failedPartialPlan:plan("p3",[a(1),a(2),a(3)]),expansion:expansion([3])});
 assert.equal(c1.fingerprint,c2.fingerprint); assert.notEqual(c1.fingerprint,c3.fingerprint);
});

test("no-good exacto solo para mismo fingerprint causal",()=>{
 const failed=plan("failed",[a(1),a(2)]); const c1=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([1],99)}); const c2=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2],99)});
 assert.notEqual(c1.fingerprint,c2.fingerprint);
 const ev=evaluateInitialConstructionCausalAlternative({conflict:c1,failedPartialPlan:failed,alternative:plan("same",[a(1),a(2)]),nogoodFingerprints:new Set([c1.fingerprint])});
 assert.equal(ev.reason,"NOGOOD_EQUIVALENT_CONFLICT");
});

test("comparación legacy registra cambio y coincidencia",()=>{
 const failed=plan("failed",[a(1),a(2)]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion([2])});
 const local=plan("local",[a(1,8),a(2)],{residual:1}); const causal=plan("causal",[a(1)],{residual:9});
 let sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:local},{partialPlan:causal}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry.partialPlanId,"causal"); assert.equal(sel.evidence.legacySelectionChanged,true);
 sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:causal}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.evidence.legacySelectionMatched,true);
});

test("índice de lineage usa última reasignación activa",()=>{
 const x=a(1), y=a(1,8); const l=lineage([x]); const p={...plan("p",[y]),decisionLineage:[...l,...lineage([y]).map((e:any)=>({...e,decisionId:"decision-new",decisionDepth:2}))]};
 const idx=buildInitialConstructionDecisionAssignmentIndex(p);
 assert.equal(idx.byTaskId["1"].decisionId,"decision-new");
});
