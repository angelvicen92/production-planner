import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

export type InitialConstructionCriticalChainPartialPlanStatus = "ACTIVE"|"SUSPENDED"|"DEAD_END"|"PRUNED"|"COMPLETE_PRODUCTIVE";
export interface InitialConstructionCriticalChainPartialPlan {
 readonly partialPlanId:string; readonly parentPartialPlanId:string|null; readonly assignments:readonly any[];
 readonly assignmentsFingerprint:string; readonly goalTaskId:number|null; readonly executedFrontierTaskIds:readonly number[];
 readonly completedClosureTaskIds:readonly number[]; readonly decisionPath:readonly string[];
 readonly criticalChainMapFingerprint:string; readonly futureFeasibility:InitialConstructionFutureFeasibility;
 readonly status:InitialConstructionCriticalChainPartialPlanStatus; readonly createdOrdinal:number; readonly readOnly:true;
}
export interface InitialConstructionFutureFeasibility {
 readonly feasible:boolean; readonly minimumRemainingChainSlackMinutes:number|null;
 readonly negativeSlackGoalTaskIds:readonly number[]; readonly zeroFrontierGoalTaskIds:readonly number[];
 readonly zeroPlausibleWindowTaskIds:readonly number[]; readonly criticalResourceCount:number;
 readonly criticalSpaceCount:number; readonly unservedMainFlowGoalTaskIds:readonly number[];
 readonly pendingLoadMinutes:number; readonly futureFreedom:number; readonly priorityKey:readonly number[];
 readonly fingerprint:string; readonly readOnly:true;
}
export const INITIAL_CONSTRUCTION_CRITICAL_CHAIN_SEARCH_DEFAULTS=deepFreeze({maxSuspendedPartialPlans:24,maxTotalConstructivePartialPlans:160,maxCriticalChainsPerDecision:2,maxRetainedChainBranches:3,maxChildrenPerDecision:5,maxCrossCycleBacktracks:32,maxElapsedMs:90000,readOnly:true});

/** A deterministic, structured (not weighted) feasibility projection used to
 * compare siblings and to prune a branch as soon as it destroys a chain. */
export function evaluateInitialConstructionPartialPlanFutureFeasibility(args:{criticalChains:readonly any[]; plausibleWindowTaskIds?:readonly number[]}){
 const plausible=args.plausibleWindowTaskIds?new Set(args.plausibleWindowTaskIds.map(Number)):null;
 const negative=args.criticalChains.filter(c=>c.chainSlackMinutes!=null&&c.chainSlackMinutes<0).map(c=>c.goalTaskId).sort((a,b)=>a-b);
 const zeroFrontier=args.criticalChains.filter(c=>(c.topologicalPendingChainTaskIds?.length??0)>0&&(c.executableFrontierTaskIds?.length??0)===0).map(c=>c.goalTaskId).sort((a,b)=>a-b);
 const zeroWindows=plausible?args.criticalChains.filter(c=>!plausible.has(Number(c.goalTaskId))).map(c=>c.goalTaskId).sort((a,b)=>a-b):[];
 const slacks=args.criticalChains.map(c=>c.chainSlackMinutes).filter((v):v is number=>Number.isFinite(v));
 const criticalResourceCount=args.criticalChains.filter(c=>Number(c.resourcePressure)>0).length;
 const criticalSpaceCount=args.criticalChains.filter(c=>Number(c.spacePressure)>0).length;
 const unservedMain=args.criticalChains.filter(c=>c.goalMainFlow&&(c.pendingTransitivePrerequisiteTaskIds?.length??0)>0).map(c=>c.goalTaskId).sort((a,b)=>a-b);
 const pendingLoadMinutes=args.criticalChains.reduce((n,c)=>n+Number(c.pendingChainDurationMinutes??0),0);
 const futureFreedom=args.criticalChains.reduce((n,c)=>n+Math.max(0,Number(c.chainSlackMinutes??0)),0);
 const feasible=negative.length===0&&zeroFrontier.length===0&&zeroWindows.length===0;
 const raw={feasible,minimumRemainingChainSlackMinutes:slacks.length?Math.min(...slacks):null,negativeSlackGoalTaskIds:negative,zeroFrontierGoalTaskIds:zeroFrontier,zeroPlausibleWindowTaskIds:zeroWindows,criticalResourceCount,criticalSpaceCount,unservedMainFlowGoalTaskIds:unservedMain,pendingLoadMinutes,futureFreedom,priorityKey:[feasible?0:1,negative.length,zeroFrontier.length,zeroWindows.length,criticalResourceCount,criticalSpaceCount,unservedMain.length,-futureFreedom]};
 return deepFreeze({...raw,fingerprint:createHash("sha256").update(stableStringify(raw)).digest("hex"),readOnly:true}) as InitialConstructionFutureFeasibility;
}
