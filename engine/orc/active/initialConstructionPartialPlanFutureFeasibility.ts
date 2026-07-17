import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

export type InitialConstructionCriticalChainPartialPlanStatus = "ACTIVE"|"SUSPENDED"|"EXPANDED"|"DEAD_END"|"PRUNED"|"COMPLETE_PRODUCTIVE";
export interface InitialConstructionCriticalChainPartialPlan {
 readonly partialPlanId:string; readonly parentPartialPlanId:string|null; readonly assignments:readonly any[];
 readonly depth:number; readonly assignmentsFingerprint:string; readonly goalTaskId:number|null; readonly executionTaskId:number|null; readonly executedFrontierTaskIds:readonly number[];
 readonly minimalExecutionClosureTaskIds:readonly number[]; readonly decisionBranchFingerprint:string; readonly decisionPath:readonly string[];
 readonly criticalChainMapFingerprint:string; readonly anchorRankingFingerprint:string; readonly futureFeasibility:InitialConstructionFutureFeasibility;
 readonly status:InitialConstructionCriticalChainPartialPlanStatus; readonly createdOrdinal:number; readonly readOnly:true;
}
export interface InitialConstructionFutureFeasibility {
 readonly status:"FEASIBLE"|"RISKY"|"INFEASIBLE"; readonly feasible:boolean; readonly minimumRemainingChainSlackMinutes:number|null;
 readonly negativeSlackGoalTaskIds:readonly number[]; readonly zeroFrontierGoalTaskIds:readonly number[];
 readonly zeroPlausibleWindowTaskIds:readonly number[]; readonly criticalResourceCount:number;
 readonly criticalSpaceCount:number; readonly unservedMainFlowGoalTaskIds:readonly number[];
 readonly pendingLoadMinutes:number; readonly futureFreedom:number; readonly priorityKey:readonly number[];
 readonly fingerprint:string; readonly readOnly:true;
}
export const INITIAL_CONSTRUCTION_CRITICAL_CHAIN_SEARCH_DEFAULTS=deepFreeze({maxSuspendedPartialPlans:24,maxTotalConstructivePartialPlans:160,maxCriticalChainsPerDecision:2,maxExecutableFrontierTasksPerChain:2,maxRetainedChainBranches:3,maxChildrenPerDecision:5,maxCrossCycleBacktracks:32,maxElapsedMs:90000,readOnly:true});

/** A deterministic, structured (not weighted) feasibility projection used to
 * compare siblings and to prune a branch as soon as it destroys a chain. */
export function evaluateInitialConstructionPartialPlanFutureFeasibility(args:{criticalChains:readonly any[]; plausibleWindowTaskIds?:readonly number[]; residualProductiveTaskCount?:number}){
 const chains=[...args.criticalChains].sort((a,b)=>Number(a.goalTaskId)-Number(b.goalTaskId));
 const plausible=args.plausibleWindowTaskIds?new Set(args.plausibleWindowTaskIds.map(Number)):null;
 const negative=chains.filter(c=>c.chainSlackMinutes!=null&&c.chainSlackMinutes<0).map(c=>c.goalTaskId);
 const zeroFrontier=chains.filter(c=>(c.topologicalPendingChainTaskIds?.length??0)>0&&(c.executableFrontierTaskIds?.length??0)===0).map(c=>c.goalTaskId);
 const zeroWindows=plausible?chains.filter(c=>!plausible.has(Number(c.goalTaskId))).map(c=>c.goalTaskId):[];
 const slacks=chains.map(c=>c.chainSlackMinutes).filter((v):v is number=>Number.isFinite(v));
 const criticalResourceCount=chains.filter(c=>Number(c.resourcePressure)>0).length;
 const criticalSpaceCount=chains.filter(c=>Number(c.spacePressure)>0).length;
 const unservedMain=chains.filter(c=>c.goalMainFlow&&(c.pendingTransitivePrerequisiteTaskIds?.length??0)>0).map(c=>c.goalTaskId);
 const pendingLoadMinutes=chains.reduce((n,c)=>n+Number(c.pendingChainDurationMinutes??0),0);
 const futureFreedom=chains.reduce((n,c)=>n+Math.max(0,Number(c.chainSlackMinutes??0)),0);
 // Slack and sampled windows are projections, not canonical proofs.  In
 // particular, summing independent prerequisites produces false negatives.
 const hardImpossible=zeroFrontier.length>0;
 const risky=negative.length>0||zeroWindows.length>0||criticalResourceCount>0||criticalSpaceCount>0||unservedMain.length>0;
 const status=hardImpossible?"INFEASIBLE":risky?"RISKY":"FEASIBLE"; const feasible=status!=="INFEASIBLE";
 const negativeMagnitude=negative.reduce((n,id)=>n+Math.abs(Number(chains.find(c=>c.goalTaskId===id)?.chainSlackMinutes??0)),0);
 const raw={status,feasible,minimumRemainingChainSlackMinutes:slacks.length?Math.min(...slacks):null,negativeSlackGoalTaskIds:negative,zeroFrontierGoalTaskIds:zeroFrontier,zeroPlausibleWindowTaskIds:zeroWindows,criticalResourceCount,criticalSpaceCount,unservedMainFlowGoalTaskIds:unservedMain,pendingLoadMinutes,futureFreedom,priorityKey:[status==="FEASIBLE"?0:status==="RISKY"?1:2,negative.length,negativeMagnitude,zeroFrontier.length,zeroWindows.length,criticalResourceCount+criticalSpaceCount,args.residualProductiveTaskCount??chains.length,-futureFreedom]};
 return deepFreeze({...raw,fingerprint:createHash("sha256").update(stableStringify(raw)).digest("hex"),readOnly:true}) as InitialConstructionFutureFeasibility;
}
