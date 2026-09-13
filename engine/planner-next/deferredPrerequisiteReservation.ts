import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { assessAnonymousPostInCompletions, assessTransportFutureFeasibility,
  findTransportDirectionWitness, validateDirectionWitness,
  type AnonymousPostInCompletionAssessment } from "./transportGrouping";
import { createPendingCompletionDeadlineAuthority } from "./pendingCompletionDeadlineAuthority";
import { assessParticipantMealFutureFeasibility, participantMealCandidates, participantMealWitnessFingerprint,
  probeParticipantMealFutureFeasibility } from "./participantMeals";

export interface DeferredArrivalCausalCertificate {
  causingTaskId:string|null;arrivalTaskId:string;participantId:string|null;previousBoundary:number;currentBoundary:number;
  previousWitnessFingerprint:string;previousWitnessSummary:readonly {start:number;taskIds:string[]}[];
  repair:import("./transportGrouping").TransportWitnessCausalDiagnostic|null;
}

export interface DeferredPrerequisiteReservationResult {
  feasible: boolean;
  branchesExplored: number;
  exhausted: boolean;
  arrivalChecks: number;
  arrivalBranchesExplored: number;
  arrivalBacktracks: number;
  arrivalRepaired: boolean;
  arrivalPruned: boolean;
  arrivalWitnessDropped: boolean;
  transportEvidence: { slotLogicalStarts:number;slotAnalyticallyEliminatedStarts:number;slotStartSetsEvaluated:number;
    matchingChecks:number;matchingEdgeChecks:number;matchingAugmentTraversals:number;equivalentMembershipsCollapsed:number;
    monotoneFastPathChecks:number;monotoneFastPathHits:number;monotoneFastPathWitnesses:number;monotoneFastPathAbstentions:number;
    cumulativeCapacityChecks:number;cumulativeCapacityPrunes:number;futureChecks:number;futureIntervalCalculations:number;
    futureEnumeratedStarts:number;futureCapacityPrunes:number };
  causalDiagnostic:DeferredArrivalCausalCertificate|null;
  pendingArrivalDeadline: AnonymousPostInCompletionAssessment;
  exactPrerequisiteSearchesAvoided: number;
  reservation: DeferredPrerequisiteReservation;
  /** The canonical necessary-only transport proof, forwarded without reinterpretation. */
  transportFailure: ReturnType<typeof assessTransportFutureFeasibility>["firstFailure"];
  participantMealWitnessAction:"BUILD"|"REUSE"|"REPAIR"|"NO_WITNESS"|"BUDGET_EXHAUSTED";
  participantMealRepairBranches:number;
}

export interface DeferredPrerequisiteReservation {
  groups: readonly (readonly ScheduledTask[])[];
  deadlines: Readonly<Record<string, number>>;
  fingerprint: string;
  /** Virtual, branch-local choices. They are reservations, never locks. */
  participantMeals: readonly ScheduledParticipantMeal[];
  participantMealFingerprint: string;
}

/** The generalized participant-presence authority. The old name remains as a source-compatible alias. */
export type DeferredParticipantPresenceReservation = DeferredPrerequisiteReservation;

const emptyReservation = (): DeferredPrerequisiteReservation => ({ groups: [], deadlines: {}, fingerprint: "",
  participantMeals:[],participantMealFingerprint:participantMealWitnessFingerprint([]) });
const witnessSummary = (groups:readonly (readonly ScheduledTask[])[]) => groups.map(group=>({start:group[0]!.start,
  taskIds:group.map(({id})=>id).sort()})).sort((a,b)=>a.start-b.start||a.taskIds.join(",").localeCompare(b.taskIds.join(",")));
const reservationFingerprint = (groups:readonly (readonly ScheduledTask[])[],deadlines:Readonly<Record<string,number>>) =>
  `${witnessSummary(groups).map(group=>`${group.start}:${group.taskIds.join(",")}`).join("|")}#${Object.entries(deadlines).sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>`${id}:${value}`).join("|")}`;

function arrivalLowerBounds(groups:readonly (readonly ScheduledTask[])[]):ReadonlyMap<string,number>{
  return new Map(groups.flat().flatMap(task=>task.participantId?[[task.participantId,task.end] as const]:[]));
}

