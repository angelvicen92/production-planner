import type {
  PlanMetrics,
  PlanResult,
  PlannerNextProblem,
  ScheduledTask,
  SearchStopReason,
  Task,
} from "./contracts";
import { fingerprint } from "./fingerprint";
import { presencePreferenceWeight, resourcePresenceIncrement, resourcePresenceMetrics, resourceRouteMetrics } from "./resourcePresence";
import { preflight, validatePlan } from "./validate";
import { canPlaceTask } from "./placement";
import { placeAuxiliaryTasks } from "./placeAuxiliaryTasks";
import { participantPresenceSpan } from "./participantPresence";
import { requiredSecondarySpaces, secondaryBlockCount, secondaryEnd, secondaryGapMinutes, secondaryStart, secondaryTasks } from "./secondaryContinuity";
import { setupBlockCounts, setupFamilySequence, setupSpaces, setupSwitchCount, setupTasks } from "./setupGrouping";

interface MainAlternative {
  tasks: ScheduledTask[];
  score: number;
  signature: string;
}

interface Counters {
  alternativesGenerated: number;
  alternativesRetained: number;
  branches: number;
  backtracks: number;
  patternsGenerated: number;
  patternsEvaluated: number;
  auxiliaryBranches: number;
  secondaryBranches: number;
  futureChecks: number; futureBranches: number; futurePruned: number; futureTopPruned: number; blockers: Record<string, number>; acceptedMinimum: number;
}

function canonical<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function generatePatterns(
  mains: Task[],
  minimumRun: number,
  maximumRunsByKey: number,
  maximumPatterns: number,
): { patterns: string[][]; exhausted: boolean } {
  const counts = new Map<string, number>();
  for (const task of mains) counts.set(task.blockKey ?? "", (counts.get(task.blockKey ?? "") ?? 0) + 1);
  const keys = [...counts.keys()].sort();
  const output: string[][] = [];
  let exhausted = false;

  function visit(remaining: Map<string, number>, runs: Array<{ key: string; count: number }>): void {
    if (exhausted) return;
    const left = [...remaining.values()].reduce((sum, count) => sum + count, 0);
    if (left === 0) {
      if (output.length >= maximumPatterns) {
        exhausted = true;
        return;
      }
      output.push(runs.flatMap((run) => Array(run.count).fill(run.key) as string[]));
      return;
    }
    for (const key of keys) {
      const available = remaining.get(key) ?? 0;
      const sameAsPrevious = runs.at(-1)?.key === key;
      const runsForKey = runs.filter((run) => run.key === key).length;
      if (available === 0 || sameAsPrevious || runsForKey >= maximumRunsByKey) continue;
      for (let take = minimumRun; take <= available; take += 1) {
        remaining.set(key, available - take);
        visit(remaining, [...runs, { key, count: take }]);
        remaining.set(key, available);
        if (exhausted) return;
      }
    }
  }

  visit(new Map(counts), []);
  const runCount = (pattern: string[]): number => pattern.reduce(
    (count, key, index) => count + (index === 0 || pattern[index - 1] !== key ? 1 : 0), 0,
  );
  output.sort((a, b) => runCount(a) - runCount(b) || a.join("|").localeCompare(b.join("|")));
  return { patterns: output, exhausted };
}

function placeFeeders(problem: PlannerNextProblem, mains: ScheduledTask[]): ScheduledTask[] | null {
  const placed = [...mains];
  const feederByParticipant = new Map(
    problem.tasks.filter(({ kind }) => kind === "vocal").map((task) => [task.participantId, task]),
  );
  const latestFirst = [...mains].sort((a, b) => b.start - a.start || a.id.localeCompare(b.id));
  for (const main of latestFirst) {
    const feeder = feederByParticipant.get(main.participantId);
    if (!feeder) return null;
    const deadline = main.start - Math.max(
      problem.participantTransitionMinutes,
      problem.resourceTransitionMinutes,
    );
    let selectedStart: number | undefined;
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      if (canPlaceTask(problem, feeder, start, placed)) {
        selectedStart = start;
        break;
      }
    }
    if (selectedStart === undefined) return null;
    placed.push({ ...feeder, start: selectedStart, end: selectedStart + feeder.duration });
  }
  return placed;
}

