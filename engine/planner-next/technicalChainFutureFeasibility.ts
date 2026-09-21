import type { PlannerNextProblem, ScheduledTask, Task, TechnicalChainPolicy } from "./contracts";
import { generateTechnicalChainCandidates, technicalChainWorkItemKey } from "./technicalChains";

export type TechnicalChainFutureReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface TechnicalChainFutureReservationProbe {
  status: TechnicalChainFutureReservationStatus;
  affectedStructures: number;
  structuresChecked: number;
  branchesConsumed: number;
  structureId: string | null;
  workItemKey: string | null;
  candidateCount: number;
  /** Representative of the single repair decision whose removal was exactly proved to restore a witness. */
  certifiedCausingTaskId: string | null;
  certifiedDecisionDepth: number | null;
  initialRepairableGroupCount: number;
  redundantDecisionDepths: number[];
  irreducibleDecisionDepths: number[];
  minimizationProbes: number;
  result: "WITNESS" | "ZERO_DOMAIN" | "BUDGET_EXHAUSTED" | "NOT_AFFECTED";
}

const sharesHardAuthority=(left:Task,right:Task)=>left.spaceId===right.spaceId
  ||left.participantId!==undefined&&left.participantId===right.participantId
  ||left.coachId!==undefined&&left.coachId===right.coachId
  ||left.itinerantUnitId!==undefined&&left.itinerantUnitId===right.itinerantUnitId
  ||(left.requiredResourceIds??[]).some(id=>(right.requiredResourceIds??[]).includes(id))
  ||left.dependencies.includes(right.id)||right.dependencies.includes(left.id);

/** Exact, bounded reservation for explicit future REQUIRED technical chains. */
export function probeTechnicalChainFutureReservations(problem:PlannerNextProblem,placed:readonly ScheduledTask[],
  added:readonly ScheduledTask[],allowance:number,decisionDepthForTask?:(taskId:string)=>number|null):TechnicalChainFutureReservationProbe {
  const affected=[...(problem.analyticalFutureTechnicalChains??[])].filter(chain=>
    chain.tasks.some(member=>added.some(task=>sharesHardAuthority(member,task))))
    .sort((a,b)=>a.policy.id.localeCompare(b.policy.id));
  const base={affectedStructures:affected.length,structuresChecked:0,branchesConsumed:0,structureId:null,
    workItemKey:null,candidateCount:0,certifiedCausingTaskId:null,certifiedDecisionDepth:null,
    initialRepairableGroupCount:0,redundantDecisionDepths:[] as number[],irreducibleDecisionDepths:[] as number[],minimizationProbes:0};
  if(affected.length===0)return {...base,status:"PASS",result:"NOT_AFFECTED"};
  let consumed=0,checked=0;
  for(const structure of affected){
    // Keep the explicit policy sequence as the work item while the probe problem
    // retains every analytical task, including joint-closure siblings.
    const byId=new Map(structure.tasks.map(task=>[task.id,task]));
    const members=structure.policy.orderedTaskIds.map(id=>byId.get(id)).filter((task):task is Task=>task!==undefined);
    const relevantPlaced=placed.filter(task=>structure.tasks.some(member=>sharesHardAuthority(member,task)));
    const probeProblem:PlannerNextProblem={...problem,tasks:[...problem.tasks,...structure.tasks],technicalChains:[structure.policy]};
    const generated=generateTechnicalChainCandidates(probeProblem,members,relevantPlaced,Math.max(0,allowance-consumed),"PROBE",1);
    consumed+=generated.consumed;checked++;
    const identity={structureId:structure.policy.id,workItemKey:technicalChainWorkItemKey(structure.tasks[0]!.id)};
    if(generated.exhausted)return {...base,...identity,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed,candidateCount:0};
    if(generated.candidates.length===0){
      const relevantAdded=new Set(added.filter(task=>structure.tasks.some(member=>sharesHardAuthority(member,task))).map(task=>task.id));
      const grouped=new Map<number,ScheduledTask[]>();
      for(const task of relevantPlaced){
        const depth=decisionDepthForTask?.(task.id)??(relevantAdded.has(task.id)?Number.MAX_SAFE_INTEGER:null);
        if(depth===null)continue;
        const group=grouped.get(depth)??[];group.push(task);grouped.set(depth,group);
      }
      const groups=[...grouped].sort(([left],[right])=>left-right).map(([depth,tasks])=>({depth,tasks:tasks.sort((a,b)=>a.id.localeCompare(b.id)||a.start-b.start)}));
      let working=[...relevantPlaced],probes=0;
      const redundant:number[]=[],necessary:number[]=[];
      // Deletion minimization is deterministic by repair decision, not by placement:
      // all placements materialised by one main@position move together, while fixed
      // context (no decision depth) remains in every counterfactual.
      for(const group of groups){
        const ids=new Set(group.tasks.map(task=>task.id));
        const without=working.filter(task=>!ids.has(task.id));
        const counterfactual=generateTechnicalChainCandidates(probeProblem,members,without,
          Math.max(0,allowance-consumed),"PROBE",1);
        consumed+=counterfactual.consumed;probes++;
        if(counterfactual.exhausted)return {...base,...identity,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",
          structuresChecked:checked,branchesConsumed:consumed,candidateCount:0,initialRepairableGroupCount:groups.length,
          redundantDecisionDepths:redundant,irreducibleDecisionDepths:necessary,minimizationProbes:probes};
        if(counterfactual.candidates.length===0){working=without;redundant.push(group.depth);}
        else necessary.push(group.depth);
      }
      if(necessary.length===1){
        const group=groups.find(item=>item.depth===necessary[0])!;
        return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,
          branchesConsumed:consumed,candidateCount:0,certifiedCausingTaskId:group.tasks[0]!.id,
          certifiedDecisionDepth:group.depth,initialRepairableGroupCount:groups.length,
          redundantDecisionDepths:redundant,irreducibleDecisionDepths:necessary,minimizationProbes:probes};
      }
      return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,
        branchesConsumed:consumed,candidateCount:0,initialRepairableGroupCount:groups.length,
        redundantDecisionDepths:redundant,irreducibleDecisionDepths:necessary,minimizationProbes:probes};
    }
  }
  const first=affected[0]!;
  return {...base,status:"PASS",result:"WITNESS",structuresChecked:checked,branchesConsumed:consumed,
    structureId:first.policy.id,workItemKey:technicalChainWorkItemKey(first.tasks[0]!.id),candidateCount:1};
}
