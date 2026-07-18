import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { OperationalState, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionMap } from "../understanding/initialConstructionMap";
import { buildInitialConstructionResidualContext } from "../understanding/initialConstructionResidualContext";
import { buildInitialConstructionSearchSpaces } from "../see/initialConstructionSearchSpace";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { materializeInitialConstructionAnchorAttempt, initialConstructionAssignmentFingerprint } from "./materializeInitialConstructionAnchorAttempt";
import { evaluateInitialConstructionPartialPlanFutureFeasibility, type InitialConstructionCriticalChainPartialPlan } from "./initialConstructionPartialPlanFutureFeasibility";
import type { InitialConstructionCanonicalContext } from "../understanding/initialConstructionCanonicalContext";
import { selectInitialConstructionAnchors } from "../see/initialConstructionAnchorSelector";

const digest=(value:any)=>createHash("sha256").update(stableStringify(value)).digest("hex");
const normalize=(a:any)=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const candidate=(id:string,assignments:any[])=>({id,assignments,state:{status:"draft",evidenceIds:[],metadata:{readOnly:true}},metadata:{strategy:"SCHEDULE_PENDING_TASKS",planningInfluence:"candidate-assignments",initialConstructionStage:"retained-frontier",executesTransformations:true,commitsPlanning:false,readOnly:true},evidenceIds:[],operationalValues:[]}) as any;

export interface ExpandInitialConstructionPartialPlanOnceBudget { maxCriticalChainsPerDecision?:number; maxExecutableFrontierTasksPerChain?:number; maxRetainedChainBranches?:number; maxBranchEvaluationsPerFrontierTask?:number; maxBranchEvaluationsPerAnchor?:number; maxRetainedValidBranchesPerFrontierTask?:number; initialCriticalChainBatchSize?:number; maxCriticalChainRanksScannedPerExpansion?:number; initialFrontierTaskBatchSize?:number; maxFrontierTasksScannedPerChain?:number; maxChildrenPerDecision:number }

/** Expands one immutable node using deterministic progressive widening across
 * chain ranks, frontier tasks, and raw branch evaluations before declaring a
 * true dead end. */