function maintainParticipantMealWitness(problem:PlannerNextProblem,tasks:readonly ScheduledTask[],previous:readonly ScheduledParticipantMeal[],consume:()=>boolean,
  arrivals:readonly (readonly ScheduledTask[])[]=[]){
  if(!(problem.participantMeals?.length))return {status:"REUSE" as const,meals:[] as ScheduledParticipantMeal[],branches:0,exhausted:false};
  const arrivalTasks=arrivals.flat(),effectiveTasks=[...tasks,...arrivalTasks];
  const lowerBounds=arrivalLowerBounds(arrivals);
  const probe=probeParticipantMealFutureFeasibility(problem,effectiveTasks);
  if(!probe.feasible)return {status:"NO_WITNESS" as const,meals:[] as ScheduledParticipantMeal[],branches:0,exhausted:false};
  const obligations=[...(problem.participantMeals??[])].sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId));
  const priorById=new Map(previous.map(meal=>[meal.sourceTaskId,meal]));
  const preserved:ScheduledParticipantMeal[]=[];const affected:typeof obligations=[];
  for(const obligation of obligations){const prior=priorById.get(obligation.sourceTaskId);
    if(prior&&participantMealCandidates(problem,obligation,effectiveTasks,[...previous.filter(x=>x.sourceTaskId!==obligation.sourceTaskId)],lowerBounds).some(x=>x.start===prior.start))preserved.push(prior);
    else affected.push(obligation);
  }
  if(previous.length===obligations.length&&!affected.length)return {status:"REUSE" as const,meals:[...previous],branches:0,exhausted:false};
  let branches=0,exhausted=false;
  const search=(pending:typeof obligations,placed:ScheduledParticipantMeal[]):ScheduledParticipantMeal[]|null=>{
    if(!pending.length)return placed;
    const domains=pending.map(obligation=>({obligation,candidates:participantMealCandidates(problem,obligation,effectiveTasks,placed,lowerBounds)}))
      .sort((a,b)=>a.candidates.length-b.candidates.length||a.obligation.sourceTaskId.localeCompare(b.obligation.sourceTaskId));
    const selected=domains[0]!;if(!selected.candidates.length)return null;
    for(const candidate of selected.candidates){if(!consume()){exhausted=true;return null;}branches++;
      const result=search(pending.filter(x=>x!==selected.obligation),[...placed,candidate]);if(result)return result;if(exhausted)return null;}
    return null;
  };
  // Initial construction deliberately uses the canonical exact authority. Repairs
  // retain every still-valid obligation and enumerate only the damaged suffix.
  if(!previous.length){const budget={remaining:Number.MAX_SAFE_INTEGER,consume:(count=1)=>{for(let i=0;i<count;i++)if(!consume())return false;return true;}};
    const built=assessParticipantMealFutureFeasibility(problem,effectiveTasks,budget,"MATERIALIZE",lowerBounds);
    return {status:built.complete?"BUILD" as const:built.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED")?"BUDGET_EXHAUSTED" as const:"NO_WITNESS" as const,
      meals:[...built.scheduled],branches:built.branchesExplored,exhausted:built.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED")};}
  const repaired=search(affected,preserved);
  return {status:repaired?"REPAIR" as const:exhausted?"BUDGET_EXHAUSTED" as const:"NO_WITNESS" as const,
    meals:(repaired??[]).sort((a,b)=>a.start-b.start||a.sourceTaskId.localeCompare(b.sourceTaskId)),branches,exhausted};
}

/** Single, read-only authority for the coupled virtual arrival/meal reservation. */
export function validateParticipantPresenceReservation(problem:PlannerNextProblem,arrivals:readonly Task[],
  groups:readonly (readonly ScheduledTask[])[],meals:readonly ScheduledParticipantMeal[],
  productive:readonly ScheduledTask[],virtualBoundaries:ReadonlyMap<string,number>=new Map()):boolean{
  if(!validateDirectionWitness(problem,"arrival",arrivals,groups,productive,meals,null,virtualBoundaries))return false;
  const lowerBounds=arrivalLowerBounds(groups);
  return (problem.participantMeals??[]).every(obligation=>{
    const witness=meals.find(meal=>meal.sourceTaskId===obligation.sourceTaskId);
    return Boolean(witness&&participantMealCandidates(problem,obligation,[...productive,...groups.flat()],
      meals.filter(meal=>meal.sourceTaskId!==obligation.sourceTaskId),lowerBounds).some(candidate=>candidate.start===witness.start));
  });
}

const noTransportEvidence = () => ({ slotLogicalStarts:0,slotAnalyticallyEliminatedStarts:0,slotStartSetsEvaluated:0,
  matchingChecks:0,matchingEdgeChecks:0,matchingAugmentTraversals:0,equivalentMembershipsCollapsed:0,
  monotoneFastPathChecks:0,monotoneFastPathHits:0,monotoneFastPathWitnesses:0,monotoneFastPathAbstentions:0,
  cumulativeCapacityChecks:0,cumulativeCapacityPrunes:0,futureChecks:0,futureIntervalCalculations:0,
  futureEnumeratedStarts:0,futureCapacityPrunes:0 });

const futureEvidence = (future: ReturnType<typeof assessTransportFutureFeasibility>) => ({
  futureChecks: future.checks, futureIntervalCalculations: future.intervalCalculations,
  futureEnumeratedStarts: future.enumeratedStarts, futureCapacityPrunes: future.capacityPrunes,
});

const byId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id);

