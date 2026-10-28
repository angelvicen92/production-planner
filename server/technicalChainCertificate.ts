import { buildAssistedProblem, createPlanningScope } from "../engine/planner-next/assistedPlanning";
import type { PlannerNextProblem, ScheduledTask } from "../engine/planner-next/contracts";
import { createTechnicalChainExplorer } from "../engine/planner-next/technicalChains";
import { validatePlan } from "../engine/planner-next/validate";
/** Reuse the existing exact explorer with the unused branch allowance. This is
 * context for SQL revalidation only, never an additional Draft placement. */
export function certifyDailyTechnicalChain(problem:PlannerNextProblem,placed:ScheduledTask[],remaining:number,globalWitness?:PhysicalWitness) {
  const policy=problem.technicalChains?.[0];
  if(!policy)return null;
  if(policy.phases){
    // The Assisted execution already solved the global physical future. Never
    // search a second, isolated completion or drop its occupation channels.
    if(!globalWitness||globalWitness.tasks.length!==problem.tasks.length
      ||new Set(globalWitness.tasks.map(t=>t.id)).size!==problem.tasks.length)
      return {status:"INVALID",consumed:0,contextOnly:true,tasks:[]};
    const validation=validatePlan(problem,globalWitness.tasks,globalWitness.setupPreparations??[],globalWitness.spaceMeals??[],
      globalWitness.participantMeals??[],globalWitness.resourceMeals??[],globalWitness.itinerantUnitMeals??[],
      globalWitness.roundPreparations??[],globalWitness.operationalMeals??[]);
    if(!validation.hardValid||placed.some(t=>{const certified=globalWitness.tasks.find(p=>p.id===t.id);
      return !certified||certified.start!==t.start||certified.end!==t.end||certified.spaceId!==t.spaceId
        ||JSON.stringify(certified.requiredResourceIds)!==JSON.stringify(t.requiredResourceIds);}))
      return {status:"INVALID",consumed:0,contextOnly:true,tasks:[],validation};
    const groups=new Set(problem.tasks.filter(t=>policy.orderedTaskIds.includes(t.id)).map(t=>t.jointGroupId).filter(Boolean));
    return {status:"WITNESS",consumed:0,contextOnly:true,tasks:globalWitness.tasks.filter(t=>policy.orderedTaskIds.includes(t.id)||t.jointGroupId&&groups.has(t.jointGroupId)).map(project),
      operationalMeals:globalWitness.operationalMeals??[]};
  }
  const pending=policy.orderedTaskIds.filter(id=>!placed.some(t=>t.id===id));
  let witness=placed,consumed=0,complete=true;
  if(pending.length){
    const explorer=createTechnicalChainExplorer(problem,problem.tasks.filter(t=>pending.includes(t.id)),placed,Math.max(0,remaining));
    const candidate=explorer.nextCandidate();consumed=explorer.consumed;complete=!explorer.exhausted;
    if(!candidate)return {status:complete?"ZERO_DOMAIN":"BUDGET_EXHAUSTED",consumed,contextOnly:true,tasks:[]};
    witness=[...placed,...candidate.tasks];
  }
  // Use the same scope/context validation authority as Proposed Draft. Every
  // accepted placement remains fixed context; only this future unit is certified.
  const scope=createPlanningScope({kind:"TASK_IDS",value:policy.orderedTaskIds.join(",")},{},policy.orderedTaskIds);
  const scoped=buildAssistedProblem(problem,scope,placed);
  const validation=validatePlan(scoped.originalValidationProblem,witness);
  if(!validation.hardValid)return {status:"INVALID",consumed,contextOnly:true,tasks:[],validation};
  return {status:"WITNESS",consumed,contextOnly:true,tasks:witness.filter(t=>policy.orderedTaskIds.includes(t.id)).map(t=>({
    taskId:Number(t.id.slice(5)),startPlanned:hhmm(t.start),endPlanned:hhmm(t.end),spaceId:Number(t.spaceId.slice(6)),
    assignedResourceIds:(t.requiredResourceIds??[]).map(id=>Number(id.slice(14))),
  }))};
}
type PhysicalWitness={tasks:ScheduledTask[];setupPreparations?:Parameters<typeof validatePlan>[2];spaceMeals?:Parameters<typeof validatePlan>[3];
  participantMeals?:Parameters<typeof validatePlan>[4];resourceMeals?:Parameters<typeof validatePlan>[5];itinerantUnitMeals?:Parameters<typeof validatePlan>[6];
  roundPreparations?:Parameters<typeof validatePlan>[7];operationalMeals?:Parameters<typeof validatePlan>[8]};
const project=(t:ScheduledTask)=>({taskId:Number(t.id.slice(5)),startPlanned:hhmm(t.start),endPlanned:hhmm(t.end),spaceId:Number(t.spaceId.slice(6)),
  assignedResourceIds:(t.requiredResourceIds??[]).map(id=>Number(id.slice(14)))});
const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
