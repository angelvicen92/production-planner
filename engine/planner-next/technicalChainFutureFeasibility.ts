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
  /** Placement whose removal was exactly proved to restore a witness. */
  certifiedCausingTaskId: string | null;
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
  added:readonly ScheduledTask[],allowance:number):TechnicalChainFutureReservationProbe {
  const affected=[...(problem.analyticalFutureTechnicalChains??[])].filter(chain=>
    chain.tasks.some(member=>added.some(task=>sharesHardAuthority(member,task))))
    .sort((a,b)=>a.policy.id.localeCompare(b.policy.id));
  const base={affectedStructures:affected.length,structuresChecked:0,branchesConsumed:0,structureId:null,
    workItemKey:null,candidateCount:0,certifiedCausingTaskId:null};
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
      // A cause is actionable only when this exact structure regains a complete
      // witness after removing one newly materialised, relevant placement.
      for(const candidate of [...added].filter(task=>structure.tasks.some(member=>sharesHardAuthority(member,task)))
        .sort((a,b)=>a.id.localeCompare(b.id)||a.start-b.start)){
        const without=relevantPlaced.filter(task=>task.id!==candidate.id);
        const counterfactual=generateTechnicalChainCandidates(probeProblem,members,[...without],
          Math.max(0,allowance-consumed),"PROBE",1);
        consumed+=counterfactual.consumed;
        if(counterfactual.exhausted)return {...base,...identity,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",
          structuresChecked:checked,branchesConsumed:consumed,candidateCount:0};
        if(counterfactual.candidates.length>0)return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",
          structuresChecked:checked,branchesConsumed:consumed,candidateCount:0,certifiedCausingTaskId:candidate.id};
      }
      return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,
        branchesConsumed:consumed,candidateCount:0};
    }
  }
  const first=affected[0]!;
  return {...base,status:"PASS",result:"WITNESS",structuresChecked:checked,branchesConsumed:consumed,
    structureId:first.policy.id,workItemKey:technicalChainWorkItemKey(first.tasks[0]!.id),candidateCount:1};
}
