import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");

export type InitialConstructionSuspendedFrontierEntry = Readonly<{
  partialPlan:any; partialPlanId:string; assignmentsFingerprint:string; depth:number;
  residualProductiveTaskCount:number; decisionPath:readonly string[];
  futureFeasibilityFingerprint:string|null; admittedOrdinal:number; readOnly:true;
}>;
export type InitialConstructionSuspendedFrontier = Readonly<{entries:readonly InitialConstructionSuspendedFrontierEntry[]; readOnly:true}>;
export type InitialConstructionSuspendedFrontierOfferReason = "ADMITTED_WITH_CAPACITY"|"REPLACED_WORST_RETAINED"|"WORSE_THAN_RETAINED_FRONTIER"|"DUPLICATE_ASSIGNMENTS_FINGERPRINT";
export type InitialConstructionSuspendedFrontierOfferResult = Readonly<{candidateAdmitted:boolean; candidateRejected:boolean; replacement:boolean; evictedEntry:InitialConstructionSuspendedFrontierEntry|null; frontier:InitialConstructionSuspendedFrontier; reason:InitialConstructionSuspendedFrontierOfferReason; evidence:any; readOnly:true}>;

export function compareInitialConstructionPartialPlanResults(a:any,b:any){
 const valid=(x:any)=>x?.validationResult==="VALID"||x?.finalValidationResult==="VALID"||x?.futureFeasibility?.feasible!==false;
 const target=(x:any)=>Number(x?.constructiveTargetAssignmentCount??x?.assignments?.length??0);
 const residual=(x:any)=>Number(x?.futureFeasibility?.residualProductiveTaskCount??x?.residualProductiveTaskCount??Number.MAX_SAFE_INTEGER);
 const statusRank=(x:any)=>x?.futureFeasibility?.status==="FEASIBLE"?0:x?.futureFeasibility?.status==="RISKY"?1:2;
 const blockers=(x:any)=>Number(x?.futureFeasibility?.negativeSlackGoalTaskIds?.length??0)+Number(x?.futureFeasibility?.zeroPlausibleWindowTaskIds?.length??0);
 const noFrontier=(x:any)=>Number(x?.futureFeasibility?.zeroFrontierGoalTaskIds?.length??0);
 const freedom=(x:any)=>Number(x?.futureFeasibility?.futureFreedom??0);
 const checks=[Number(valid(b))-Number(valid(a)), residual(a)-residual(b), target(b)-target(a), statusRank(a)-statusRank(b), blockers(a)-blockers(b), noFrontier(a)-noFrontier(b), freedom(b)-freedom(a)];
 for(const d of checks) if(d) return d;
 return String(a?.assignmentsFingerprint??"").localeCompare(String(b?.assignmentsFingerprint??""));
}

export function compareInitialConstructionPartialPlanOperationalQuality(a:any,b:any){
 const af=a?.partialPlan??a, bf=b?.partialPlan??b;
 const valid=(x:any)=>x?.validationResult==="VALID"||x?.finalValidationResult==="VALID"||x?.futureFeasibility?.feasible!==false;
 const target=(x:any)=>Number(x?.constructiveTargetAssignmentCount??x?.assignments?.length??0);
 const residual=(x:any)=>Number(x?.futureFeasibility?.residualProductiveTaskCount??x?.residualProductiveTaskCount??Number.MAX_SAFE_INTEGER);
 const statusRank=(x:any)=>x?.futureFeasibility?.status==="FEASIBLE"?0:x?.futureFeasibility?.status==="RISKY"?1:2;
 const blockers=(x:any)=>Number(x?.futureFeasibility?.negativeSlackGoalTaskIds?.length??0)+Number(x?.futureFeasibility?.zeroPlausibleWindowTaskIds?.length??0);
 const noFrontier=(x:any)=>Number(x?.futureFeasibility?.zeroFrontierGoalTaskIds?.length??0);
 const freedom=(x:any)=>Number(x?.futureFeasibility?.futureFreedom??0);
 for(const d of [Number(valid(bf))-Number(valid(af)), residual(af)-residual(bf), target(bf)-target(af), statusRank(af)-statusRank(bf), blockers(af)-blockers(bf), noFrontier(af)-noFrontier(bf), freedom(bf)-freedom(af)]) if(d) return d;
 return 0;
}

export function createInitialConstructionSuspendedFrontier(entries:readonly any[]=[]):InitialConstructionSuspendedFrontier{
 return deepFreeze({entries:[...entries].map((e:any)=>toInitialConstructionSuspendedFrontierEntry(e.partialPlan??e,e.admittedOrdinal??e.partialPlan?.createdOrdinal??0)).sort((a,b)=>compareInitialConstructionPartialPlanResults(a.partialPlan,b.partialPlan)),readOnly:true}) as any;
}

export function toInitialConstructionSuspendedFrontierEntry(partialPlan:any, admittedOrdinal:number):InitialConstructionSuspendedFrontierEntry{
 return deepFreeze({partialPlan,partialPlanId:String(partialPlan?.partialPlanId??""),assignmentsFingerprint:String(partialPlan?.assignmentsFingerprint??""),depth:Number(partialPlan?.depth??partialPlan?.decisionPath?.length??0),residualProductiveTaskCount:Number(partialPlan?.futureFeasibility?.residualProductiveTaskCount??partialPlan?.residualProductiveTaskCount??Number.MAX_SAFE_INTEGER),decisionPath:[...(partialPlan?.decisionPath??[])],futureFeasibilityFingerprint:partialPlan?.futureFeasibility?.fingerprint??partialPlan?.futureFeasibilityFingerprint??null,admittedOrdinal,readOnly:true}) as any;
}

