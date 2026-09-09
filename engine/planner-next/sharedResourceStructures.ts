import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { findCanonicalPerfectMatching } from "./macroScheduling";
import { prepareTaskPlacementAuthority } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { createSetupPreparation, setupPreparationDuration } from "./setupPreparation";

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
const resources = (task: Task) => [...(task.requiredResourceIds ?? [])].sort();

/** Canonical operational shape; participant identity and display text deliberately do not participate. */
export const homogeneousResourceTaskKey = (task: Task): string => JSON.stringify({
  kind: task.kind,
  spaceId: task.spaceId,
  duration: task.duration,
  resourceIds: resources(task),
  setupFamilyId: task.setupFamilyId ?? null,
  blockKey: "blockKey" in task ? task.blockKey ?? null : null,
  jointGroupId: "jointGroupId" in task ? task.jointGroupId ?? null : null,
});

export interface SharedResourceStructure {
  id: string;
  resourceId: string;
  tasks: Task[];
  flexibleGroups: Array<{ key: string; tasks: Task[] }>;
  hardFamilies: Array<{ spaceId: string; familyId: string; tasks: Task[] }>;
}

/** Finds only structures with both repeated flexible load and another exclusive use of the resource. */
export function deriveSharedResourceStructures(tasks: readonly Task[]): SharedResourceStructure[] {
  const result: SharedResourceStructure[] = [];
  const resourceIds = [...new Set(tasks.flatMap(resources))].sort();
  for (const resourceId of resourceIds) {
    const members = tasks.filter((task) => resources(task).includes(resourceId)).sort(byId);
    const flexibleByKey = new Map<string, Task[]>();
    for (const task of members.filter(({ setupFamilyId }) => setupFamilyId === undefined)) {
      const key = homogeneousResourceTaskKey(task);
      flexibleByKey.set(key, [...(flexibleByKey.get(key) ?? []), task]);
    }
    const hasRepeatedFlexibleLoad = [...flexibleByKey.values()].some((group) => group.length > 1);
    const flexibleGroups = [...flexibleByKey]
      .map(([key, group]) => ({ key, tasks: group.sort(byId) })).sort((a, b) => a.key.localeCompare(b.key));
    if (!hasRepeatedFlexibleLoad || members.length === flexibleGroups.reduce((n, group) => n + group.tasks.length, 0)) continue;
    const familyKeys = [...new Set(members.filter(({ setupFamilyId }) => setupFamilyId !== undefined)
      .map((task) => `${task.spaceId}\0${task.setupFamilyId}`))].sort();
    const hardFamilies = familyKeys.map((key) => {
      const [spaceId, familyId] = key.split("\0");
      return { spaceId: spaceId!, familyId: familyId!, tasks: members.filter((task) => task.spaceId === spaceId && task.setupFamilyId === familyId).sort(byId) };
    });
    result.push({ id: `shared-resource:${resourceId}`, resourceId, tasks: members, flexibleGroups, hardFamilies });
  }
  return result;
}

export interface SharedResourceStructureEvidence {
  branches: number;
  compactRunsTried: number;
  compactRunsSucceeded: number;
  gapInsertions: number;
  maximumFragments: number;
  candidates: number;
  capacityPrunes: number;
  matchingAttempts: number;
  matchingSuccesses: number;
  permutationsAvoided: number;
}

export interface SharedResourceCandidate { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[] }

/**
 * Enumerates resource geometry before assigning participant identities.  DFS orders the no-gap
 * continuation first, but subsequently visits every five-minute start, so compactness is never a
 * hard constraint. Hard setup families are emitted atomically and can never re-enter.
 */
