import type {
  PlannerNextProblem,
  OperationalMealPolicy,
  RoundSynchronizationPolicy,
  ScheduledRoundPreparation,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import {
  protectedMealBlocksSpace,
} from "./spaceMeals";
import { overlaps } from "./time";
import { roundPreparationId } from "./roundSynchronization";
import { findCanonicalPerfectMatching } from "./macroScheduling";
import { operationalMealCandidates } from "./operationalMeals";

export type ExactRoundSynchronizationOutcome =
  | "FOUND"
  | "DEAD_END"
  | "BUDGET_EXHAUSTED";

export interface ExactRoundSynchronizationEvidence {
  startCandidates: number;
  assignmentBranches: number;
  assignmentChecks: number;
  completeAssignments: number;
  backtracks: number;
  zeroAlternativePrunes: number;
  matchingAttempts: number;
  matchingSuccesses: number;
  assignmentBranchesAvoided: number;
  sharedOperationalMealPolicyIds: string[];
  breakVariantsConsidered: number;
  selectedBreakIntervals: Array<{ policyId:string;start:number;end:number }>;
  mealAwareShapesFeasible: number;
  noBreakHolePrunes: number;
}

export interface ExactRoundSynchronizationCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledRoundPreparation[];
  selectionOrder: string[];
  operationalMealReservations: Array<{ policyId:string;start:number;end:number }>;
}

export interface ExactRoundSynchronizationSearchResult {
  outcome: ExactRoundSynchronizationOutcome;
  evidence: ExactRoundSynchronizationEvidence;
}

export interface ExactRoundSynchronizationMacroDomain {
  domainSize: number;
  structuralCandidateCount: number;
  matchingFeasibleCandidateCount: number;
}

interface Slot {
  laneIndex: number;
  roundIndex: number;
  spaceId: string;
  start: number;
  end: number;
}
interface BreakReservation { policyId:string;start:number;end:number;afterRound:number }

const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id, "en");

const effectiveTaskResourceIds=(task:Task):string[]=>task.coachId===undefined
  ?[...(task.requiredResourceIds??[])]:[...(task.requiredResourceIds??[]),task.coachId];
const policyAffectsLane=(policy:OperationalMealPolicy,lane:RoundSynchronizationPolicy["lanes"][number],tasks:Map<string,Task>):boolean=>
  policy.spaceIds.includes(lane.spaceId)||lane.taskIds.some(id=>effectiveTaskResourceIds(tasks.get(id)!).some(resourceId=>policy.resourceIds.includes(resourceId)));
const sharedOperationalMealPolicies=(problem:PlannerNextProblem,policy:RoundSynchronizationPolicy):OperationalMealPolicy[]=>{
  const tasks=new Map(problem.tasks.map(task=>[task.id,task]));
  return [...(problem.operationalMealPolicies??[])].filter(meal=>policy.lanes.length>1
    &&policy.lanes.every(lane=>lane.taskIds.every(id=>tasks.has(id))&&policyAffectsLane(meal,lane,tasks)))
    .sort(byId);
};

function bridgeEnd(
  problem: PlannerNextProblem,
  spaceId: string,
  previousEnd: number,
  meals: ScheduledSpaceMeal[],
): number {
  const protectedMeal = problem.protectedMeal;
  if (protectedMeal && protectedMealBlocksSpace(problem, spaceId)
    && previousEnd === protectedMeal.start) {
    return protectedMeal.end;
  }
  const meal = meals.find((candidate) =>
    candidate.spaceId === spaceId && candidate.start === previousEnd);
  return meal?.end ?? previousEnd;
}

function intervalFitsSpace(
  problem: PlannerNextProblem,
  spaceId: string,
  start: number,
  end: number,
): boolean {
  const space = problem.spaces.find(({ id }) => id === spaceId);
  return Boolean(space?.availability.some((window) =>
    window.start <= start && end <= window.end));
}

function preparationAvoidsExistingOccupations(
  problem: PlannerNextProblem,
  preparation: ScheduledRoundPreparation,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  roundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
): boolean {
  if (preparation.start < problem.day.start || preparation.end > problem.day.end) return false;
  if (!intervalFitsSpace(problem, preparation.spaceId, preparation.start, preparation.end)) return false;
  if (problem.protectedMeal && protectedMealBlocksSpace(problem, preparation.spaceId)
    && overlaps(preparation, problem.protectedMeal)) return false;
  if (meals.some((meal) => meal.spaceId === preparation.spaceId && overlaps(meal, preparation))) return false;
  if (baseTasks.some((task) => task.spaceId === preparation.spaceId && overlaps(task, preparation))) return false;
  if (setupPreparations.some((item) => item.spaceId === preparation.spaceId && overlaps(item, preparation))) return false;
  if (roundPreparations.some((item) => item.spaceId === preparation.spaceId && overlaps(item, preparation))) return false;
  return true;
}

