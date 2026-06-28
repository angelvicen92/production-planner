import type { EngineInput, TaskInput } from "../../types";
import type { PlanningAssignment } from "./operationalPlanningQualityMetrics";

export const OPERATIONAL_QUALITY_ROOT_CAUSE_ANALYZER_VERSION = "ORC-OPERATIONAL-QUALITY-ROOT-CAUSE-ANALYZER-V1";

export type OperationalQualityRootCauseMetric =
  | "resourceIdleTime"
  | "talentPermanence"
  | "resourceFragmentation"
  | "talentFragmentation"
  | "spaceDispersion"
  | "mainFlowContinuity";

export interface RankedOperationalQualityEntity {
  id: string;
  value: number;
  taskIds: number[];
  explanation: string;
}

export interface OperationalQualityProblemDiagnosis {
  metric: OperationalQualityRootCauseMetric;
  severity: "none" | "low" | "medium" | "high";
  value: number;
  affectedResourceId: string | null;
  affectedTalentId: string | null;
  affectedSpaceId: string | null;
  affectedChainId: string | null;
  problematicTimeRange: { start: string; end: string; gapMinutes: number } | null;
  taskIds: number[];
  entities: string[];
  explanation: string;
  possibleOrigin: string;
}

export interface OperationalQualityRootCauseAnalysis {
  analyzerVersion: typeof OPERATIONAL_QUALITY_ROOT_CAUSE_ANALYZER_VERSION;
  topResourcesByIdleTime: RankedOperationalQualityEntity[];
  topTalentsByPermanence: RankedOperationalQualityEntity[];
  topChainsByFragmentation: RankedOperationalQualityEntity[];
  topSpacesByDispersion: RankedOperationalQualityEntity[];
  diagnoses: OperationalQualityProblemDiagnosis[];
  evidence: string[];
  planningInfluence: "none";
}

type Window = { taskId: number; start: number; end: number; resourceIds: string[]; talentId: string | null; spaceId: string | null; chainId: string };

type Summary = { id: string; windows: Window[]; span: number; work: number; idle: number; fragmentation: number; largestGap: Gap | null; taskIds: number[] };
type Gap = { start: number; end: number; minutes: number; beforeTaskId: number; afterTaskId: number };

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const minutes = (value?: string | null): number | null => {
  const [hours, mins] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
};
const hhmm = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const taskSort = (a: Window, b: Window): number => a.start - b.start || a.end - b.end || a.taskId - b.taskId;
const byValueDesc = <T extends { id: string; value: number }>(items: T[]): T[] => [...items].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id, undefined, { numeric: true }));

function mergeWindows(windows: Window[]): Window[] {
  const merged: Window[] = [];
  for (const window of [...windows].sort(taskSort)) {
    const last = merged[merged.length - 1];
    if (!last || window.start > last.end) merged.push({ ...window, resourceIds: [...window.resourceIds] });
    else {
      last.end = Math.max(last.end, window.end);
      last.resourceIds = uniqueSorted([...last.resourceIds, ...window.resourceIds]);
    }
  }
  return merged;
}

function largestGap(windows: Window[]): Gap | null {
  const sorted = [...windows].sort(taskSort);
  let selected: Gap | null = null;
  for (let index = 1; index < sorted.length; index += 1) {
    const minutes = Math.max(0, sorted[index].start - sorted[index - 1].end);
    if (minutes <= 0) continue;
    const gap = { start: sorted[index - 1].end, end: sorted[index].start, minutes, beforeTaskId: sorted[index - 1].taskId, afterTaskId: sorted[index].taskId };
    if (!selected || gap.minutes > selected.minutes || (gap.minutes === selected.minutes && gap.start < selected.start)) selected = gap;
  }
  return selected;
}

function summarize(id: string, windows: Window[]): Summary {
  const merged = mergeWindows(windows);
  const span = merged.length === 0 ? 0 : Math.max(...merged.map((item) => item.end)) - Math.min(...merged.map((item) => item.start));
  const work = merged.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
  return { id, windows: [...windows].sort(taskSort), span: round(span), work: round(work), idle: round(Math.max(0, span - work)), fragmentation: merged.length, largestGap: largestGap(windows), taskIds: [...new Set(windows.map((item) => item.taskId))].sort((a, b) => a - b) };
}

function severity(value: number): OperationalQualityProblemDiagnosis["severity"] {
  if (value <= 0) return "none";
  if (value >= 120) return "high";
  if (value >= 30) return "medium";
  return "low";
}

function taskChainId(task: TaskInput): string {
  if (task.contestantId != null) return `contestant:${task.contestantId}`;
  if (task.itinerantTeamId != null) return `itinerant:${task.itinerantTeamId}`;
  return `task:${task.id}`;
}

function rank(summary: Summary[], value: (item: Summary) => number, label: string, topN: number): RankedOperationalQualityEntity[] {
  return byValueDesc(summary.map((item) => ({ id: item.id, value: round(value(item)), taskIds: item.taskIds, explanation: `${label} ${item.id}: ${round(value(item))} minute(s) across task(s) ${item.taskIds.join(", ") || "none"}.` }))).slice(0, topN);
}

