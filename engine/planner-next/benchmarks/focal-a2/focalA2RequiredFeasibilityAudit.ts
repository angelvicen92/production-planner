import { createHash } from "node:crypto";
import type { PlannerNextProblem, Task, Window } from "../../contracts";
import { FOCAL_A2_BAND_RESOURCE_ID, projectFocalA2BandProblem } from "./focalA2BandReference";

export const FOCAL_REQUIRED_INFEASIBLE =
  "FOCAL_A2_REQUIRED_SINGLE_BLOCK_INFEASIBLE_UNDER_FEEDER_AND_COACH_CONSTRAINTS";

const canonical = (value: any): any => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const intersects = (sets: Window[][], duration: number): number | null => {
  const starts = [...new Set(sets.flat().map((w) => w.start))].sort((a, b) => a - b);
  for (const start of starts) if (sets.every((windows) => windows.some((w) => w.start <= start && start + duration <= w.end))) return start;
  return null;
};
const runs = (pattern: string[]) => pattern.reduce<string[][]>((out, key) => {
  if (out.at(-1)?.[0] === key) out.at(-1)!.push(key); else out.push([key]); return out;
}, []);

export interface FocalRequiredAuditOptions { problem?: PlannerNextProblem; resourceId?: string }

/** Independent necessary-condition proof. It neither invokes nor models the planner search. */
export function auditFocalA2RequiredFeasibility(options: FocalRequiredAuditOptions = {}) {
  const problem = options.problem ?? projectFocalA2BandProblem("CURRENT_REQUIRED");
  const resourceId = options.resourceId ?? FOCAL_A2_BAND_RESOURCE_ID;
  const before = JSON.stringify(problem);
  const mains = problem.tasks.filter((t): t is Extract<Task, { kind: "main" }> => t.kind === "main")
    .sort((a, b) => a.id.localeCompare(b.id));
  const coaches = [...new Set(mains.map((t) => t.coachId!))].sort();
  const required = (t: Task) => (t.requiredResourceIds ?? []).includes(resourceId);
  const count = (items: Task[]) => Object.fromEntries(coaches.map((id) => [id, items.filter((t) => t.coachId === id).length]));
  const coachTaskCounts = count(mains), requiredTaskCountsByCoach = count(mains.filter(required));
  const nonRequiredTaskCountsByCoach = count(mains.filter((t) => !required(t)));
  const patterns: string[][] = [];
  const enumerate = (prefix: string[], remaining: Record<string, number>) => {
    if (prefix.length === mains.length) {
      const blocks = runs(prefix);
      if (blocks.every((r) => r.length >= problem.mainFlow.minTasksPerBlock)
        && coaches.every((c) => blocks.filter((r) => r[0] === c).length <= problem.mainFlow.maxBlocksByKey)) patterns.push(prefix);
      return;
    }
    for (const coach of coaches) if (remaining[coach]! > 0) enumerate([...prefix, coach], { ...remaining, [coach]: remaining[coach]! - 1 });
  };
  enumerate([], coachTaskCounts);
  const mealSpace = problem.spaces.find((s) => s.id === problem.mainFlow.spaceId)!;
  const meal = mealSpace.mealPolicy?.window ?? problem.protectedMeal;
  const duration = mains[0]?.duration ?? 0;
  const maximumAfternoonTaskCount = Math.floor((problem.day.end - meal.end) / duration);
  const minimumMorningTaskCount = mains.length - maximumAfternoonTaskCount;
  const latestFirstStart = meal.start - minimumMorningTaskCount * duration;
  const latestPrefixMainStartByPosition = Array.from({ length: mains.length - mains.filter(required).length }, (_, i) => latestFirstStart + i * duration);
  const candidateWindows: any[] = [];
  for (const pattern of patterns) for (let startIndex = 0; startIndex <= mains.length - mains.filter(required).length; startIndex += 1) {
    const window = pattern.slice(startIndex, startIndex + mains.filter(required).length);
    if (coaches.some((c) => window.filter((x) => x === c).length !== requiredTaskCountsByCoach[c])) continue;
    const prefixCounts: Record<string, number> = Object.fromEntries(coaches.map((c) => [c, pattern.slice(0, startIndex).filter((x) => x === c).length]));
    const suffixCounts = Object.fromEntries(coaches.map((c) => [c, nonRequiredTaskCountsByCoach[c]! - prefixCounts[c]!]));
    const forcedBefore = coaches.flatMap((coach) => mains.filter((t) => !required(t) && t.coachId === coach).slice(0, prefixCounts[coach]));
    const blockers = forcedBefore.map((main) => {
      const feeder = problem.tasks.find((t) => main.dependencies.includes(t.id));
      const participant = problem.participants.find((p) => p.id === main.participantId)!;
      const coach = problem.coaches.find((c) => c.id === feeder?.coachId)!;
      const space = problem.spaces.find((s) => s.id === feeder?.spaceId)!;
      const vocalStart = feeder ? intersects([participant.availability, coach.availability, space.availability], feeder.duration) : null;
      const earliestMainStart = vocalStart == null || !feeder ? null : Math.max(vocalStart + feeder.duration + problem.participantTransitionMinutes, participant.availability[0]!.start);
      return { taskId: main.id, feederId: feeder?.id, earliestVocalStart: vocalStart, earliestMainStart };
    }).filter((x) => x.earliestMainStart == null || x.earliestMainStart > latestPrefixMainStartByPosition[startIndex - 1]!);
    candidateWindows.push({ pattern: pattern.join(","), startIndex, prefixCounts: Object.fromEntries(coaches.map((c) => [c, pattern.slice(0, startIndex).filter((x) => x === c).length])), suffixCounts, forcedBeforeTaskIds: forcedBefore.map((t) => t.id), blockers });
  }
  const blockerTaskIds = [...new Set(candidateWindows.flatMap((w) => w.blockers.map((b: any) => b.taskId)))].sort();
  const blockerFeederIds = [...new Set(candidateWindows.flatMap((w) => w.blockers.map((b: any) => b.feederId)).filter(Boolean))].sort();
  const feasibleRequiredWindowCount = candidateWindows.filter((w) => w.blockers.length === 0).length;
  const output = {
    proofVersion: "focal-a2-required-feasibility-proof-v1", inputDigest: digest(problem), mainTaskCount: mains.length,
    requiredTaskCount: mains.filter(required).length, nonRequiredTaskCount: mains.filter((t) => !required(t)).length,
    coachTaskCounts, requiredTaskCountsByCoach, nonRequiredTaskCountsByCoach,
    legalCoachPatternCount: patterns.length, legalPatterns: patterns.map((p) => p.join(",")),
    membershipCompatiblePatternWindowCount: candidateWindows.length,
    compatibleStartIndexes: [...new Set(candidateWindows.map((w) => w.startIndex))].sort((a, b) => a - b),
    minimumMorningTaskCount, maximumAfternoonTaskCount, latestPrefixMainStartByPosition,
    candidateWindows, blockerTaskIds, blockerFeederIds, feasibleRequiredWindowCount,
    infeasible: feasibleRequiredWindowCount === 0,
    reasonCodes: feasibleRequiredWindowCount === 0 ? [FOCAL_REQUIRED_INFEASIBLE] : [],
    deterministic: true, inputUnchanged: before === JSON.stringify(problem),
  };
  return output;
}
