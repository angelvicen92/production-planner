import type {
  OperationalMealPolicy,
  PlannerNextProblem,
  ScheduledOperationalMeal,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import {
  incrementallyRepairMatchingWitness,
  type ExactSearchLedger,
} from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { probeParticipantFutureReservations } from "./participantFutureFeasibility";
import { probeParticipantMealFutureFeasibility } from "./participantMeals";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateResourcePresence } from "./resourcePresence";
import { operationalMealCandidates } from "./operationalMeals";
import { overlaps } from "./time";

export interface ExactPreferredResourceUnitCandidate {
  readonly tasks: readonly ScheduledTask[];
  readonly preparations: readonly ScheduledSetupPreparation[];
  readonly presence: readonly [blocks: number, span: number, idle: number];
  readonly operationalMealReservations: readonly ScheduledOperationalMeal[];
  readonly blockCount: 1 | 2;
  readonly blockIntervals: readonly { start: number; end: number }[];
}

export type ExactPreferredResourceUnitOutcome =
  | "FOUND"
  | "DEAD_END"
  | "BUDGET_EXHAUSTED";
export interface ExactPreferredResourceUnitContinuationResult {
  outcome: ExactPreferredResourceUnitOutcome;
  /** True only when the complete candidate reached participant Future EXACT and it pruned. */
  participantFutureExactPrune?: boolean;
  /** True only when the continuation was pruned by participant-meal future feasibility. */
  participantMealPrune?: boolean;
  terminalFutureResult?: "PASS" | "PRUNE" | "ABSTAIN" | "NOT_CHECKED";
}
export interface ExactPreferredResourceUnitEvidence {
  geometryCount: number;
  matchingSuccesses: number;
  rawCompatibleEdges: number;
  futureEdgeChecks: number;
  analyticPrunedEdges: number;
  matchingAttempts: number;
  matchingTraversals: number;
  causalForbiddenEdges: number;
  mealEdgeChecks: number;
  mealPrunedEdges: number;
  mealAwareGeometries: number;
  mealReservationVariants: number;
  selectedOperationalMealReservations: ScheduledOperationalMeal[];
  firstMealPrunedEdge: {
    taskId: string;
    spotId: string;
    start: number;
    blockingMealTaskId: string | null;
  } | null;
  blockingMealTaskId: string | null;
  incrementalRepairs: number;
  geometriesRescuedByRematching: number;
  firstMatchingWitness: Record<string, string> | null;
  selectedMatchingWitness: Record<string, string> | null;
  terminalFutureResult: "PASS" | "PRUNE" | "ABSTAIN" | "NOT_CHECKED";
  completeCandidatesAttemptedByBlockCount: Record<"1" | "2", number>;
  terminalResultCountsByBlockCount: Record<
    "1" | "2",
    Record<"PASS" | "PRUNE" | "ABSTAIN" | "NOT_CHECKED", number>
  >;
  firstTwoBlockCandidate: {
    intervals: readonly { start: number; end: number }[];
    firstMatching: Record<string, string>;
    terminalResult: "PASS" | "PRUNE" | "ABSTAIN" | "NOT_CHECKED";
    branchesConsumedAtEntry: number;
  } | null;
}
export interface ExactPreferredResourceUnitAuthorities {
  /** Test seam; production always uses the canonical participant-future authority. */
  participantFutureProbe?: typeof probeParticipantFutureReservations;
  participantMealProbe?: typeof probeParticipantMealFutureFeasibility;
}

/** Builds each setup geometry once, then incrementally repairs only matching edges
 * that participant Future Feasibility proves individually infeasible. */