function diagnosis(metric: OperationalQualityRootCauseMetric, item: Summary | null, value: number, explanation: string, possibleOrigin: string): OperationalQualityProblemDiagnosis {
  const gap = item?.largestGap ?? null;
  return {
    metric,
    severity: severity(value),
    value: round(value),
    affectedResourceId: metric.startsWith("resource") ? item?.id ?? null : null,
    affectedTalentId: metric === "talentPermanence" || metric === "talentFragmentation" ? item?.id ?? null : null,
    affectedSpaceId: metric === "spaceDispersion" ? item?.id ?? null : null,
    affectedChainId: item?.windows[0]?.chainId ?? null,
    problematicTimeRange: gap ? { start: hhmm(gap.start), end: hhmm(gap.end), gapMinutes: gap.minutes } : null,
    taskIds: item?.taskIds ?? [],
    entities: uniqueSorted([item?.id, item?.windows[0]?.chainId, ...(item?.windows.flatMap((window) => window.resourceIds) ?? [])].filter((entry): entry is string => Boolean(entry))),
    explanation,
    possibleOrigin,
  };
}

export function analyzeOperationalQualityRootCauses(input: EngineInput, assignments: PlanningAssignment[], topN = 5): OperationalQualityRootCauseAnalysis {
  const byTask = new Map<number, TaskInput>((input.tasks ?? []).map((task) => [task.id, task]));
  const windows: Window[] = [];
  for (const item of assignments) {
    const start = minutes(item.startPlanned);
    const end = minutes(item.endPlanned);
    if (start === null || end === null || end <= start) continue;
    const task = byTask.get(item.taskId);
    const resourceIds = uniqueSorted((item.assignedResources ?? task?.assignedResourceIds ?? []).map(String));
    windows.push({ taskId: item.taskId, start, end, resourceIds, talentId: task ? taskChainId(task) : null, spaceId: task?.spaceId != null ? String(task.spaceId) : null, chainId: task ? taskChainId(task) : `task:${item.taskId}` });
  }
  const grouped = (ids: string[], predicate: (window: Window, id: string) => boolean): Summary[] => ids.map((id) => summarize(id, windows.filter((window) => predicate(window, id))));
  const resources = grouped(uniqueSorted(windows.flatMap((window) => window.resourceIds)), (window, id) => window.resourceIds.includes(id));
  const talents = grouped(uniqueSorted(windows.map((window) => window.talentId).filter((id): id is string => Boolean(id))), (window, id) => window.talentId === id);
  const chains = grouped(uniqueSorted(windows.map((window) => window.chainId)), (window, id) => window.chainId === id);
  const spaces = grouped(uniqueSorted(windows.map((window) => window.spaceId).filter((id): id is string => Boolean(id))), (window, id) => window.spaceId === id);
  const all = summarize("main-flow", windows);
  const worstResourceIdle = byValueDesc(resources.map((item) => ({ id: item.id, value: item.idle, item })))[0]?.item ?? null;
  const worstTalentPermanence = byValueDesc(talents.map((item) => ({ id: item.id, value: item.span, item })))[0]?.item ?? null;
  const worstChainFragmentation = byValueDesc(chains.map((item) => ({ id: item.id, value: item.fragmentation, item })))[0]?.item ?? null;
  const worstSpaceDispersion = byValueDesc(spaces.map((item) => ({ id: item.id, value: item.idle, item })))[0]?.item ?? null;
  const diagnoses = [
    diagnosis("resourceIdleTime", worstResourceIdle, worstResourceIdle?.idle ?? 0, `Highest resource idle time is ${worstResourceIdle?.idle ?? 0} minute(s) for resource ${worstResourceIdle?.id ?? "none"}.`, "Gap between planned blocks for the same resource."),
    diagnosis("talentPermanence", worstTalentPermanence, worstTalentPermanence?.span ?? 0, `Highest talent permanence is ${worstTalentPermanence?.span ?? 0} minute(s) for ${worstTalentPermanence?.id ?? "none"}.`, "Talent chain spans from first to last planned task, including waiting time."),
    diagnosis("resourceFragmentation", worstResourceIdle, worstResourceIdle?.fragmentation ?? 0, `Most fragmented resource among idle candidates is ${worstResourceIdle?.id ?? "none"} with ${worstResourceIdle?.fragmentation ?? 0} block(s).`, "Non-contiguous assigned windows for the same resource."),
    diagnosis("talentFragmentation", worstChainFragmentation, worstChainFragmentation?.fragmentation ?? 0, `Most fragmented chain is ${worstChainFragmentation?.id ?? "none"} with ${worstChainFragmentation?.fragmentation ?? 0} block(s).`, "Non-contiguous tasks inside the same contestant or itinerant chain."),
    diagnosis("spaceDispersion", worstSpaceDispersion, worstSpaceDispersion?.idle ?? 0, `Highest space dispersion is ${worstSpaceDispersion?.idle ?? 0} minute(s) for space ${worstSpaceDispersion?.id ?? "none"}.`, "Same space is used across a long span with internal gaps."),
    diagnosis("mainFlowContinuity", all, all.largestGap?.minutes ?? 0, `Largest main-flow gap is ${all.largestGap?.minutes ?? 0} minute(s).`, "Gap between consecutive planned tasks in the global flow."),
  ];
  return {
    analyzerVersion: OPERATIONAL_QUALITY_ROOT_CAUSE_ANALYZER_VERSION,
    topResourcesByIdleTime: rank(resources, (item) => item.idle, "Resource idle time", topN),
    topTalentsByPermanence: rank(talents, (item) => item.span, "Talent permanence", topN),
    topChainsByFragmentation: rank(chains, (item) => item.fragmentation, "Chain fragmentation", topN),
    topSpacesByDispersion: rank(spaces, (item) => item.idle, "Space dispersion", topN),
    diagnoses,
    evidence: diagnoses.map((item) => `${item.metric}: ${item.explanation} Possible origin: ${item.possibleOrigin}`),
    planningInfluence: "none",
  };
}