function emptyMetrics(
  problem: PlannerNextProblem,
  reasons: string[],
  runtimeMs: number,
  stopReason: SearchStopReason,
  counters?: Partial<Counters>,
): PlanMetrics {
  return {
    complete: false,
    hardValid: false,
    plannedTaskCount: 0,
    unplannedTaskCount: Array.isArray(problem.tasks) ? problem.tasks.length : 0,
    mainFlowStart: null,
    mainFlowEnd: null,
    mainFlowGapMinutes: 0,
    blockSequence: [],
    blockCountByKey: {},
    dependencyViolationCount: 0,
    overlapViolationCount: 0,
    transitionViolationCount: 0,
    availabilityViolationCount: 0,
    blockViolationCount: 0,
    resourceAvailabilityViolationCount: 0,
    resourceOverlapViolationCount: 0,
    resourceTransitionViolationCount: 0,
    secondaryContinuityViolationCount: 0,
    setupViolationCount: 0,
    participantPresenceMinutesById: {},
    totalParticipantPresenceMinutes: 0,
    maxParticipantPresenceMinutes: 0,
    resourcePresenceMinutesById: {},
    resourceInternalGapMinutesById: {},
    resourceMoveCountById: {},
    resourceTransitionSlackMinutesById: {},
    totalResourcePresenceMinutes: 0,
    maxResourcePresenceMinutes: 0,
    alternativesGenerated: counters?.alternativesGenerated ?? 0,
    alternativesRetained: counters?.alternativesRetained ?? 0,
    branchesExplored: counters?.branches ?? 0,
    backtracks: counters?.backtracks ?? 0,
    patternsGenerated: counters?.patternsGenerated ?? 0,
    patternsEvaluated: counters?.patternsEvaluated ?? 0,
    branchBudgetConsumed: counters?.branches ?? 0,
    searchStopReason: stopReason,
    runtimeMs,
    planFingerprint: fingerprint([]),
    auxiliaryTaskCount: Array.isArray(problem.tasks) ? problem.tasks.filter((x) => x?.kind === "auxiliary").length : 0,
    auxiliaryPlannedTaskCount: 0,
    auxiliaryBranchesExplored: counters?.auxiliaryBranches ?? 0,
    auxiliarySelectionOrder: [],
    auxiliaryCandidateCountWhenSelectedByTaskId: {},
    secondaryBlockBranchesExplored: counters?.secondaryBranches ?? 0,
    auxiliaryWorkItemSelectionOrder: [],
    secondaryBlockCandidateCountWhenSelectedBySpaceId: {},
    secondarySpaceStartById: {},
    secondarySpaceEndById: {},
    secondarySpaceGapMinutesById: {},
    secondarySpaceBlockCountById: {},
    setupFamilySequenceBySpaceId: {}, setupBlockCountBySpaceAndFamily: {}, setupSwitchCountBySpaceId: {},
    futureFeasibilityChecks: counters?.futureChecks ?? 0, futureFeasibilityBranchesExplored: counters?.futureBranches ?? 0, futureInfeasibleCandidatesPruned: counters?.futurePruned ?? 0, futureTopRankedCandidatesPruned: counters?.futureTopPruned ?? 0, futureBlockerCountByWorkItemKey: counters?.blockers ?? {}, acceptedPathMinimumFutureAlternativeCount: counters?.acceptedMinimum ?? 0,
    reasonCodes: reasons,
  };
}

function failure(
  problem: PlannerNextProblem,
  begun: number,
  reason: SearchStopReason,
  counters?: Partial<Counters>,
): PlanResult {
  return {
    complete: false,
    scheduledTasks: [],
    metrics: emptyMetrics(problem, [reason], performance.now() - begun, reason, counters),
  };
}

