import type { PlannerNextProblem, ScheduledTask, Task, Window } from "./contracts";
import type { ExactItinerantPlanSearchOptions } from "./exactItinerantPlan";
import type { ExactMainChoiceDescriptor } from "./exactMainAndFeederCore";
import { latestFeederEndBeforeMain } from "./coachRouteTransitions";

export interface ResidualObligationAlignmentKey {
  residualTaskCount: number;
  currentPresenceSpan: number;
  projectedPresenceLowerBound: number;
  projectedMaximumGapLowerBound: number;
  sumIndependentPresenceExpansion: number;
  sumIndependentIdleExpansion: number;
  sumIndependentMinimumGap: number;
  emptyStaticDomainCount: number;
  participantSlack: number;
  firstObligation: number;
  candidateId: string;
}

export interface ResidualOrderingDecision {
  depth: number;
  baselineOrder: string[];
  contextualOrder: string[];
  keys: ResidualObligationAlignmentKey[];
  explanation: string;
}

export interface ResidualObligationOrderingEvidence {
  orderingPolicy: "RESIDUAL_OBLIGATION_ALIGNMENT";
  cacheScope: "DESCRIPTOR_STATE";
  orderingDecisions: number;
  candidatesRanked: number;
  candidatesWithResidualTasks: number;
  candidatesWithoutResidualTasks: number;
  staticStartEvaluations: number;
  staticStartsFound: number;
  emptyStaticDomains: number;
  decisionOrderChangedCount: number;
  firstCandidateChangedCount: number;
  selectedCandidateHadResidualTasksCount: number;
  usesIdealLatestFeederLowerBound: true;
  decisions: ResidualOrderingDecision[];
  selectedProjectedPresenceLowerBoundByDepth: Record<string, number>;
  selectedProjectedMaximumGapLowerBoundByDepth: Record<string, number>;
}

export interface ResidualObligationInterval { start: number; end: number }
export interface ResidualObligationIntervalMetrics {
  span: number;
  productive: number;
  idle: number;
  maximumGap: number;
  nearestDistance: number;
}

const MAX_DIAGNOSTIC_DECISIONS = 40;
const fits = (windows: readonly Window[] | undefined, start: number, end: number): boolean =>
  windows === undefined || windows.some((window) => window.start <= start && end <= window.end);
const intervalsForParticipant = (tasks: readonly Readonly<ScheduledTask>[], participantId: string): ResidualObligationInterval[] =>
  tasks.filter((task) => task.kind !== "technical" && task.participantId === participantId)
    .map(({ start, end }) => ({ start, end }));

export function mergeResidualObligationIntervals(
  intervals: readonly Readonly<ResidualObligationInterval>[],
): ResidualObligationInterval[] {
  const ordered = intervals.filter(({ start, end }) => end > start)
    .map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: ResidualObligationInterval[] = [];
  for (const interval of ordered) {
    const current = merged.at(-1);
    if (!current || interval.start > current.end) merged.push({ ...interval });
    else current.end = Math.max(current.end, interval.end);
  }
  return merged;
}

export function measureResidualObligationIntervals(
  intervals: readonly Readonly<ResidualObligationInterval>[],
  added?: Readonly<ResidualObligationInterval>,
): ResidualObligationIntervalMetrics {
  const existing = mergeResidualObligationIntervals(intervals);
  const merged = mergeResidualObligationIntervals([...existing, ...(added ? [{ ...added }] : [])]);
  if (!merged.length) return { span: 0, productive: 0, idle: 0, maximumGap: 0, nearestDistance: 0 };
  const productive = merged.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  let maximumGap = 0, nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < merged.length; index += 1) {
    const gap = Math.max(0, merged[index]!.start - merged[index - 1]!.end);
    maximumGap = Math.max(maximumGap, gap);
  }
  if (added && added.end > added.start) for (const interval of existing) nearestDistance = Math.min(nearestDistance,
    Math.max(0, added.start - interval.end, interval.start - added.end));
  const span = merged.at(-1)!.end - merged[0]!.start;
  return { span, productive, idle: Math.max(0, span - productive), maximumGap,
    nearestDistance: Number.isFinite(nearestDistance) ? nearestDistance : 0 };
}