function buildSlots(
  problem: PlannerNextProblem,
  policy: RoundSynchronizationPolicy,
  firstStart: number,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
  breakReservations:readonly BreakReservation[]=[],
): { slots: Slot[]; preparations: ScheduledRoundPreparation[] } | null {
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneSlots: Slot[][] = [];
  const preparations: ScheduledRoundPreparation[] = [];

  for (const [laneIndex, lane] of policy.lanes.entries()) {
    const laneTasks = lane.taskIds.map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task));
    if (laneTasks.length !== lane.taskIds.length || laneTasks.length === 0) return null;
    const duration = laneTasks[0]!.duration;
    const slots: Slot[] = [];
    let start = firstStart;

    for (let index = 0; index < laneTasks.length; index += 1) {
      if (index > 0) {
        const previous = slots[index - 1]!;
        let preparationStart = bridgeEnd(problem, lane.spaceId, previous.end, meals);
        for(const reservation of breakReservations.filter(item=>item.afterRound===index).sort((a,b)=>a.start-b.start||a.policyId.localeCompare(b.policyId))){
          if(reservation.start<preparationStart)return null;
          preparationStart=reservation.end;
        }
        if (lane.preparationMinutesBetweenRounds > 0) {
          const preparation: ScheduledRoundPreparation = {
            id: roundPreparationId(policy.id, lane.spaceId, index + 1),
            kind: "round-preparation",
            synchronizationId: policy.id,
            spaceId: lane.spaceId,
            roundIndex: index + 1,
            duration: lane.preparationMinutesBetweenRounds,
            start: preparationStart,
            end: preparationStart + lane.preparationMinutesBetweenRounds,
          };
          if (!preparationAvoidsExistingOccupations(
            problem,
            preparation,
            baseTasks,
            setupPreparations,
            [...existingRoundPreparations, ...preparations],
            meals,
          )) return null;
          preparations.push(preparation);
          start = preparation.end;
        } else {
          start = preparationStart;
        }
      }
      const end = start + duration;
      if (start < problem.day.start || end > problem.day.end) return null;
      if (!intervalFitsSpace(problem, lane.spaceId, start, end)) return null;
      slots.push({ laneIndex, roundIndex: index + 1, spaceId: lane.spaceId, start, end });
    }
    laneSlots.push(slots);
  }

  const synchronizedCount = Math.min(...laneSlots.map((slots) => slots.length));
  for (let index = 0; index < synchronizedCount; index += 1) {
    const reference = laneSlots[0]![index]!;
    if (laneSlots.slice(1).some((slots) => {
      const candidate = slots[index]!;
      return candidate.start !== reference.start || candidate.end !== reference.end;
    })) return null;
  }

  return {
    slots: laneSlots.flat().sort((left, right) =>
      left.start - right.start || left.laneIndex - right.laneIndex || left.roundIndex - right.roundIndex),
    preparations: preparations.sort(byId),
  };
}