export function planMainFlowAndFeeders(problem: PlannerNextProblem): PlanResult {
  const begun = performance.now();
  const preflightReasons = preflight(problem);
  if (preflightReasons.length > 0) {
    return {
      complete: false,
      scheduledTasks: [],
      metrics: emptyMetrics(problem, preflightReasons, performance.now() - begun, "PREFLIGHT_FAILED"),
    };
  }

  const mains = canonical(problem.tasks.filter(({ kind }) => kind === "main"));
  const duration = mains[0]?.duration;
  if (duration === undefined || mains.length === 0) {
    return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN");
  }
  const mainStart = problem.mainFlow.preferredEnd - mains.length * duration;
  const generatedPatterns = generatePatterns(
    mains,
    problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,
    problem.budget.maxPatterns,
  );
  const counters: Counters = {
    alternativesGenerated: 0,
    alternativesRetained: 0,
    branches: 0,
    backtracks: 0,
    patternsGenerated: generatedPatterns.patterns.length,
    patternsEvaluated: 0,
    auxiliaryBranches: 0,
    secondaryBranches: 0, futureChecks: 0, futureBranches: 0, futurePruned: 0, futureTopPruned: 0, blockers: {}, acceptedMinimum: 0,
  };
  if (generatedPatterns.exhausted) {
    return failure(problem, begun, "PATTERN_BUDGET_EXHAUSTED", counters);
  }

  const alternatives: MainAlternative[] = [];
  for (const pattern of generatedPatterns.patterns) {
    counters.patternsEvaluated += 1;
    let beam: MainAlternative[] = [{ tasks: [], score: 0, signature: "" }];
    for (let position = 0; position < mains.length && beam.length > 0; position += 1) {
      const next: MainAlternative[] = [];
      const slot = mainStart + position * duration;
      for (const state of beam) {
        for (const task of mains) {
          if (counters.branches >= problem.budget.maxBranchExpansions) {
            return failure(problem, begun, "BRANCH_BUDGET_EXHAUSTED", counters);
          }
          counters.branches += 1;
          if (task.blockKey !== pattern[position]
            || state.tasks.some(({ id }) => id === task.id)
            || !canPlaceTask(problem, task, slot, state.tasks)) continue;
          const feeder = problem.tasks.find(
            (candidate) => candidate.kind === "vocal" && candidate.participantId === task.participantId,
          );
          const participant = problem.participants.find(({ id }) => id === task.participantId);
          if (!feeder || !participant) continue;
          const deadline = slot - Math.max(
            problem.participantTransitionMinutes,
            problem.resourceTransitionMinutes,
          );
          if (!participant.availability.some((window) => window.start + feeder.duration <= deadline)) continue;
          const loss = participant.availability
            .filter((window) => window.start <= slot && slot + duration <= window.end)
            .reduce((total, window) => total + Math.max(0, window.end - slot), 0);
          const originalIndex = mains.findIndex(({ id }) => id === task.id);
          const scheduledTask = { ...task, start: slot, end: slot + duration };
          const resourcePenalty = (task.requiredResourceIds ?? []).reduce((sum, resourceId) => {
            const resource = problem.resources.find(({ id }) => id === resourceId);
            return sum + (resource ? resourcePresenceIncrement(resourceId, state.tasks, scheduledTask)
              * presencePreferenceWeight(resource.presencePreference) : 0);
          }, 0);
          const score = state.score + loss + Math.abs(originalIndex - position) + resourcePenalty;
          const tasks = [...state.tasks, scheduledTask];
          next.push({ tasks, score, signature: tasks.map(({ id }) => id).join("|") });
          counters.alternativesGenerated += 1;
        }
      }
      beam = next
        .sort((a, b) => a.score - b.score || a.signature.localeCompare(b.signature))
        .slice(0, problem.budget.bestK);
    }
    alternatives.push(...beam);
  }
  const retained = alternatives
    .sort((a, b) => a.score - b.score || a.signature.localeCompare(b.signature))
    .slice(0, problem.budget.bestK);
  counters.alternativesRetained = retained.length;

  for (let index = 0; index < retained.length; index += 1) {
    const alternative = retained[index];
    if (!alternative) continue;
    const core = placeFeeders(problem, alternative.tasks);
    const auxiliary = core ? placeAuxiliaryTasks(problem, core, Math.max(0, problem.budget.maxBranchExpansions - counters.branches)) : null;
    if (auxiliary) { counters.auxiliaryBranches += auxiliary.branches; counters.branches += auxiliary.branches; }
    if (auxiliary) { counters.secondaryBranches += auxiliary.secondaryBranches; counters.futureChecks += auxiliary.futureChecks; counters.futureBranches += auxiliary.futureBranches; counters.futurePruned += auxiliary.futurePruned; counters.futureTopPruned += auxiliary.futureTopPruned; counters.acceptedMinimum = auxiliary.acceptedMinimum; for (const [key,value] of Object.entries(auxiliary.blockers)) counters.blockers[key]=(counters.blockers[key]??0)+value; }
    if (auxiliary?.futureExhausted) return failure(problem, begun, "FUTURE_FEASIBILITY_BRANCH_BUDGET_EXHAUSTED", counters);
    if (auxiliary?.secondaryExhausted) return failure(problem, begun, "SECONDARY_BLOCK_BRANCH_BUDGET_EXHAUSTED", counters);
    if (auxiliary?.exhausted) return failure(problem, begun, "AUXILIARY_BRANCH_BUDGET_EXHAUSTED", counters);
    const all = auxiliary?.tasks ?? null;
    const validation = all ? validatePlan(problem, all) : null;
    if (!all || !validation?.hardValid) {
      const hasNext = index + 1 < retained.length;
      if (!hasNext) break;
      if (counters.backtracks >= problem.budget.maxBacktracks) {
        return failure(problem, begun, "BACKTRACK_BUDGET_EXHAUSTED", counters);
      }
      counters.backtracks += 1;
      continue;
    }

    const ordered = [...all].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const mainTasks = ordered.filter(({ kind }) => kind === "main");
    const firstMain = mainTasks[0];
    const lastMain = mainTasks.at(-1);
    if (!firstMain || !lastMain) break;
    const runs: string[] = [];
    for (const task of mainTasks) {
      const key = task.blockKey;
      if (key && runs.at(-1) !== key) runs.push(key);
    }
    const blockCountByKey: Record<string, number> = {};
    for (const key of runs) blockCountByKey[key] = (blockCountByKey[key] ?? 0) + 1;
    const presence: Record<string, number> = {};
    for (const id of canonical(problem.participants).map(({ id }) => id)) {
      presence[id] = participantPresenceSpan(id, ordered);
    }
    const values = Object.values(presence);
    const resourcePresence = resourcePresenceMetrics(problem.resources, ordered);
    const resourceRoute = resourceRouteMetrics(problem, ordered);
    const resourceValues = Object.values(resourcePresence.presenceMinutesById);
    const secondaryStartById: Record<string, number | null> = {}, secondaryEndById: Record<string, number | null> = {}, secondaryGapsById: Record<string, number> = {}, secondaryBlocksById: Record<string, number> = {};
    for (const space of requiredSecondarySpaces(problem)) { const tasks = secondaryTasks(ordered, space.id); secondaryStartById[space.id] = secondaryStart(tasks); secondaryEndById[space.id] = secondaryEnd(tasks); secondaryGapsById[space.id] = secondaryGapMinutes(tasks); secondaryBlocksById[space.id] = secondaryBlockCount(tasks); }
    const metrics: PlanMetrics = {
      ...validation,
      complete: true,
      plannedTaskCount: all.length,
      unplannedTaskCount: 0,
      mainFlowStart: firstMain.start,
      mainFlowEnd: lastMain.end,
      mainFlowGapMinutes: mainTasks.slice(1).reduce((total, task, mainIndex) => {
        const previous = mainTasks[mainIndex];
        return total + (previous ? Math.max(0, task.start - previous.end) : 0);
      }, 0),
      blockSequence: runs,
      blockCountByKey,
      participantPresenceMinutesById: presence,
      totalParticipantPresenceMinutes: values.reduce((sum, value) => sum + value, 0),
      maxParticipantPresenceMinutes: values.length > 0 ? Math.max(...values) : 0,
      resourcePresenceMinutesById: resourcePresence.presenceMinutesById,
      resourceInternalGapMinutesById: resourcePresence.internalGapMinutesById,
      resourceMoveCountById: resourceRoute.moveCountById,
      resourceTransitionSlackMinutesById: resourceRoute.transitionSlackMinutesById,
      totalResourcePresenceMinutes: resourceValues.reduce((sum, value) => sum + value, 0),
      maxResourcePresenceMinutes: resourceValues.length > 0 ? Math.max(...resourceValues) : 0,
      alternativesGenerated: counters.alternativesGenerated,
      alternativesRetained: counters.alternativesRetained,
      branchesExplored: counters.branches,
      backtracks: counters.backtracks,
      patternsGenerated: counters.patternsGenerated,
      patternsEvaluated: counters.patternsEvaluated,
      branchBudgetConsumed: counters.branches,
      searchStopReason: "SOLUTION_FOUND",
      runtimeMs: performance.now() - begun,
      planFingerprint: fingerprint(ordered),
      auxiliaryTaskCount: problem.tasks.filter((x) => x.kind === "auxiliary").length,
      auxiliaryPlannedTaskCount: ordered.filter((x) => x.kind === "auxiliary").length,
      auxiliaryBranchesExplored: counters.auxiliaryBranches,
      auxiliarySelectionOrder: auxiliary?.selectionOrder ?? [],
      auxiliaryCandidateCountWhenSelectedByTaskId: auxiliary?.candidateCounts ?? {},
      secondaryBlockBranchesExplored: counters.secondaryBranches,
      auxiliaryWorkItemSelectionOrder: auxiliary?.workItemSelectionOrder ?? [],
      secondaryBlockCandidateCountWhenSelectedBySpaceId: auxiliary?.blockCandidateCounts ?? {},
      secondarySpaceStartById: secondaryStartById,
      secondarySpaceEndById: secondaryEndById,
      secondarySpaceGapMinutesById: secondaryGapsById,
      secondarySpaceBlockCountById: secondaryBlocksById,
      setupFamilySequenceBySpaceId: Object.fromEntries(setupSpaces(problem).map((space) => [space.id, setupFamilySequence(setupTasks(ordered, space.id))])),
      setupBlockCountBySpaceAndFamily: Object.fromEntries(setupSpaces(problem).flatMap((space) => Object.entries(setupBlockCounts(setupTasks(ordered, space.id))).map(([family, count]) => [`${space.id}|${family}`, count]))),
      setupSwitchCountBySpaceId: Object.fromEntries(setupSpaces(problem).map((space) => [space.id, setupSwitchCount(setupTasks(ordered, space.id))])),
      futureFeasibilityChecks: counters.futureChecks, futureFeasibilityBranchesExplored: counters.futureBranches, futureInfeasibleCandidatesPruned: counters.futurePruned, futureTopRankedCandidatesPruned: counters.futureTopPruned, futureBlockerCountByWorkItemKey: counters.blockers, acceptedPathMinimumFutureAlternativeCount: counters.acceptedMinimum,
    };
    return { complete: true, scheduledTasks: ordered, metrics };
  }
  return failure(problem, begun, "NO_COMPLETE_HARD_VALID_PLAN", counters);
}
