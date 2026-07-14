import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { Candidate, CandidateAssignment, OperationalState, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionMap } from "../understanding/initialConstructionMap";
import { buildInitialConstructionResidualContext } from "../understanding/initialConstructionResidualContext";
import { selectInitialConstructionAnchors } from "../see/initialConstructionAnchorSelector";
import { buildInitialConstructionSearchSpaces } from "../see/initialConstructionSearchSpace";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { initialConstructionAssignmentFingerprint, materializeInitialConstructionAnchorAttempt } from "./materializeInitialConstructionAnchorAttempt";
import { buildInitialConstructionRepairProblem } from "./initialConstructionRepairProblem";

const norm=(a:any):CandidateAssignment=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
function candidate(id:string, assignments:CandidateAssignment[]):Candidate{ return {id,assignments,state:{status:"draft",evidenceIds:[],metadata:{readOnly:true}},metadata:{strategy:"SCHEDULE_PENDING_TASKS",planningInfluence:"candidate-assignments",initialConstructionStage:"conflict-directed-repair",executesTransformations:assignments.length>0,commitsPlanning:false,readOnly:true},evidenceIds:[],operationalValues:[]}; }

export interface InitialConstructionRepairBudget { maxRepairRounds?: number; maxEjectedAssignments?: number; maxRepairNeighborhoodTasks?: number; maxRepairAttemptsPerRound?: number; maxRepairBranchEvaluations?: number; maxRepairElapsedMs?: number }

export function defaultInitialConstructionRepairBudget(): Required<InitialConstructionRepairBudget> { return { maxRepairRounds:4, maxEjectedAssignments:4, maxRepairNeighborhoodTasks:12, maxRepairAttemptsPerRound:32, maxRepairBranchEvaluations:128, maxRepairElapsedMs:30000 }; }