function breakReservationVariants(problem:PlannerNextProblem,policy:RoundSynchronizationPolicy,firstStart:number,
  baseTasks:ScheduledTask[],setupPreparations:ScheduledSetupPreparation[],existingRoundPreparations:ScheduledRoundPreparation[],
  meals:ScheduledSpaceMeal[]):{shared:OperationalMealPolicy[];variants:BreakReservation[][];considered:number;noHolePrunes:number}{
  const shared=sharedOperationalMealPolicies(problem,policy);
  if(!shared.length)return{shared,variants:[[]],considered:0,noHolePrunes:0};
  const baseShape=buildSlots(problem,policy,firstStart,baseTasks,setupPreparations,existingRoundPreparations,meals,[]);
  if(!baseShape)return{shared,variants:[],considered:0,noHolePrunes:shared.length};
  const synchronizedRounds=Math.min(...policy.lanes.map(lane=>lane.taskIds.length));
  let variants:BreakReservation[][]=[[]],considered=0,noHolePrunes=0;
  for(const mealPolicy of shared){
    const candidates=operationalMealCandidates(problem,mealPolicy,baseTasks,[]).filter(candidate=>
      !setupPreparations.some(preparation=>mealPolicy.spaceIds.includes(preparation.spaceId)&&overlaps(preparation,candidate))
      &&!existingRoundPreparations.some(preparation=>mealPolicy.spaceIds.includes(preparation.spaceId)&&overlaps(preparation,candidate)));
    const options:BreakReservation[]=[];
    for(let afterRound=1;afterRound<synchronizedRounds;afterRound+=1){
      const boundary=baseShape.slots.find(slot=>slot.laneIndex===0&&slot.roundIndex===afterRound)?.end;
      if(boundary===undefined)continue;
      const eligible=candidates.filter(candidate=>candidate.start>=boundary);
      const candidate=eligible.find(item=>item.start===boundary)??eligible[0];
      if(candidate){considered+=1;options.push({policyId:mealPolicy.id,start:candidate.start,end:candidate.end,afterRound});}
    }
    const canonical=[...new Map(options.map(option=>[JSON.stringify(option),option])).values()].sort((a,b)=>
      Number(a.start!==(baseShape.slots.find(slot=>slot.laneIndex===0&&slot.roundIndex===a.afterRound)?.end??-1))
      -Number(b.start!==(baseShape.slots.find(slot=>slot.laneIndex===0&&slot.roundIndex===b.afterRound)?.end??-1))
      ||a.afterRound-b.afterRound||a.start-b.start||a.policyId.localeCompare(b.policyId));
    if(!canonical.length){noHolePrunes+=1;return{shared,variants:[],considered,noHolePrunes};}
    variants=variants.flatMap(existing=>canonical.filter(option=>existing.every(other=>option.end<=other.start||other.end<=option.start
      ||!shared.some(item=>item.id===other.policyId&&(item.resourceIds.some(id=>mealPolicy.resourceIds.includes(id))||item.spaceIds.some(id=>mealPolicy.spaceIds.includes(id))))))
      .map(option=>[...existing,option]));
  }
  const feasible=variants.filter(reservations=>buildSlots(problem,policy,firstStart,baseTasks,setupPreparations,existingRoundPreparations,meals,reservations)!==null);
  return{shared,variants:feasible,considered,noHolePrunes:noHolePrunes+(feasible.length?0:1)};
}

function materializeMatchingCandidate(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  firstStart: number, baseTasks: ScheduledTask[], setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[], meals: ScheduledSpaceMeal[],breakReservations:readonly BreakReservation[]=[]): ExactRoundSynchronizationCandidate | null {
  const shape = buildSlots(problem, policy, firstStart, baseTasks, setupPreparations, existingRoundPreparations, meals,breakReservations);
  if (!shape) return null;
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneTasks = policy.lanes.map((lane) => lane.taskIds.map((id) => taskById.get(id))
    .filter((task): task is Task => Boolean(task)).sort(byId));
  if (laneTasks.some((tasks, index) => tasks.length !== policy.lanes[index]!.taskIds.length)) return null;
  const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;
  const slotById = new Map(shape.slots.map((slot) => [slotKey(slot), slot]));
  const allTasks = laneTasks.flat(), taskByMatchingId = new Map(allTasks.map((task) => [task.id, task]));
  const matching = findCanonicalPerfectMatching([...slotById.keys()], allTasks.map(({ id }) => id), (taskId, key) => {
    const task = taskByMatchingId.get(taskId)!, slot = slotById.get(key)!;
    return laneTasks[slot.laneIndex]!.some(({ id }) => id === taskId) && canPlaceTask(problem, task, slot.start, baseTasks, meals);
  });
  if (!matching) return null;
  const scheduled = [...matching].map(([key, taskId]) => {
    const slot = slotById.get(key)!;
    return scoreAuxiliaryTask(problem, taskByMatchingId.get(taskId)!, slot.start, baseTasks).scheduled;
  });
  if (scheduled.some((task) => !canPlaceTask(problem, task, task.start,
    [...baseTasks, ...scheduled.filter(({ id }) => id !== task.id)], meals))) return null;
  scheduled.sort((left, right) => left.start - right.start || byId(left, right));
  return { tasks: scheduled, preparations: [...shape.preparations], selectionOrder: scheduled.map(({ id }) => id),
    operationalMealReservations:breakReservations.map(({policyId,start,end})=>({policyId,start,end})) };
}

/** Counts hard-valid synchronized temporal shapes without consuming the shared search ledger. */
export function probeExactRoundSynchronizationMacroDomain(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  baseTasks: ScheduledTask[], setupPreparations: ScheduledSetupPreparation[], existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[]): ExactRoundSynchronizationMacroDomain {
  let structuralCandidateCount = 0, matchingFeasibleCandidateCount = 0;
  for (let start = problem.day.start; start < problem.day.end; start += 5) {
    const reservationVariants=breakReservationVariants(problem,policy,start,baseTasks,setupPreparations,existingRoundPreparations,meals).variants;
    for(const reservations of reservationVariants){
      if (buildSlots(problem, policy, start, baseTasks, setupPreparations, existingRoundPreparations, meals,reservations)) structuralCandidateCount += 1;
      if (materializeMatchingCandidate(problem, policy, start, baseTasks, setupPreparations, existingRoundPreparations, meals,reservations)) matchingFeasibleCandidateCount += 1;
    }
  }
  return { domainSize: matchingFeasibleCandidateCount, structuralCandidateCount, matchingFeasibleCandidateCount };
}

