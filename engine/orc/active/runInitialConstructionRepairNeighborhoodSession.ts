import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { initialConstructionAssignmentFingerprint, materializeInitialConstructionAnchorAttempt } from "./materializeInitialConstructionAnchorAttempt";
import { buildInitialConstructionMap } from "../understanding/initialConstructionMap";
import { buildInitialConstructionResidualContext } from "../understanding/initialConstructionResidualContext";
import { selectInitialConstructionAnchors } from "../see/initialConstructionAnchorSelector";
import { buildInitialConstructionSearchSpaces } from "../see/initialConstructionSearchSpace";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";

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

function candidate(id:string, assignments:CandidateAssignment[]):any{ return {id,assignments,state:{status:"draft",evidenceIds:[],metadata:{readOnly:true}},metadata:{strategy:"SCHEDULE_PENDING_TASKS",planningInfluence:"candidate-assignments",initialConstructionStage:"repair-neighborhood",executesTransformations:assignments.length>0,commitsPlanning:false,readOnly:true},evidenceIds:[],operationalValues:[]}; }
function prereqClosure(anchorId:number, base:CandidateAssignment[], context:any): number[] { const assigned=new Set(base.map(a=>a.taskId)); const out=new Set<number>([anchorId]); const visit=(id:number)=>{ for(const p of context.prerequisitesByTaskId?.get(id)??[]) if(!assigned.has(p)&&!out.has(p)){ out.add(p); visit(p); } }; visit(anchorId); return (context.topologicalTaskIds??[...out]).filter((id:number)=>out.has(id)); }
function validateCombined(args:any, assignments:CandidateAssignment[], id:string){ const tr=buildCandidateStates(args.originOperationalState,[candidate(id,assignments)],{createdAt:null,maxTransformations:1}); const sim=simulateCandidateStates(args.originOperationalState,tr.candidateStates,{createdAt:null,maxSimulations:1}); const val=validateSimulatedStates(sim.simulatedStates,{createdAt:null}); return val.validationResults[0]?.result??"INVALID"; }
function placeOne(args:any, current:CandidateAssignment[], taskId:number, maxBranches:number){
  const map:any=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:current,provisionallyAssignedTaskIds:current.map(a=>a.taskId)});
  const anchors:any[]=selectInitialConstructionAnchors({input:args.originInput,initialConstructionMap:map,maxAnchors:Number.MAX_SAFE_INTEGER});
  const anchor=anchors.find(a=>Number(a.anchorTaskId)===Number(taskId))??{anchorTaskId:taskId};
  const searchSpaces:any[]=buildInitialConstructionSearchSpaces({input:args.originInput,anchors:[anchor],initialConstructionMap:map,maxSearchSpaces:1,maxWindowsPerAnchor:20});
  const closure=prereqClosure(taskId,current,args.canonicalContext);
  const stage={...(args.stage1??{}),selectedAnchor:anchor,selectedAnchorTaskId:taskId,initialConstructionMap:map,searchSpaces};
  const attempt=materializeInitialConstructionAnchorAttempt({originInput:args.originInput,originOperationalState:args.originOperationalState,stage,anchor,baseProvisionalAssignments:current,provisionallySatisfiedTaskIds:current.map((a:any)=>a.taskId),closureTaskIds:closure,maxBranches,reasoningBudget:args.localBudget,createdAt:null,canonicalContext:args.canonicalContext});
  for(const opt of attempt.selectable??[]){ const byId=new Map(current.map(a=>[a.taskId,a])); for(const a of opt.branch.assignments.map(norm)) byId.set(a.taskId,a); const combined=[...byId.values()].sort((a,b)=>a.taskId-b.taskId); if(new Set(combined.map(a=>a.taskId)).size!==combined.length) continue; if(validateCombined(args,combined,`repair-neighborhood:${taskId}`)==="VALID") return {ok:true,combined,attempt,closure}; }
  return {ok:false,combined:current,attempt,closure};
}
export function runInitialConstructionRepairNeighborhoodSession(args:{ originInput:EngineInput; originOperationalState:OperationalState; canonicalContext:any; combinedPartialPlan:any; repairProblem:any; ejectionSet:any; blockedAnchorTaskId:number; localBudget?:any; stage1?:any }){
  const before=[...(args.combinedPartialPlan?.assignments??[])].map(norm).sort((a,b)=>a.taskId-b.taskId);
  const removed=new Set((args.ejectionSet?.repairDependencyClosureTaskIds??[]).map(Number));
  const neighborhood=(args.ejectionSet?.repairNeighborhoodTaskIds??[...removed,Number(args.blockedAnchorTaskId)]).map(Number);
  if ([...removed].some(id=>(args.repairProblem?.immutableTaskIds??[]).map(Number).includes(id))) {
    const audit=auditInitialConstructionRepairNeighborhoodPreservation({before,after:before,repairNeighborhoodTaskIds:neighborhood,protectedTaskIds:args.repairProblem?.protectedTaskIds??[],productiveTaskIds:(args.originInput.tasks??[]).map((t:any)=>Number(t.id))});
    return deepFreeze({version:"INITIAL-CONSTRUCTION-REPAIR-NEIGHBORHOOD-SESSION-V1",executed:true,accepted:false,combinedPartialPlan:args.combinedPartialPlan,anchorAssigned:before.some(a=>a.taskId===Number(args.blockedAnchorTaskId)),allNeighborhoodReinserted:false,acceptedCycleCount:0,anchorAttemptCount:0,validationCount:0,audit,stopReason:"IMMUTABLE_EJECTION_REJECTED",sessionFingerprint:hash({audit:audit.fingerprint}),readOnly:true}) as any;
  }
  let current=before.filter(a=>!removed.has(a.taskId)); let attempts=0, validations=0, cycles=0;
  const maxBranches=Number(args.localBudget?.maxNeighborhoodBranchEvaluations??args.localBudget?.maxRepairBranchEvaluations??128);
  const first=placeOne(args,current,Number(args.blockedAnchorTaskId),maxBranches); attempts++; validations++;
  if(!first.ok){ const audit=auditInitialConstructionRepairNeighborhoodPreservation({before,after:before,repairNeighborhoodTaskIds:neighborhood,protectedTaskIds:args.repairProblem?.protectedTaskIds??[],productiveTaskIds:(args.originInput.tasks??[]).map((t:any)=>Number(t.id))}); return deepFreeze({version:"INITIAL-CONSTRUCTION-REPAIR-NEIGHBORHOOD-SESSION-V1",executed:true,accepted:false,combinedPartialPlan:args.combinedPartialPlan,anchorAssigned:false,allNeighborhoodReinserted:false,acceptedCycleCount:0,anchorAttemptCount:attempts,validationCount:validations,audit,stopReason:"ANCHOR_RECONSTRUCTION_FAILED",sessionFingerprint:hash({audit:audit.fingerprint,set:args.ejectionSet?.fingerprint}),readOnly:true}) as any; }
  current=first.combined; cycles++;
  for(const id of (args.canonicalContext?.topologicalTaskIds??neighborhood).filter((id:number)=>neighborhood.includes(id)&&!current.some(a=>a.taskId===id))){ const r=placeOne(args,current,Number(id),maxBranches); attempts++; validations++; if(!r.ok){ const audit=auditInitialConstructionRepairNeighborhoodPreservation({before,after:before,repairNeighborhoodTaskIds:neighborhood,protectedTaskIds:args.repairProblem?.protectedTaskIds??[],productiveTaskIds:(args.originInput.tasks??[]).map((t:any)=>Number(t.id))}); return deepFreeze({version:"INITIAL-CONSTRUCTION-REPAIR-NEIGHBORHOOD-SESSION-V1",executed:true,accepted:false,combinedPartialPlan:args.combinedPartialPlan,anchorAssigned:true,allNeighborhoodReinserted:false,acceptedCycleCount:cycles,anchorAttemptCount:attempts,validationCount:validations,audit,stopReason:"NEIGHBORHOOD_REINSERTION_FAILED",sessionFingerprint:hash({audit:audit.fingerprint,set:args.ejectionSet?.fingerprint}),readOnly:true}) as any; } current=r.combined; cycles++; }
  const audit=auditInitialConstructionRepairNeighborhoodPreservation({before,after:current,repairNeighborhoodTaskIds:neighborhood,protectedTaskIds:args.repairProblem?.protectedTaskIds??[],productiveTaskIds:(args.originInput.tasks??[]).map((t:any)=>Number(t.id))});
  const beforeResidual=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:before, selectedPartialPlanId:`before:${initialConstructionAssignmentFingerprint(before)}`}});
  const afterResidual=buildInitialConstructionResidualContext({originInput:args.originInput, originOperationalState:args.originOperationalState, stage2:{selectedAssignments:current, selectedPartialPlanId:`after:${initialConstructionAssignmentFingerprint(current)}`}});
  const accepted=current.some(a=>a.taskId===Number(args.blockedAnchorTaskId)) && [...removed].every(id=>current.some(a=>a.taskId===id)) && afterResidual.residualProductiveTaskIds.length<beforeResidual.residualProductiveTaskIds.length && audit.duplicateTaskIds.length===0 && !audit.protectedAssignmentsModified && audit.outsideNeighborhoodAssignmentsModified===0 && validateCombined(args,current,"repair-neighborhood:final")==="VALID"; validations++;
  const finalPlan=accepted?{...args.combinedPartialPlan,assignments:current,combinedAssignmentsFingerprint:initialConstructionAssignmentFingerprint(current),readOnly:true}:args.combinedPartialPlan;
  return deepFreeze({version:"INITIAL-CONSTRUCTION-REPAIR-NEIGHBORHOOD-SESSION-V1",executed:true,accepted,combinedPartialPlan:finalPlan,anchorAssigned:current.some(a=>a.taskId===Number(args.blockedAnchorTaskId)),allNeighborhoodReinserted:[...removed].every(id=>current.some(a=>a.taskId===id)),acceptedCycleCount:accepted?cycles:0,anchorAttemptCount:attempts,validationCount:validations,audit,stopReason:accepted?"REPAIR_ACCEPTED":"ACCEPTANCE_CRITERIA_FAILED",sessionFingerprint:hash({before:initialConstructionAssignmentFingerprint(before),after:initialConstructionAssignmentFingerprint(current),audit:audit.fingerprint,set:args.ejectionSet?.fingerprint}),readOnly:true}) as any;
}
