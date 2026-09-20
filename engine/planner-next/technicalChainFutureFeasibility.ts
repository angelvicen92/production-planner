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
    workItemKey:null,candidateCount:0};
  if(affected.length===0)return {...base,status:"PASS",result:"NOT_AFFECTED"};
  let consumed=0,checked=0;
  for(const structure of affected){
    const probeProblem:PlannerNextProblem={...problem,tasks:[...problem.tasks,...structure.tasks],technicalChains:[structure.policy]};
    const generated=generateTechnicalChainCandidates(probeProblem,structure.tasks,[...placed],Math.max(0,allowance-consumed),"PROBE",1);
    consumed+=generated.consumed;checked++;
    const identity={structureId:structure.policy.id,workItemKey:technicalChainWorkItemKey(structure.tasks[0]!.id)};
    if(generated.exhausted)return {...base,...identity,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed,candidateCount:0};
    if(generated.candidates.length===0)return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,branchesConsumed:consumed,candidateCount:0};
  }
  const first=affected[0]!;
  return {...base,status:"PASS",result:"WITNESS",structuresChecked:checked,branchesConsumed:consumed,
    structureId:first.policy.id,workItemKey:technicalChainWorkItemKey(first.tasks[0]!.id),candidateCount:1};
}
