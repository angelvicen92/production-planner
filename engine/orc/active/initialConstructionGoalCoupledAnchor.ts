import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { OperationalState, CandidateAssignment } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

export type InitialConstructionGoalResolutionSource = "PRIMARY_SUPPORTED_GOAL"|"CRITICAL_CHAIN_GOAL"|"SELF_ANCHOR_FALLBACK"|"NO_PENDING_GOAL";
export type InitialConstructionGoalResolutionStatus = "RESOLVED"|"NO_PENDING_GOAL"|"GOAL_NOT_FOUND";
const uniq=(xs:number[])=>[...new Set(xs.filter(Number.isFinite))].sort((a,b)=>a-b);
const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");

export function resolveInitialConstructionGoalCoupledAnchor(args:{
  anchor:any; initialConstructionMap:any; canonicalContext?:any; inputTasks:readonly any[]; provisionalAssignedTaskIds?:readonly number[]; targetConstructiveTaskIds?:readonly number[]; constructionSearchStrategy?:"single_path"|"critical_chain_retained_alternatives"; originOperationalState?:OperationalState|null; provisionalAssignments?:readonly CandidateAssignment[];
}){
 const anchor=args.anchor??{}; const map=args.initialConstructionMap??{}; const priorityCarrierTaskId=Number(anchor.anchorTaskId);
 const taskIds=new Set((args.inputTasks??[]).map((t:any)=>Number(t.id)).filter(Number.isFinite));
 const universe=new Set((args.targetConstructiveTaskIds??map.classification?.taskUniverse?.constructiveExecutionTaskIds??map.classification?.constructiveExecutionTasks?.map((x:any)=>x.id)??map.classification?.constructiveTargetTasks?.map((x:any)=>x.id)??[]).map(Number));
 const provisionallySatisfied=new Set([...(args.provisionalAssignedTaskIds??[]),...(args.provisionalAssignments??[]).map((a:any)=>Number(a.taskId)),...(map.provisionallyAssignedTaskIds??[])].map(Number).filter(Number.isFinite));
 const protectedIds=new Set<number>();
 for(const t of args.inputTasks??[]) if(t.status==="done"||t.status==="in_progress") protectedIds.add(Number(t.id));
 for(const l of args.originOperationalState?.locks??[]) if(Number.isFinite(Number((l as any).taskId))) protectedIds.add(Number((l as any).taskId));
 for(const a of args.originOperationalState?.planning??[]) if(Number.isFinite(Number((a as any).taskId))) protectedIds.add(Number((a as any).taskId));
 const satisfied=new Set([...provisionallySatisfied,...protectedIds]);
 const supportedGoalTaskIds=uniq([...(anchor.supportedGoalTaskIds??[]), anchor.primarySupportedGoalTaskId, anchor.goalTaskId].map(Number));
 const candidates=[{id:Number(anchor.primarySupportedGoalTaskId),source:"PRIMARY_SUPPORTED_GOAL" as const},{id:Number(anchor.goalTaskId),source:"CRITICAL_CHAIN_GOAL" as const},...supportedGoalTaskIds.map(id=>({id,source:"CRITICAL_CHAIN_GOAL" as const}))];
 const firstPending=candidates.find(c=>taskIds.has(c.id)&&universe.has(c.id)&&!satisfied.has(c.id));
 let constructionGoalTaskId=firstPending?.id??Number.NaN; let goalResolutionSource:InitialConstructionGoalResolutionSource=firstPending?.source??"NO_PENDING_GOAL";
 const goalAlreadySatisfied=!!candidates.find(c=>taskIds.has(c.id)&&universe.has(c.id)&&satisfied.has(c.id));
 if(!Number.isFinite(constructionGoalTaskId)){
   if(taskIds.has(priorityCarrierTaskId)&&universe.has(priorityCarrierTaskId)&&!satisfied.has(priorityCarrierTaskId)){ constructionGoalTaskId=priorityCarrierTaskId; goalResolutionSource="SELF_ANCHOR_FALLBACK"; }
 }
 const goalTaskFound=Number.isFinite(constructionGoalTaskId)&&taskIds.has(constructionGoalTaskId);
 const chain=(map.criticalChains??[]).find((c:any)=>Number(c.goalTaskId)===constructionGoalTaskId)??null;
 const nodeById=new Map((map.dependencyGraph?.nodes??[]).map((n:any)=>[Number(n.taskId),n]));
 const node:any=nodeById.get(constructionGoalTaskId)??{};
 const chainIds=(chain?.topologicalPendingChainTaskIds??[]).map(Number);
 const graphIds=[...((node.transitivePrerequisiteTaskIds??node.directPrerequisiteTaskIds??[]) as any[]).map(Number), constructionGoalTaskId];
 const rawClosure=[...(chainIds.length?chainIds:[]),...graphIds].filter((id:number,i:number,a:number[])=>Number.isFinite(id)&&a.indexOf(id)===i);
 const executableUniverse=new Set((map.classification?.taskUniverse?.constructiveExecutionTaskIds??map.classification?.constructiveExecutionTasks?.map((x:any)=>x.id)??args.targetConstructiveTaskIds??map.classification?.taskUniverse?.constructiveTargetTaskIds??map.classification?.constructiveTargetTasks?.map((x:any)=>x.id)??[]).map(Number));
 const pendingGoalClosureTaskIds=rawClosure.filter(id=>taskIds.has(id)&&executableUniverse.has(id)&&!satisfied.has(id));
 const alreadySatisfiedClosureTaskIds=rawClosure.filter(id=>taskIds.has(id)&&executableUniverse.has(id)&&satisfied.has(id));
 const orderSource=chainIds.length?chainIds:rawClosure;
 const topologicalPendingGoalClosureTaskIds=[...orderSource.filter((id:number)=>pendingGoalClosureTaskIds.includes(id)),...pendingGoalClosureTaskIds.filter(id=>!orderSource.includes(id))].filter((id,i,a)=>a.indexOf(id)===i);
 const executableFrontierTaskIds=uniq((chain?.executableFrontierTaskIds??anchor.executableFrontierTaskIds??[priorityCarrierTaskId]).map(Number).filter((id:number)=>pendingGoalClosureTaskIds.includes(id)));
 const goalIncludedInPendingClosure=topologicalPendingGoalClosureTaskIds.includes(constructionGoalTaskId);
 const resolutionStatus:InitialConstructionGoalResolutionStatus=!Number.isFinite(constructionGoalTaskId)?"NO_PENDING_GOAL":!goalTaskFound?"GOAL_NOT_FOUND":"RESOLVED";
 const failureReason=resolutionStatus==="RESOLVED"?null:resolutionStatus;
 const chainFingerprint=chain?.fingerprint??anchor.fingerprint??hash({priorityCarrierTaskId,supportedGoalTaskIds});
 const fingerprint=hash({version:"INITIAL-CONSTRUCTION-GOAL-COUPLED-ANCHOR-V1",priorityCarrierTaskId,constructionGoalTaskId:goalTaskFound?constructionGoalTaskId:null,goalResolutionSource,supportedGoalTaskIds,executableFrontierTaskIds,pendingGoalClosureTaskIds,topologicalPendingGoalClosureTaskIds,alreadySatisfiedClosureTaskIds,goalAlreadySatisfied,goalIncludedInPendingClosure,chainFingerprint,resolutionStatus,failureReason});
 return deepFreeze({priorityCarrierTaskId,constructionGoalTaskId:goalTaskFound?constructionGoalTaskId:null,goalResolutionSource,supportedGoalTaskIds,executableFrontierTaskIds,pendingGoalClosureTaskIds,topologicalPendingGoalClosureTaskIds,alreadySatisfiedClosureTaskIds,goalAlreadySatisfied,goalIncludedInPendingClosure,goalTaskFound,chainFingerprint,resolutionStatus,failureReason,fingerprint,readOnly:true}) as any;
}