function lexicographicNumbers(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]!, right = b[index]!;
    const comparison = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
    if (comparison) return comparison;
  }
  return 0;
}

export function residualObligationAlignmentTuple(key: ResidualObligationAlignmentKey): readonly (number | string)[] {
  return [key.emptyStaticDomainCount, key.projectedPresenceLowerBound, key.projectedMaximumGapLowerBound,
    key.sumIndependentIdleExpansion, key.sumIndependentPresenceExpansion, key.sumIndependentMinimumGap,
    key.participantSlack, key.firstObligation, key.candidateId];
}

/**
 * Pure static quality estimate. Independent best positions can conflict with one another, so this
 * key proves neither feasibility nor optimality and is never used to prune a candidate.
 */
export function evaluateResidualObligationCandidate(problem: Readonly<PlannerNextProblem>,
  standaloneTasks: readonly Readonly<Task>[], candidate: ExactMainChoiceDescriptor,
  counters?: Pick<ResidualObligationOrderingEvidence, "staticStartEvaluations" | "staticStartsFound" | "emptyStaticDomains">): ResidualObligationAlignmentKey {
  const participantId = candidate.mainTask.kind === "technical" ? undefined : candidate.mainTask.participantId;
  const residual = participantId === undefined ? [] : standaloneTasks.filter((task) => task.kind === "auxiliary"
    && task.participantId === participantId && !candidate.placedTasks.some(({ id }) => id === task.id));
  const current = intervalsForParticipant([...candidate.placedTasks, ...candidate.operationTasks], participantId ?? "");
  const idealFeederEnd = latestFeederEndBeforeMain(
    problem,
    candidate.feeder,
    candidate.mainTask.spaceId,
    candidate.slot,
    candidate.firstObligation,
  );
  current.push({ start: idealFeederEnd - candidate.feeder.duration, end: idealFeederEnd });
  const currentMetrics = measureResidualObligationIntervals(current);
  let projectedPresence = currentMetrics.span, projectedGap = currentMetrics.maximumGap;
  let presenceExpansion = 0, idleExpansion = 0, minimumGap = 0, empty = 0;
  for (const task of [...residual].sort((a, b) => a.id.localeCompare(b.id))) {
    const participant = problem.participants.find(({ id }) => id === task.participantId);
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((item) => item.id === id));
    const coach = task.coachId === undefined ? undefined : problem.coaches.find(({ id }) => id === task.coachId);
    const missingReference = participant === undefined || space === undefined || resources.some((resource) => resource === undefined)
      || (task.coachId !== undefined && coach === undefined);
    let best: (ResidualObligationIntervalMetrics & { start: number }) | undefined;
    for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) {
      if (counters) counters.staticStartEvaluations += 1;
      const end = start + task.duration;
      if (missingReference || !fits(task.availability, start, end) || !fits(participant!.availability, start, end)
        || !fits(space?.availability, start, end) || resources.some((resource) => !fits(resource?.availability, start, end))
        || !fits(coach?.availability, start, end)) continue;
      if (counters) counters.staticStartsFound += 1;
      const value = { ...measureResidualObligationIntervals(current, { start, end }), start };
      if (!best || lexicographicNumbers([value.span, value.maximumGap, value.idle - currentMetrics.idle,
        value.nearestDistance, value.start], [best.span, best.maximumGap, best.idle - currentMetrics.idle,
        best.nearestDistance, best.start]) < 0) best = value;
    }
    if (!best) { empty += 1; if (counters) counters.emptyStaticDomains += 1; continue; }
    projectedPresence = Math.max(projectedPresence, best.span);
    projectedGap = Math.max(projectedGap, best.maximumGap);
    presenceExpansion += Math.max(0, best.span - currentMetrics.span);
    idleExpansion += Math.max(0, best.idle - currentMetrics.idle);
    minimumGap += best.maximumGap;
  }
  return { residualTaskCount: residual.length, currentPresenceSpan: currentMetrics.span,
    projectedPresenceLowerBound: projectedPresence, projectedMaximumGapLowerBound: projectedGap,
    sumIndependentPresenceExpansion: presenceExpansion, sumIndependentIdleExpansion: idleExpansion,
    sumIndependentMinimumGap: minimumGap, emptyStaticDomainCount: empty,
    participantSlack: candidate.participantSlack, firstObligation: candidate.firstObligation,
    candidateId: candidate.mainTask.id };
}

