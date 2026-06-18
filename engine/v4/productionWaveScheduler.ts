import { generatePlanV3 } from "../v3";
import { validateHardConstraints } from "../v3/hardValidation";
import type { EngineInput, EngineOutput, LockInput, TaskInput, TimeWindow } from "../types";
import type { EngineV3Options } from "../v3/types";
import type { V4StrategicAnalysis } from "./analysis";
import { buildV4GuidedInput } from "./guidedInput";

export interface ProductionWaveBlocker { taskId: number; reason: string; details?: string; }
export interface ProductionWaveDiagnostics {
  applied: boolean;
  mainFlowSpaceId: number | null;
  waveStart: string | null;
  waveEnd: string | null;
  mainFlowTasksPlaced: number;
  prerequisitesPlaced: number;
  dependentTasksPlaced: number;
  strategicInternalLocks: number;
  mainFlowGapMinutes: number;
  resourceAwareValidation: boolean;
  blockers: ProductionWaveBlocker[];
  warnings: string[];
  fallbackUsed: boolean;
  infeasible?: boolean;
  reason?: string;
}
export interface ProductionWaveResult { output: EngineOutput; delegatedInput: EngineInput; diagnostics: ProductionWaveDiagnostics; }

interface Options { maxDependencyDepth?: number; }
type Interval = { start: number; end: number; taskId?: number; kind?: string; resources?: number[] };
const INF = Number.POSITIVE_INFINITY;
const toMin = (v?: string | null): number | null => { const [h, m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const unique = (xs: unknown[]) => [...new Set(xs.map(Number).filter(Number.isFinite))];
const duration = (task: TaskInput) => Math.max(5, Number(task.durationOverrideMin ?? 30) || 30);
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const spaceOf = (task: TaskInput) => Number.isFinite(Number(task.spaceId ?? task.zoneId)) ? Number(task.spaceId ?? task.zoneId) : null;
const talentOf = (task: TaskInput) => Number.isFinite(Number(task.contestantId)) ? Number(task.contestantId) : null;
const directDeps = (task: TaskInput) => unique([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId]);
const templateDeps = (task: TaskInput) => unique([...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]);
const isProtected = (task: TaskInput) => task.status === "done" || task.status === "in_progress" || Boolean(task.fixedWindowStart && task.fixedWindowEnd);
const isMainFlowTask = (task: TaskInput, mainFlowId: number) => spaceOf(task) === mainFlowId || Number(task.zoneId) === mainFlowId;
const resourceIds = (task: TaskInput): number[] => unique([...(task.assignedResourceIds ?? []), ...Object.keys(task.resourceRequirements?.byItem ?? {}), ...(task.resourceRequirements?.anyOf ?? []).flatMap((g) => g.resourceItemIds ?? [])]);

function hardBreaks(input: EngineInput): Interval[] {
  const windows: TimeWindow[] = [...(input.globalHardBreaks ?? [])];
  if (input.mealMode !== "flexible_meal_window" && input.meal?.start && input.meal?.end) windows.push(input.meal);
  if (input.actualMeal?.start && input.actualMeal?.end && !input.actualMeal.contestantId && !input.actualMeal.spaceId && !input.actualMeal.itinerantTeamId) windows.push(input.actualMeal);
  return windows.map((w) => ({ start: toMin(w.start) ?? 0, end: toMin(w.end) ?? 0, kind: "hard_break" })).filter((i) => i.end > i.start);
}

function fixedIntervals(input: EngineInput, byId: Map<number, TaskInput>): Interval[] {
  const intervals: Interval[] = [];
  for (const task of input.tasks ?? []) {
    const s = toMin(task.startPlanned ?? task.startReal ?? task.fixedWindowStart); const e = toMin(task.endPlanned ?? task.endReal ?? task.fixedWindowEnd);
    if (s !== null && e !== null && e > s) intervals.push({ start: s, end: e, taskId: task.id, kind: task.status, resources: resourceIds(task) });
  }
  for (const lock of input.locks ?? []) {
    const task = byId.get(Number(lock.taskId)); const s = toMin(lock.lockedStart); const e = toMin(lock.lockedEnd);
    if (task && s !== null && e !== null && e > s) intervals.push({ start: s, end: e, taskId: task.id, kind: "lock", resources: resourceIds(task) });
  }
  return intervals;
}

function conflicts(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, c: Interval, warnings: string[]): string | null {
  if (hardBreaks(input).some((b) => overlaps(c, b))) return "hard break";
  const sId = spaceOf(task); const tId = talentOf(task); const rIds = resourceIds(task);
  if ((task.resourceRequirements?.byType && Object.keys(task.resourceRequirements.byType).length) || (task.resourceRequirements?.anyOf ?? []).some((g) => !g.resourceItemIds?.length || Number(g.quantity ?? 1) !== 1)) {
    warnings.push(`Task ${task.id}: unresolved resource type or unsafe anyOf quantity delegated to V3.`); return "unsafe resource requirement";
  }
  const all = [...fixedIntervals(input, byId), ...[...placed.entries()].map(([taskId, p]) => ({ ...p, taskId, resources: resourceIds(byId.get(taskId)!) }))];
  for (const busy of all) {
    const other = busy.taskId ? byId.get(busy.taskId) : null;
    if (!other || busy.taskId === task.id || !overlaps(c, busy)) continue;
    if (sId !== null && spaceOf(other) === sId) return `space ${sId} conflict`;
    if (tId !== null && talentOf(other) === tId) return `talent ${tId} conflict`;
    const shared = rIds.find((id) => (busy.resources ?? []).includes(id));
    if (shared) return `resource ${shared} conflict`;
  }
  if (Number(task.camerasOverride ?? 0) > 0) {
    const simultaneous = all.filter((busy) => overlaps(c, busy)).reduce((sum, busy) => sum + Number(byId.get(Number(busy.taskId))?.camerasOverride ?? 0), 0);
    if (simultaneous + Number(task.camerasOverride ?? 0) > Number(input.camerasAvailable ?? INF)) return "camera conflict";
  }
  return null;
}

function findSlot(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, earliest: number, warnings: string[]): Interval | null {
  const workStart = toMin(input.workDay.start) ?? 0; const workEnd = toMin(input.workDay.end) ?? 24 * 60;
  const avail = input.contestantAvailabilityById?.[talentOf(task) ?? -1];
  const startMin = Math.max(workStart, earliest, toMin(avail?.start) ?? workStart); const endMax = Math.min(workEnd, toMin(avail?.end) ?? workEnd);
  for (let s = startMin; s + duration(task) <= endMax; s += 5) {
    const c = { start: s, end: s + duration(task), taskId: task.id };
    if (!conflicts(input, byId, placed, task, c, warnings)) return c;
  }
  return null;
}

function expandPrerequisites(root: TaskInput, tasks: TaskInput[], byId: Map<number, TaskInput>, maxDepth: number, blockers: ProductionWaveBlocker[]): TaskInput[] {
  const out: TaskInput[] = []; const visiting = new Set<number>(); const seen = new Set<number>();
  const visit = (task: TaskInput, depth: number) => {
    if (depth > maxDepth) return;
    if (visiting.has(task.id)) { blockers.push({ taskId: root.id, reason: "Dependency cycle", details: `Cycle at task ${task.id}` }); return; }
    visiting.add(task.id);
    const candidates = [...directDeps(task).map((id) => byId.get(id)).filter(Boolean) as TaskInput[], ...templateDeps(task).flatMap((tmpl) => tasks.filter((t) => t.templateId === tmpl && t.contestantId === task.contestantId))];
    for (const dep of candidates) if (!seen.has(dep.id) && dep.status === "pending" && !isProtected(dep)) { seen.add(dep.id); visit(dep, depth + 1); out.push(dep); }
    visiting.delete(task.id);
  };
  visit(root, 1); return out;
}

export function buildProductionWavePlan(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options?: EngineV3Options & Options): ProductionWaveResult {
  const diag: ProductionWaveDiagnostics = { applied: false, mainFlowSpaceId: strategicAnalysis.mainFlow?.id ?? null, waveStart: null, waveEnd: null, mainFlowTasksPlaced: 0, prerequisitesPlaced: 0, dependentTasksPlaced: 0, strategicInternalLocks: 0, mainFlowGapMinutes: 0, resourceAwareValidation: true, blockers: [], warnings: [], fallbackUsed: false };
  if (!strategicAnalysis.mainFlow) { const guided = buildV4GuidedInput(input, strategicAnalysis); return { output: generatePlanV3(guided.input, options), delegatedInput: guided.input, diagnostics: { ...diag, fallbackUsed: true, reason: "No main flow configured; delegated to V3." } }; }
  const tasks = input.tasks ?? []; const byId = new Map(tasks.map((t) => [t.id, t])); const placed = new Map<number, Interval>();
  const order = new Map((strategicAnalysis.mainFlowSequence ?? []).map((x, i) => [x.talentId, i]));
  const main = tasks.filter((t) => t.status === "pending" && !isProtected(t) && isMainFlowTask(t, strategicAnalysis.mainFlow!.id)).sort((a, b) => (order.get(Number(a.contestantId)) ?? INF) - (order.get(Number(b.contestantId)) ?? INF));
  let cursor = Math.min(...[toMin(input.workDay.start) ?? 0, ...(main.map((m) => toMin(input.workDay.start) ?? 0))]);
  const dependentsByTask = new Map<number, TaskInput[]>();
  for (const t of tasks) for (const dep of directDeps(t)) dependentsByTask.set(dep, [...(dependentsByTask.get(dep) ?? []), t]);
  for (const task of main) {
    for (const dep of expandPrerequisites(task, tasks, byId, Number(options?.maxDependencyDepth ?? 3), diag.blockers)) {
      if (placed.has(dep.id)) continue;
      const slot = findSlot(input, byId, placed, dep, toMin(input.workDay.start) ?? 0, diag.warnings);
      if (slot && slot.end <= Math.max(cursor, slot.end)) { placed.set(dep.id, slot); diag.prerequisitesPlaced += 1; cursor = Math.max(cursor, slot.end); }
      else diag.blockers.push({ taskId: task.id, reason: "Prerequisite not safely placeable", details: `Prerequisite ${dep.id}` });
    }
    const mainSlot = findSlot(input, byId, placed, task, cursor, diag.warnings);
    if (mainSlot) { placed.set(task.id, mainSlot); diag.mainFlowTasksPlaced += 1; cursor = mainSlot.end; }
    else { diag.blockers.push({ taskId: task.id, reason: "No resource-aware slot found", details: "Delegated to V3 without internal lock." }); continue; }
    for (const dep of (dependentsByTask.get(task.id) ?? []).filter((t) => t.status === "pending" && !isProtected(t) && !placed.has(t.id)).slice(0, 1)) {
      const slot = findSlot(input, byId, placed, dep, cursor, diag.warnings);
      if (slot && slot.start - cursor <= 15) { placed.set(dep.id, slot); diag.dependentTasksPlaced += 1; cursor = slot.end; }
    }
  }
  const internalLocks: LockInput[] = [...placed].map(([taskId, p], i) => ({ id: -970000 - i, planId: input.planId, taskId, lockType: "time", lockedStart: hhmm(p.start), lockedEnd: hhmm(p.end) }));
  const delegatedInput = { ...input, locks: [...(input.locks ?? []), ...internalLocks] };
  let output = generatePlanV3(delegatedInput, options);
  const validation = validateHardConstraints(delegatedInput as any, output);
  const wave = [...placed.values()]; const mainWave = [...placed.entries()].filter(([id]) => main.some((t) => t.id === id)).map(([, p]) => p).sort((a, b) => a.start - b.start);
  diag.mainFlowGapMinutes = mainWave.reduce((sum, item, i) => i ? sum + Math.max(0, item.start - mainWave[i - 1].end) : 0, 0);
  diag.waveStart = wave.length ? hhmm(Math.min(...wave.map((p) => p.start))) : null; diag.waveEnd = wave.length ? hhmm(Math.max(...wave.map((p) => p.end))) : null; diag.strategicInternalLocks = internalLocks.length;
  const intact = tasks.filter((t) => t.status === "done" || t.status === "in_progress").every((t) => { const p = output.plannedTasks?.find((x: any) => Number(x.taskId) === t.id) as any; return !p || (p.startPlanned ?? p.start) === (t.startPlanned ?? t.startReal ?? p.startPlanned ?? p.start); });
  const ok = output.hardFeasible !== false && validation.hardValidationPassed && intact;
  if (!ok) output = { ...output, hardFeasible: false } as EngineOutput;
  return { output, delegatedInput, diagnostics: { ...diag, applied: ok, infeasible: !ok, reason: ok ? "Production wave created strategic internal locks and delegated the rest to V3." : "Production wave discarded by hard defensive safety gate." } };
}