export function expandInitialConstructionPartialPlanOnce(args:{originInput:EngineInput;originOperationalState:OperationalState;stage1:any;canonicalContext:InitialConstructionCanonicalContext;parentPartialPlan:InitialConstructionCriticalChainPartialPlan;budget:ExpandInitialConstructionPartialPlanOnceBudget;caches?:{seenAssignmentsFingerprints?:Set<string>};createdOrdinal:number;reasoningBudget?:ReasoningBudgetProfile|null;createdAt?:string|null}){
 const parentAssignments=[...args.parentPartialPlan.assignments].map(normalize).sort((a,b)=>a.taskId-b.taskId);
 const pseudo={selectedAssignments:parentAssignments,selectedPartialPlanId:args.parentPartialPlan.partialPlanId,selectedValidationResult:"VALID"};
 const residualContext=buildInitialConstructionResidualContext({originInput:args.originInput,originOperationalState:args.originOperationalState,stage2:pseudo});
 const map=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:parentAssignments,provisionallyAssignedTaskIds:parentAssignments.map(a=>a.taskId)});
 const canonicalAnchors:any[]=selectInitialConstructionAnchors({input:args.originInput,initialConstructionMap:map,maxAnchors:Number.MAX_SAFE_INTEGER});
 const anchorsByTaskId=new Map(canonicalAnchors.map(anchor=>[Number(anchor.anchorTaskId),anchor]));
 const allChains=[...(map.criticalChains??[])];
 const chainBatch=Math.max(1,Number(args.budget.initialCriticalChainBatchSize??args.budget.maxCriticalChainsPerDecision??2));
 const chainLimit=Math.max(chainBatch,Number(args.budget.maxCriticalChainRanksScannedPerExpansion??args.budget.maxCriticalChainsPerDecision??allChains.length));
 const frontierBatch=Math.max(1,Number(args.budget.initialFrontierTaskBatchSize??args.budget.maxExecutableFrontierTasksPerChain??2));
 const frontierLimit=Math.max(frontierBatch,Number(args.budget.maxFrontierTasksScannedPerChain??args.budget.maxExecutableFrontierTasksPerChain??8));
 const explorationLimit=Math.max(1,Number(args.budget.maxBranchEvaluationsPerFrontierTask??args.budget.maxBranchEvaluationsPerAnchor??48));
 const retainLimit=Math.max(1,Number(args.budget.maxRetainedValidBranchesPerFrontierTask??args.budget.maxRetainedChainBranches??3));
 const children:any[]=[], hardInvalid:any[]=[], futureInfeasible:any[]=[], duplicates:any[]=[], frontierAudits:any[]=[];
 const branchEvaluationBudgetByFrontierTask:Record<string,number>={}; const frontierExhaustionReasonCounts:Record<string,number>={}; const partialPlanExhaustionReasonCounts:Record<string,number>={};
 const local=new Set<string>(); const attemptedPairs=new Set<string>(); let ordinal=args.createdOrdinal, searchSpacesBuilt=0, materializationAttempts=0, transformationsExecuted=0, simulationsExecuted=0, validationsExecuted=0;
 let criticalChainWideningRoundCount=0, frontierTaskWideningRoundCount=0, criticalChainRanksScanned=0, maxCriticalChainRankScanned=0, frontierTasksAvailable=0, frontierTasksScanned=0, maxFrontierTaskRankScanned=0, branchEvaluationCount=0, retainedValidBranchCount=0, rawInvalidBranchCount=0, rawClosureIncompleteBranchCount=0;
 const parentFp=args.parentPartialPlan.assignmentsFingerprint;
 outer: for(let chainStart=0; chainStart<Math.min(allChains.length,chainLimit); chainStart+=chainBatch){
  criticalChainWideningRoundCount++;
  const chains=allChains.slice(chainStart,Math.min(chainStart+chainBatch,chainLimit));
  for(const chain of chains){
   criticalChainRanksScanned++; maxCriticalChainRankScanned=Math.max(maxCriticalChainRankScanned,criticalChainRanksScanned);
   const frontiers=[...(chain.executableFrontierTaskIds??[])].map(Number).filter(Number.isFinite); frontierTasksAvailable+=frontiers.length;
   let chainProduced=false;
   for(let frontierStart=0; frontierStart<Math.min(frontiers.length,frontierLimit) && children.length<args.budget.maxChildrenPerDecision; frontierStart+=frontierBatch){
    frontierTaskWideningRoundCount++;
    for(const executionTaskId of frontiers.slice(frontierStart,Math.min(frontierStart+frontierBatch,frontierLimit))){
     const pairKey=`${chain.goalTaskId}:${executionTaskId}:${parentFp}`; if(attemptedPairs.has(pairKey)) continue; attemptedPairs.add(pairKey);
     frontierTasksScanned++; maxFrontierTaskRankScanned=Math.max(maxFrontierTaskRankScanned,frontierStart+1); branchEvaluationBudgetByFrontierTask[String(executionTaskId)]=explorationLimit;
     const full=[...(chain.topologicalPendingChainTaskIds??[])].map(Number); const minimal=[Number(executionTaskId)];
     const fullMaterialized=full.length===1&&full[0]===executionTaskId;
     frontierAudits.push({goalTaskId:chain.goalTaskId,executionTaskId,frontierTaskRank:frontierStart+1,fullGoalPendingClosureTaskIds:full,minimalExecutionClosureTaskIds:minimal,fullGoalClosureMaterialized:fullMaterialized,executionClosureContractValid:full.includes(executionTaskId)&&minimal.length===1,inheritedCriticalitySourceTaskIds:chain.inheritedCriticalitySourceTaskIds??[]});
     const anchor=anchorsByTaskId.get(Number(executionTaskId));
     if(!anchor||(!anchor.supportedGoalTaskIds?.includes(Number(chain.goalTaskId))&&Number(anchor.goalTaskId)!==Number(chain.goalTaskId))){frontierAudits.push({goalTaskId:chain.goalTaskId,executionTaskId,code:"FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR",fullGoalPendingClosureTaskIds:full,minimalExecutionClosureTaskIds:minimal,executionClosureContractValid:false}); frontierExhaustionReasonCounts.FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR=(frontierExhaustionReasonCounts.FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR??0)+1; continue;}
     const spaces=buildInitialConstructionSearchSpaces({input:args.originInput,anchors:[anchor] as any,initialConstructionMap:map,maxSearchSpaces:1,maxWindowsPerAnchor:20}); searchSpacesBuilt+=spaces.length;
     const stage={...args.stage1,selectedAnchor:anchor,selectedAnchorTaskId:executionTaskId,initialConstructionMap:map,searchSpaces:spaces};
     const attempt=materializeInitialConstructionAnchorAttempt({originInput:args.originInput,originOperationalState:args.originOperationalState,stage,anchor,baseProvisionalAssignments:parentAssignments,provisionallySatisfiedTaskIds:parentAssignments.map(a=>a.taskId),closureTaskIds:minimal,maxBranches:explorationLimit,reasoningBudget:args.reasoningBudget,createdAt:args.createdAt??null,canonicalContext:args.canonicalContext});
     materializationAttempts++; branchEvaluationCount+=Number(attempt.diagnostics?.branchEvaluationCount??attempt.attemptedBranchCount??0); rawInvalidBranchCount+=(attempt.attempts??[]).filter((a:any)=>a.rejectionReason==="hard-invalid"||a.validation?.result==="INVALID").length; rawClosureIncompleteBranchCount+=(attempt.branches??[]).filter((b:any)=>b.status==="closure-incomplete").length;
     const selectable=[...(attempt.selectable??[])].sort((a:any,b:any)=>String(a.branch.branchId).localeCompare(String(b.branch.branchId))); const seenOption=new Set<string>(); let retainedForFrontier=0;
     for(const option of selectable){
      const byId=new Map(parentAssignments.map(a=>[a.taskId,a])); for(const a of option.branch.assignments.map(normalize)) if(!byId.has(a.taskId)) byId.set(a.taskId,a);
      const combined=[...byId.values()].sort((a,b)=>a.taskId-b.taskId); const fp=initialConstructionAssignmentFingerprint(combined);
      if(seenOption.has(fp)||combined.length===parentAssignments.length||local.has(fp)||args.caches?.seenAssignmentsFingerprints?.has(fp)){duplicates.push(fp);continue;} seenOption.add(fp); local.add(fp);
      const tr=buildCandidateStates(args.originOperationalState,[candidate(`retained:${ordinal}`,combined)],{createdAt:args.createdAt??null,maxTransformations:1}); transformationsExecuted+=tr.candidateStates.length; const sim=simulateCandidateStates(args.originOperationalState,tr.candidateStates,{createdAt:args.createdAt??null,maxSimulations:1}); simulationsExecuted+=sim.simulatedStates.length; const validationResult=validateSimulatedStates(sim.simulatedStates,{createdAt:args.createdAt??null}); validationsExecuted+=validationResult.validationResults.length; const validation=validationResult.validationResults[0];
      if(validation?.result!=="VALID"){hardInvalid.push({assignmentsFingerprint:fp,validationResult:validation?.result??null});continue;}
      const childMap=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:combined,provisionallyAssignedTaskIds:combined.map(a=>a.taskId)});
      const childResidual=buildInitialConstructionResidualContext({originInput:args.originInput,originOperationalState:args.originOperationalState,stage2:{...pseudo,selectedAssignments:combined}});
      const future=evaluateInitialConstructionPartialPlanFutureFeasibility({criticalChains:childMap.criticalChains??[],residualProductiveTaskCount:childResidual.residualProductiveTaskIds.length});
      const branchFp=option.branch.branchFingerprint??option.branch.branchId??digest(option.branch.assignments); const decision=`${chain.goalTaskId}:${executionTaskId}:${branchFp}`;
      const child={partialPlanId:`critical-chain:${ordinal}:${fp.slice(0,12)}`,parentPartialPlanId:args.parentPartialPlan.partialPlanId,depth:args.parentPartialPlan.depth+1,assignments:combined,assignmentsFingerprint:fp,goalTaskId:Number(chain.goalTaskId),executionTaskId:Number(executionTaskId),executedFrontierTaskIds:[Number(executionTaskId)],minimalExecutionClosureTaskIds:minimal,decisionBranchFingerprint:String(branchFp),decisionPath:[...args.parentPartialPlan.decisionPath,decision],criticalChainMapFingerprint:childMap.criticalChainMapFingerprint,anchorRankingFingerprint:digest((childMap.criticalChains??[]).map((c:any)=>c.goalTaskId)),futureFeasibility:future,status:future.status==="INFEASIBLE"?"PRUNED":"SUSPENDED",createdOrdinal:ordinal++,readOnly:true};
      retainedForFrontier++; retainedValidBranchCount++; if(future.status==="INFEASIBLE") futureInfeasible.push(child); else {children.push(child); chainProduced=true;}
      if(retainedForFrontier>=retainLimit||children.length>=args.budget.maxChildrenPerDecision) break;
     }
     if(retainedForFrontier===0) frontierExhaustionReasonCounts.NO_RETAINED_VALID_BRANCH=(frontierExhaustionReasonCounts.NO_RETAINED_VALID_BRANCH??0)+1;
     if(children.length>=args.budget.maxChildrenPerDecision) break outer;
    }
   }
   if(!chainProduced) partialPlanExhaustionReasonCounts.CHAIN_PRODUCED_NO_CHILDREN=(partialPlanExhaustionReasonCounts.CHAIN_PRODUCED_NO_CHILDREN??0)+1;
  }
 }
 const allEligibleCriticalChainsExhausted=criticalChainRanksScanned>=allChains.length||criticalChainRanksScanned>=chainLimit;
 const allEligibleFrontierTasksExhausted=frontierTasksScanned>=Math.min(frontierTasksAvailable,criticalChainRanksScanned*frontierLimit);
 const allConfiguredBranchEvaluationsExhausted=branchEvaluationCount>=Object.keys(branchEvaluationBudgetByFrontierTask).length*explorationLimit;
 const falseDeadEndCount=0;
 const raw={parentPartialPlanId:args.parentPartialPlan.partialPlanId,parentAssignmentsFingerprint:args.parentPartialPlan.assignmentsFingerprint,residualContext,initialConstructionMap:map,canonicalAnchors,anchorRanking:canonicalAnchors.map((a:any)=>a.anchorTaskId),chainsConsidered:allChains.slice(0,criticalChainRanksScanned),frontierTasksConsidered:frontierAudits,hardValidChildren:children,hardInvalidChildren:hardInvalid,futureInfeasibleChildren:futureInfeasible,duplicateAssignmentsFingerprints:duplicates,transformationsExecuted,simulationsExecuted,validationsExecuted,searchSpacesBuilt,materializationAttempts,hardValidChildCount:children.length,hardInvalidChildCount:hardInvalid.length,futureInfeasibleChildCount:futureInfeasible.length,duplicateChildCount:duplicates.length,criticalChainWideningRoundCount,criticalChainRanksAvailable:allChains.length,criticalChainRanksScanned,maxCriticalChainRankScanned,frontierTaskWideningRoundCount,frontierTasksAvailable,frontierTasksScanned,maxFrontierTaskRankScanned,branchEvaluationCount,branchEvaluationBudgetByFrontierTask,retainedValidBranchCount,rawInvalidBranchCount,rawClosureIncompleteBranchCount,frontierExhaustionReasonCounts,partialPlanExhaustionReasonCounts,falseDeadEndCount,allEligibleCriticalChainsExhausted,allEligibleFrontierTasksExhausted,allConfiguredBranchEvaluationsExhausted,diagnostics:{canonicalExecutionAnchorCount:canonicalAnchors.length,canonicalTargetAnchorCount:canonicalAnchors.filter((a:any)=>a.countsAsConstructiveTarget).length,canonicalSupportAnchorCount:canonicalAnchors.filter((a:any)=>a.constructiveSupport).length,frontierTaskWithoutCanonicalAnchorCount:frontierAudits.filter((a:any)=>a.code==="FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR").length,frontierTaskWithoutCanonicalAnchorIds:[...new Set(frontierAudits.filter((a:any)=>a.code==="FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR").map((a:any)=>a.executionTaskId))],frontierTaskWithoutCanonicalAnchorReasonCounts:{FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR:frontierAudits.filter((a:any)=>a.code==="FRONTIER_TASK_WITHOUT_CANONICAL_ANCHOR").length},arrivalFrontierSelectionCount:frontierAudits.filter((a:any)=>map.classification.transportArrivalTasks?.some((t:any)=>t.id===a.executionTaskId)).length,arrivalFrontierMaterializationCount:frontierAudits.filter((a:any)=>map.classification.transportArrivalTasks?.some((t:any)=>t.id===a.executionTaskId)&&!a.code).length,supportFrontierSelectionCount:frontierAudits.filter((a:any)=>map.classification.constructiveSupportTasks?.some((t:any)=>t.id===a.executionTaskId)).length,supportFrontierMaterializationCount:frontierAudits.filter((a:any)=>map.classification.constructiveSupportTasks?.some((t:any)=>t.id===a.executionTaskId)&&!a.code).length,mapBuildCount:1+children.length+futureInfeasible.length,futureFeasibilityEvaluationCount:children.length+futureInfeasible.length},stopReason:children.length?"CHILDREN_GENERATED":"ALL_ELIGIBLE_FRONTIER_CANDIDATES_EXHAUSTED"};
 return deepFreeze({...raw,fingerprint:digest({parent:raw.parentAssignmentsFingerprint,children:children.map(c=>c.assignmentsFingerprint),invalid:hardInvalid,duplicates}),readOnly:true}) as any;
}
