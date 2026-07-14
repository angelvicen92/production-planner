import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { initialConstructionAssignmentFingerprint } from "./materializeInitialConstructionAnchorAttempt";

const norm=(a:any):CandidateAssignment=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");

export function auditInitialConstructionRepairNeighborhoodPreservation(args:{ before: readonly CandidateAssignment[]; after: readonly CandidateAssignment[]; repairNeighborhoodTaskIds: readonly number[]; protectedTaskIds?: readonly number[]; productiveTaskIds?: readonly number[] }){
  const neighborhood=new Set(args.repairNeighborhoodTaskIds.map(Number)); const protectedSet=new Set((args.protectedTaskIds??[]).map(Number)); const productive=new Set((args.productiveTaskIds??[]).map(Number));
  const before=new Map(args.before.map(a=>[a.taskId,norm(a)])); const after=new Map(args.after.map(a=>[a.taskId,norm(a)]));
  const changed=(ids:number[])=>ids.filter(id=>stableStringify(before.get(id)??null)!==stableStringify(after.get(id)??null)).sort((a,b)=>a-b);
  const outside=[...new Set([...before.keys(),...after.keys()])].filter(id=>!neighborhood.has(id));
  const protectedChanged=changed([...protectedSet]); const outsideChanged=changed(outside);
  const lost=[...before.keys()].filter(id=>productive.has(id)&&!after.has(id)).sort((a,b)=>a-b); const newly=[...after.keys()].filter(id=>productive.has(id)&&!before.has(id)).sort((a,b)=>a-b);
  const afterIds=args.after.map(a=>a.taskId); const duplicateTaskIds=[...new Set(afterIds.filter((id,i)=>afterIds.indexOf(id)!==i))].sort((a,b)=>a-b);
  const removedAssignmentIds=[...before.keys()].filter(id=>!after.has(id)).sort((a,b)=>a-b); const reinsertedAssignmentIds=[...after.keys()].filter(id=>!before.has(id)).sort((a,b)=>a-b);
  const modifiedNeighborhoodAssignmentIds=changed([...neighborhood]);
  return deepFreeze({protectedAssignmentsModified:protectedChanged.length>0,protectedAssignmentIdsModified:protectedChanged,outsideNeighborhoodAssignmentsModified:outsideChanged.length,outsideNeighborhoodAssignmentIdsModified:outsideChanged,lostProductiveTaskIds:lost,newlyAssignedProductiveTaskIds:newly,removedAssignmentIds,reinsertedAssignmentIds,modifiedNeighborhoodAssignmentIds,duplicateTaskIds,fingerprint:hash({protectedChanged,outsideChanged,lost,newly,removedAssignmentIds,reinsertedAssignmentIds,modifiedNeighborhoodAssignmentIds,duplicateTaskIds}),readOnly:true}) as any;
}

export function runInitialConstructionRepairNeighborhoodSession(args:{ originInput:EngineInput; originOperationalState:OperationalState; canonicalContext:any; combinedPartialPlan:any; repairProblem:any; ejectionSet:any; blockedAnchorTaskId:number; localBudget?:any }){
  const before=[...(args.combinedPartialPlan?.assignments??[])].map(norm).sort((a,b)=>a.taskId-b.taskId);
  const removed=new Set((args.ejectionSet?.repairDependencyClosureTaskIds??[]).map(Number));
  const base=before.filter(a=>!removed.has(a.taskId));
  const audit=auditInitialConstructionRepairNeighborhoodPreservation({before,after:base,repairNeighborhoodTaskIds:args.ejectionSet?.repairNeighborhoodTaskIds??[],protectedTaskIds:args.repairProblem?.protectedTaskIds??[],productiveTaskIds:(args.originInput.tasks??[]).map((t:any)=>Number(t.id))});
  const sessionFingerprint=hash({before:initialConstructionAssignmentFingerprint(before),base:initialConstructionAssignmentFingerprint(base),audit:audit.fingerprint,blockedAnchorTaskId:args.blockedAnchorTaskId,set:args.ejectionSet?.fingerprint??null});
  return deepFreeze({version:"INITIAL-CONSTRUCTION-REPAIR-NEIGHBORHOOD-SESSION-V1",executed:true,accepted:false,combinedPartialPlan:{...args.combinedPartialPlan,assignments:base,combinedAssignmentsFingerprint:initialConstructionAssignmentFingerprint(base),readOnly:true},anchorAssigned:base.some(a=>a.taskId===Number(args.blockedAnchorTaskId)),allNeighborhoodReinserted:false,acceptedCycleCount:0,anchorAttemptCount:0,validationCount:0,audit,stopReason:"ANCHOR_RECONSTRUCTION_FAILED",sessionFingerprint,readOnly:true}) as any;
}
