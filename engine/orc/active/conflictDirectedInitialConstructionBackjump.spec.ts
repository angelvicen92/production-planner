import test from "node:test";
import assert from "node:assert/strict";
import { buildInitialConstructionCausalConflict, evaluateInitialConstructionCausalAlternative, selectConflictDirectedInitialConstructionBackjump } from "./conflictDirectedInitialConstructionBackjump";
import { createInitialConstructionSuspendedFrontier } from "./initialConstructionSuspendedFrontier";

const a=(taskId:number,start=taskId)=>({taskId,startPlanned:`2026-01-01T0${start}:00:00Z`,endPlanned:`2026-01-01T0${start}:30:00Z`,spaceId:1,resourceIds:[]});
const plan=(id:string,assignments:any[],decisionPath:string[],extra:any={})=>({partialPlanId:id,assignments,assignmentsFingerprint:id,decisionPath,depth:decisionPath.length,futureFeasibility:{status:"FEASIBLE",residualProductiveTaskCount:extra.residual??10},constructiveTargetAssignmentCount:assignments.length,readOnly:true});
const expansion=(task=99,blockers:number[]=[1,2,3,4,5,6])=>({frontierTasksConsidered:[{executionTaskId:task,primaryGoalTaskId:task,supportedGoalTaskIds:[task]}],frontierFailureEvidence:[{executionTaskId:task,primaryGoalTaskId:task,supportedGoalTaskIds:[task],retainedValidBranchCount:0,rejectionReasonCodes:["NO_RETAINED_VALID_BRANCH"],causalConflictTaskIds:blockers,contestantConflictTaskIds:[],spaceConflictTaskIds:[],resourceConflictTaskIds:[],dependencyLowerBoundTaskIds:[],dependencyUpperBoundTaskIds:[],protectedIntervalConflictIds:[],attemptedTemporalCandidateFingerprints:[],attemptedIntervals:[],evidenceComplete:true,incompleteReasonCodes:[],sourceDiagnosticsFingerprint:"test",fingerprint:`e:${task}:${blockers.join(",")}`,readOnly:true}],frontierExhaustionReasonCounts:{NO_RETAINED_VALID_BRANCH:1},anchorPlacementRejectedBranchCount:1,stopReason:"ALL_ELIGIBLE_FRONTIER_CANDIDATES_EXHAUSTED"});

test("backjump causal selects an older causal change over a nearer same-conflict alternative",()=>{
 const failed=plan("failed",[a(1),a(2),a(3),a(4),a(5),a(6)],["g:1:b","g:2:b","g:3:b","g:4:b","g:5:b","g:6:b"]);
 const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion()});
 const same=plan("same",failed.assignments,failed.decisionPath.slice(0,5),{residual:1});
 const causal=plan("causal",[a(1),a(20),a(3)],["g:1:b","g:20:alt","g:3:b"],{residual:9});
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:same},{partialPlan:causal}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry.partialPlanId,"causal");
 assert.ok(sel.evidence.sameConflictAlternativeSkippedCount>=1);
});

test("near alternative conserving all causal assignments is SAME_CAUSAL_CONFLICT",()=>{
 const failed=plan("failed",[a(1),a(2)],["g:1:b","g:2:b"]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion()});
 const ev=evaluateInitialConstructionCausalAlternative({conflict,failedPartialPlan:failed,alternative:plan("near",[a(1),a(2)],["g:1:b"])});
 assert.equal(ev.causallyUseful,false); assert.equal(ev.reason,"SAME_CAUSAL_CONFLICT");
});

test("quality comparator wins between causal alternatives",()=>{
 const failed=plan("failed",[a(1),a(2)],["g:1:b","g:2:b"]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion()});
 const worse=plan("worse",[a(10)],["g:10:x"],{residual:20}); const better=plan("better",[a(20),a(21)],["g:20:x"],{residual:1});
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:worse},{partialPlan:better}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry.partialPlanId,"better");
});

test("protected-only conflict does not invent reversible decisions",()=>{
 const failed=plan("failed",[a(1)],[],{rootAssignmentTaskIds:[1]}); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion(99,[1])});
 assert.equal(conflict.causalDecisions.length,0); assert.equal(conflict.blockingAssignments.length,0);
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:plan("alt",[],[])}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry,null); assert.equal(sel.evidence.fallbackReason,"NO_REVERSIBLE_CAUSAL_DECISION");
});

test("multiple causes prefer deepest changed causal decision",()=>{
 const failed=plan("failed",[a(1),a(2),a(3)],["g:1:b","g:2:b","g:3:b"]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion()});
 const shallow=plan("shallow",[a(10),a(2),a(3)],["g:10:x","g:2:b","g:3:b"]); const deep=plan("deep",[a(1),a(2),a(30)],["g:1:b","g:2:b","g:30:x"]);
 const sel=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier([{partialPlan:shallow},{partialPlan:deep}]),failedPartialPlan:failed,conflict});
 assert.equal(sel.selectedEntry.partialPlanId,"deep");
});

test("no-good equivalent is detected without merging distinct intervals",()=>{
 const failed=plan("failed",[a(1)],["g:1:b"]); const c1=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion(99)}); const c2=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion(100)});
 assert.notEqual(c1.fingerprint,c2.fingerprint);
 const ev=evaluateInitialConstructionCausalAlternative({conflict:c1,failedPartialPlan:failed,alternative:plan("same",[a(1)],[]),nogoodFingerprints:new Set([c1.fingerprint])});
 assert.equal(ev.reason,"NOGOOD_EQUIVALENT_CONFLICT");
});

test("deterministic selection ignores offer order",()=>{
 const failed=plan("failed",[a(1),a(2)],["g:1:b","g:2:b"]); const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion()});
 const alts=[plan("b",[a(20)],["g:20:x"],{residual:2}),plan("a",[a(10)],["g:10:x"],{residual:2})];
 const s1=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier(alts.map(partialPlan=>({partialPlan}))),failedPartialPlan:failed,conflict});
 const s2=selectConflictDirectedInitialConstructionBackjump({frontier:createInitialConstructionSuspendedFrontier(alts.reverse().map(partialPlan=>({partialPlan}))),failedPartialPlan:failed,conflict});
 assert.equal(s1.selectedEntry.partialPlanId,s2.selectedEntry.partialPlanId); assert.deepEqual(s1.evidence,s2.evidence);
});


test("causal conflict uses only structured materialization blockers",()=>{
 const failed=plan("failed",[a(1),a(2),a(3)],["g:1:b","g:2:b","g:3:b"]);
 const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:expansion(99,[2])});
 assert.deepEqual(conflict.blockingAssignments.map((b:any)=>b.taskId),[2]);
 assert.deepEqual(conflict.causalDecisions.map((d:any)=>d.decision),["g:2:b"]);
});

test("causal conflict does not invent blockers without structured evidence",()=>{
 const failed=plan("failed",[a(1),a(2)],["g:1:b","g:2:b"]);
 const conflict=buildInitialConstructionCausalConflict({failedPartialPlan:failed,expansion:{frontierTasksConsidered:[{executionTaskId:99,primaryGoalTaskId:99,supportedGoalTaskIds:[99]}],frontierExhaustionReasonCounts:{NO_RETAINED_VALID_BRANCH:1}}});
 assert.equal(conflict.blockingAssignments.length,0);
 assert.equal(conflict.causalDecisions.length,0);
});
