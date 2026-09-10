import type {
  PlannerNextProblem,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { findCanonicalPerfectMatching } from "./macroScheduling";
import { prepareTaskPlacementAuthority } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { eligibleSetupTasksForPolicy, setupFamilySequence } from "./setupGrouping";
import {
  createSetupPreparation,
  preparationAvoidsOccupations,
  preparationWithinAvailability,
  preparationWithinDay,
  setupPreparationDuration,
  spaceOccupations,
} from "./setupPreparation";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import type { PrerequisiteAwareSlotAuthority } from "./prerequisiteAwareSlotFeasibility";
import type { ArrivalInjectiveEnvelopeAssessment } from "./prerequisiteAwareSlotFeasibility";

export interface ExactSetupBlockCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledSetupPreparation[];
  cost: number;
  geometryIdleMinutes: number;
  geometrySpanMinutes: number;
  matchingRepairIndex: number;
}

export interface ExactSetupBlockGenerationEvidence {
  branchesExplored: number;
  startsExplored: number;
  maximumDepth: number;
  completeCandidateCount: number;
  familyOrderCandidateCounts: Record<string, number>;
  matchingAttempts: number;
  matchingSuccesses: number;
  matchingRepairs: number;
  permutationBranchesAvoided: number;
  minimumIdleMinutes: number | null;
  maximumIdleMinutes: number | null;
  compactGeometriesTried: number;
  compactGeometryMatchingRepairs: number;
  geometriesAbandonedAfterMatchingExhaustion: number;
  firstSuccessfulGeometry: { idleMinutes: number; spanMinutes: number } | null;
  firstSuccessfulMatchingRepairIndex: number | null;
  matchingSearchSteps: number;
  prerequisiteAwareGeometriesEliminated: number;
  prerequisiteAwareMatchingRepairsAvoided: number;
  firstPrerequisiteAwareCompactStart: number | null;
  geometryPrerequisiteEnvelopeChecks: number;
  geometryPrerequisiteEnvelopePrunes: number;
  logicalMatchingCandidatesAvoidedByEnvelope: number;
  firstFeedableCompactStart: number | null;
  arrivalInjectiveEnvelopeChecks: number;
  arrivalInjectiveEnvelopePrunes: number;
  arrivalInjectiveFixedPrefixTasksChecked: number;
  arrivalInjectiveEdgeDeadlineChecks: number;
  arrivalInjectiveMaxMatchingChecks: number;
  firstArrivalInjectiveCertificate: { cutoff: number; minimumDemand: number; maximumPossible: number } | null;
  firstArrivalInjectiveCertificateFixedPrefixTaskCount: number | null;
  firstArrivalInjectiveAbstention: (NonNullable<ArrivalInjectiveEnvelopeAssessment["abstention"]> & {
    fixedPrefixTaskCount: number;
  }) | null;
}

export interface ExactSetupBlockGenerationResult {
  outcome: "COMPLETE" | "BUDGET_EXHAUSTED";
  candidates: ExactSetupBlockCandidate[];
  evidence: ExactSetupBlockGenerationEvidence;
}

export interface ExactSetupMacroDomain {
  domainSize: number;
  structuralCandidateCount: number;
  matchingFeasibleCandidateCount: number;
  /** The compact/canonical projection is only a heuristic for the gap-complete hard domain. */
  domainExact: false;
}

export interface ExactSetupBlockExplorer {
  nextCandidate(): ExactSetupBlockCandidate | null;
  recordCandidateOutcome(successful: boolean): void;
  readonly exhausted: boolean;
  readonly evidence: ExactSetupBlockGenerationEvidence;
}

const byId = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id);
const edgeKey = (slotId: string, taskId: string): string => `${slotId}\u0000${taskId}`;
const matchingSignature = (matching: ReadonlyMap<string, string>): string => [...matching]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([slotId, taskId]) => `${slotId}:${taskId}`)
  .join("|");
const candidateSignature = (candidate: ExactSetupBlockCandidate): string => [
  ...candidate.tasks.slice().sort(byId).map((task) => `${task.id}@${task.start}-${task.end}`),
  ...candidate.preparations.slice().sort(byId).map((item) => `${item.id}@${item.start}-${item.end}`),
].join("|");

