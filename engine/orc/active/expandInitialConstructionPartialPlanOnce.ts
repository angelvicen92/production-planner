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

const digest=(value:any)=>createHash("sha256").update(stableStringify(value)).digest("hex");
const normalize=(a:any)=>({taskId:Number(a.taskId),startPlanned:a.startPlanned??null,endPlanned:a.endPlanned??null,spaceId:a.spaceId??null,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].map(Number).sort((x,y)=>x-y)});
const candidate=(id:string,assignments:any[])=>({id,assignments,state:{status:"draft",evidenceIds:[],metadata:{readOnly:true}},metadata:{strategy:"SCHEDULE_PENDING_TASKS",planningInfluence:"candidate-assignments",initialConstructionStage:"retained-frontier",executesTransformations:true,commitsPlanning:false,readOnly:true},evidenceIds:[],operationalValues:[]}) as any;

export interface ExpandInitialConstructionPartialPlanOnceBudget { maxCriticalChainsPerDecision:number; maxExecutableFrontierTasksPerChain:number; maxRetainedChainBranches:number; maxChildrenPerDecision:number }

/** Expands exactly one immutable node.  A critical goal remains the intent,
 * while only an executable frontier task is passed to the real ORC pipeline. */
export function expandInitialConstructionPartialPlanOnce(args:{originInput:EngineInput;originOperationalState:OperationalState;stage1:any;canonicalContext:InitialConstructionCanonicalContext;parentPartialPlan:InitialConstructionCriticalChainPartialPlan;budget:ExpandInitialConstructionPartialPlanOnceBudget;caches?:{seenAssignmentsFingerprints?:Set<string>};createdOrdinal:number;reasoningBudget?:ReasoningBudgetProfile|null;createdAt?:string|null}){
 const parentAssignments=[...args.parentPartialPlan.assignments].map(normalize).sort((a,b)=>a.taskId-b.taskId);
 const pseudo={selectedAssignments:parentAssignments,selectedPartialPlanId:args.parentPartialPlan.partialPlanId,selectedValidationResult:"VALID"};
 const residualContext=buildInitialConstructionResidualContext({originInput:args.originInput,originOperationalState:args.originOperationalState,stage2:pseudo});
 const map=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:parentAssignments,provisionallyAssignedTaskIds:parentAssignments.map(a=>a.taskId)});
 const chains=[...(map.criticalChains??[])].slice(0,args.budget.maxCriticalChainsPerDecision);
 const children:any[]=[], hardInvalid:any[]=[], futureInfeasible:any[]=[], duplicates:any[]=[], frontierAudits:any[]=[];
 const local=new Set<string>(); let ordinal=args.createdOrdinal;
 outer: for(const chain of chains){
  for(const executionTaskId of [...(chain.executableFrontierTaskIds??[])].slice(0,args.budget.maxExecutableFrontierTasksPerChain)){
   const full=[...(chain.topologicalPendingChainTaskIds??[])].map(Number); const minimal=[Number(executionTaskId)];
   const fullMaterialized=full.length===1&&full[0]===executionTaskId;
   frontierAudits.push({goalTaskId:chain.goalTaskId,executionTaskId,fullGoalPendingClosureTaskIds:full,minimalExecutionClosureTaskIds:minimal,fullGoalClosureMaterialized:fullMaterialized,executionClosureContractValid:full.includes(executionTaskId)&&minimal.length===1,inheritedCriticalitySourceTaskIds:chain.inheritedCriticalitySourceTaskIds??[]});
   const anchor={anchorTaskId:executionTaskId,taskId:executionTaskId,allPrerequisiteTaskIds:[]};
   const spaces=buildInitialConstructionSearchSpaces({input:args.originInput,anchors:[anchor] as any,initialConstructionMap:map,maxSearchSpaces:1,maxWindowsPerAnchor:20});
   const stage={...args.stage1,selectedAnchor:anchor,selectedAnchorTaskId:executionTaskId,initialConstructionMap:map,searchSpaces:spaces};
   const attempt=materializeInitialConstructionAnchorAttempt({originInput:args.originInput,originOperationalState:args.originOperationalState,stage,anchor,baseProvisionalAssignments:parentAssignments,provisionallySatisfiedTaskIds:parentAssignments.map(a=>a.taskId),closureTaskIds:minimal,maxBranches:args.budget.maxRetainedChainBranches,reasoningBudget:args.reasoningBudget,createdAt:args.createdAt??null,canonicalContext:args.canonicalContext});
   for(const option of attempt.selectable??[]){
    const byId=new Map(parentAssignments.map(a=>[a.taskId,a])); for(const a of option.branch.assignments.map(normalize)) if(!byId.has(a.taskId)) byId.set(a.taskId,a);
    const combined=[...byId.values()].sort((a,b)=>a.taskId-b.taskId); const fp=initialConstructionAssignmentFingerprint(combined);
    if(combined.length===parentAssignments.length||local.has(fp)||args.caches?.seenAssignmentsFingerprints?.has(fp)){duplicates.push(fp);continue;} local.add(fp);
    const tr=buildCandidateStates(args.originOperationalState,[candidate(`retained:${ordinal}`,combined)],{createdAt:args.createdAt??null,maxTransformations:1});
    const sim=simulateCandidateStates(args.originOperationalState,tr.candidateStates,{createdAt:args.createdAt??null,maxSimulations:1}); const validation=validateSimulatedStates(sim.simulatedStates,{createdAt:args.createdAt??null}).validationResults[0];
    if(validation?.result!=="VALID"){hardInvalid.push({assignmentsFingerprint:fp,validationResult:validation?.result??null});continue;}
    const childMap=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:combined,provisionallyAssignedTaskIds:combined.map(a=>a.taskId)});
    const childResidual=buildInitialConstructionResidualContext({originInput:args.originInput,originOperationalState:args.originOperationalState,stage2:{...pseudo,selectedAssignments:combined}});
    const future=evaluateInitialConstructionPartialPlanFutureFeasibility({criticalChains:childMap.criticalChains??[],residualProductiveTaskCount:childResidual.residualProductiveTaskIds.length});
    const branchFp=option.branch.branchFingerprint??option.branch.branchId??digest(option.branch.assignments); const decision=`${chain.goalTaskId}:${executionTaskId}:${branchFp}`;
    const child={partialPlanId:`critical-chain:${ordinal}:${fp.slice(0,12)}`,parentPartialPlanId:args.parentPartialPlan.partialPlanId,depth:args.parentPartialPlan.depth+1,assignments:combined,assignmentsFingerprint:fp,goalTaskId:Number(chain.goalTaskId),executionTaskId:Number(executionTaskId),executedFrontierTaskIds:[Number(executionTaskId)],minimalExecutionClosureTaskIds:minimal,decisionBranchFingerprint:String(branchFp),decisionPath:[...args.parentPartialPlan.decisionPath,decision],criticalChainMapFingerprint:childMap.criticalChainMapFingerprint,anchorRankingFingerprint:digest((childMap.criticalChains??[]).map((c:any)=>c.goalTaskId)),futureFeasibility:future,status:future.status==="INFEASIBLE"?"PRUNED":"SUSPENDED",createdOrdinal:ordinal++,readOnly:true};
    if(future.status==="INFEASIBLE") futureInfeasible.push(child); else children.push(child);
    if(children.length>=args.budget.maxChildrenPerDecision) break outer;
   }
  }
 }
 const raw={parentPartialPlanId:args.parentPartialPlan.partialPlanId,parentAssignmentsFingerprint:args.parentPartialPlan.assignmentsFingerprint,residualContext,initialConstructionMap:map,anchorRanking:chains.map((c:any)=>c.goalTaskId),chainsConsidered:chains,frontierTasksConsidered:frontierAudits,hardValidChildren:children,hardInvalidChildren:hardInvalid,futureInfeasibleChildren:futureInfeasible,duplicateAssignmentsFingerprints:duplicates,diagnostics:{mapBuildCount:1+children.length+futureInfeasible.length,futureFeasibilityEvaluationCount:children.length+futureInfeasible.length},stopReason:children.length?"CHILDREN_GENERATED":"NO_VALID_CHILDREN"};
 return deepFreeze({...raw,fingerprint:digest({parent:raw.parentAssignmentsFingerprint,children:children.map(c=>c.assignmentsFingerprint),invalid:hardInvalid,duplicates}),readOnly:true}) as any;
}
