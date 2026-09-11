import type {
  PlannerNextProblem,
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
import {
  operationalMealBoundaryIntervalAvailable,
  operationalMealPoliciesClosedByTaskIds,
} from "./operationalMeals";
import type { PrerequisiteAwareSlotAuthority } from "./prerequisiteAwareSlotFeasibility";

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
  prerequisiteAwareGeometriesEliminated: number;
  firstPrerequisiteAwareStart: number | null;
  geometryPrerequisiteEnvelopeChecks: number;
  geometryPrerequisiteEnvelopePrunes: number;
  logicalMatchingCandidatesAvoidedByEnvelope: number;
  firstFeedableCompactStart: number | null;
  arrivalInjectiveChecks: number;
  arrivalInjectivePrunes: number;
  edgeDeadlineChecks: number;
  maxMatchingChecks: number;
  firstCertificate: { cutoff: number; minimumDemand: number; maximumPossible: number } | null;
  firstAbstention: { reason: string; taskCount: number; distinctParticipantCount: number } | null;
}

export interface ExactRoundSynchronizationCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledRoundPreparation[];
  selectionOrder: string[];
}

export interface ExactRoundSynchronizationSearchResult {
  outcome: ExactRoundSynchronizationOutcome;
  evidence: ExactRoundSynchronizationEvidence;
}

export interface ExactRoundSynchronizationMacroDomain {
  domainSize: number;
  structuralCandidateCount?: number;
  matchingFeasibleCandidateCount?: number;
  domainExact: false;
}

interface Slot {
  laneIndex: number;
  roundIndex: number;
  spaceId: string;
  start: number;
  end: number;
}

interface MealGapShape {
  readonly durationByBoundary: ReadonlyMap<number, number>;
  readonly boundaryByPolicyId: ReadonlyMap<string, number>;
}

function mealGapShapes(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy): MealGapShape[] {
  const roundCount = Math.max(...policy.lanes.map((lane) => lane.taskIds.length));
  const closed = operationalMealPoliciesClosedByTaskIds(problem, policy.lanes.flatMap((lane) => lane.taskIds));
  if (closed.length === 0) return [{ durationByBoundary: new Map(), boundaryByPolicyId: new Map() }];
  if (roundCount < 2) return [];
  const shapes: MealGapShape[] = [];
  const assign = (index: number, boundaries: number[]): void => {
    if (index === closed.length) {
      const durations = new Map<number, number>();
      const boundaryByPolicyId = new Map<string, number>();
      boundaries.forEach((boundary, policyIndex) => {
        const mealPolicy = closed[policyIndex]!;
        boundaryByPolicyId.set(mealPolicy.id, boundary);
        durations.set(boundary, Math.max(durations.get(boundary) ?? 0, mealPolicy.duration));
      });
      shapes.push({ durationByBoundary: durations, boundaryByPolicyId });
      return;
    }
    for (let boundary = 1; boundary < roundCount; boundary += 1) {
      assign(index + 1, [...boundaries, boundary]);
    }
  };
  assign(0, []);
  return shapes;
}

const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id, "en");

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
  mealGap: MealGapShape,
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
        const boundary = index;
        const gapDuration = mealGap.durationByBoundary.get(boundary) ?? 0;
        const preparationStart = bridgeEnd(problem, lane.spaceId, previous.end + gapDuration, meals);
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

function gapShapeIsHardValid(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  firstStart: number, baseTasks: ScheduledTask[], shape: MealGapShape): boolean {
  const closed = operationalMealPoliciesClosedByTaskIds(problem, policy.lanes.flatMap((lane) => lane.taskIds));
  if (closed.length === 0) return true;
  const duration = policy.lanes[0]?.taskIds.length
    ? problem.tasks.find((task) => task.id === policy.lanes[0]!.taskIds[0])?.duration : undefined;
  if (duration === undefined) return false;
  const boundaryStarts = new Map<number, number>();
  const roundCount = Math.max(...policy.lanes.map((lane) => lane.taskIds.length));
  for (let boundary = 1; boundary < roundCount; boundary += 1) {
    const continuingLane = policy.lanes.find((lane) => lane.taskIds.length > boundary);
    if (!continuingLane) continue;
    const start = firstStart + boundary * duration
      + Array.from({ length: boundary - 1 }, (_, index) => continuingLane.preparationMinutesBetweenRounds
        + (shape.durationByBoundary.get(index + 1) ?? 0)).reduce((sum, value) => sum + value, 0);
    const gapDuration = shape.durationByBoundary.get(boundary) ?? 0;
    if (gapDuration > 0) boundaryStarts.set(boundary, start);
  }
  return closed.every((mealPolicy) => {
    const boundary = shape.boundaryByPolicyId.get(mealPolicy.id);
    const start = boundary === undefined ? undefined : boundaryStarts.get(boundary);
    return start !== undefined && operationalMealBoundaryIntervalAvailable(problem, mealPolicy, baseTasks, start);
  });
}

