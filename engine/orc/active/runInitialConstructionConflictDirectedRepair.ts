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
import { resolveInitialConstructionCanonicalContext, type InitialConstructionCanonicalContext } from "../understanding/initialConstructionCanonicalContext";

const norm=(a:any):CandidateAssignment=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
function candidate(id:string, assignments:CandidateAssignment[]):Candidate{ return {id,assignments,state:{status:"draft",evidenceIds:[],metadata:{readOnly:true}},metadata:{strategy:"SCHEDULE_PENDING_TASKS",planningInfluence:"candidate-assignments",initialConstructionStage:"conflict-directed-repair",executesTransformations:assignments.length>0,commitsPlanning:false,readOnly:true},evidenceIds:[],operationalValues:[]}; }

export interface InitialConstructionRepairBudget { maxRepairRounds?: number; maxEjectedAssignments?: number; maxRepairNeighborhoodTasks?: number; maxRepairAttemptsPerRound?: number; maxRepairBranchEvaluations?: number; maxRepairElapsedMs?: number }

export function defaultInitialConstructionRepairBudget(): Required<InitialConstructionRepairBudget> { return { maxRepairRounds:4, maxEjectedAssignments:4, maxRepairNeighborhoodTasks:12, maxRepairAttemptsPerRound:32, maxRepairBranchEvaluations:128, maxRepairElapsedMs:30000 }; }
export function resolveInitialConstructionRepairBudget(reasoningBudget?: (ReasoningBudgetProfile & Record<string, any>) | null, override?: InitialConstructionRepairBudget | null): Required<InitialConstructionRepairBudget> { const d=defaultInitialConstructionRepairBudget(); return { maxRepairRounds:Number(override?.maxRepairRounds ?? reasoningBudget?.maxRepairRounds ?? d.maxRepairRounds), maxEjectedAssignments:Number(override?.maxEjectedAssignments ?? reasoningBudget?.maxEjectedAssignments ?? d.maxEjectedAssignments), maxRepairNeighborhoodTasks:Number(override?.maxRepairNeighborhoodTasks ?? reasoningBudget?.maxRepairNeighborhoodTasks ?? d.maxRepairNeighborhoodTasks), maxRepairAttemptsPerRound:Number(override?.maxRepairAttemptsPerRound ?? reasoningBudget?.maxRepairAttemptsPerRound ?? d.maxRepairAttemptsPerRound), maxRepairBranchEvaluations:Number(override?.maxRepairBranchEvaluations ?? reasoningBudget?.maxRepairBranchEvaluations ?? d.maxRepairBranchEvaluations), maxRepairElapsedMs:Number(override?.maxRepairElapsedMs ?? reasoningBudget?.maxRepairElapsedMs ?? d.maxRepairElapsedMs) }; }