/** Enumerates a matching frontier by deterministic edge exclusions, never by permutation DFS. */
function* constrainedMatchings(
  slotIds: string[],
  taskIds: string[],
  compatible: (taskId: string, slotId: string) => boolean,
  onSearch: () => void,
): Generator<ReadonlyMap<string, string>> {
  const frontier: Set<string>[] = [new Set()];
  const seenConstraints = new Set([""]);
  const seenMatchings = new Set<string>();
  while (frontier.length > 0) {
    const forbidden = frontier.shift()!;
    onSearch();
    const matching = findCanonicalPerfectMatching(slotIds, taskIds,
      (taskId, slotId) => !forbidden.has(edgeKey(slotId, taskId)) && compatible(taskId, slotId));
    if (!matching) continue;
    const signature = matchingSignature(matching);
    if (!seenMatchings.has(signature)) {
      seenMatchings.add(signature);
      yield matching;
    }
    for (const [slotId, taskId] of [...matching].sort(([left], [right]) => left.localeCompare(right))) {
      const next = new Set(forbidden);
      next.add(edgeKey(slotId, taskId));
      const constraintSignature = [...next].sort().join("|");
      if (!seenConstraints.has(constraintSignature)) {
        seenConstraints.add(constraintSignature);
        frontier.push(next);
      }
    }
  }
}

function* slotGeometries(
  start: number,
  duration: number,
  count: number,
  dayEnd: number,
  fallback: boolean,
): Generator<number[]> {
  const compactSpan = count * duration;
  for (let span = fallback ? compactSpan + 5 : compactSpan; start + span <= dayEnd; span += 5) {
    if (!fallback && span > compactSpan) return;
    const last = start + span - duration;
    function* choose(prefix: number[]): Generator<number[]> {
      if (prefix.length === count - 1) {
        yield [...prefix, last];
        return;
      }
      const floor = prefix.at(-1)! + duration;
      const remaining = count - 1 - prefix.length;
      for (let next = floor; next + remaining * duration <= last; next += 5) yield* choose([...prefix, next]);
    }
    if (count === 1) yield [start];
    else yield* choose([start]);
  }
}

