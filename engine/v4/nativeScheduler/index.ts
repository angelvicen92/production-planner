import { validateHardConstraints } from "../../v3/hardValidation";
import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import type { V4StrategicAnalysis } from "../analysis";
import { buildProductionWavePlan } from "../productionWaveScheduler";

export interface V4NativeRemainderBlocker { taskId: number; reason: string; details?: string; }
export interface V4NativeRemainderBucketDiagnostics { name: string; tasks: number; placed: number; unplanned: number; }
export interface V4NativeRemainderDiagnostics {
  applied: boolean;
  discarded?: boolean;
  placedByWave: number;
  placedByNativeScheduler: number;
  unplanned: number;
  buckets: V4NativeRemainderBucketDiagnostics[];
  makespan: string | null;
  mainFlowGapMinutes: number;
  blockers: V4NativeRemainderBlocker[];
  warnings: string[];
  infeasible: boolean;
  reason?: string;
}
export interface V4NativeRemainderOptions extends EngineV3Options { maxNativeTasks?: number; maxSlotChecksPerTask?: number; maxRuntimeMs?: number; slotStepMinutes?: number; }

type Interval = { start: number; end: number; taskId?: number; resources?: number[]; kind?: string };
const INF = Number.POSITIVE_INFINITY;
const toMin = (v?: string | null): number | null => { const [h, m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const uniq = (xs: unknown[]) => [...new Set(xs.map(Number).filter(Number.isFinite))];
const dur = (task: TaskInput) => Math.max(5, Number(task.durationOverrideMin ?? 30) || 30);
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const spaceOf = (task?: TaskInput | null) => Number.isFinite(Number(task?.spaceId ?? task?.zoneId)) ? Number(task?.spaceId ?? task?.zoneId) : null;
const talentOf = (task?: TaskInput | null) => Number.isFinite(Number(task?.contestantId)) ? Number(task?.contestantId) : null;
const depsOf = (task: TaskInput) => uniq([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId]);
const tmplDepsOf = (task: TaskInput) => uniq([...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]);
const resOf = (task?: TaskInput | null) => uniq([...(task?.assignedResourceIds ?? []), ...Object.keys(task?.resourceRequirements?.byItem ?? {}), ...(task?.resourceRequirements?.anyOf ?? []).flatMap((g) => g.resourceItemIds ?? [])]);
const protectedTask = (task: TaskInput) => task.status === "done" || task.status === "in_progress" || Boolean(task.fixedWindowStart && task.fixedWindowEnd);

function breakIntervals(input: EngineInput): Interval[] {
  const windows: TimeWindow[] = [...(input.globalHardBreaks ?? [])];
  if (input.mealMode !== "flexible_meal_window" && input.meal?.start && input.meal?.end) windows.push(input.meal);
  for (const b of input.protectedBreaks ?? []) if (!b.contestantId && !b.spaceId && !b.itinerantTeamId) windows.push(b);
  if (input.actualMeal?.start && input.actualMeal?.end && !input.actualMeal.contestantId && !input.actualMeal.spaceId && !input.actualMeal.itinerantTeamId) windows.push(input.actualMeal);
  return windows.map((w) => ({ start: toMin(w.start) ?? 0, end: toMin(w.end) ?? 0, kind: "break" })).filter((x) => x.end > x.start);
}

function fixedIntervals(input: EngineInput, byId: Map<number, TaskInput>): Interval[] {
  const out: Interval[] = [];
  for (const task of input.tasks ?? []) {
    const s = toMin(task.startPlanned ?? task.startReal ?? task.fixedWindowStart); const e = toMin(task.endPlanned ?? task.endReal ?? task.fixedWindowEnd);
    if (s !== null && e !== null && e > s && (protectedTask(task) || task.startPlanned || task.startReal || task.fixedWindowStart)) out.push({ start: s, end: e, taskId: task.id, resources: resOf(task), kind: task.status });
  }
  for (const lock of input.locks ?? []) {
    const task = byId.get(Number(lock.taskId)); const s = toMin(lock.lockedStart); const e = toMin(lock.lockedEnd);
    if (task && s !== null && e !== null && e > s) out.push({ start: s, end: e, taskId: task.id, resources: resOf(task), kind: Number(lock.id) < 0 ? "strategic_lock" : "real_lock" });
  }
  return out;
}

function violates(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, c: Interval): string | null {
  if (breakIntervals(input).some((b) => overlaps(c, b))) return "break or meal conflict";
  const space = spaceOf(task); const talent = talentOf(task); const resources = resOf(task);
  const all = [...fixedIntervals(input, byId), ...[...placed.entries()].map(([id, p]) => ({ ...p, taskId: id, resources: resOf(byId.get(id)) }))];
  for (const busy of all) {
    if (busy.taskId === task.id || !overlaps(c, busy)) continue;
    const other = byId.get(Number(busy.taskId));
    if (space !== null && spaceOf(other) === space) return `space ${space} conflict`;
    if (talent !== null && talentOf(other) === talent) return `talent ${talent} conflict`;
    const shared = resources.find((id) => (busy.resources ?? []).includes(id));
    if (shared) return `resource ${shared} conflict`;
  }
  return null;
}

function depReady(byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput): number | null {
  let earliest = 0;
  for (const depId of depsOf(task)) { const dep = placed.get(depId); const original = byId.get(depId); const fixedEnd = toMin(original?.endPlanned ?? original?.endReal); if (!dep && fixedEnd === null) return null; earliest = Math.max(earliest, dep?.end ?? fixedEnd ?? 0); }
  for (const tmpl of tmplDepsOf(task)) for (const other of byId.values()) if (other.templateId === tmpl && other.contestantId === task.contestantId) { const dep = placed.get(other.id); const fixedEnd = toMin(other.endPlanned ?? other.endReal); if (!dep && fixedEnd === null) return null; earliest = Math.max(earliest, dep?.end ?? fixedEnd ?? 0); }
  return earliest;
}

function findSlot(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, earliest: number, opts: Required<Pick<V4NativeRemainderOptions, "maxSlotChecksPerTask" | "slotStepMinutes">>): { slot: Interval | null; checks: number; lastReason?: string } {
  const ws = toMin(input.workDay.start) ?? 0; const we = toMin(input.workDay.end) ?? 1440; const av = input.contestantAvailabilityById?.[talentOf(task) ?? -1];
  const start = Math.max(ws, earliest, toMin(task.fixedWindowStart) ?? ws, toMin(av?.start) ?? ws); const endMax = Math.min(we, toMin(task.fixedWindowEnd) ?? we, toMin(av?.end) ?? we);
  let checks = 0; let lastReason = "No candidate slots in task window";
  for (let s = start; s + dur(task) <= endMax && checks < opts.maxSlotChecksPerTask; s += opts.slotStepMinutes, checks += 1) {
    const c = { start: s, end: s + dur(task), taskId: task.id };
    const reason = violates(input, byId, placed, task, c);
    if (!reason) return { slot: c, checks };
    lastReason = reason;
  }
  return { slot: null, checks, lastReason };
}

export function buildV4NativeRemainderPlan(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options: V4NativeRemainderOptions = {}): { output: EngineOutput; diagnostics: V4NativeRemainderDiagnostics } {
  const started = Date.now(); const maxNativeTasks = Number(options.maxNativeTasks ?? 500); const maxRuntimeMs = Number(options.maxRuntimeMs ?? 5000);
  const slotOptions = { maxSlotChecksPerTask: Number(options.maxSlotChecksPerTask ?? 300), slotStepMinutes: Number(options.slotStepMinutes ?? 5) };
  const wave = buildProductionWavePlan(input, strategicAnalysis, options);
  const delegatedInput = wave.delegatedInput ?? input;
  const tasks = input.tasks ?? []; const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const strategicLocks = (delegatedInput.locks ?? []).filter((l) => Number(l.id) < 0);
  const placed = new Map<number, Interval>();
  for (const lock of strategicLocks) { const s = toMin(lock.lockedStart); const e = toMin(lock.lockedEnd); if (s !== null && e !== null && e > s) placed.set(Number(lock.taskId), { start: s, end: e, taskId: Number(lock.taskId), resources: resOf(byId.get(Number(lock.taskId))), kind: "wave" }); }
  const diag: V4NativeRemainderDiagnostics = { applied: true, placedByWave: placed.size, placedByNativeScheduler: 0, unplanned: 0, buckets: [], makespan: null, mainFlowGapMinutes: 0, blockers: [], warnings: [...(wave.diagnostics.warnings ?? [])], infeasible: false };
  if (tasks.filter((t) => t.status === "pending" && !protectedTask(t) && !placed.has(t.id)).length > maxNativeTasks) diag.warnings.push(`Native scheduler task limit reached: maxNativeTasks=${maxNativeTasks}.`);
  const criticalResources = new Set((strategicAnalysis.criticalResources ?? []).map((r) => r.id)); const criticalTalents = new Set((strategicAnalysis.criticalTalents ?? []).map((t) => t.id)); const continuousSpaces = new Set((strategicAnalysis.continuousSpaces ?? []).map((s) => s.id));
  const dependents = new Set<number>(); for (const t of tasks) for (const d of depsOf(t)) dependents.add(d);
  const order = new Map(tasks.map((t, i) => [t.id, i])); const talentRank = new Map((strategicAnalysis.mainFlowSequence ?? []).map((x, i) => [x.talentId, i])); const cost = new Map((strategicAnalysis.costOfDelayRanking ?? []).map((x) => [x.talentId, x.costOfDelay])); const press = new Map([...(strategicAnalysis.criticalTalents ?? []), ...(strategicAnalysis.mainFlowCandidates ?? []).map((c) => ({ id: c.talentId, pressureScore: c.pressureScore }))].map((x: any) => [Number(x.id), Number(x.pressureScore ?? 0)]));
  const scoreSort = (a: TaskInput, b: TaskInput) => (press.get(talentOf(b) ?? -1) ?? 0) - (press.get(talentOf(a) ?? -1) ?? 0) || (cost.get(talentOf(b) ?? -1) ?? 0) - (cost.get(talentOf(a) ?? -1) ?? 0) || (talentRank.get(talentOf(a) ?? -1) ?? INF) - (talentRank.get(talentOf(b) ?? -1) ?? INF) || dur(b) - dur(a) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const remaining = tasks.filter((t) => t.status === "pending" && !protectedTask(t) && !placed.has(t.id)).slice(0, maxNativeTasks);
  const buckets = [
    { name: "criticalResourceTasks", tasks: remaining.filter((t) => resOf(t).some((id) => criticalResources.has(id))).sort(scoreSort), placed: 0, unplanned: 0 },
    { name: "criticalTalentTasks", tasks: remaining.filter((t) => criticalTalents.has(talentOf(t) ?? -1)).sort(scoreSort), placed: 0, unplanned: 0 },
    { name: "continuousSpaceTasks", tasks: remaining.filter((t) => continuousSpaces.has(spaceOf(t) ?? -1)).sort(scoreSort), placed: 0, unplanned: 0 },
    { name: "dependencySensitiveTasks", tasks: remaining.filter((t) => depsOf(t).length || tmplDepsOf(t).length || dependents.has(t.id)).sort(scoreSort), placed: 0, unplanned: 0 },
    { name: "flexibleFillerTasks", tasks: remaining.sort(scoreSort), placed: 0, unplanned: 0 },
  ];
  const seen = new Set<number>();
  for (const bucket of buckets) for (const task of bucket.tasks) {
    if (seen.has(task.id) || placed.has(task.id)) continue; seen.add(task.id);
    if (Date.now() - started > maxRuntimeMs) { diag.warnings.push(`Native scheduler runtime limit reached: maxRuntimeMs=${maxRuntimeMs}.`); break; }
    const ready = depReady(byId, placed, task); if (ready === null) { bucket.unplanned += 1; diag.blockers.push({ taskId: task.id, reason: "No valid slot found", details: "Required dependency is not planned before this task." }); continue; }
    const found = findSlot(delegatedInput, byId, placed, task, ready, slotOptions);
    if (found.slot) { placed.set(task.id, found.slot); bucket.placed += 1; diag.placedByNativeScheduler += 1; }
    else { bucket.unplanned += 1; diag.blockers.push({ taskId: task.id, reason: "No valid slot found", details: found.lastReason ?? "Talent, space, resource or dependency windows do not overlap." }); }
  }
  diag.buckets = buckets.map((b) => ({ name: b.name, tasks: b.tasks.length, placed: b.placed, unplanned: b.unplanned }));
  const protectedPlanned = tasks.flatMap((task) => {
    if (!protectedTask(task) && !(input.locks ?? []).some((lock) => Number(lock.taskId) === Number(task.id) && Number(lock.id) > 0)) return [];
    const s = toMin(task.startPlanned ?? task.startReal ?? task.fixedWindowStart); const e = toMin(task.endPlanned ?? task.endReal ?? task.fixedWindowEnd);
    return s !== null && e !== null && e > s ? [{ taskId: task.id, startPlanned: hhmm(s), endPlanned: hhmm(e), assignedResources: resOf(task) }] : [];
  });
  const nativePlanned = [...placed.entries()].sort((a, b) => a[1].start - b[1].start).map(([taskId, p]) => ({ taskId, startPlanned: hhmm(p.start), endPlanned: hhmm(p.end), assignedResources: resOf(byId.get(taskId)) }));
  const plannedTasks = [...protectedPlanned, ...nativePlanned.filter((p) => !protectedPlanned.some((fixed) => Number(fixed.taskId) === Number(p.taskId)))].sort((a, b) => (toMin(a.startPlanned) ?? 0) - (toMin(b.startPlanned) ?? 0));
  const plannedIds = new Set(plannedTasks.map((p) => Number(p.taskId)));
  const unplanned = tasks.filter((t) => t.status === "pending" && !protectedTask(t) && !plannedIds.has(t.id)).map((t) => ({ taskId: t.id, reason: { code: "V4_NATIVE_NO_SLOT", message: "V4 native scheduler could not place this pending task.", taskId: t.id } }));
  diag.unplanned = unplanned.length; const ends = plannedTasks.map((p) => toMin(p.endPlanned) ?? 0); diag.makespan = ends.length ? hhmm(Math.max(...ends)) : null;
  const mainId = strategicAnalysis.mainFlow?.id ?? null; const main = [...placed.entries()].filter(([id]) => { const t = byId.get(id); return mainId !== null && (spaceOf(t) === mainId || Number(t?.zoneId) === mainId); }).map(([, p]) => p).sort((a, b) => a.start - b.start); diag.mainFlowGapMinutes = main.reduce((s, x, i) => i ? s + Math.max(0, x.start - main[i - 1].end) : 0, 0);
  const output: EngineOutput = { feasible: unplanned.length === 0, complete: unplanned.length === 0, hardFeasible: true, plannedTasks, unplanned };
  const hard = validateHardConstraints(delegatedInput as any, output); if (!hard.hardValidationPassed) { output.hardFeasible = false; diag.infeasible = true; diag.applied = false; diag.reason = `Native remainder failed hard validation: ${(hard.hardConstraintViolationCodes ?? []).slice(0, 3).join(", ")}`; }
  else diag.reason = "Production Wave strategic locks plus native V4 remainder scheduler.";
  return { output, diagnostics: diag };
}
