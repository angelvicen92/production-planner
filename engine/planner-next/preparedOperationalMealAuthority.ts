import type { OperationalMealPolicy, PlannerNextProblem, ScheduledOperationalMeal, ScheduledTask, Window } from "./contracts";
import { assessOperationalMealFutureFeasibility, operationalMealCandidates, operationalMealWitnessFingerprint, type OperationalMealSearchBudget, type OperationalMealWitness } from "./operationalMeals";
import { overlaps } from "./time";

export type OperationalMealReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface OperationalMealRemainingInterval { readonly start:number; readonly end:number }
export interface OperationalMealFirstPrune {
  readonly phase:"CORE"|"STANDALONE";readonly causingTaskId:string;readonly causingStart:number;readonly policyId:string;
  readonly resourceIds:readonly string[];readonly spaceIds:readonly string[];readonly window:Window;readonly duration:number;
  readonly candidateCountBefore:number;readonly candidateCountAfter:number;readonly remainingIntervals:readonly OperationalMealRemainingInterval[];readonly depth:number;
}
export interface PreparedOperationalMealEvidence {
  checks:number;passes:number;prunes:number;abstentions:number;irrelevantFastPasses:number;affectedPoliciesChecked:number;
  individualDomainChecks:number;individualZeroDomainPrunes:number;witnessValidationChecks:number;witnessReuseHits:number;
  witnessInvalidations:number;witnessRepairs:number;exactCollectiveChecks:number;branchesConsumed:number;terminalSearchesAvoided:number;
  firstPrune:OperationalMealFirstPrune|null;
}
export interface OperationalMealReservationProbe { readonly status:OperationalMealReservationStatus;readonly witness:OperationalMealWitness|null;readonly affectedPolicyIds:readonly string[];readonly blockingPolicyId:string|null;readonly remainingIntervals:readonly OperationalMealRemainingInterval[] }

const resourceIds=(task:ScheduledTask):readonly string[]=>task.coachId===undefined?(task.requiredResourceIds??[]):[...(task.requiredResourceIds??[]),task.coachId];
const affects=(task:ScheduledTask,policy:OperationalMealPolicy):boolean=>policy.spaceIds.includes(task.spaceId)||resourceIds(task).some(id=>policy.resourceIds.includes(id));
const policyConflict=(left:OperationalMealPolicy,right:OperationalMealPolicy):boolean=>left.resourceIds.some(id=>right.resourceIds.includes(id))||left.spaceIds.some(id=>right.spaceIds.includes(id));
const intersect=(left:Window[],right:readonly Window[]):Window[]=>left.flatMap(a=>right.map(b=>({start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)}))).filter(x=>x.end>x.start);
const subtract=(source:Window[],occupied:Window):Window[]=>source.flatMap(interval=>{
  if(!overlaps(interval,occupied))return [interval];const result:Window[]=[];
  if(interval.start<occupied.start)result.push({start:interval.start,end:Math.min(interval.end,occupied.start)});
  if(occupied.end<interval.end)result.push({start:Math.max(interval.start,occupied.end),end:interval.end});return result;
});

export class PreparedOperationalMealAuthority {
  readonly evidence:PreparedOperationalMealEvidence={checks:0,passes:0,prunes:0,abstentions:0,irrelevantFastPasses:0,affectedPoliciesChecked:0,
    individualDomainChecks:0,individualZeroDomainPrunes:0,witnessValidationChecks:0,witnessReuseHits:0,witnessInvalidations:0,witnessRepairs:0,
    exactCollectiveChecks:0,branchesConsumed:0,terminalSearchesAvoided:0,firstPrune:null};
  private lastWitness:OperationalMealWitness|null=null;
  private witnessFingerprint:string|null=null;
  constructor(private readonly problem:PlannerNextProblem,private readonly fixedMeals:readonly ScheduledOperationalMeal[]=[]){ }