export function exploreExactPreferredResourceUnit(args: {
  problem: PlannerNextProblem;
  resourceId: string;
  resourceTasks: readonly Task[];
  setupTasks: readonly Task[];
  placed: readonly ScheduledTask[];
  preparations: readonly ScheduledSetupPreparation[];
  meals: readonly ScheduledSpaceMeal[];
  ledger: ExactSearchLedger;
  continuation: (
    candidate: ExactPreferredResourceUnitCandidate,
  ) => ExactPreferredResourceUnitContinuationResult;
  authorities?: ExactPreferredResourceUnitAuthorities;
}): {
  outcome: ExactPreferredResourceUnitOutcome;
  evidence: ExactPreferredResourceUnitEvidence;
} {
  const {
    problem,
    resourceId,
    resourceTasks,
    setupTasks,
    placed,
    preparations,
    meals,
    ledger,
    continuation,
  } = args;
  const participantFutureProbe =
    args.authorities?.participantFutureProbe ??
    probeParticipantFutureReservations;
  const participantMealProbe =
    args.authorities?.participantMealProbe ??
    probeParticipantMealFutureFeasibility;
  const evidence: ExactPreferredResourceUnitEvidence = {
    geometryCount: 0,
    matchingSuccesses: 0,
    rawCompatibleEdges: 0,
    futureEdgeChecks: 0,
    analyticPrunedEdges: 0,
    matchingAttempts: 0,
    matchingTraversals: 0,
    causalForbiddenEdges: 0,
    mealEdgeChecks: 0,
    mealPrunedEdges: 0,
    mealAwareGeometries: 0,
    mealReservationVariants: 0,
    selectedOperationalMealReservations: [],
    firstMealPrunedEdge: null,
    blockingMealTaskId: null,
    incrementalRepairs: 0,
    geometriesRescuedByRematching: 0,
    firstMatchingWitness: null,
    selectedMatchingWitness: null,
    terminalFutureResult: "NOT_CHECKED",
    completeCandidatesAttemptedByBlockCount: { 1: 0, 2: 0 },
    terminalResultCountsByBlockCount: {
      1: { PASS: 0, PRUNE: 0, ABSTAIN: 0, NOT_CHECKED: 0 },
      2: { PASS: 0, PRUNE: 0, ABSTAIN: 0, NOT_CHECKED: 0 },
    },
    firstTwoBlockCandidate: null,
  };
  const mutableMeals = [...meals];
  const setup = generateExactSetupBlockCandidates(
    problem,
    [...setupTasks],
    [...placed],
    [...preparations],
    mutableMeals,
    ledger,
  );
  const duration = resourceTasks.reduce((sum, task) => sum + task.duration, 0);
  const taskById = new Map(resourceTasks.map((task) => [task.id, task]));
  const taskIds = [...taskById.keys()].sort();
  const mealApplicable = (problem.participantMeals?.length ?? 0) > 0;
  const analyticEdgeCache = new Map<string, "PASS" | "PRUNE" | "ABSTAIN">();
  const mealEdgeCache = new Map<
    string,
    { feasible: boolean; blockingMealTaskId: string | null }
  >();
  const effectiveResourceIds = (task: Task): string[] =>
    task.coachId === undefined
      ? [...(task.requiredResourceIds ?? [])]
      : [...(task.requiredResourceIds ?? []), task.coachId];
  const unitTasks = [...resourceTasks, ...setupTasks];
  const operationalPolicies = [...(problem.operationalMealPolicies ?? [])]
    .filter((policy) =>
      unitTasks.some(
        (task) =>
          policy.spaceIds.includes(task.spaceId) ||
          effectiveResourceIds(task).some((id) =>
            policy.resourceIds.includes(id),
          ),
      ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const conflicts = (
    task: ScheduledTask,
    policy: OperationalMealPolicy,
    meal: ScheduledOperationalMeal,
  ) =>
    (policy.spaceIds.includes(task.spaceId) ||
      effectiveResourceIds(task).some((id) =>
        policy.resourceIds.includes(id),
      )) &&
    overlaps(task, meal);
  const structuralCandidates = [...setup.candidates].sort((a, b) => {
    const quality = (candidate: typeof a) => {
      const ordered = [...candidate.tasks, ...candidate.preparations].sort(
        (x, y) =>
          x.start - y.start || x.end - y.end || x.id.localeCompare(y.id),
      );
      const blocks = ordered.reduce(
        (count, item, index) =>
          count + Number(index === 0 || item.start > ordered[index - 1]!.end),
        0,
      );
      const span = ordered.length ? ordered.at(-1)!.end - ordered[0]!.start : 0;
      const occupied = ordered.reduce(
        (sum, item) => sum + item.end - item.start,
        0,
      );
      return [blocks, span, span - occupied] as const;
    };
    const aq = quality(a),
      bq = quality(b);
    return (
      aq[0] - bq[0] ||
      aq[1] - bq[1] ||
      aq[2] - bq[2] ||
      a.tasks
        .map((task) => `${task.id}@${task.start}`)
        .sort()
        .join("|")
        .localeCompare(
          b.tasks
            .map((task) => `${task.id}@${task.start}`)
            .sort()
            .join("|"),
        )
    );
  });
  type Geometry = {
    starts: number[];
    reservations: ScheduledOperationalMeal[];
    blockIntervals: { start: number; end: number }[];
  };
  const boundaryStarts = (
    duration: number,
    tier: 0 | 1 | 2,
    occupations: readonly { start: number; end: number }[],
  ): number[] => {
    const boundaries =
      tier === 0
        ? [
            ...new Set(occupations.flatMap((item) => [item.start, item.end])),
          ].sort((a, b) => a - b)
        : tier === 1
          ? [
              ...new Set([...placed].flatMap((item) => [item.start, item.end])),
            ].sort((a, b) => a - b)
          : Array.from(
              {
                length: Math.max(
                  0,
                  Math.floor((problem.day.end - problem.day.start) / 5) + 1,
                ),
              },
              (_, i) => problem.day.start + i * 5,
            );
    return [
      ...new Set(
        boundaries.flatMap((boundary) => [boundary, boundary - duration]),
      ),
    ]
      .filter(
        (value) =>
          value >= problem.day.start && value + duration <= problem.day.end,
      )
      .sort((a, b) => a - b);
  };
  function* oneBlockGeometries(
    structural: (typeof structuralCandidates)[number],
  ): Generator<Geometry> {
    const occupations = [...structural.tasks, ...structural.preparations];
    const first = Math.min(...occupations.map((item) => item.start)),
      last = Math.max(...occupations.map((item) => item.end));
    const seen = new Set<string>();
    for (const tier of [0, 1, 2] as const)
      for (const orientation of ["BEFORE", "AFTER"] as const) {
        const naturalBoundary =
          orientation === "BEFORE" ? resourceTasks.length : 0;
        const assignments = function* (
          index = 0,
          current: number[] = [],
        ): Generator<number[]> {
          if (index === operationalPolicies.length) {
            yield current;
            return;
          }
          const boundaries =
            tier === 0
              ? [naturalBoundary]
              : [
                  naturalBoundary,
                  ...Array.from(
                    { length: resourceTasks.length + 1 },
                    (_, i) => i,
                  ),
                ].filter(
                  (value, index, array) => array.indexOf(value) === index,
                );
          for (const boundary of boundaries)
            yield* assignments(index + 1, [...current, boundary]);
        };
        for (const boundaries of assignments()) {
          const mealMinutes = operationalPolicies.reduce(
            (sum, policy) => sum + policy.duration,
            0,
          );
          const anchoredStart =
            orientation === "BEFORE" ? first - duration - mealMinutes : last;
          const structuralBoundaries = [
            ...new Set(occupations.flatMap((item) => [item.start, item.end])),
          ].sort((a, b) => a - b);
          const taskBoundaries = [
            ...new Set([...placed].flatMap((item) => [item.start, item.end])),
          ].sort((a, b) => a - b);
          const candidateStarts =
            tier === 0
              ? [
                  anchoredStart,
                  ...structuralBoundaries.flatMap((boundary) => [
                    boundary,
                    boundary - duration - mealMinutes,
                  ]),
                ]
              : tier === 1
                ? taskBoundaries.flatMap((boundary) => [
                    boundary,
                    boundary - duration - mealMinutes,
                  ])
                : Array.from(
                    {
                      length: Math.max(
                        0,
                        Math.floor((problem.day.end - problem.day.start) / 5) +
                          1,
                      ),
                    },
                    (_, i) => problem.day.start + i * 5,
                  );
          for (const start of candidateStarts) {
            let cursor = start;
            const starts: number[] = [];
            const reservations: ScheduledOperationalMeal[] = [];
            let valid = true;
            for (
              let boundary = 0;
              boundary <= resourceTasks.length;
              boundary += 1
            ) {
              for (const [policyIndex, policy] of operationalPolicies
                .map((policy, index) => [index, policy] as const)
                .filter(([i]) => boundaries[i] === boundary)) {
                const candidate = operationalMealCandidates(
                  problem,
                  policy,
                  [...placed, ...structural.tasks],
                  reservations,
                ).find((item) => item.start === cursor);
                if (!candidate) {
                  valid = false;
                  break;
                }
                reservations.push(candidate);
                cursor = candidate.end;
              }
              if (!valid) break;
              if (boundary < resourceTasks.length) {
                starts.push(cursor);
                cursor += resourceTasks[boundary]!.duration;
              }
            }
            if (!valid) continue;
            if (
              start === anchoredStart &&
              ((orientation === "BEFORE" && cursor !== first) ||
                (orientation === "AFTER" && start !== last))
            )
              continue;
            const key = `${starts.join(",")}|${reservations.map((x) => `${x.id}@${x.start}`).join(",")}`;
            if (!seen.has(key)) {
              seen.add(key);
              yield {
                starts,
                reservations,
                blockIntervals: [{ start: starts[0]!, end: cursor }],
              };
            }
          }
        }
      }
  }
  function* twoBlockGeometries(
    structural: (typeof structuralCandidates)[number],
  ): Generator<Geometry> {
    if (resourceTasks.length < 2) return;
    const occupations = [...structural.tasks, ...structural.preparations];
    // Durations define anonymous temporal spots; task identity is assigned only by matching below.
    const slotDurations = resourceTasks
      .map((task) => task.duration)
      .sort((a, b) => a - b);
    const seen = new Set<string>();
    for (const tier of [0, 1, 2] as const)
      for (let split = 1; split < slotDurations.length; split += 1) {
        const firstDuration = slotDurations
            .slice(0, split)
            .reduce((a, b) => a + b, 0),
          secondDuration = slotDurations
            .slice(split)
            .reduce((a, b) => a + b, 0);
        for (const firstStart of boundaryStarts(
          firstDuration,
          tier,
          occupations,
        ))
          for (const secondStart of boundaryStarts(
            secondDuration,
            tier,
            occupations,
          )) {
            const intervals = [
              { start: firstStart, end: firstStart + firstDuration },
              { start: secondStart, end: secondStart + secondDuration },
            ].sort((a, b) => a.start - b.start || a.end - b.end);
            if (intervals[0]!.end > intervals[1]!.start) continue;
            const starts: number[] = [];
            let cursor = intervals[0]!.start;
            for (const value of slotDurations.slice(0, split)) {
              starts.push(cursor);
              cursor += value;
            }
            cursor = intervals[1]!.start;
            for (const value of slotDurations.slice(split)) {
              starts.push(cursor);
              cursor += value;
            }
            const reservations: ScheduledOperationalMeal[] = [];
            let valid = true;
            for (const policy of operationalPolicies) {
              const meal = operationalMealCandidates(
                problem,
                policy,
                [...placed, ...structural.tasks],
                reservations,
              ).find((candidate) =>
                intervals.every((interval) => !overlaps(interval, candidate)),
              );
              if (!meal) {
                valid = false;
                break;
              }
              reservations.push(meal);
            }
            if (!valid) continue;
            const key = `${starts.join(",")}|${reservations.map((x) => `${x.id}@${x.start}`).join(",")}`;
            if (!seen.has(key)) {
              seen.add(key);
              yield { starts, reservations, blockIntervals: intervals };
            }
          }
      }
  }
  const exploreGeometry = (
    structural: (typeof structuralCandidates)[number],
    geometry: Geometry,
    blockCount: 1 | 2,
  ): ExactPreferredResourceUnitOutcome => {
    const { reservations } = geometry;
    evidence.geometryCount += 1;
    evidence.mealReservationVariants += reservations.length > 0 ? 1 : 0;
    const slots = resourceTasks.map((_, index) => `spot:${index}`);
    const spotStart = (position: number) => geometry.starts[position]!;
    const spotDuration = (position: number) =>
      position + 1 < geometry.starts.length &&
      geometry.starts[position + 1]! <=
        (geometry.blockIntervals.find(
          (i) =>
            i.start <= geometry.starts[position]! &&
            geometry.starts[position]! < i.end,
        )?.end ?? -1)
        ? geometry.starts[position + 1]! - geometry.starts[position]!
        : geometry.blockIntervals.find(
            (i) =>
              i.start <= geometry.starts[position]! &&
              geometry.starts[position]! < i.end,
          )!.end - geometry.starts[position]!;
    const validPositions = new Map<string, number[]>();
    const base = [...placed, ...structural.tasks];
    const baseKey = base
      .map((task) => `${task.id}@${task.start}-${task.end}`)
      .sort()
      .join("|");
    for (const taskId of taskIds) {
      const task = taskById.get(taskId)!,
        positions: number[] = [];
      for (let position = 0; position < slots.length; position += 1) {
        const at = spotStart(position);
        if (blockCount === 2 && task.duration !== spotDuration(position))
          continue;
        if (!canPlaceTask(problem, task, at, base, mutableMeals)) continue;
        evidence.rawCompatibleEdges += 1;
        evidence.futureEdgeChecks += 1;
        const scheduled = scoreAuxiliaryTask(problem, task, at, base).scheduled;
        if (
          reservations.some((meal) => {
            const policy = operationalPolicies.find(
              (item) => item.id === meal.id,
            );
            return policy ? conflicts(scheduled, policy, meal) : false;
          })
        )
          continue;
        const edgeKey = `${task.id}@${task.spaceId}:${at}`,
          futureKey = `${baseKey}|${edgeKey}`;
        let futureStatus = analyticEdgeCache.get(futureKey);
        if (futureStatus === undefined) {
          futureStatus = participantFutureProbe(
            problem,
            [...base, scheduled],
            [scheduled],
            undefined,
            "ANALYTIC_ONLY",
          ).status;
          analyticEdgeCache.set(futureKey, futureStatus);
        }
        let mealResult = {
          feasible: true,
          blockingMealTaskId: null as string | null,
        };
        if (mealApplicable) {
          evidence.mealEdgeChecks += 1;
          const cached = mealEdgeCache.get(futureKey);
          if (cached) mealResult = cached;
          else {
            const probe = participantMealProbe(
              problem,
              [...base, scheduled],
              [scheduled],
            );
            mealResult = {
              feasible: probe.feasible,
              blockingMealTaskId: probe.blockingMealTaskIds[0] ?? null,
            };
            mealEdgeCache.set(futureKey, mealResult);
          }
        }
        if (!mealResult.feasible) {
          evidence.mealPrunedEdges += 1;
          evidence.blockingMealTaskId ??= mealResult.blockingMealTaskId;
          evidence.firstMealPrunedEdge ??= {
            taskId: task.id,
            spotId: slots[position]!,
            start: at,
            blockingMealTaskId: mealResult.blockingMealTaskId,
          };
        }
        if (futureStatus === "PRUNE") {
          evidence.analyticPrunedEdges += 1;
          continue;
        }
        if (!mealResult.feasible) continue;
        positions.push(position);
      }
      validPositions.set(taskId, positions);
    }
    let forbidden = new Set<string>(),
      previousForbidden = new Set<string>(),
      previous = new Map<string, number>(),
      repaired = false;
    while (true) {
      evidence.matchingAttempts += 1;
      const result = incrementallyRepairMatchingWitness(
        taskIds,
        validPositions,
        forbidden,
        previousForbidden,
        previous,
        () => ledger.consume("STANDALONE"),
      );
      evidence.matchingTraversals += result.traversals;
      if (result.outcome === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
      if (result.outcome !== "PERFECT" || !result.matching) break;
      const matching = result.matching,
        witness = Object.fromEntries(
          [...matching]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([taskId, position]) => [taskId, slots[position]!]),
        );
      evidence.firstMatchingWitness ??= witness;
      const scheduled = [...matching].map(
          ([taskId, position]) =>
            scoreAuxiliaryTask(
              problem,
              taskById.get(taskId)!,
              spotStart(position),
              base,
            ).scheduled,
        ),
        all = [...structural.tasks, ...scheduled];
      if (
        scheduled.some(
          (task) =>
            !canPlaceTask(
              problem,
              task,
              task.start,
              [...placed, ...all.filter((item) => item.id !== task.id)],
              mutableMeals,
            ),
        )
      )
        break;
      evidence.matchingSuccesses += 1;
      evidence.completeCandidatesAttemptedByBlockCount[
        String(blockCount) as "1" | "2"
      ] += 1;
      const resource = problem.resources.find(
        (item) => item.id === resourceId,
      )!;
      evidence.mealAwareGeometries += Number(reservations.length > 0);
      const decision = continuation({
        tasks: all,
        preparations: structural.preparations,
        operationalMealReservations: reservations,
        presence: evaluateResourcePresence(resource, all, [], [], reservations)
          .preferredLexicographicTuple,
        blockCount,
        blockIntervals: geometry.blockIntervals,
      });
      const terminal = decision.terminalFutureResult ?? "NOT_CHECKED";
      evidence.terminalFutureResult = terminal;
      evidence.terminalResultCountsByBlockCount[
        String(blockCount) as "1" | "2"
      ][terminal] += 1;
      if (blockCount === 2 && !evidence.firstTwoBlockCandidate)
        evidence.firstTwoBlockCandidate = {
          intervals: geometry.blockIntervals,
          firstMatching: witness,
          terminalResult: terminal,
          branchesConsumedAtEntry: ledger.branchesExplored,
        };
      if (decision.outcome !== "DEAD_END") {
        evidence.selectedMatchingWitness = witness;
        evidence.selectedOperationalMealReservations = [...reservations];
        if (repaired) evidence.geometriesRescuedByRematching += 1;
        return decision.outcome;
      }
      if (
        !decision.participantFutureExactPrune &&
        !decision.participantMealPrune
      )
        break;
      const newlyForbidden: string[] = [];
      for (const [taskId, position] of matching) {
        const task = taskById.get(taskId)!,
          edge = scoreAuxiliaryTask(
            problem,
            task,
            spotStart(position),
            base,
          ).scheduled;
        let prune = false;
        if (decision.participantFutureExactPrune) {
          const exact = participantFutureProbe(
            problem,
            [...base, edge],
            [edge],
            { consume: () => ledger.consume("STANDALONE") },
            "EXACT",
          );
          if (
            exact.status === "ABSTAIN" &&
            exact.abstainCause === "BUDGET_EXHAUSTED"
          )
            return "BUDGET_EXHAUSTED";
          prune = exact.status === "PRUNE";
        }
        if (decision.participantMealPrune) {
          const meal = participantMealProbe(problem, [...base, edge], [edge]);
          prune = prune || !meal.feasible;
        }
        if (prune) newlyForbidden.push(`${taskId}@${position}`);
      }
      if (!newlyForbidden.length) break;
      previousForbidden = forbidden;
      previous = new Map(matching);
      forbidden = new Set([...forbidden, ...newlyForbidden]);
      evidence.causalForbiddenEdges += newlyForbidden.filter(
        (edge) => !previousForbidden.has(edge),
      ).length;
      evidence.incrementalRepairs += 1;
      repaired = true;
    }
    return "DEAD_END";
  };
  // blockCount is an outer search family: exhaust every one-block structural continuation before entering two blocks.
  const blockCountFamilies =
    problem.resources.find((item) => item.id === resourceId)
      ?.presencePreference === "PREFERRED"
      ? ([1, 2] as const)
      : ([1] as const);
  for (const blockCount of blockCountFamilies)
    for (const structural of structuralCandidates) {
      const geometries =
        blockCount === 1
          ? oneBlockGeometries(structural)
          : twoBlockGeometries(structural);
      for (const geometry of geometries) {
        const outcome = exploreGeometry(structural, geometry, blockCount);
        if (outcome !== "DEAD_END") return { outcome, evidence };
      }
    }
  return {
    outcome:
      setup.outcome === "BUDGET_EXHAUSTED" ? "BUDGET_EXHAUSTED" : "DEAD_END",
    evidence,
  };
}