export function frontierFingerprint(frontier:InitialConstructionSuspendedFrontier){return hash(frontier.entries.map(e=>({fp:e.assignmentsFingerprint,depth:e.depth,residual:e.residualProductiveTaskCount,ff:e.futureFeasibilityFingerprint})));}

export function offerInitialConstructionSuspendedAlternative(args:{frontier:InitialConstructionSuspendedFrontier; candidate:any; maxSuspendedPartialPlans:number; activePartialPlan:any; admittedOrdinal:number}):InitialConstructionSuspendedFrontierOfferResult{
 const max=Math.max(0,Number(args.maxSuspendedPartialPlans)||0); const before=[...args.frontier.entries]; const candidate=toInitialConstructionSuspendedFrontierEntry(args.candidate,args.admittedOrdinal);
 if(before.some(e=>e.assignmentsFingerprint===candidate.assignmentsFingerprint)) return deepFreeze({candidateAdmitted:false,candidateRejected:true,replacement:false,evictedEntry:null,frontier:args.frontier,reason:"DUPLICATE_ASSIGNMENTS_FINGERPRINT",evidence:{capacityReached:before.length>=max,blindSuspendedFrontierRejection:false,bestRankedSuspendedAlternativeEvicted:false,frontierFingerprint:frontierFingerprint(args.frontier)},readOnly:true}) as any;
 const ranked=[...before,candidate].sort((a,b)=>compareInitialConstructionPartialPlanResults(a.partialPlan,b.partialPlan)); const kept=ranked.slice(0,max); const evicted=ranked.slice(max); const admitted=kept.some(e=>e.assignmentsFingerprint===candidate.assignmentsFingerprint); const evictedEntry=evicted.find(e=>e.assignmentsFingerprint!==candidate.assignmentsFingerprint)??null;
 const frontier=createInitialConstructionSuspendedFrontier(kept); const bestBefore=before.sort((a,b)=>compareInitialConstructionPartialPlanResults(a.partialPlan,b.partialPlan))[0]??null;
 const bestEvicted=!!(bestBefore&&evictedEntry&&bestBefore.assignmentsFingerprint===evictedEntry.assignmentsFingerprint);
 const reason=admitted?(before.length>=max?"REPLACED_WORST_RETAINED":"ADMITTED_WITH_CAPACITY"):"WORSE_THAN_RETAINED_FRONTIER";
 return deepFreeze({candidateAdmitted:admitted,candidateRejected:!admitted,replacement:admitted&&before.length>=max,evictedEntry:admitted?evictedEntry:null,frontier,reason,evidence:{capacityReached:before.length>=max,blindSuspendedFrontierRejection:false,bestRankedSuspendedAlternativeEvicted:bestEvicted,frontierFingerprint:frontierFingerprint(frontier),evictedFingerprint:evictedEntry?.assignmentsFingerprint??null,activePartialPlanId:args.activePartialPlan?.partialPlanId??null},readOnly:true}) as any;
}

export function commonDecisionPathPrefixLength(a:readonly string[]=[],b:readonly string[]=[]){let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++; return i;}
export function backtrackDistance(failed:readonly string[]=[],candidate:readonly string[]=[]){return Math.max(0,failed.length-commonDecisionPathPrefixLength(failed,candidate));}

export function selectInitialConstructionBacktrackAlternative(args:{frontier:InitialConstructionSuspendedFrontier; failedPartialPlan:any}){
 const failedPath=[...(args.failedPartialPlan?.decisionPath??[])]; const ranked=[...args.frontier.entries].sort((a,b)=>{
  const q=compareInitialConstructionPartialPlanOperationalQuality(a.partialPlan,b.partialPlan); if(q) return q;
  const pa=commonDecisionPathPrefixLength(failedPath,a.decisionPath), pb=commonDecisionPathPrefixLength(failedPath,b.decisionPath); if(pa!==pb) return pb-pa;
  const da=failedPath.length-pa, db=failedPath.length-pb; if(da!==db) return da-db;
  if(a.depth!==b.depth) return b.depth-a.depth;
  return a.assignmentsFingerprint.localeCompare(b.assignmentsFingerprint);
 });
 const selected=ranked[0]??null; const remaining=ranked.slice(1); const prefix=selected?commonDecisionPathPrefixLength(failedPath,selected.decisionPath):0; const distance=selected?failedPath.length-prefix:0;
 return deepFreeze({selectedEntry:selected,frontier:createInitialConstructionSuspendedFrontier(remaining),evidence:{selectedPartialPlanId:selected?.partialPlanId??null,backtrackDistance:distance,commonDecisionPathPrefixLength:prefix,fromDepth:failedPath.length,toDepth:selected?.depth??null,bypassedBetterAlternative:false,bypassedNearerEquivalentAlternative:false,nearestEquivalentSelected:ranked.length>1&&ranked.some(e=>compareInitialConstructionPartialPlanOperationalQuality(e.partialPlan,selected?.partialPlan)===0)},readOnly:true}) as any;
}
