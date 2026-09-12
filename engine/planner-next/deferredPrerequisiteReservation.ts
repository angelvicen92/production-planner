import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { assessAnonymousPostInCompletions, assessTransportFutureFeasibility,
  findTransportDirectionWitness, validateDirectionWitness,
  type AnonymousPostInCompletionAssessment } from "./transportGrouping";
import { createPendingCompletionDeadlineAuthority } from "./pendingCompletionDeadlineAuthority";

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
}

export interface DeferredPrerequisiteReservation {
  groups: readonly (readonly ScheduledTask[])[];
  deadlines: Readonly<Record<string, number>>;
  fingerprint: string;
}

const emptyReservation = (): DeferredPrerequisiteReservation => ({ groups: [], deadlines: {}, fingerprint: "" });
const witnessSummary = (groups:readonly (readonly ScheduledTask[])[]) => groups.map(group=>({start:group[0]!.start,
  taskIds:group.map(({id})=>id).sort()})).sort((a,b)=>a.start-b.start||a.taskIds.join(",").localeCompare(b.taskIds.join(",")));
const reservationFingerprint = (groups:readonly (readonly ScheduledTask[])[],deadlines:Readonly<Record<string,number>>) =>
  `${witnessSummary(groups).map(group=>`${group.start}:${group.taskIds.join(",")}`).join("|")}#${Object.entries(deadlines).sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>`${id}:${value}`).join("|")}`;

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
    pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 1 };
  const futureTransport = assessTransportFutureFeasibility(problem, placed);
  if (!futureTransport.feasible) return { feasible: false,
    branchesExplored: 0, exhausted: false, arrivalChecks: futureTransport.checks, arrivalBranchesExplored: 0,
    arrivalBacktracks: 0, arrivalRepaired: false, arrivalPruned: true, arrivalWitnessDropped: Boolean(previous?.groups.length),
    transportEvidence: { ...noTransportEvidence(), cumulativeCapacityChecks: futureTransport.checks,
      cumulativeCapacityPrunes: futureTransport.capacityPrunes, ...futureEvidence(futureTransport) }, causalDiagnostic: null,
    transportFailure:futureTransport.firstFailure, pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 0,reservation:emptyReservation() };
  const previousGroups=previous?.groups??[];
  const sameMembership=previousGroups.flat().map(({id})=>id).sort().join("|")===arrivals.map(({id})=>id).sort().join("|");
  const reusable=sameMembership&&previousGroups.length>0&&validateDirectionWitness(problem,"arrival",arrivals,previousGroups,placed,[],null,virtualBoundaries);
  const witness=reusable?null:findTransportDirectionWitness(problem,"arrival",arrivals,placed,consume,[],true,virtualBoundaries);
  const groups=reusable?previousGroups:(witness?.groups??[]);
  const reservation={groups,deadlines:deadlineRecord,fingerprint:reservationFingerprint(groups,deadlineRecord)};
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
  const feasible=reusable||(witness?.feasible??arrivals.length===0),exhausted=witness?.exhausted??false;
  return { feasible, branchesExplored: arrivalBranchesExplored, exhausted,
    arrivalChecks, arrivalBranchesExplored, arrivalBacktracks,
    arrivalPruned: !feasible&&!exhausted,
    arrivalWitnessDropped: previousGroups.length>0&&!feasible, transportEvidence,causalDiagnostic,
    transportFailure:null, pendingArrivalDeadline, exactPrerequisiteSearchesAvoided: 0,reservation,
    arrivalRepaired:previousGroups.length>0&&!reusable&&feasible };
}