/**
 * Conservative, branch-free MRV estimate. It deliberately does not build slots,
 * call placement authorities, or run matching: those materially distinct choices
 * are evaluated exactly once by exploreExactRoundSynchronizationPolicy.
 */
export function probeExactRoundSynchronizationMacroDomain(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  _baseTasks: ScheduledTask[], _setupPreparations: ScheduledSetupPreparation[], _existingRoundPreparations: ScheduledRoundPreparation[],
  _meals: ScheduledSpaceMeal[]): ExactRoundSynchronizationMacroDomain {
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const complete = policy.lanes.every((lane) => lane.taskIds.length > 0
    && lane.taskIds.every((id) => taskById.has(id)));
  if (!complete) return { domainSize: 0, domainExact: false };
  let feasibleStartRanges = [{ start: problem.day.start, end: problem.day.end }];
  for (const lane of policy.lanes) {
    const duration = taskById.get(lane.taskIds[0]!)!.duration;
    const minimumSpan = lane.taskIds.length * duration
      + Math.max(0, lane.taskIds.length - 1) * lane.preparationMinutesBetweenRounds;
    const laneRanges = (problem.spaces.find(({ id }) => id === lane.spaceId)?.availability ?? [])
      .map(({ start, end }) => ({ start, end: end - minimumSpan }))
      .filter(({ start, end }) => start <= end);
    feasibleStartRanges = feasibleStartRanges.flatMap((current) => laneRanges.map((candidate) => ({
      start: Math.max(current.start, candidate.start), end: Math.min(current.end, candidate.end),
    })).filter(({ start, end }) => start <= end));
  }
  const starts = feasibleStartRanges.reduce((sum, { start, end }) => {
    const first = problem.day.start + Math.ceil((start - problem.day.start) / 5) * 5;
    return sum + Math.max(0, Math.floor((end - first) / 5) + 1);
  }, 0);
  if (starts === 0) return { domainSize: 0, domainExact: false };
  const boundaries = Math.max(...policy.lanes.map((lane) => lane.taskIds.length)) - 1;
  const closedPolicyCount = operationalMealPoliciesClosedByTaskIds(
    problem, policy.lanes.flatMap((lane) => lane.taskIds),
  ).length;
  const gapShapeUpperBound = closedPolicyCount === 0 ? 1 : Math.max(1, boundaries) ** closedPolicyCount;
  const upperBound = starts * gapShapeUpperBound;
  return { domainSize: upperBound, domainExact: false };
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
  prerequisiteAwareSlot?: PrerequisiteAwareSlotAuthority,
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
    prerequisiteAwareGeometriesEliminated: 0,
    firstPrerequisiteAwareStart: null,
    geometryPrerequisiteEnvelopeChecks: 0, geometryPrerequisiteEnvelopePrunes: 0,
    logicalMatchingCandidatesAvoidedByEnvelope: 0, firstFeedableCompactStart: null,
    arrivalInjectiveChecks: 0, arrivalInjectivePrunes: 0, edgeDeadlineChecks: 0, maxMatchingChecks: 0,
    firstCertificate: null, firstAbstention: null,
  };
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneTasks = policy.lanes.map((lane) =>
    lane.taskIds.map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task)).sort(byId));
  if (laneTasks.some((tasks, index) => tasks.length !== policy.lanes[index]!.taskIds.length)) {
    return { outcome: "DEAD_END", evidence };
  }

  for (let firstStart = problem.day.start; firstStart < problem.day.end; firstStart += 5) {
    evidence.startCandidates += 1;
    for (const gap of mealGapShapes(problem, policy)) {
      if (!gapShapeIsHardValid(problem, policy, firstStart, baseTasks, gap)) continue;
      const shape = buildSlots(
        problem,
        policy,
        firstStart,
        baseTasks,
        setupPreparations,
        existingRoundPreparations,
        meals,
        gap,
      );
      if (!shape) continue;

      const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;
      const slotById = new Map(shape.slots.map((slot) => [slotKey(slot), slot]));
      const allTasks = laneTasks.flat();
      const taskByMatchingId = new Map(allTasks.map((task) => [task.id, task]));
      const compatibleEdges=new Map<string,boolean>();
      const compatible=(taskId:string,key:string):boolean=>{
        const edgeKey=`${taskId}\u0000${key}`,cached=compatibleEdges.get(edgeKey);if(cached!==undefined)return cached;
        evidence.assignmentChecks+=1;const task=taskByMatchingId.get(taskId)!,slot=slotById.get(key)!;
        const accepted=laneTasks[slot.laneIndex]!.some(({id})=>id===taskId)
          &&canPlaceTask(problem,task,slot.start,baseTasks,meals)
          &&prerequisiteAwareSlot?.(task,slot.start)!=="PROVEN_IMPOSSIBLE";
        compatibleEdges.set(edgeKey,accepted);return accepted;
      };
      const compatibleStarts=new Map(allTasks.map(task=>[task.id,[...slotById]
        .filter(([key])=>compatible(task.id,key)).map(([,slot])=>slot.start)]));
      if(prerequisiteAwareSlot?.geometryFeasible&&[...compatibleStarts.values()].every(domain=>domain.length)){
        evidence.geometryPrerequisiteEnvelopeChecks+=1;
        const bounds=allTasks.map(task=>({task,start:Math.max(...compatibleStarts.get(task.id)!)}));
        if(prerequisiteAwareSlot.geometryFeasible(bounds)==="PROVEN_IMPOSSIBLE"){
          evidence.geometryPrerequisiteEnvelopePrunes+=1;
          evidence.logicalMatchingCandidatesAvoidedByEnvelope+=1;
          evidence.prerequisiteAwareGeometriesEliminated+=1;
          continue;
        }
        if(evidence.firstFeedableCompactStart===null)evidence.firstFeedableCompactStart=firstStart;
      }
      if(prerequisiteAwareSlot?.arrivalInjectiveFeasible){
        const edges=allTasks.flatMap(task=>[...slotById]
          .filter(([key])=>compatible(task.id,key))
          .map(([slotId,slot])=>({task,slotId,start:slot.start})));
        const assessment=prerequisiteAwareSlot.arrivalInjectiveFeasible(edges);
        evidence.edgeDeadlineChecks+=assessment.edgeDeadlineChecks;
        evidence.maxMatchingChecks+=assessment.maxMatchingChecks;
        if(assessment.checked)evidence.arrivalInjectiveChecks+=1;
        else if(assessment.abstention&&evidence.firstAbstention===null)
          evidence.firstAbstention={...assessment.abstention};
        if(assessment.verdict==="PROVEN_IMPOSSIBLE"){
          evidence.arrivalInjectivePrunes+=1;
          evidence.prerequisiteAwareGeometriesEliminated+=1;
          evidence.logicalMatchingCandidatesAvoidedByEnvelope+=1;
          if(evidence.firstCertificate===null)evidence.firstCertificate=assessment.firstCertificate;
          continue;
        }
      }
      evidence.matchingAttempts += 1;
      const matching = findCanonicalPerfectMatching(
        [...slotById.keys()],
        allTasks.map(({ id }) => id),
        compatible,
      );
      if (!matching) {
        evidence.zeroAlternativePrunes += 1;
        evidence.prerequisiteAwareGeometriesEliminated += 1;
        continue;
      }
      if (evidence.firstPrerequisiteAwareStart === null) evidence.firstPrerequisiteAwareStart = firstStart;
      if (!ledger.consume("STANDALONE")) return { outcome: "BUDGET_EXHAUSTED", evidence };
      evidence.assignmentBranches += 1;
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
      });
      if (outcome !== "DEAD_END") return { outcome, evidence };
      evidence.backtracks += 1;
    }
  }

  return { outcome: "DEAD_END", evidence };
}
