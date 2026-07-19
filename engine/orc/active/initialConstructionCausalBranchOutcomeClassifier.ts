import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import type { InitialConstructionCausalBranchAttempt, InitialConstructionCausalBranchAttemptStatus } from "./initialConstructionCausalBranchOutcomeLedger";

const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
const arr=(x:any)=>[...(x??[])];

export type InitialConstructionCausalBranchTerminalStatus="HARD_INVALID"|"FUTURE_INFEASIBLE"|"COMPLETE"|"BUDGET_INTERRUPTED"|null|undefined;
export interface InitialConstructionResultingCausalConflict { readonly fingerprint:string; readonly familyFingerprint?:string|null; readonly frontierTaskId?:number|null; readonly blockingTaskIds?:readonly number[]; readonly reason?:string|null; }
export interface InitialConstructionCausalBranchOutcomeClassification { readonly status:Exclude<InitialConstructionCausalBranchAttemptStatus,"ACTIVE">; readonly conflictFingerprint:string; readonly resultingConflictFingerprint:string|null; readonly exactConflictFingerprintMatch:boolean; readonly blockedFrontierTaskAssigned:boolean; readonly productiveProgress:boolean; readonly reason:string; readonly sameFingerprintInvariantViolation:boolean; readonly differentFingerprintInvariantViolation:boolean; readonly fingerprint:string; readonly readOnly:true; }

export function isInitialConstructionTaskAssignedInPartialPlan(activePartialPlan:any, taskId:number|null|undefined):boolean{
 if(!Number.isFinite(Number(taskId))) return false;
 return arr(activePartialPlan?.assignments).some((a:any)=>Number(a.taskId)===Number(taskId));
}

export function classifyInitialConstructionCausalBranchOutcome(args:{attempt:InitialConstructionCausalBranchAttempt; resultingConflict?:InitialConstructionResultingCausalConflict|null; activePartialPlan?:any; productiveProgress?:boolean; blockedFrontierTaskAssigned?:boolean; terminalStatus?:InitialConstructionCausalBranchTerminalStatus;}):InitialConstructionCausalBranchOutcomeClassification{
 const terminal=args.terminalStatus??null;
 const resulting=args.resultingConflict??null;
 const resultingFp=resulting?.fingerprint??null;
 const blockedAssigned=Boolean(args.blockedFrontierTaskAssigned??isInitialConstructionTaskAssignedInPartialPlan(args.activePartialPlan,args.attempt.frontierTaskId));
 const productiveProgress=Boolean(args.productiveProgress);
 const exact=Boolean(resultingFp&&args.attempt.conflictFingerprint===resultingFp);
 let status:Exclude<InitialConstructionCausalBranchAttemptStatus,"ACTIVE">;
 let reason:string;
 if(terminal){ status=terminal; reason=`TERMINAL_${terminal}`; }
 else if(blockedAssigned&&!exact){ status="RESOLVED_BLOCKED_FRONTIER"; reason="ORIGINAL_BLOCKED_FRONTIER_ASSIGNED_AND_CONFLICT_NOT_REPEATED"; }
 else if(!resultingFp){ status="BUDGET_INTERRUPTED"; reason="NO_RESULTING_CONFLICT_AVAILABLE"; }
 else if(exact){ status=productiveProgress?"PROGRESSED_BUT_REPEATED_SAME_CONFLICT":"REPEATED_SAME_CONFLICT"; reason=productiveProgress?"EXACT_CONFLICT_REPEATED_AFTER_PRODUCTIVE_PROGRESS":"EXACT_CONFLICT_REPEATED"; }
 else { status="ADVANCED_TO_DIFFERENT_CONFLICT"; reason="RESULTING_CONFLICT_FINGERPRINT_DIFFERS"; }
 const sameViolation=(status==="REPEATED_SAME_CONFLICT"||status==="PROGRESSED_BUT_REPEATED_SAME_CONFLICT")&&!exact;
 const diffViolation=status==="ADVANCED_TO_DIFFERENT_CONFLICT"&&Boolean(resultingFp)&&exact;
 const payload={status,conflictFingerprint:args.attempt.conflictFingerprint,resultingConflictFingerprint:resultingFp,exactConflictFingerprintMatch:exact,blockedFrontierTaskAssigned:blockedAssigned,productiveProgress,reason,sameFingerprintInvariantViolation:sameViolation,differentFingerprintInvariantViolation:diffViolation};
 return deepFreeze({...payload,fingerprint:hash(payload),readOnly:true}) as any;
}
