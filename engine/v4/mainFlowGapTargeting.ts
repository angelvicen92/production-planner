import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../types";
import type { V4StrategicAnalysis } from "./analysis";
import type { V4PlanQualityEvaluation } from "./quality";

export interface V4MainFlowGapTarget {
  start: number;
  end: number;
  durationMinutes: number;
  previousTaskId: string | number | null;
  nextTaskId: string | number | null;
  candidateTaskIds: Array<string | number>;
  blockingReasons: string[];
}

export interface V4MainFlowGapTargetingAnalysis { gaps: V4MainFlowGapTarget[]; totalGapMinutes: number; }

type Interval = { start: number; end: number; taskId?: number };

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

function windowToInterval(window?: TimeWindow | null): Interval | null {
  const start = toMinutes(window?.start); const end = toMinutes(window?.end);
  return start === null || end === null || end <= start ? null : { start, end };
}

function overlapMinutes(a: Interval, b: Interval): number { return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)); }
function excludedIntervals(input: EngineInput): Interval[] { return [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])].map(windowToInterval).filter((x): x is Interval => x !== null); }
const isMainFlowTask = (task: TaskInput | undefined, mainFlowId: number): boolean => Number(task?.spaceId ?? task?.zoneId) === mainFlowId || Number(task?.zoneId) === mainFlowId;
const duration = (task?: TaskInput) => Math.max(5, Number(task?.durationOverrideMin ?? 30) || 30);
const depsOf = (task?: TaskInput): number[] => [...new Set([...(task?.dependsOnTaskIds ?? []), task?.dependsOnTaskId].map(Number).filter(Number.isFinite))];
const tmplDepsOf = (task?: TaskInput): number[] => [...new Set([...(task?.dependsOnTemplateIds ?? []), task?.dependsOnTemplateId].map(Number).filter(Number.isFinite))];

export function analyzeMainFlowGapsForTargeting(input: EngineInput, baselineOutput: EngineOutput, strategicAnalysis: V4StrategicAnalysis, _baselineQuality?: V4PlanQualityEvaluation): V4MainFlowGapTargetingAnalysis {
  const mainFlowId = strategicAnalysis.mainFlow?.id;
  if (mainFlowId === undefined || mainFlowId === null) return { gaps: [], totalGapMinutes: 0 };
  const byId = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const planned = (baselineOutput.plannedTasks ?? []).map((item) => {
    const taskId = Number(item.taskId); const task = byId.get(taskId); const start = toMinutes(item.startPlanned); const end = toMinutes(item.endPlanned);
    return { taskId, task, start, end };
  }).filter((item) => item.task && item.start !== null && item.end !== null && item.end > item.start && isMainFlowTask(item.task, Number(mainFlowId))) as Array<{ taskId: number; task: TaskInput; start: number; end: number }>;
  planned.sort((a, b) => a.start - b.start || a.end - b.end);
  const exclusions = excludedIntervals(input);
  const plannedIds = new Set((baselineOutput.plannedTasks ?? []).map((item) => Number(item.taskId)));
  const allMainFlow = (input.tasks ?? []).filter((task) => task.status === "pending" && isMainFlowTask(task, Number(mainFlowId)));
  const gaps: V4MainFlowGapTarget[] = [];
  for (let i = 1; i < planned.length; i += 1) {
    const raw: Interval = { start: planned[i - 1].end, end: planned[i].start };
    if (raw.end <= raw.start) continue;
    const excluded = exclusions.reduce((sum, item) => sum + overlapMinutes(raw, item), 0);
    const net = Math.max(0, raw.end - raw.start - excluded);
    if (net <= 0) continue;
    const next = planned[i].task;
    const candidateTaskIds = allMainFlow.filter((task) => task.id === next.id || !plannedIds.has(task.id) || duration(task) <= net).map((task) => task.id);
    const missingDeps = depsOf(next).filter((id) => !plannedIds.has(id));
    const missingTemplateDeps = tmplDepsOf(next).filter((tmpl) => !(input.tasks ?? []).some((task) => task.templateId === tmpl && task.contestantId === next.contestantId && plannedIds.has(task.id)));
    const blockingReasons = [...missingDeps.map((id) => `Dependency ${id} is not planned before the gap.`), ...missingTemplateDeps.map((id) => `Template dependency ${id} is not planned before the gap.`)];
    gaps.push({ start: raw.start, end: raw.end, durationMinutes: net, previousTaskId: planned[i - 1].taskId, nextTaskId: planned[i].taskId, candidateTaskIds, blockingReasons });
  }
  return { gaps, totalGapMinutes: gaps.reduce((sum, gap) => sum + gap.durationMinutes, 0) };
}