export function createResidualObligationMainOrderer(problem: Readonly<PlannerNextProblem>,
  standaloneTasks: readonly Readonly<Task>[]): { options: NonNullable<ExactItinerantPlanSearchOptions["coreOrderer"]>;
    evidence: ResidualObligationOrderingEvidence } {
  const evidence: ResidualObligationOrderingEvidence = { orderingPolicy: "RESIDUAL_OBLIGATION_ALIGNMENT",
    cacheScope: "DESCRIPTOR_STATE",
    orderingDecisions: 0, candidatesRanked: 0, candidatesWithResidualTasks: 0, candidatesWithoutResidualTasks: 0,
    staticStartEvaluations: 0, staticStartsFound: 0, emptyStaticDomains: 0, decisionOrderChangedCount: 0,
    firstCandidateChangedCount: 0, selectedCandidateHadResidualTasksCount: 0,
    usesIdealLatestFeederLowerBound: true, decisions: [], selectedProjectedPresenceLowerBoundByDepth: {},
    selectedProjectedMaximumGapLowerBoundByDepth: {} };
  const keys = new WeakMap<ExactMainChoiceDescriptor, ResidualObligationAlignmentKey>();
  const key = (candidate: ExactMainChoiceDescriptor): ResidualObligationAlignmentKey => {
    const known = keys.get(candidate); if (known) return known;
    const evaluated = evaluateResidualObligationCandidate(problem, standaloneTasks, candidate, evidence);
    keys.set(candidate, evaluated); return evaluated;
  };
  const options: NonNullable<ExactItinerantPlanSearchOptions["coreOrderer"]> = {
    mainChoiceComparator: (a, b) => lexicographicNumbers(residualObligationAlignmentTuple(key(a)), residualObligationAlignmentTuple(key(b))),
    onMainChoicesRanked(baseline, ordered) {
      const baselineOrder = baseline.map(({ mainTask }) => mainTask.id), contextualOrder = ordered.map(({ mainTask }) => mainTask.id);
      evidence.orderingDecisions += 1; evidence.candidatesRanked += ordered.length;
      const decisionKeys = ordered.map(key);
      evidence.candidatesWithResidualTasks += decisionKeys.filter(({ residualTaskCount }) => residualTaskCount > 0).length;
      evidence.candidatesWithoutResidualTasks += decisionKeys.filter(({ residualTaskCount }) => residualTaskCount === 0).length;
      if (baselineOrder.join("\0") !== contextualOrder.join("\0")) evidence.decisionOrderChangedCount += 1;
      if (baselineOrder[0] !== contextualOrder[0]) evidence.firstCandidateChangedCount += 1;
      if (evidence.decisions.length < MAX_DIAGNOSTIC_DECISIONS) evidence.decisions.push({ depth: ordered[0]?.depth ?? 0,
        baselineOrder, contextualOrder, keys: decisionKeys,
        explanation: "La obligación residual cambia solo el orden: todas las alternativas exactas siguen disponibles." });
    },
    onMainChoiceAccepted(candidate) {
      const selected = key(candidate), depth = String(candidate.depth);
      evidence.selectedProjectedPresenceLowerBoundByDepth[depth] = selected.projectedPresenceLowerBound;
      evidence.selectedProjectedMaximumGapLowerBoundByDepth[depth] = selected.projectedMaximumGapLowerBound;
      if (selected.residualTaskCount > 0) evidence.selectedCandidateHadResidualTasksCount += 1;
    },
  };
  return { options, evidence };
}