function pendingHardPredecessors(problem: PlannerNextProblem, pending: readonly Task[], placed: readonly ScheduledTask[]): Task[] {
  const placedIds = new Set(placed.map(({ id }) => id));
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const eligibleById = new Map(pending.map((task) => [task.id, task]));
  for (const id of problem.transportPolicy?.arrival.taskIds ?? []) {
    const task = taskById.get(id);
    if (placedIds.has(id)) eligibleById.delete(id);
    else if (task) eligibleById.set(id, task);
  }
  const result = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskById.get(id);
    for (const dependency of task?.dependencies ?? []) {
      if (eligibleById.has(dependency)) result.add(dependency);
      visit(dependency);
    }
  };
  for (const task of placed) visit(task.id);
  return [...result].map((id) => eligibleById.get(id)!).sort(byId);
}

/** Applies necessary-only future-feasibility checks without selecting or materializing future task starts. */
export function maintainDeferredPrerequisiteReservation(problem: PlannerNextProblem, pending: readonly Task[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[] = [],
  previous:DeferredPrerequisiteReservation|null=null,consume:()=>boolean=()=>true,causingTaskId:string|null=null): DeferredPrerequisiteReservationResult {
  const predecessors = pendingHardPredecessors(problem, pending, placed);
  const arrivalIds = new Set(problem.transportPolicy?.arrival.taskIds ?? []);
  const arrivals = predecessors.filter(({ id }) => arrivalIds.has(id));
  const deadlines = createPendingCompletionDeadlineAuthority(problem, predecessors, placed, meals);
  const completionDeadlineByParticipant = new Map(arrivals.flatMap((task) => task.participantId
    ? [[task.participantId, deadlines.completionDeadline(task.id)] as const] : []));
  const deadlineRecord=Object.fromEntries(arrivals.map(task=>[task.id,deadlines.completionDeadline(task.id)]).sort(([a],[b])=>a.localeCompare(b)));
  const virtualBoundaries=new Map(Object.entries(deadlineRecord));
  const pendingArrivalDeadline = assessAnonymousPostInCompletions(problem, completionDeadlineByParticipant);
  if (!pendingArrivalDeadline.feasible) return { feasible: false,
    branchesExplored: 0, exhausted: false, arrivalChecks: 0, arrivalBranchesExplored: 0,
    arrivalBacktracks: 0, arrivalRepaired: false, arrivalPruned: true, arrivalWitnessDropped: Boolean(previous?.groups.length),
    transportEvidence: noTransportEvidence(), causalDiagnostic: null, transportFailure: null,reservation:emptyReservation(),
    pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 1,participantMealWitnessAction:"NO_WITNESS",participantMealRepairBranches:0 };
  const futureTransport = assessTransportFutureFeasibility(problem, placed);
  if (!futureTransport.feasible) return { feasible: false,
    branchesExplored: 0, exhausted: false, arrivalChecks: futureTransport.checks, arrivalBranchesExplored: 0,
    arrivalBacktracks: 0, arrivalRepaired: false, arrivalPruned: true, arrivalWitnessDropped: Boolean(previous?.groups.length),
    transportEvidence: { ...noTransportEvidence(), cumulativeCapacityChecks: futureTransport.checks,
      cumulativeCapacityPrunes: futureTransport.capacityPrunes, ...futureEvidence(futureTransport) }, causalDiagnostic: null,
    transportFailure:futureTransport.firstFailure, pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 0,reservation:emptyReservation(),participantMealWitnessAction:"NO_WITNESS",participantMealRepairBranches:0 };
  const previousGroups=previous?.groups??[];
  const sameMembership=previousGroups.flat().map(({id})=>id).sort().join("|")===arrivals.map(({id})=>id).sort().join("|");
  // Repair meals against the maintained arrival first. A concrete stale meal is
  // a movable witness, never a lock which may justify NO_WITNESS for the branch.
  let groups=previousGroups;
  let mealState=maintainParticipantMealWitness(problem,placed,previous?.participantMeals??[],consume,groups);
  let reusable=sameMembership&&groups.length>0&&mealState.status!=="NO_WITNESS"&&mealState.status!=="BUDGET_EXHAUSTED"
    &&validateParticipantPresenceReservation(problem,arrivals,groups,mealState.meals,placed,virtualBoundaries);
  let witness=reusable?null:findTransportDirectionWitness(problem,"arrival",arrivals,placed,consume,
    mealState.status==="NO_WITNESS"||mealState.status==="BUDGET_EXHAUSTED"?previous?.participantMeals??[]:mealState.meals,true,virtualBoundaries);
  if(!reusable&&witness?.feasible){
    groups=witness.groups;
    mealState=maintainParticipantMealWitness(problem,placed,previous?.participantMeals??[],consume,groups);
  } else if(!reusable)groups=witness?.groups??[];
  const mealFingerprint=participantMealWitnessFingerprint(mealState.meals);
  const baseFingerprint=reservationFingerprint(groups,deadlineRecord);
  const reservation={groups,deadlines:deadlineRecord,participantMeals:mealState.meals,participantMealFingerprint:mealFingerprint,
    fingerprint:`${baseFingerprint}#MEALS:${mealFingerprint}`};
  const changed=arrivals.find(task=>(previous?.deadlines[task.id]??deadlineRecord[task.id])!==deadlineRecord[task.id]);
  const causalDiagnostic=!reusable&&previousGroups.length>0&&witness?.feasible&&changed?{
    causingTaskId,arrivalTaskId:changed.id,participantId:changed.participantId??null,
    previousBoundary:previous!.deadlines[changed.id]!,currentBoundary:deadlineRecord[changed.id]!,
    previousWitnessFingerprint:previous!.fingerprint,previousWitnessSummary:witnessSummary(previousGroups),repair:witness.causalDiagnostic}:null;
  const arrivalChecks = futureTransport.checks+(previousGroups.length>0?1:0), arrivalBranchesExplored = witness?.branchesExplored??0,
    arrivalBacktracks = witness?.backtracks??0;
  const transportEvidence={ ...noTransportEvidence(), cumulativeCapacityChecks: futureTransport.checks+(witness?.cumulativeCapacityChecks??0),
    cumulativeCapacityPrunes: futureTransport.capacityPrunes+(witness?.cumulativeCapacityPrunes??0), ...futureEvidence(futureTransport),
    slotLogicalStarts:witness?.slotLogicalStarts??0,slotAnalyticallyEliminatedStarts:witness?.slotAnalyticallyEliminatedStarts??0,
    slotStartSetsEvaluated:witness?.slotStartSetsEvaluated??0,matchingChecks:witness?.matchingChecks??0,
    matchingEdgeChecks:witness?.matchingEdgeChecks??0,matchingAugmentTraversals:witness?.matchingAugmentTraversals??0,
    equivalentMembershipsCollapsed:witness?.equivalentMembershipsCollapsed??0,monotoneFastPathChecks:witness?.monotoneFastPathChecks??0,
    monotoneFastPathHits:witness?.monotoneFastPathHits??0,monotoneFastPathWitnesses:witness?.monotoneFastPathWitnesses??0,
    monotoneFastPathAbstentions:witness?.monotoneFastPathAbstentions??0 };
  const arrivalFeasible=reusable||(witness?.feasible??arrivals.length===0);
  const feasible=arrivalFeasible&&(mealState.status!=="NO_WITNESS"&&mealState.status!=="BUDGET_EXHAUSTED"),exhausted=(witness?.exhausted??false)||mealState.exhausted;
  return { feasible, branchesExplored: arrivalBranchesExplored, exhausted,
    arrivalChecks, arrivalBranchesExplored, arrivalBacktracks,
    arrivalPruned: !feasible&&!exhausted,
    arrivalWitnessDropped: previousGroups.length>0&&!feasible, transportEvidence,causalDiagnostic,
    transportFailure:null, pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 0,reservation,
    arrivalRepaired:previousGroups.length>0&&!reusable&&feasible,participantMealWitnessAction:mealState.status,
    participantMealRepairBranches:mealState.branches };
}
