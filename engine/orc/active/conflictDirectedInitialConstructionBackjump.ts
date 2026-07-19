import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { compareInitialConstructionPartialPlanOperationalQuality, commonDecisionPathPrefixLength, createInitialConstructionSuspendedFrontier, type InitialConstructionSuspendedFrontier } from "./initialConstructionSuspendedFrontier";

const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
const norm=(a:any)=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const assignmentKey=(a:any)=>hash(norm(a));
const decisionExecutionTaskId=(d:string)=>{ const p=String(d).split(":"); const n=Number(p[1]??p[0]); return Number.isFinite(n)?n:null; };

export type InitialConstructionCausalBlockerClassification="REVERSIBLE_PROVISIONAL"|"PROTECTED_BY_LOCK_OR_STATE"|"EXTERNAL_ORIGIN"|"STRUCTURAL_UNATTRIBUTABLE";
export type InitialConstructionAlternativeCausalReason="CAUSALLY_USEFUL"|"SAME_CAUSAL_CONFLICT"|"NO_SHARED_CAUSAL_HISTORY"|"NO_REVERSIBLE_CAUSAL_DECISION"|"NOGOOD_EQUIVALENT_CONFLICT";

export function buildInitialConstructionDecisionAssignmentIndex(partialPlan:any){
 const rootTasks=new Set((partialPlan?.rootAssignmentTaskIds??[]).map(Number));
 const assignments=[...(partialPlan?.assignments??[])].map(norm).sort((a,b)=>a.taskId-b.taskId);
 const decisions=[...(partialPlan?.decisionPath??[])].map(String);
 const entries:any[]=[];
 for(const a of assignments){
  let depth=-1, decision:string|null=null;
  for(let i=decisions.length-1;i>=0;i--) if(decisionExecutionTaskId(decisions[i])===a.taskId){depth=i+1; decision=decisions[i]; break;}
  const classification:InitialConstructionCausalBlockerClassification=depth>0&&!rootTasks.has(a.taskId)?"REVERSIBLE_PROVISIONAL":(rootTasks.has(a.taskId)?"PROTECTED_BY_LOCK_OR_STATE":"STRUCTURAL_UNATTRIBUTABLE");
  entries.push({assignment:a,assignmentKey:assignmentKey(a),taskId:a.taskId,classification,decision,decisionDepth:depth>0?depth:null,readOnly:true});
 }
 return deepFreeze({entries,byTaskId:Object.fromEntries(entries.map(e=>[String(e.taskId),e])),byAssignmentKey:Object.fromEntries(entries.map(e=>[e.assignmentKey,e])),fingerprint:hash(entries.map(e=>({k:e.assignmentKey,t:e.taskId,c:e.classification,d:e.decision,depth:e.decisionDepth}))),readOnly:true}) as any;
}