export function runInitialConstructionConflictDirectedRepair(args:{ originInput:EngineInput; originOperationalState:OperationalState; stage1:any; combinedPartialPlan:any; terminalResidual:any; terminalEvidence:any; reasoningBudget?:ReasoningBudgetProfile|null; budget?:InitialConstructionRepairBudget|null; createdAt?:string|null }) {
  const budget={...defaultInitialConstructionRepairBudget(), ...(args.budget??{})};
  const started=performance.now();
  const initial=[...(args.combinedPartialPlan?.assignments??args.combinedPartialPlan?.selectedAssignments??[])].map(norm).sort((a,b)=>a.taskId-b.taskId);
  const initialFp=initialConstructionAssignmentFingerprint(initial);
  const residualProductive=[...(args.terminalResidual?.residualProductiveTaskIds??args.terminalEvidence?.productiveTasksRemainingIds??[])].map(Number).filter(Number.isFinite);
  const blockedIds=[...(args.terminalEvidence?.blockedAnchorTaskIds??[]), ...(args.terminalEvidence?.terminalBlockedAnchorSample??[]).map((x:any)=>x.anchorTaskId), ...residualProductive].map(Number).filter(Number.isFinite);
  const attempted:any[]=[]; const accepted:any[]=[]; let current=initial; let finalResidual=args.terminalResidual; let finalValidationResult=args.terminalEvidence?.finalCombinedValidationResult??"VALID"; let repairAttemptCount=0;
  for (let round=0; round<budget.maxRepairRounds && performance.now()-started<budget.maxRepairElapsedMs; round++) {
    const residual=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:current, selectedPartialPlanId:`repair:${initialConstructionAssignmentFingerprint(current)}`}});
    finalResidual=residual;
    const anchorId=Number((residual.residualProductiveTaskIds??[]).find((id:number)=>blockedIds.includes(id)) ?? (residual.residualProductiveTaskIds??[])[0] ?? blockedIds[0]);
    if (!Number.isFinite(anchorId)) break;
    const terminalEv = args.terminalEvidence?.byAnchor?.[anchorId] ?? args.terminalEvidence ?? {};
    const problem=buildInitialConstructionRepairProblem({input:args.originInput, originOperationalState:args.originOperationalState, residualFingerprint:residual.fingerprint, blockedAnchorTaskId:anchorId, blockedAnchorRank:null, blockedAnchorClosureTaskIds:[anchorId], terminalEvidence:terminalEv, provisionalAssignments:current, maxEjectedAssignments:budget.maxEjectedAssignments, maxRepairNeighborhoodTasks:budget.maxRepairNeighborhoodTasks});
    let best:any=null;
    for (const set of problem.candidateEjectionSets.slice(0,budget.maxRepairAttemptsPerRound)) {
      if (repairAttemptCount>=budget.maxRepairAttemptsPerRound || performance.now()-started>=budget.maxRepairElapsedMs) break;
      repairAttemptCount++;
      const closureSet=new Set(set.repairDependencyClosureTaskIds.map(Number));
      const base=current.filter(a=>!closureSet.has(a.taskId));
      const repairMap:any=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:base,provisionallyAssignedTaskIds:base.map(a=>a.taskId)});
      const anchors:any[]=selectInitialConstructionAnchors({input:args.originInput,initialConstructionMap:repairMap,maxAnchors:Number.MAX_SAFE_INTEGER});
      const anchor=anchors.find(a=>Number(a.anchorTaskId)===anchorId)??{anchorTaskId:anchorId};
      const searchSpaces:any[]=buildInitialConstructionSearchSpaces({input:args.originInput,anchors:[anchor],initialConstructionMap:repairMap,maxSearchSpaces:1,maxWindowsPerAnchor:20});
      const closure=[...new Set([...set.repairDependencyClosureTaskIds, anchorId].map(Number))].filter(id=>!base.some(a=>a.taskId===id));
      const stage={...args.stage1,selectedAnchor:anchor,selectedAnchorTaskId:anchorId,initialConstructionMap:repairMap,searchSpaces};
      const attempt=materializeInitialConstructionAnchorAttempt({originInput:args.originInput,originOperationalState:args.originOperationalState,stage,anchor,baseProvisionalAssignments:base,provisionallySatisfiedTaskIds:base.map(a=>a.taskId),closureTaskIds:closure,maxBranches:budget.maxRepairBranchEvaluations,reasoningBudget:args.reasoningBudget,createdAt:args.createdAt??null});
      let validationResult="INVALID"; let productiveDelta=0; const rejectionReasons:string[]=[];
      for (const opt of attempt.selectable??[]) {
        const byId=new Map(base.map(a=>[a.taskId,a])); for (const a of opt.branch.assignments.map(norm)) byId.set(a.taskId,a);
        const combined=[...byId.values()].sort((a,b)=>a.taskId-b.taskId); const ids=combined.map(a=>a.taskId);
        if (new Set(ids).size!==ids.length) { rejectionReasons.push("duplicate_tasks"); continue; }
        const tr=buildCandidateStates(args.originOperationalState,[candidate(`candidate:repair:${round}:${repairAttemptCount}`,combined)],{createdAt:args.createdAt??null,maxTransformations:1});
        const sim=simulateCandidateStates(args.originOperationalState,tr.candidateStates,{createdAt:args.createdAt??null,maxSimulations:1});
        const val=validateSimulatedStates(sim.simulatedStates,{createdAt:args.createdAt??null});
        validationResult=val.validationResults[0]?.result??"INVALID";
        productiveDelta=combined.length-current.length;
        if (validationResult==="VALID" && productiveDelta>0) {
          const modified=current.filter(a=>{ const n=combined.find(x=>x.taskId===a.taskId); return !n || stableStringify(n)!==stableStringify(a); }).length;
          const candidateBest={combined,set,validationResult,productiveDelta,modified,attempt};
          if (!best || productiveDelta>best.productiveDelta || (productiveDelta===best.productiveDelta && set.repairDependencyClosureTaskIds.length<best.set.repairDependencyClosureTaskIds.length) || (productiveDelta===best.productiveDelta && set.repairDependencyClosureTaskIds.length===best.set.repairDependencyClosureTaskIds.length && modified<best.modified) || (productiveDelta===best.productiveDelta && modified===best.modified && initialConstructionAssignmentFingerprint(combined).localeCompare(initialConstructionAssignmentFingerprint(best.combined))<0)) best=candidateBest;
        } else rejectionReasons.push(`combined_${validationResult}`);
      }
      attempted.push({blockedAnchorTaskId:anchorId,ejectedTaskIds:set.ejectedTaskIds,repairDependencyClosureTaskIds:set.repairDependencyClosureTaskIds,candidateCount:attempt.selectable?.length??0,validationResult,productiveDelta,rejectionReasons:rejectionReasons.slice(0,5)});
    }
    if (!best) break;
    current=best.combined; accepted.push(best); finalValidationResult="VALID";
  }
  const finalFp=initialConstructionAssignmentFingerprint(current);
  const finalResidualContext=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:current, selectedPartialPlanId:`repair:${finalFp}`}});
  const evidence={version:"INITIAL-CONSTRUCTION-CONFLICT-DIRECTED-REPAIR-V1",executed:residualProductive.length>0,triggeredByStopReason:args.terminalEvidence?.stopReason??null,initialAssignmentCount:initial.length,initialResidualProductiveTaskCount:residualProductive.length,repairRoundCount:accepted.length,repairAttemptCount,repairAcceptedCount:accepted.length,acceptedPartialPlanBacktrackCount:accepted.length,blockedAnchorTaskIds:[...new Set(blockedIds)].sort((a,b)=>a-b),candidateEjectionSetCount:attempted.length,attemptedEjectionSets:attempted.slice(0,10),acceptedEjectionTaskIds:accepted.flatMap(a=>a.set.ejectedTaskIds),acceptedRepairDependencyClosureTaskIds:accepted.flatMap(a=>a.set.repairDependencyClosureTaskIds),preservedAssignmentCount:initial.filter(a=>current.some(b=>stableStringify(a)===stableStringify(b))).length,modifiedAssignmentCount:initial.filter(a=>{const b=current.find(x=>x.taskId===a.taskId); return b && stableStringify(a)!==stableStringify(b)}).length,reinsertedAssignmentCount:accepted.flatMap(a=>a.set.repairDependencyClosureTaskIds).length,productiveAssignmentDelta:current.length-initial.length,finalAssignmentCount:current.length,finalResidualProductiveTaskCount:finalResidualContext.residualProductiveTaskIds.length,finalValidationResult,protectedAssignmentsModified:false,v4SeedUsed:false,commitsExecuted:0,stopReason:accepted.length?"REPAIR_ACCEPTED":"NO_VALID_REPAIR",repairFingerprint:hash({initialFp,finalFp,attempted:attempted.map(a=>({b:a.blockedAnchorTaskId,e:a.ejectedTaskIds,c:a.repairDependencyClosureTaskIds,v:a.validationResult,d:a.productiveDelta})),accepted:accepted.map(a=>({e:a.set.ejectedTaskIds,c:a.set.repairDependencyClosureTaskIds}))}),warnings:[],readOnly:true};
  return deepFreeze({version:"INITIAL-CONSTRUCTION-CONFLICT-DIRECTED-REPAIR-V1",executed:evidence.executed,accepted:evidence.repairAcceptedCount>0,combinedPartialPlan:{combinedPartialPlanId:`repair:${finalFp}`,assignments:current,combinedAssignmentsFingerprint:finalFp,readOnly:true},terminalResidual:finalResidual,finalResidual:finalResidualContext,evidence,commitsExecuted:0,readOnly:true}) as any;
}