export function runInitialConstructionConflictDirectedRepair(args:{ originInput:EngineInput; originOperationalState:OperationalState; stage1:any; combinedPartialPlan:any; terminalResidual:any; terminalEvidence:any; reasoningBudget?:ReasoningBudgetProfile|null; budget?:InitialConstructionRepairBudget|null; createdAt?:string|null; canonicalContext?:InitialConstructionCanonicalContext|null; globalDeadlineRemainingMs?:number|null }) {
  const canonicalContext=resolveInitialConstructionCanonicalContext({ input: args.originInput, stage1: args.stage1, canonicalContext: args.canonicalContext });
  const budget=resolveInitialConstructionRepairBudget(args.reasoningBudget as any, args.budget);
  budget.maxRepairElapsedMs=Math.max(0, Math.min(budget.maxRepairElapsedMs, args.globalDeadlineRemainingMs ?? budget.maxRepairElapsedMs));
  const started=performance.now();
  const initial=[...(args.combinedPartialPlan?.assignments??args.combinedPartialPlan?.selectedAssignments??[])].map(norm).sort((a,b)=>a.taskId-b.taskId);
  const initialFp=initialConstructionAssignmentFingerprint(initial);
  const residualProductive=[...(args.terminalResidual?.residualProductiveTaskIds??args.terminalEvidence?.productiveTasksRemainingIds??[])].map(Number).filter(Number.isFinite);
  const blockedIds=[...(args.terminalEvidence?.blockedAnchorTaskIds??[]), ...(args.terminalEvidence?.terminalBlockedAnchorSample??[]).map((x:any)=>x.anchorTaskId), ...residualProductive].map(Number).filter(Number.isFinite);
  const attempted:any[]=[]; const accepted:any[]=[]; const anchorsEvaluatedByRound:number[][]=[]; const anchorsWithoutCausalEvidence:number[]=[]; const anchorsWithoutReversibleBlockers:number[]=[]; const candidateEjectionSetsByAnchor:Record<number,number>={}; const repairableConflictTaskIdsByAnchor:Record<number,number[]>={}; const immutableConflictTaskIdsByAnchor:Record<number,number[]>={}; const repairAttemptsByRound:number[]=[]; let current=initial; let finalResidual=args.terminalResidual; let finalValidationResult=args.terminalEvidence?.finalCombinedValidationResult??"VALID"; let repairAttemptCount=0;
  for (let round=0; round<budget.maxRepairRounds && performance.now()-started<budget.maxRepairElapsedMs; round++) {
    const residual=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:current, selectedPartialPlanId:`repair:${initialConstructionAssignmentFingerprint(current)}`}});
    finalResidual=residual;
    const residualAnchorIds=[...(residual.residualProductiveTaskIds??[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    anchorsEvaluatedByRound.push(residualAnchorIds);
    let attemptsThisRound=0;
    let best:any=null;
    for (const anchorId of residualAnchorIds) {
      if (attemptsThisRound>=budget.maxRepairAttemptsPerRound || performance.now()-started>=budget.maxRepairElapsedMs) break;
      const terminalEv = args.terminalEvidence?.byAnchor?.[anchorId] ?? args.terminalEvidence ?? {};
      if (!terminalEv || (terminalEv.causalConflictEvidenceComplete === false && !(terminalEv.causalConflictTaskIds??[]).length)) anchorsWithoutCausalEvidence.push(anchorId);
      const problem=buildInitialConstructionRepairProblem({input:args.originInput, originOperationalState:args.originOperationalState, residualFingerprint:residual.fingerprint, blockedAnchorTaskId:anchorId, blockedAnchorRank:null, blockedAnchorClosureTaskIds:terminalEv.closureTaskIds ?? [anchorId], terminalEvidence:terminalEv, provisionalAssignments:current, maxEjectedAssignments:budget.maxEjectedAssignments, maxRepairNeighborhoodTasks:budget.maxRepairNeighborhoodTasks, canonicalContext});
      candidateEjectionSetsByAnchor[anchorId]=(candidateEjectionSetsByAnchor[anchorId]??0)+problem.candidateEjectionSets.length;
      repairableConflictTaskIdsByAnchor[anchorId]=[...problem.repairableConflictTaskIds];
      immutableConflictTaskIdsByAnchor[anchorId]=[...problem.immutableConflictTaskIds];
      if (!problem.candidateEjectionSets.length) anchorsWithoutReversibleBlockers.push(anchorId);
      for (const set of problem.candidateEjectionSets) {
        if (attemptsThisRound>=budget.maxRepairAttemptsPerRound || performance.now()-started>=budget.maxRepairElapsedMs) break;
        attemptsThisRound++; repairAttemptCount++;
        const closureSet=new Set(set.repairDependencyClosureTaskIds.map(Number));
        const base=current.filter(a=>!closureSet.has(a.taskId));
        const repairMap:any=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:base,provisionallyAssignedTaskIds:base.map(a=>a.taskId)});
        const anchors:any[]=selectInitialConstructionAnchors({input:args.originInput,initialConstructionMap:repairMap,maxAnchors:Number.MAX_SAFE_INTEGER});
        const anchor=anchors.find(a=>Number(a.anchorTaskId)===anchorId)??{anchorTaskId:anchorId};
        const searchSpaces:any[]=buildInitialConstructionSearchSpaces({input:args.originInput,anchors:[anchor],initialConstructionMap:repairMap,maxSearchSpaces:1,maxWindowsPerAnchor:20});
        const closure=[...new Set([...set.repairDependencyClosureTaskIds, anchorId].map(Number))].filter(id=>!base.some(a=>a.taskId===id));
        const stage={...args.stage1,selectedAnchor:anchor,selectedAnchorTaskId:anchorId,initialConstructionMap:repairMap,searchSpaces};
        const attempt=materializeInitialConstructionAnchorAttempt({originInput:args.originInput,originOperationalState:args.originOperationalState,stage,anchor,baseProvisionalAssignments:base,provisionallySatisfiedTaskIds:base.map(a=>a.taskId),closureTaskIds:closure,maxBranches:budget.maxRepairBranchEvaluations,reasoningBudget:args.reasoningBudget,createdAt:args.createdAt??null,canonicalContext});
        let validationResult="INVALID"; let productiveDelta=0; const rejectionReasons:string[]=[];
        const beforeResidualCount=residual.residualProductiveTaskIds.length;
        for (const opt of attempt.selectable??[]) {
          const byId=new Map(base.map(a=>[a.taskId,a])); for (const a of opt.branch.assignments.map(norm)) byId.set(a.taskId,a);
          const combined=[...byId.values()].sort((a,b)=>a.taskId-b.taskId); const ids=combined.map(a=>a.taskId);
          if (new Set(ids).size!==ids.length) { rejectionReasons.push("duplicate_tasks"); continue; }
          const tr=buildCandidateStates(args.originOperationalState,[candidate(`candidate:repair:${round}:${repairAttemptCount}`,combined)],{createdAt:args.createdAt??null,maxTransformations:1});
          const sim=simulateCandidateStates(args.originOperationalState,tr.candidateStates,{createdAt:args.createdAt??null,maxSimulations:1});
          const val=validateSimulatedStates(sim.simulatedStates,{createdAt:args.createdAt??null});
          validationResult=val.validationResults[0]?.result??"INVALID";
          const afterResidual=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:combined, selectedPartialPlanId:`repair:${initialConstructionAssignmentFingerprint(combined)}`}});
          productiveDelta=beforeResidualCount-afterResidual.residualProductiveTaskIds.length;
          if (validationResult==="VALID" && productiveDelta>0) {
            const modified=current.filter(a=>{ const n=combined.find(x=>x.taskId===a.taskId); return !n || stableStringify(n)!==stableStringify(a); }).length;
            const candidateBest={combined,set,validationResult,productiveDelta,modified,attempt,blockedAnchorTaskId:anchorId,productiveResidualAfter:afterResidual.residualProductiveTaskIds.length};
            if (!best || candidateBest.productiveResidualAfter<best.productiveResidualAfter || (candidateBest.productiveResidualAfter===best.productiveResidualAfter && productiveDelta>best.productiveDelta) || (productiveDelta===best.productiveDelta && set.repairDependencyClosureTaskIds.length<best.set.repairDependencyClosureTaskIds.length) || (productiveDelta===best.productiveDelta && set.repairDependencyClosureTaskIds.length===best.set.repairDependencyClosureTaskIds.length && modified<best.modified) || (productiveDelta===best.productiveDelta && modified===best.modified && initialConstructionAssignmentFingerprint(combined).localeCompare(initialConstructionAssignmentFingerprint(best.combined))<0)) best=candidateBest;
          } else rejectionReasons.push(`combined_${validationResult}`);
        }
        attempted.push({blockedAnchorTaskId:anchorId,ejectedTaskIds:set.ejectedTaskIds,repairDependencyClosureTaskIds:set.repairDependencyClosureTaskIds,candidateCount:attempt.selectable?.length??0,validationResult,productiveDelta,rejectionReasons:rejectionReasons.slice(0,5)});
      }
    }
    repairAttemptsByRound.push(attemptsThisRound);
    if (!best) break;
    current=best.combined; accepted.push(best); finalValidationResult="VALID";
  }
  const finalFp=initialConstructionAssignmentFingerprint(current);
  const finalResidualContext=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:current, selectedPartialPlanId:`repair:${finalFp}`}});
  const evidence={version:"INITIAL-CONSTRUCTION-CONFLICT-DIRECTED-REPAIR-V1",executed:residualProductive.length>0,triggeredByStopReason:args.terminalEvidence?.stopReason??null,initialAssignmentCount:initial.length,initialAssignmentsFingerprint:initialFp,initialResidualProductiveTaskCount:residualProductive.length,repairExecuted:residualProductive.length>0,repairRoundCount:repairAttemptsByRound.length,repairAttemptCount,repairAcceptedCount:accepted.length,acceptedPartialPlanBacktrackCount:accepted.length,blockedAnchorTaskIds:[...new Set(blockedIds)].sort((a,b)=>a-b),candidateEjectionSetCount:Object.values(candidateEjectionSetsByAnchor).reduce((a:any,b:any)=>a+Number(b),0),anchorsEvaluatedByRound,anchorsWithoutCausalEvidence:[...new Set(anchorsWithoutCausalEvidence)].sort((a,b)=>a-b),anchorsWithoutReversibleBlockers:[...new Set(anchorsWithoutReversibleBlockers)].sort((a,b)=>a-b),candidateEjectionSetsByAnchor,repairableConflictTaskIdsByAnchor,immutableConflictTaskIdsByAnchor,repairDependencyClosureEvaluationCount:repairAttemptCount,repairAttemptsByRound,acceptedBlockedAnchorTaskIds:accepted.map(a=>a.blockedAnchorTaskId),attemptedEjectionSets:attempted.slice(0,10),acceptedEjectionTaskIds:accepted.flatMap(a=>a.set.ejectedTaskIds),acceptedRepairDependencyClosureTaskIds:accepted.flatMap(a=>a.set.repairDependencyClosureTaskIds),preservedAssignmentCount:initial.filter(a=>current.some(b=>stableStringify(a)===stableStringify(b))).length,modifiedAssignmentCount:initial.filter(a=>{const b=current.find(x=>x.taskId===a.taskId); return b && stableStringify(a)!==stableStringify(b)}).length,reinsertedAssignmentCount:accepted.flatMap(a=>a.set.repairDependencyClosureTaskIds).length,productiveAssignmentDelta:current.length-initial.length,finalAssignmentCount:current.length,finalResidualProductiveTaskCount:finalResidualContext.residualProductiveTaskIds.length,finalValidationResult,productiveAssignmentsBefore:initial.length,productiveAssignmentsAfter:current.length,productiveResidualBefore:residualProductive.length,productiveResidualAfter:finalResidualContext.residualProductiveTaskIds.length,protectedAssignmentsModified:false,protectedAssignmentIdsModified:[],outsideNeighborhoodAssignmentsModified:0,outsideNeighborhoodAssignmentIdsModified:[],removedAssignmentCount:initial.filter(a=>!current.some(b=>b.taskId===a.taskId)).length,repairLogicalStopReason:accepted.length?"REPAIR_ACCEPTED":"NO_CAUSAL_REPAIR_CANDIDATES",v4SeedUsed:false,commitsExecuted:0,stopReason:accepted.length?"REPAIR_ACCEPTED":"NO_VALID_REPAIR",repairFingerprint:hash({initialFp,finalFp,attempted:attempted.map(a=>({b:a.blockedAnchorTaskId,e:a.ejectedTaskIds,c:a.repairDependencyClosureTaskIds,v:a.validationResult,d:a.productiveDelta})),accepted:accepted.map(a=>({e:a.set.ejectedTaskIds,c:a.set.repairDependencyClosureTaskIds}))}),warnings:[],readOnly:true};
  return deepFreeze({version:"INITIAL-CONSTRUCTION-CONFLICT-DIRECTED-REPAIR-V1",executed:evidence.executed,accepted:evidence.repairAcceptedCount>0,combinedPartialPlan:{combinedPartialPlanId:`repair:${finalFp}`,assignments:current,combinedAssignmentsFingerprint:finalFp,readOnly:true},terminalResidual:finalResidual,finalResidual:finalResidualContext,evidence,commitsExecuted:0,readOnly:true}) as any;
}