export function buildInitialConstructionCausalConflict(args:{failedPartialPlan:any; expansion:any}){
 const index=buildInitialConstructionDecisionAssignmentIndex(args.failedPartialPlan);
 const frontierTasks=[...(args.expansion?.frontierTasksConsidered??[])];
 const first=frontierTasks[0]??{};
 const reasons=Object.entries(args.expansion?.frontierExhaustionReasonCounts??{}).filter(([,v])=>Number(v)>0).map(([k])=>k).sort();
 if(!reasons.length&&Number(args.expansion?.anchorPlacementRejectedBranchCount??0)>0) reasons.push("ANCHOR_PLACEMENT_REJECTED");
 if(!reasons.length&&Number(args.expansion?.rawClosureIncompleteBranchCount??0)>0) reasons.push("RAW_CLOSURE_INCOMPLETE");
 if(!reasons.length) reasons.push(String(args.expansion?.stopReason??"DEAD_END"));
 const blockedTaskIds=[...new Set(frontierTasks.map((f:any)=>Number(f.executionTaskId)).filter(Number.isFinite))].sort((a,b)=>a-b);
 const reversible=index.entries.filter((e:any)=>e.classification==="REVERSIBLE_PROVISIONAL");
 const blockers=reversible.map((e:any)=>({taskId:e.taskId,assignmentKey:e.assignmentKey,classification:e.classification,decision:e.decision,decisionDepth:e.decisionDepth,assignment:e.assignment,readOnly:true}));
 const decisions:any[]=[...new Map<string,any>(blockers.filter((b:any)=>b.decision).map((b:any)=>[b.decision,{decision:b.decision,decisionDepth:b.decisionDepth,taskIds:blockers.filter((x:any)=>x.decision===b.decision).map((x:any)=>x.taskId).sort((a:any,b:any)=>a-b),readOnly:true}])).values()].sort((a:any,b:any)=>Number(b.decisionDepth)-Number(a.decisionDepth)||String(a.decision).localeCompare(String(b.decision)));
 const payload={frontierTaskId:Number(first.executionTaskId??blockedTaskIds[0]??null)||null,frontierTaskIds:blockedTaskIds,criticalGoalTaskIds:[...new Set(frontierTasks.flatMap((f:any)=>[f.primaryGoalTaskId,...(f.supportedGoalTaskIds??[])]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b),attemptedInterval:null,rejectionReasons:reasons,blockingAssignments:blockers,causalDecisions:decisions,mostRecentCausalDepth:decisions[0]?.decisionDepth??null};
 return deepFreeze({...payload,fingerprint:hash(payload),readOnly:true}) as any;
}

export function evaluateInitialConstructionCausalAlternative(args:{conflict:any; failedPartialPlan:any; alternative:any; nogoodFingerprints?:ReadonlySet<string>}){
 const alt=args.alternative?.partialPlan??args.alternative; const failedPath=[...(args.failedPartialPlan?.decisionPath??[])].map(String); const altPath=[...(alt?.decisionPath??[])].map(String);
 const altKeys=new Set([...(alt?.assignments??[])].map(assignmentKey));
 const causal=args.conflict?.blockingAssignments??[]; const eliminated=causal.filter((b:any)=>!altKeys.has(b.assignmentKey)); const conserved=causal.filter((b:any)=>altKeys.has(b.assignmentKey));
 const changedDecisions=[...new Set(eliminated.map((b:any)=>b.decision).filter(Boolean))].sort();
 const shares=causal.some((b:any)=>b.decisionDepth!=null && altPath.slice(0,Number(b.decisionDepth)-1).every((d,i)=>failedPath[i]===d));
 const same=causal.length>0&&conserved.length===causal.length;
 const useful=changedDecisions.length>0;
 const deepestChanged=Math.max(0,...eliminated.map((b:any)=>Number(b.decisionDepth??0)));
 const prefix=commonDecisionPathPrefixLength(failedPath,altPath); const distance=Math.max(0,failedPath.length-prefix);
 const wouldRepeat=args.nogoodFingerprints?.has(args.conflict?.fingerprint)===true&&same;
 const reason:InitialConstructionAlternativeCausalReason=wouldRepeat?"NOGOOD_EQUIVALENT_CONFLICT":useful?"CAUSALLY_USEFUL":same?"SAME_CAUSAL_CONFLICT":shares?"NO_REVERSIBLE_CAUSAL_DECISION":"NO_SHARED_CAUSAL_HISTORY";
 return deepFreeze({alternativePartialPlanId:alt?.partialPlanId??null,alternativeAssignmentsFingerprint:alt?.assignmentsFingerprint??args.alternative?.assignmentsFingerprint??null,causallyUseful:useful&&!wouldRepeat,changedDecisions,eliminatedAssignmentKeys:eliminated.map((b:any)=>b.assignmentKey).sort(),conservedAssignmentKeys:conserved.map((b:any)=>b.assignmentKey).sort(),deepestChangedCausalDepth:deepestChanged||null,backjumpDistance:distance,commonDecisionPathPrefixLength:prefix,reason,readOnly:true}) as any;
}

export function selectConflictDirectedInitialConstructionBackjump(args:{frontier:InitialConstructionSuspendedFrontier; failedPartialPlan:any; conflict:any; nogoodFingerprints?:ReadonlySet<string>}){
 const evaluations=[...args.frontier.entries].map(e=>({entry:e,evaluation:evaluateInitialConstructionCausalAlternative({conflict:args.conflict,failedPartialPlan:args.failedPartialPlan,alternative:e,nogoodFingerprints:args.nogoodFingerprints})}));
 const useful=evaluations.filter(x=>x.evaluation.causallyUseful).sort((a,b)=>Number(b.evaluation.deepestChangedCausalDepth??0)-Number(a.evaluation.deepestChangedCausalDepth??0)||compareInitialConstructionPartialPlanOperationalQuality(a.entry.partialPlan,b.entry.partialPlan)||Number(a.evaluation.backjumpDistance)-Number(b.evaluation.backjumpDistance)||a.entry.assignmentsFingerprint.localeCompare(b.entry.assignmentsFingerprint));
 const selected=useful[0]??null; const remaining=selected?evaluations.filter(x=>x.entry.assignmentsFingerprint!==selected.entry.assignmentsFingerprint).map(x=>x.entry):args.frontier.entries;
 const skipped=evaluations.filter(x=>!x.evaluation.causallyUseful);
 return deepFreeze({selectedEntry:selected?.entry??null,frontier:createInitialConstructionSuspendedFrontier(remaining),evaluations:evaluations.map(x=>x.evaluation),evidence:{conflictFingerprint:args.conflict?.fingerprint??null,selectedPartialPlanId:selected?.entry.partialPlanId??null,accepted:Boolean(selected),fallbackReason:selected?null:((args.conflict?.causalDecisions?.length??0)>0?"NO_CAUSALLY_USEFUL_SUSPENDED_ALTERNATIVE":"NO_REVERSIBLE_CAUSAL_DECISION"),backtrackDistance:selected?.evaluation.backjumpDistance??0,commonDecisionPathPrefixLength:selected?.evaluation.commonDecisionPathPrefixLength??0,fromDepth:[...(args.failedPartialPlan?.decisionPath??[])].length,toDepth:selected?.entry.depth??null,changedDecisions:selected?.evaluation.changedDecisions??[],nonCausalAlternativeSkippedCount:skipped.filter(x=>x.evaluation.reason!=="SAME_CAUSAL_CONFLICT"&&x.evaluation.reason!=="NOGOOD_EQUIVALENT_CONFLICT").length,sameConflictAlternativeSkippedCount:skipped.filter(x=>x.evaluation.reason==="SAME_CAUSAL_CONFLICT"||x.evaluation.reason==="NOGOOD_EQUIVALENT_CONFLICT").length,readOnly:true},readOnly:true}) as any;
}