  private intervals(policy:OperationalMealPolicy,tasks:readonly ScheduledTask[]):Window[]{
    let free:Window[]=[{...policy.window}];
    for(const id of policy.resourceIds){const authority=this.problem.resources.find(x=>x.id===id)??this.problem.coaches.find(x=>x.id===id);free=intersect(free,authority?.availability??[]);}
    for(const id of policy.spaceIds){const authority=this.problem.spaces.find(x=>x.id===id);free=intersect(free,authority?.availability??[]);}
    for(const task of tasks)if(affects(task,policy))free=subtract(free,{start:task.start,end:task.end});
    return free.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  private witnessValid(tasks:readonly ScheduledTask[]):boolean{
    if(!this.lastWitness?.complete)return false;this.evidence.witnessValidationChecks++;
    return this.lastWitness.scheduled.every(meal=>{const policy=this.problem.operationalMealPolicies?.find(x=>x.id===meal.id);return policy!==undefined&&operationalMealCandidates(this.problem,policy,tasks,this.lastWitness!.scheduled.filter(x=>x.id!==meal.id)).some(x=>x.start===meal.start&&x.end===meal.end);});
  }
  private independentWitness(tasks:readonly ScheduledTask[],policies:readonly OperationalMealPolicy[]):OperationalMealWitness|null{
    const scheduled:ScheduledOperationalMeal[]=[...this.fixedMeals],counts:Record<string,number>={},order:string[]=[];
    for(const policy of policies){if(scheduled.some(meal=>meal.id===policy.id))continue;const candidates=operationalMealCandidates(this.problem,policy,tasks,scheduled);counts[policy.id]=candidates.length;
      if(!candidates[0])return null;scheduled.push(candidates[0]);order.push(policy.id);}
    return {complete:true,scheduled:scheduled.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)),candidateCountByPolicyId:counts,
      finalSelectionOrder:order,blockingPolicyIds:[],branchesExplored:0,backtracks:0,reasonCodes:[],readOnly:true};
  }
  assess(tasks:readonly ScheduledTask[],addedTasks:readonly ScheduledTask[],budget:OperationalMealSearchBudget,phase:"CORE"|"STANDALONE",depth:number):OperationalMealReservationProbe{
    this.evidence.checks++;const policies=[...(this.problem.operationalMealPolicies??[])].sort((a,b)=>a.id.localeCompare(b.id));
    const affected=policies.filter(policy=>addedTasks.some(task=>affects(task,policy)));this.evidence.affectedPoliciesChecked+=affected.length;
    if(affected.length===0){this.evidence.irrelevantFastPasses++;this.evidence.passes++;return {status:"PASS",witness:this.lastWitness,affectedPolicyIds:[],blockingPolicyId:null,remainingIntervals:[]};}
    let blocking:OperationalMealPolicy|undefined,remaining:Window[]=[];
    const individualPolicies=this.lastWitness?affected:policies;
    for(const policy of individualPolicies){this.evidence.individualDomainChecks++;const free=this.intervals(policy,tasks);if(!free.some(x=>x.end-x.start>=policy.duration)){blocking=policy;remaining=free;break;}}
    if(blocking){this.evidence.individualZeroDomainPrunes++;this.evidence.prunes++;const causing=addedTasks.find(task=>affects(task,blocking!))??addedTasks[0]!;
      this.evidence.firstPrune??={phase,causingTaskId:causing.id,causingStart:causing.start,policyId:blocking.id,resourceIds:[...blocking.resourceIds],spaceIds:[...blocking.spaceIds],window:{...blocking.window},duration:blocking.duration,
        candidateCountBefore:operationalMealCandidates(this.problem,blocking,tasks.filter(task=>!addedTasks.includes(task)),[]).length,candidateCountAfter:0,remainingIntervals:remaining.map(x=>({...x})),depth};
      return {status:"PRUNE",witness:null,affectedPolicyIds:affected.map(x=>x.id),blockingPolicyId:blocking.id,remainingIntervals:remaining};}
    if(this.witnessValid(tasks)){this.evidence.witnessReuseHits++;this.evidence.passes++;return {status:"PASS",witness:this.lastWitness,affectedPolicyIds:affected.map(x=>x.id),blockingPolicyId:null,remainingIntervals:[]};}
    if(this.lastWitness)this.evidence.witnessInvalidations++;
    // Independent policies cannot invalidate one another, so their first canonical candidates
    // compose directly. Only contending policies need the existing exact collective authority.
    const collective=policies.some((policy,index)=>policies.slice(index+1).some(other=>policyConflict(policy,other)));
    if(collective)this.evidence.exactCollectiveChecks++;
    const witness=collective?assessOperationalMealFutureFeasibility(this.problem,tasks,budget,"MATERIALIZE",this.fixedMeals)
      :this.independentWitness(tasks,policies)??assessOperationalMealFutureFeasibility(this.problem,tasks,budget,"MATERIALIZE",this.fixedMeals);
    this.evidence.branchesConsumed+=witness.branchesExplored;
    if(witness.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED")){this.evidence.abstentions++;return {status:"ABSTAIN",witness:null,affectedPolicyIds:affected.map(x=>x.id),blockingPolicyId:null,remainingIntervals:[]};}
    if(!witness.complete){this.evidence.prunes++;return {status:"PRUNE",witness,affectedPolicyIds:affected.map(x=>x.id),blockingPolicyId:witness.blockingPolicyIds[0]??null,remainingIntervals:[]};}
    if(this.lastWitness)this.evidence.witnessRepairs++;this.lastWitness=witness;this.witnessFingerprint=operationalMealWitnessFingerprint(witness.scheduled);this.evidence.passes++;
    return {status:"PASS",witness,affectedPolicyIds:affected.map(x=>x.id),blockingPolicyId:null,remainingIntervals:[]};
  }
  materialize(tasks:readonly ScheduledTask[],budget:OperationalMealSearchBudget):OperationalMealWitness{
    if(this.witnessValid(tasks)){this.evidence.witnessReuseHits++;this.evidence.terminalSearchesAvoided++;return this.lastWitness!;}
    const policies=[...(this.problem.operationalMealPolicies??[])].sort((a,b)=>a.id.localeCompare(b.id));
    const collective=policies.some((policy,index)=>policies.slice(index+1).some(other=>policyConflict(policy,other)));
    if(collective)this.evidence.exactCollectiveChecks++;
    const witness=collective?assessOperationalMealFutureFeasibility(this.problem,tasks,budget,"MATERIALIZE",this.fixedMeals)
      :this.independentWitness(tasks,policies)??assessOperationalMealFutureFeasibility(this.problem,tasks,budget,"MATERIALIZE",this.fixedMeals);this.evidence.branchesConsumed+=witness.branchesExplored;
    if(witness.complete){if(this.witnessFingerprint!==null)this.evidence.witnessRepairs++;this.lastWitness=witness;this.witnessFingerprint=operationalMealWitnessFingerprint(witness.scheduled);}return witness;
  }
}
