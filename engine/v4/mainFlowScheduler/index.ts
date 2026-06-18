import { generatePlanV3 } from "../../v3";
import type { EngineInput, EngineOutput, LockInput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import type { V4StrategicAnalysis } from "../analysis";
import { buildV4GuidedInput } from "../guidedInput";

export interface MainFlowFirstBlocker { taskId: number; reason: string; }
export interface MainFlowFirstDiagnostics {
  applied: boolean; mainFlowSpaceId: number | null; scheduledMainFlowTasks: number; unscheduledMainFlowTasks: number;
  placedPrerequisites: number; blockStart: string | null; blockEnd: string | null; internalGapMinutes: number;
  blockers: MainFlowFirstBlocker[]; fallbackUsed: boolean; infeasible?: boolean; reason?: string;
}
export interface MainFlowFirstResult { output: EngineOutput; diagnostics: MainFlowFirstDiagnostics; delegatedInput: EngineInput; }

type Interval = { start: number; end: number; taskId?: number; kind?: string };
const INF = Number.POSITIVE_INFINITY;
const toMin = (v?: string | null): number | null => { const [h,m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h)&&Number.isFinite(m) ? h*60+m : null; };
const hhmm = (m: number) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const duration = (task: TaskInput) => Math.max(5, Number(task.durationOverrideMin ?? 30) || 30);
const idNum = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const unique = (xs: unknown[]) => [...new Set(xs.map(Number).filter(Number.isFinite))];

function hardBreaks(input: EngineInput): Interval[] {
  const windows: TimeWindow[] = [...(input.globalHardBreaks ?? [])];
  if (input.mealMode !== "flexible_meal_window" && input.meal?.start && input.meal?.end) windows.push(input.meal);
  if (input.actualMeal?.start && input.actualMeal?.end && !input.actualMeal.contestantId && !input.actualMeal.spaceId && !input.actualMeal.itinerantTeamId) windows.push(input.actualMeal);
  return windows.map(w => ({ start: toMin(w.start) ?? 0, end: toMin(w.end) ?? 0, kind: "break" })).filter(i => i.end > i.start);
}
function deps(task: TaskInput): number[] { return unique([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId]); }
function templateDeps(task: TaskInput): number[] { return unique([...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]); }
function isLockedFixed(input: EngineInput, task: TaskInput): boolean {
  return Boolean(task.fixedWindowStart && task.fixedWindowEnd) || (input.locks ?? []).some(l => Number(l.taskId) === task.id && Boolean(l.lockedStart && l.lockedEnd));
}
function isMainFlowTask(task: TaskInput, spaceId: number): boolean { return Number(task.spaceId ?? task.zoneId) === spaceId || Number(task.zoneId) === spaceId; }
function occupiedFromInput(input: EngineInput, tasksById: Map<number, TaskInput>, placed: Map<number, Interval>, kind: "space"|"talent", id: number): Interval[] {
  const out: Interval[] = [...hardBreaks(input)];
  for (const task of input.tasks ?? []) {
    const s = toMin(task.startPlanned ?? task.startReal ?? task.fixedWindowStart); const e = toMin(task.endPlanned ?? task.endReal ?? task.fixedWindowEnd);
    if (s === null || e === null || e <= s) continue;
    if (kind === "space" && Number(task.spaceId ?? task.zoneId) !== id) continue;
    if (kind === "talent" && Number(task.contestantId) !== id) continue;
    out.push({ start: s, end: e, taskId: task.id, kind: task.status });
  }
  for (const lock of input.locks ?? []) {
    const task = tasksById.get(Number(lock.taskId)); const s = toMin(lock.lockedStart); const e = toMin(lock.lockedEnd);
    if (!task || s === null || e === null) continue;
    if (kind === "space" && Number(task.spaceId ?? task.zoneId) !== id) continue;
    if (kind === "talent" && Number(task.contestantId) !== id) continue;
    out.push({ start: s, end: e, taskId: task.id, kind: "lock" });
  }
  for (const [taskId, p] of placed) {
    const task = tasksById.get(taskId); if (!task) continue;
    if ((kind === "space" && Number(task.spaceId ?? task.zoneId) === id) || (kind === "talent" && Number(task.contestantId) === id)) out.push(p);
  }
  return out;
}
function findSlot(input: EngineInput, tasksById: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, earliest: number, latestEnd: number): Interval | null {
  const workStart = toMin(input.workDay.start) ?? 0; const workEnd = toMin(input.workDay.end) ?? 24*60;
  const dur = duration(task); const space = idNum(task.spaceId ?? task.zoneId); const talent = idNum(task.contestantId);
  const startMin = Math.max(workStart, earliest, toMin(input.contestantAvailabilityById?.[talent ?? -1]?.start) ?? workStart);
  const endMax = Math.min(workEnd, latestEnd, toMin(input.contestantAvailabilityById?.[talent ?? -1]?.end) ?? workEnd);
  for (let s = startMin; s + dur <= endMax; s += 5) {
    const c = { start: s, end: s + dur, taskId: task.id };
    const busy = [...(space !== null ? occupiedFromInput(input, tasksById, placed, "space", space) : hardBreaks(input)), ...(talent !== null ? occupiedFromInput(input, tasksById, placed, "talent", talent) : [])];
    if (!busy.some(b => overlaps(c, b))) return c;
  }
  return null;
}

export function buildMainFlowFirstPlan(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options?: EngineV3Options): MainFlowFirstResult {
  const baseDiag: MainFlowFirstDiagnostics = { applied: false, mainFlowSpaceId: strategicAnalysis.mainFlow?.id ?? null, scheduledMainFlowTasks: 0, unscheduledMainFlowTasks: 0, placedPrerequisites: 0, blockStart: null, blockEnd: null, internalGapMinutes: 0, blockers: [], fallbackUsed: false };
  if (!strategicAnalysis.mainFlow) {
    const guided = buildV4GuidedInput(input, strategicAnalysis);
    return { output: generatePlanV3(guided.input, options), delegatedInput: guided.input, diagnostics: { ...baseDiag, fallbackUsed: true, reason: "No main flow configured; delegated to main_flow_guided." } };
  }
  const tasks = input.tasks ?? []; const byId = new Map(tasks.map(t => [t.id, t])); const placed = new Map<number, Interval>();
  const sequenceRank = new Map((strategicAnalysis.mainFlowSequence ?? []).map((x,i) => [x.talentId, i]));
  const delayRank = new Map((strategicAnalysis.costOfDelayRanking ?? []).map((x,i) => [x.talentId, i]));
  const pressure = new Map((strategicAnalysis.criticalTalents ?? []).map(x => [x.id, x.pressureScore]));
  const original = new Map(tasks.map((t,i) => [t.id, i]));
  const main = tasks.filter(t => t.status === "pending" && isMainFlowTask(t, strategicAnalysis.mainFlow!.id) && !isLockedFixed(input,t))
    .sort((a,b) => (sequenceRank.get(Number(a.contestantId)) ?? INF) - (sequenceRank.get(Number(b.contestantId)) ?? INF) || (delayRank.get(Number(a.contestantId)) ?? INF) - (delayRank.get(Number(b.contestantId)) ?? INF) || (pressure.get(Number(b.contestantId)) ?? 0) - (pressure.get(Number(a.contestantId)) ?? 0) || (toMin(a.fixedWindowStart) ?? INF) - (toMin(b.fixedWindowStart) ?? INF) || deps(a).length - deps(b).length || (original.get(a.id) ?? 0) - (original.get(b.id) ?? 0));
  let cursor = toMin(input.workDay.start) ?? 0;
  for (const task of main) {
    for (const depId of deps(task)) {
      const dep = byId.get(depId); if (dep?.status === "pending" && !placed.has(dep.id) && !isLockedFixed(input, dep)) {
        const pre = findSlot(input, byId, placed, dep, toMin(input.workDay.start) ?? 0, cursor || INF);
        if (pre) { placed.set(dep.id, pre); baseDiag.placedPrerequisites += 1; } else baseDiag.blockers.push({ taskId: task.id, reason: "Missing direct prerequisite before main flow task" });
      }
    }
    for (const tmpl of templateDeps(task)) {
      const dep = tasks.find(t => t.status === "pending" && t.templateId === tmpl && t.contestantId === task.contestantId && !placed.has(t.id));
      if (dep && !isLockedFixed(input, dep)) {
        const pre = findSlot(input, byId, placed, dep, toMin(input.workDay.start) ?? 0, cursor || INF);
        if (pre) { placed.set(dep.id, pre); baseDiag.placedPrerequisites += 1; } else baseDiag.blockers.push({ taskId: task.id, reason: "Missing direct prerequisite before main flow task" });
      }
    }
    const slot = findSlot(input, byId, placed, task, cursor, INF);
    if (slot) { placed.set(task.id, slot); cursor = slot.end; } else baseDiag.blockers.push({ taskId: task.id, reason: "No safe early continuous slot found" });
  }
  const internalLocks: LockInput[] = [...placed].map(([taskId, p], i) => ({ id: -900000 - i, planId: input.planId, taskId, lockType: "time", lockedStart: hhmm(p.start), lockedEnd: hhmm(p.end) }));
  const delegatedInput = { ...input, locks: [...(input.locks ?? []), ...internalLocks] };
  const output = generatePlanV3(delegatedInput, options);
  const mainPlaced = main.filter(t => output.plannedTasks?.some(p => p.taskId === t.id));
  const starts = mainPlaced.map(t => toMin(output.plannedTasks.find(p => p.taskId === t.id)?.startPlanned)).filter((n): n is number => n !== null);
  const ends = mainPlaced.map(t => toMin(output.plannedTasks.find(p => p.taskId === t.id)?.endPlanned)).filter((n): n is number => n !== null);
  const ordered = mainPlaced.map(t => output.plannedTasks.find(p => p.taskId === t.id)).filter(Boolean).sort((a:any,b:any)=>(toMin(a.startPlanned)??0)-(toMin(b.startPlanned)??0));
  const gaps = ordered.reduce((sum:any,p:any,i:number) => i ? sum + Math.max(0, (toMin(p.startPlanned)??0) - (toMin((ordered[i-1] as any).endPlanned)??0)) : 0, 0);
  return { output, delegatedInput, diagnostics: { ...baseDiag, applied: output.hardFeasible !== false, infeasible: output.hardFeasible === false, scheduledMainFlowTasks: mainPlaced.length, unscheduledMainFlowTasks: Math.max(0, main.length - mainPlaced.length), blockStart: starts.length ? hhmm(Math.min(...starts)) : null, blockEnd: ends.length ? hhmm(Math.max(...ends)) : null, internalGapMinutes: gaps, fallbackUsed: false, reason: output.hardFeasible === false ? "Main flow first candidate discarded by hard feasibility gate." : "Main flow first pre-locked a compact early block and delegated the rest to V3." } };
}