/**
 * Explores one generic two-lane synchronized round policy under the shared exact ledger.
 * The policy task arrays are treated as eligible sets, never as an authoritative order.
 */
export function exploreExactRoundSynchronizationPolicy(
  problem: PlannerNextProblem,
  policy: RoundSynchronizationPolicy,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  continuation: (candidate: ExactRoundSynchronizationCandidate) => ExactRoundSynchronizationOutcome,
): ExactRoundSynchronizationSearchResult {
  const evidence: ExactRoundSynchronizationEvidence = {
    startCandidates: 0,
    assignmentBranches: 0,
    assignmentChecks: 0,
    completeAssignments: 0,
    backtracks: 0,
    zeroAlternativePrunes: 0,
    matchingAttempts: 0,
    matchingSuccesses: 0,
    assignmentBranchesAvoided: 0,
    sharedOperationalMealPolicyIds:sharedOperationalMealPolicies(problem,policy).map(({id})=>id),breakVariantsConsidered:0,
    selectedBreakIntervals:[],mealAwareShapesFeasible:0,noBreakHolePrunes:0,
  };
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneTasks = policy.lanes.map((lane) =>
    lane.taskIds.map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task)).sort(byId));
  if (laneTasks.some((tasks, index) => tasks.length !== policy.lanes[index]!.taskIds.length)) {
    return { outcome: "DEAD_END", evidence };
  }

  for (let firstStart = problem.day.start; firstStart < problem.day.end; firstStart += 5) {
    evidence.startCandidates += 1;
    const reservationProbe=breakReservationVariants(problem,policy,firstStart,baseTasks,setupPreparations,existingRoundPreparations,meals);
    evidence.breakVariantsConsidered+=reservationProbe.considered;evidence.noBreakHolePrunes+=reservationProbe.noHolePrunes;
    for(const reservations of reservationProbe.variants){
    const shape = buildSlots(problem,policy,firstStart,baseTasks,setupPreparations,existingRoundPreparations,meals,reservations);
    if (!shape) continue;evidence.mealAwareShapesFeasible+=Number(reservations.length>0);

    const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;
    if (!ledger.consume("STANDALONE")) return { outcome: "BUDGET_EXHAUSTED", evidence };
    evidence.assignmentBranches += 1;
    evidence.matchingAttempts += 1;
    const slotById = new Map(shape.slots.map((slot) => [slotKey(slot), slot]));
    const allTasks = laneTasks.flat();
    const taskByMatchingId = new Map(allTasks.map((task) => [task.id, task]));
    const matching = findCanonicalPerfectMatching(
      [...slotById.keys()],
      allTasks.map(({ id }) => id),
      (taskId, key) => {
        evidence.assignmentChecks += 1;
        const task = taskByMatchingId.get(taskId)!;
        const slot = slotById.get(key)!;
        return laneTasks[slot.laneIndex]!.some(({ id }) => id === taskId)
          && canPlaceTask(problem, task, slot.start, baseTasks, meals);
      },
    );
    if (!matching) {
      evidence.zeroAlternativePrunes += 1;
      continue;
    }
    const scheduled = [...matching].map(([key, taskId]) => {
      const slot = slotById.get(key)!;
      return scoreAuxiliaryTask(problem, taskByMatchingId.get(taskId)!, slot.start, baseTasks).scheduled;
    });
    if (scheduled.some((task) => !canPlaceTask(problem, task, task.start,
      [...baseTasks, ...scheduled.filter(({ id }) => id !== task.id)], meals))) {
      evidence.zeroAlternativePrunes += 1;
      continue;
    }
    evidence.matchingSuccesses += 1;
    evidence.assignmentBranchesAvoided += Math.max(0, allTasks.length - 1);
    evidence.completeAssignments += 1;
    const outcome = continuation({
      tasks: scheduled.sort((left, right) => left.start - right.start || byId(left, right)),
      preparations: [...shape.preparations],
      selectionOrder: scheduled.map(({ id }) => id),
      operationalMealReservations:reservations.map(({policyId,start,end})=>({policyId,start,end})),
    });
    if(outcome!=="DEAD_END")evidence.selectedBreakIntervals=reservations.map(({policyId,start,end})=>({policyId,start,end}));
    if (outcome !== "DEAD_END") return { outcome, evidence };
    evidence.backtracks += 1;
    }
  }

  return { outcome: "DEAD_END", evidence };
}