export function exploreSharedResourceStructure(
  problem: PlannerNextProblem,
  structure: SharedResourceStructure,
  placed: readonly ScheduledTask[],
  existingPreparations: readonly ScheduledSetupPreparation[],
  meals: readonly ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  accept: (candidate: SharedResourceCandidate) => "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED",
): { outcome: "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED"; evidence: SharedResourceStructureEvidence } {
  const evidence: SharedResourceStructureEvidence = { branches: 0, compactRunsTried: 0, compactRunsSucceeded: 0,
    gapInsertions: 0, maximumFragments: 0, candidates: 0, capacityPrunes: 0, matchingAttempts: 0, matchingSuccesses: 0, permutationsAvoided: 0 };
  const resource = problem.resources.find(({ id }) => id === structure.resourceId);
  const freeCapacity = (resource?.availability ?? []).reduce((sum, window) => sum + window.end - window.start, 0);
  const preparationLoad = [...new Set(structure.hardFamilies.map(({ spaceId }) => spaceId))].reduce((sum, spaceId) => {
    const policy = problem.spaces.find(({ id }) => id === spaceId)?.setupPolicy;
    return sum + (policy && structure.hardFamilies.filter((family) => family.spaceId === spaceId).length > 1
      ? policy.preparationMinutesBetweenFamilies ?? 0 : 0);
  }, 0);
  if (structure.tasks.reduce((sum, task) => sum + task.duration, 0) + preparationLoad > freeCapacity) {
    evidence.capacityPrunes = 1;
    return { outcome: "DEAD_END", evidence };
  }
  type Segment = { kind: "flex"; key: string; duration: number } | { kind: "family"; family: SharedResourceStructure["hardFamilies"][number] };
  const flexibleRemaining = new Map(structure.flexibleGroups.map((group) => [group.key, group.tasks.length]));
  const flexibleTasks = new Map(structure.flexibleGroups.map((group) => [group.key, group.tasks]));
  const familyRemaining = new Map(structure.hardFamilies.map((family) => [`${family.spaceId}\0${family.familyId}`, family]));
  const slots = new Map<string, number[]>();

  const materialize = (segments: readonly { segment: Segment; start: number }[], preparations: ScheduledSetupPreparation[]): SharedResourceCandidate | null => {
    const scheduled: ScheduledTask[] = [];
    for (const [key, starts] of [...slots].sort(([a], [b]) => a.localeCompare(b))) {
      const tasks = flexibleTasks.get(key)!;
      evidence.matchingAttempts += 1;
      const authorities = new Map(tasks.map((task) => [task.id, prepareTaskPlacementAuthority(problem, task, [...placed, ...scheduled], meals)]));
      const slotIds = starts.map((_, index) => String(index));
      const matching = findCanonicalPerfectMatching(slotIds, tasks.map(({ id }) => id), (taskId, slotId) => {
        const authority = authorities.get(taskId)!;
        return authority.accepts(starts[Number(slotId)]!, authority.baseDomain);
      });
      if (!matching) return null;
      evidence.matchingSuccesses += 1; evidence.permutationsAvoided += Math.max(0, tasks.length - 1);
      for (const [slotId, taskId] of matching) {
        const task = tasks.find(({ id }) => id === taskId)!;
        scheduled.push(scoreAuxiliaryTask(problem, task, starts[Number(slotId)]!, [...placed, ...scheduled]).scheduled);
      }
    }
    for (const { segment, start } of segments) if (segment.kind === "family") {
      const tasks = segment.family.tasks;
      const slotIds = tasks.map((_, index) => String(index));
      const authorities = new Map(tasks.map((task) => [task.id, prepareTaskPlacementAuthority(problem, task, [...placed, ...scheduled], meals)]));
      evidence.matchingAttempts += 1;
      const matching = findCanonicalPerfectMatching(slotIds, tasks.map(({ id }) => id), (taskId, slotId) => {
        const authority = authorities.get(taskId)!;
        return authority.accepts(start + Number(slotId) * tasks[0]!.duration, authority.baseDomain);
      });
      if (!matching) return null;
      evidence.matchingSuccesses += 1; evidence.permutationsAvoided += Math.max(0, tasks.length - 1);
      for (const [slotId, taskId] of matching) {
        const task = tasks.find(({ id }) => id === taskId)!;
        scheduled.push(scoreAuxiliaryTask(problem, task, start + Number(slotId) * task.duration, [...placed, ...scheduled]).scheduled);
      }
    }
    const ordered = scheduled.sort((a, b) => a.start - b.start || byId(a, b));
    for (let index = 0; index < ordered.length; index++) {
      const task = ordered[index]!;
      const authority = prepareTaskPlacementAuthority(problem, task, [...placed, ...ordered.slice(0, index), ...ordered.slice(index + 1)], meals);
      if (!authority.accepts(task.start, authority.baseDomain)) return null;
    }
    return { tasks: ordered, preparations };
  };

  const visit = (cursor: number, segments: Array<{ segment: Segment; start: number }>, preparations: ScheduledSetupPreparation[], lastFlex: string | null, fragments: number): "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED" => {
    const pendingFlex = [...flexibleRemaining].filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b));
    const pendingFamilies = [...familyRemaining.values()].sort((a, b) => `${a.spaceId}\0${a.familyId}`.localeCompare(`${b.spaceId}\0${b.familyId}`));
    if (pendingFlex.length === 0 && pendingFamilies.length === 0) {
      evidence.maximumFragments = Math.max(evidence.maximumFragments, fragments); evidence.candidates += 1;
      const candidate = materialize(segments, preparations);
      if (!candidate) return "DEAD_END";
      if (fragments === structure.flexibleGroups.length) evidence.compactRunsSucceeded += 1;
      return accept(candidate);
    }
    const choices: Segment[] = [
      ...pendingFlex.sort(([a], [b]) => (a === lastFlex ? -1 : b === lastFlex ? 1 : a.localeCompare(b)))
        .map(([key]) => ({ kind: "flex" as const, key, duration: flexibleTasks.get(key)![0]!.duration })),
      ...pendingFamilies.map((family) => ({ kind: "family" as const, family })),
    ];
    // Explore the same gap for every structural continuation before widening it. This makes
    // fragment/span/idle ordering global at this depth instead of exhausting one identity-free
    // sequence's gaps before trying the next sequence.
    for (let gap = 0; cursor + gap < problem.day.end; gap += 5) {
      for (const segment of choices) {
        const duration = segment.kind === "flex" ? segment.duration : segment.family.tasks.reduce((sum, task) => sum + task.duration, 0);
        const policy = segment.kind === "family" ? problem.spaces.find(({ id }) => id === segment.family.spaceId)?.setupPolicy : undefined;
        const previousSameSpaceFamily = segment.kind === "family" ? segments.filter(({ segment: prior }) => prior.kind === "family" && prior.family.spaceId === segment.family.spaceId) : [];
        const preparationDuration = segment.kind === "family" && policy ? setupPreparationDuration(policy, segment.family.familyId, previousSameSpaceFamily.length > 0) ?? 0 : 0;
        const occupationStart = cursor + gap;
        if (occupationStart + preparationDuration + duration > problem.day.end) continue;
        if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        evidence.branches += 1;
        const start = occupationStart + preparationDuration;
        if (segment.kind === "flex" && lastFlex === segment.key && gap === 0) evidence.compactRunsTried += 1;
        if (gap > 0) evidence.gapInsertions += 1;
        let nextPreparations = preparations;
        if (segment.kind === "family" && preparationDuration > 0) nextPreparations = [...preparations,
          createSetupPreparation(segment.family.spaceId, segment.family.familyId, 1, preparationDuration, occupationStart)];
        if (segment.kind === "flex") {
          flexibleRemaining.set(segment.key, flexibleRemaining.get(segment.key)! - 1);
          slots.set(segment.key, [...(slots.get(segment.key) ?? []), start]);
        } else familyRemaining.delete(`${segment.family.spaceId}\0${segment.family.familyId}`);
        const nextFragments = segment.kind === "flex" && lastFlex !== segment.key ? fragments + 1 : fragments;
        const outcome = visit(start + duration, [...segments, { segment, start }], nextPreparations,
          segment.kind === "flex" ? segment.key : null, nextFragments);
        if (segment.kind === "flex") { flexibleRemaining.set(segment.key, flexibleRemaining.get(segment.key)! + 1); slots.get(segment.key)!.pop(); }
        else familyRemaining.set(`${segment.family.spaceId}\0${segment.family.familyId}`, segment.family);
        if (outcome !== "DEAD_END") return outcome;
      }
    }
    return "DEAD_END";
  };
  return { outcome: visit(problem.day.start, [], [...existingPreparations], null, 0), evidence };
}