export function createExactSetupBlockExplorer(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  options: { compactOnly?: boolean; canonicalOnly?: boolean;
    prerequisiteAwareSlot?: PrerequisiteAwareSlotAuthority } = {},
): ExactSetupBlockExplorer {
  const ordered = [...tasks].sort(byId);
  const spaceId = ordered[0]?.spaceId;
  const space = problem.spaces.find((candidate) => candidate.id === spaceId);
  const policy = space?.setupPolicy;
  const evidence: ExactSetupBlockGenerationEvidence = {
    branchesExplored: 0, startsExplored: 0, maximumDepth: 0, completeCandidateCount: 0,
    familyOrderCandidateCounts: {}, matchingAttempts: 0, matchingSuccesses: 0,
    matchingRepairs: 0, permutationBranchesAvoided: 0, minimumIdleMinutes: null, maximumIdleMinutes: null,
    compactGeometriesTried: 0, compactGeometryMatchingRepairs: 0,
    geometriesAbandonedAfterMatchingExhaustion: 0, firstSuccessfulGeometry: null,
    firstSuccessfulMatchingRepairIndex: null, matchingSearchSteps: 0,
    prerequisiteAwareGeometriesEliminated: 0, prerequisiteAwareMatchingRepairsAvoided: 0,
    firstPrerequisiteAwareCompactStart: null,
    geometryPrerequisiteEnvelopeChecks: 0, geometryPrerequisiteEnvelopePrunes: 0,
    logicalMatchingCandidatesAvoidedByEnvelope: 0, firstFeedableCompactStart: null,
    arrivalInjectiveEnvelopeChecks: 0, arrivalInjectiveEnvelopePrunes: 0,
    arrivalInjectiveFixedPrefixTasksChecked: 0,
    arrivalInjectiveEdgeDeadlineChecks: 0, arrivalInjectiveMaxMatchingChecks: 0,
    firstArrivalInjectiveCertificate: null, firstArrivalInjectiveCertificateFixedPrefixTaskCount: null,
    firstArrivalInjectiveAbstention: null,
  };
  let budgetExhausted = false;
  let pendingOutcome: ExactSetupBlockCandidate | null = null;

  function* candidates(): Generator<ExactSetupBlockCandidate> {
    if (!spaceId || !space || !policy || ordered.length === 0
      || ordered.some((task) => task.spaceId !== spaceId || task.setupFamilyId === undefined)) return;

    function* visit(
      canonicalStart: number,
      remaining: Task[],
      partial: ScheduledTask[],
      partialPreparations: ScheduledSetupPreparation[],
      cost: number,
      fallback: boolean,
      repairIndex: number,
      repairsEnabled: boolean,
      repaired: boolean,
    ): Generator<ExactSetupBlockCandidate> {
      evidence.maximumDepth = Math.max(evidence.maximumDepth, partial.length);
      if (remaining.length === 0) {
        if (repairsEnabled && !repaired) return;
        const start = Math.min(...partial.map((task) => task.start));
        const end = Math.max(...partial.map((task) => task.end));
        const idleMinutes = partial.reduce((sum, task, index, all) => index > 0
          && all[index - 1]!.setupFamilyId === task.setupFamilyId ? sum + task.start - all[index - 1]!.end : sum, 0);
        const candidate = { tasks: partial, preparations: partialPreparations, cost,
          geometryIdleMinutes: idleMinutes, geometrySpanMinutes: end - start, matchingRepairIndex: repairIndex };
        const key = setupFamilySequence(partial).join(">");
        evidence.familyOrderCandidateCounts[key] = (evidence.familyOrderCandidateCounts[key] ?? 0) + 1;
        evidence.completeCandidateCount += 1;
        evidence.minimumIdleMinutes = Math.min(evidence.minimumIdleMinutes ?? idleMinutes, idleMinutes);
        evidence.maximumIdleMinutes = Math.max(evidence.maximumIdleMinutes ?? idleMinutes, idleMinutes);
        yield candidate;
        return;
      }

      const families = [...new Set(eligibleSetupTasksForPolicy(remaining, partial, policy)
        .map((task) => task.setupFamilyId!))].sort();
      for (const familyId of families) {
        const familyTasks = remaining.filter((task) => task.setupFamilyId === familyId).sort(byId);
        const durations = [...new Set(familyTasks.map((task) => task.duration))];
        if (durations.length !== 1) continue;
        const cursor = partial.at(-1)?.end ?? canonicalStart;
        const preparationDuration = setupPreparationDuration(policy, familyId, partial.length > 0);
        const preparation = preparationDuration === undefined ? undefined
          : createSetupPreparation(spaceId, familyId, 1, preparationDuration, cursor);
        const earliest = preparation?.end ?? cursor;
        const priorTasks = [...placed, ...partial];
        const priorPreparations = [...preparations, ...partialPreparations];
        if (preparation && (!preparationWithinDay(problem, preparation)
          || !preparationWithinAvailability(space.availability, preparation)
          || !occupationAvoidsProtectedMeal(problem, spaceId, preparation.start, preparation.end)
          || !preparationAvoidsOccupations(preparation, spaceOccupations(priorTasks, priorPreparations, spaceId, meals)))) continue;
        const authorities = new Map(familyTasks.map((task) => [task.id,
          prepareTaskPlacementAuthority(problem, task, priorTasks, meals)]));

        for (const starts of slotGeometries(earliest, durations[0]!, familyTasks.length, problem.day.end, fallback)) {
          if (!ledger.consume("STANDALONE")) { budgetExhausted = true; return; }
          evidence.branchesExplored += 1;
          const compact = starts.at(-1)! + durations[0]! - starts[0]! === familyTasks.length * durations[0]!;
          if (compact) evidence.compactGeometriesTried += 1;
          const slotIds = starts.map((_start, index) => `${familyId}:${index}`);
          evidence.matchingAttempts += 1;
          const compatible = (taskId: string, slotId: string): boolean => {
            const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
            const task = familyTasks.find((candidate) => candidate.id === taskId)!;
            const authority = authorities.get(taskId)!;
            return authority.accepts(starts[index]!, authority.baseDomain)
              && options.prerequisiteAwareSlot?.(task, starts[index]!) !== "PROVEN_IMPOSSIBLE";
          };
          const compatibleStarts=new Map(familyTasks.map(task=>[task.id,slotIds
            .filter(slotId=>compatible(task.id,slotId))
            .map(slotId=>starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!) ]));
          if(options.prerequisiteAwareSlot?.geometryFeasible&&[...compatibleStarts.values()].every(domain=>domain.length)){
            evidence.geometryPrerequisiteEnvelopeChecks+=1;
            const bounds=familyTasks.map(task=>({task,start:Math.max(...compatibleStarts.get(task.id)!)}));
            if(options.prerequisiteAwareSlot.geometryFeasible(bounds)==="PROVEN_IMPOSSIBLE"){
              evidence.geometryPrerequisiteEnvelopePrunes+=1;
              evidence.logicalMatchingCandidatesAvoidedByEnvelope+=1;
              evidence.prerequisiteAwareGeometriesEliminated+=1;
              evidence.prerequisiteAwareMatchingRepairsAvoided+=1;
              continue;
            }
            if(compact&&evidence.firstFeedableCompactStart===null)evidence.firstFeedableCompactStart=starts[0]!;
          }
          if(options.prerequisiteAwareSlot?.arrivalInjectiveFeasible){
            const occupiedSlotIds=new Set(slotIds);
            const fixedPrefixEdges=partial.map((task,index)=>{
              let slotId=`fixed-prefix:${index}`;
              while(occupiedSlotIds.has(slotId))slotId=`fixed-prefix:${slotId}`;
              occupiedSlotIds.add(slotId);
              return {task,slotId,start:task.start};
            });
            const edges=[...fixedPrefixEdges,...familyTasks.flatMap(task=>slotIds.filter(slotId=>compatible(task.id,slotId)).map(slotId=>({
              task,slotId,start:starts[Number(slotId.slice(slotId.lastIndexOf(":")+1))]!,
            })))];
            const assessment=options.prerequisiteAwareSlot.arrivalInjectiveFeasible(edges);
            if(!assessment.checked&&assessment.abstention&&evidence.firstArrivalInjectiveAbstention===null)
              evidence.firstArrivalInjectiveAbstention={...assessment.abstention,
                fixedPrefixTaskCount:fixedPrefixEdges.length};
            evidence.arrivalInjectiveEdgeDeadlineChecks+=assessment.edgeDeadlineChecks;
            evidence.arrivalInjectiveMaxMatchingChecks+=assessment.maxMatchingChecks;
            if(assessment.checked){
              evidence.arrivalInjectiveEnvelopeChecks+=1;
              evidence.arrivalInjectiveFixedPrefixTasksChecked+=fixedPrefixEdges.length;
            }
            if(assessment.verdict==="PROVEN_IMPOSSIBLE"){
              evidence.arrivalInjectiveEnvelopePrunes+=1;
              if(evidence.firstArrivalInjectiveCertificate===null){
                evidence.firstArrivalInjectiveCertificate=assessment.firstCertificate;
                evidence.firstArrivalInjectiveCertificateFixedPrefixTaskCount=fixedPrefixEdges.length;
              }
              evidence.logicalMatchingCandidatesAvoidedByEnvelope+=1;
              evidence.prerequisiteAwareGeometriesEliminated+=1;
              evidence.prerequisiteAwareMatchingRepairsAvoided+=1;
              continue;
            }
          }
          evidence.matchingSearchSteps += 1;
          if (!findCanonicalPerfectMatching(slotIds, familyTasks.map(({ id }) => id), compatible)) {
            evidence.prerequisiteAwareGeometriesEliminated += 1;
            evidence.prerequisiteAwareMatchingRepairsAvoided += 1;
            continue;
          }
          if (compact && evidence.firstPrerequisiteAwareCompactStart === null)
            evidence.firstPrerequisiteAwareCompactStart = starts[0]!;
          let matchingIndex = 0;
          let yieldedForGeometry = false;
          for (const matching of constrainedMatchings(slotIds, familyTasks.map(({ id }) => id), compatible,
            () => { evidence.matchingSearchSteps += 1; })) {
            if ((options.canonicalOnly || !repairsEnabled) && matchingIndex > 0) break;
            if (matchingIndex > 0) {
              if (!ledger.consume("STANDALONE")) { budgetExhausted = true; return; }
              evidence.branchesExplored += 1;
              evidence.matchingRepairs += 1;
              if (compact) evidence.compactGeometryMatchingRepairs += 1;
            }
            evidence.matchingSuccesses += 1;
            const currentRepairIndex = matchingIndex;
            matchingIndex += 1;
            const scheduled = [...matching].map(([slotId, taskId]) => {
              const task = familyTasks.find((candidate) => candidate.id === taskId)!;
              const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
              return scoreAuxiliaryTask(problem, task, starts[index]!, priorTasks).scheduled;
            }).sort((left, right) => left.start - right.start || byId(left, right));
            if (scheduled.some((task) => !authorities.get(task.id)!.accepts(task.start,
              authorities.get(task.id)!.domain(scheduled.filter((peer) => peer.id !== task.id))))) continue;
            yieldedForGeometry = true;
            evidence.permutationBranchesAvoided += Math.max(0, familyTasks.length - 1);
            yield* visit(canonicalStart, remaining.filter((task) => task.setupFamilyId !== familyId),
              [...partial, ...scheduled], preparation ? [...partialPreparations, preparation] : partialPreparations,
              cost + scheduled.reduce((sum, task) => sum + scoreAuxiliaryTask(problem,
                familyTasks.find((candidate) => candidate.id === task.id)!, task.start, priorTasks).cost, 0),
              fallback, Math.max(repairIndex, currentRepairIndex), repairsEnabled,
              repaired || currentRepairIndex > 0);
            if (budgetExhausted) return;
          }
          if (yieldedForGeometry) evidence.geometriesAbandonedAfterMatchingExhaustion += 1;
        }
      }
    }

    // FAST/PREFERRED: try every canonical compact geometry before spending branches
    // on compact matching repairs, then repeat those two passes for gapped geometry.
    // Cost remains the first historical ranking key when callers materialize the full domain.
    for (const fallback of options.compactOnly ? [false] : [false, true]) {
      for (const repairsEnabled of options.canonicalOnly ? [false] : [false, true]) {
        for (let start = problem.day.start; start < problem.day.end; start += 5) {
          evidence.startsExplored += 1;
          yield* visit(start, ordered, [], [], 0, fallback, 0, repairsEnabled, false);
          if (budgetExhausted) return;
        }
      }
    }
  }

  const iterator = candidates();
  let done = false;
  return {
    get exhausted() { return budgetExhausted; },
    evidence,
    nextCandidate() {
      if (done) return null;
      pendingOutcome = null;
      const next = iterator.next();
      done = Boolean(next.done);
      if (next.done) return null;
      pendingOutcome = next.value;
      return next.value;
    },
    recordCandidateOutcome(successful) {
      if (!pendingOutcome) return;
      if (successful && evidence.firstSuccessfulGeometry === null) {
        evidence.firstSuccessfulGeometry = {
          idleMinutes: pendingOutcome.geometryIdleMinutes,
          spanMinutes: pendingOutcome.geometrySpanMinutes,
        };
        evidence.firstSuccessfulMatchingRepairIndex = pendingOutcome.matchingRepairIndex;
      }
      pendingOutcome = null;
    },
  };
}

export function generateExactSetupBlockCandidates(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  countOnly = false,
): ExactSetupBlockGenerationResult {
  const explorer = createExactSetupBlockExplorer(problem, tasks, placed, preparations, meals, ledger);
  const candidates: ExactSetupBlockCandidate[] = [];
  for (let candidate = explorer.nextCandidate(); candidate; candidate = explorer.nextCandidate()) {
    if (!countOnly) candidates.push(candidate);
    explorer.recordCandidateOutcome(false);
  }
  candidates.sort((left, right) => left.geometryIdleMinutes - right.geometryIdleMinutes
    || left.geometrySpanMinutes - right.geometrySpanMinutes
    || left.cost - right.cost
    || (right.tasks[0]?.start ?? 0) - (left.tasks[0]?.start ?? 0)
    || candidateSignature(left).localeCompare(candidateSignature(right)));
  return { outcome: explorer.exhausted ? "BUDGET_EXHAUSTED" : "COMPLETE", candidates, evidence: explorer.evidence };
}

/** Preserves the base HEAD compact/canonical constrainedness without claiming the gapped domain is exact. */
export function probeExactSetupMacroDomain(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
): ExactSetupMacroDomain {
  const ledger: ExactSearchLedger = {
    limit: Number.POSITIVE_INFINITY, branchesExplored: 0, coreBranches: 0,
    standaloneBranches: 0, lastExhaustionPhase: null, consume: () => true,
  };
  const explorer = createExactSetupBlockExplorer(problem, tasks, placed, preparations, meals, ledger,
    { compactOnly: true, canonicalOnly: true });
  while (explorer.nextCandidate()) explorer.recordCandidateOutcome(false);
  return { domainSize: explorer.evidence.completeCandidateCount,
    structuralCandidateCount: explorer.evidence.startsExplored,
    matchingFeasibleCandidateCount: explorer.evidence.completeCandidateCount, domainExact: false };
}
