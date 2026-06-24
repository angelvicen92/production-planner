import { generatePlanV3 } from "../v3";
import { validateHardConstraints } from "../v3/hardValidation";
import type { EngineInput, EngineOutput, LockInput, TaskInput, TimeWindow } from "../types";
import type { EngineV3Options } from "../v3/types";
import type { V4StrategicAnalysis } from "./analysis";
import type { MainFlowSequenceVariant } from "./mainFlowSequenceSearch";
import { evaluateV4PlanQuality } from "./quality";
import { analyzeMainFlowGapsForTargeting, type V4MainFlowGapTargetingAnalysis } from "./mainFlowGapTargeting";

export type V4NativeCriticalCoreRejectionReason = "NATIVE_CORE_NOT_EXECUTED" | "NO_MAIN_FLOW" | "CORE_TASK_SELECTION_EMPTY" | "CORE_TASKS_NOT_PLACED" | "V3_FILL_INFEASIBLE" | "UNPLANNED_WORSE" | "MAIN_FLOW_GAP_WORSE" | "MAIN_FLOW_GAP_NOT_IMPROVED" | "MAKESPAN_WORSE" | "NO_QUALITY_GAIN" | "HARD_VALIDATION_FAILED" | "RUNTIME_BUDGET_EXCEEDED" | "UNKNOWN";
export interface V4NativeCriticalCoreBlocker { taskId: number; reason: string; details?: string; resourceConflicts?: string[]; spaceConflicts?: string[]; talentConflicts?: string[]; }
export interface V4NativeCriticalCorePlacementDiagnostics { selectedCoreTasks: number; placedCoreTasks: number; delegatedCoreTasks: number; failedCoreTasks: number; strategicInternalLocks: number; topFailedTasks: V4NativeCriticalCoreBlocker[]; }
export interface V4NativeCriticalCoreDiagnostics {
  applied: boolean;
  discarded?: boolean;
  coreTasksSelected: number;
  coreTasksPlaced: number;
  coreTasksDelegated: number;
  strategicInternalLocks: number;
  v3FillUsed: boolean;
  flowGapMinutesBeforeV3Fill: number;
  finalMainFlowGapMinutes: number;
  finalMakespan: string | null;
  iterations: number;
  blockers: V4NativeCriticalCoreBlocker[];
  warnings: string[];
  infeasible?: boolean;
  reason?: string;
  accepted?: boolean;
  rejectionReason?: V4NativeCriticalCoreRejectionReason;
  rejectionDetails?: Record<string, number>;
  corePlacement?: V4NativeCriticalCorePlacementDiagnostics;
  sequenceVariantId?: string;
  sequenceVariantLabel?: string;
  gapTargeting?: {
    applied: boolean; baselineGapMinutes: number; candidateGapMinutes: number; gapsTargeted: number; gapsClosed: number; gapsPartiallyReduced: number;
    attempts: Array<{ gapStart: string; gapEnd: string; previousTaskId: string | number | null; nextTaskId: string | number | null; operation: string; success: boolean; reason: string }>;
    blockers: string[];
  };
}
export interface V4NativeCriticalCoreOptions extends EngineV3Options { maxSlotsEvaluatedPerTask?: number; maxCoreIterations?: number; maxRuntimeMs?: number; slotStepMinutes?: number; sequenceOverride?: MainFlowSequenceVariant; baselineOutput?: EngineOutput; baselineQuality?: ReturnType<typeof evaluateV4PlanQuality>; }
export interface V4NativeCriticalCoreResult { output: EngineOutput; delegatedInput: EngineInput; diagnostics: V4NativeCriticalCoreDiagnostics; }

type Interval = { start: number; end: number; taskId?: number; resources?: number[]; kind?: string };
const INF = Number.POSITIVE_INFINITY;
const toMin = (v?: string | null): number | null => { const [h, m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const uniq = (xs: unknown[]) => [...new Set(xs.map(Number).filter(Number.isFinite))];
const duration = (task: TaskInput) => Math.max(5, Number(task.durationOverrideMin ?? 30) || 30);
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const spaceOf = (task?: TaskInput | null) => Number.isFinite(Number(task?.spaceId ?? task?.zoneId)) ? Number(task?.spaceId ?? task?.zoneId) : null;
const talentOf = (task?: TaskInput | null) => Number.isFinite(Number(task?.contestantId)) ? Number(task?.contestantId) : null;
const depsOf = (task: TaskInput) => uniq([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId]);
const tmplDepsOf = (task: TaskInput) => uniq([...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]);
const resOf = (task?: TaskInput | null) => uniq([...(task?.assignedResourceIds ?? []), ...Object.keys(task?.resourceRequirements?.byItem ?? {}), ...(task?.resourceRequirements?.anyOf ?? []).flatMap((g) => g.resourceItemIds ?? [])]);
const protectedTask = (task: TaskInput) => task.status === "done" || task.status === "in_progress" || Boolean(task.fixedWindowStart && task.fixedWindowEnd);
const unsafeResources = (task: TaskInput) => Boolean(task.resourceRequirements?.byType && Object.keys(task.resourceRequirements.byType).length) || (task.resourceRequirements?.anyOf ?? []).some((g) => !g.resourceItemIds?.length || Number(g.quantity ?? 1) !== 1);

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
    if (task && s !== null && e !== null && e > s) out.push({ start: s, end: e, taskId: task.id, resources: resOf(task), kind: Number(lock.id) < 0 ? "internal_lock" : "real_lock" });
  }
  return out;
}

function depEnd(byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, blockers: V4NativeCriticalCoreBlocker[]): number | null {
  let earliest = 0;
  for (const depId of depsOf(task)) {
    const original = byId.get(depId); if (!original) { blockers.push({ taskId: task.id, reason: "Missing dependency", details: `Dependency task ${depId} does not exist.` }); return null; }
    const dep = placed.get(depId); const fixedEnd = toMin(original.endPlanned ?? original.endReal);
    if (!dep && fixedEnd === null) return null;
    earliest = Math.max(earliest, dep?.end ?? fixedEnd ?? 0);
  }
  for (const tmpl of tmplDepsOf(task)) {
    const matches = [...byId.values()].filter((other) => other.templateId === tmpl && other.contestantId === task.contestantId);
    if (!matches.length) { blockers.push({ taskId: task.id, reason: "Missing template dependency", details: `Template dependency ${tmpl} has no matching task.` }); return null; }
    for (const other of matches) { const dep = placed.get(other.id); const fixedEnd = toMin(other.endPlanned ?? other.endReal); if (!dep && fixedEnd === null) return null; earliest = Math.max(earliest, dep?.end ?? fixedEnd ?? 0); }
  }
  return earliest;
}

function violates(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, c: Interval): string | null {
  if (breakIntervals(input).some((b) => overlaps(c, b))) return "break or meal conflict";
  const all = [...fixedIntervals(input, byId), ...[...placed].map(([id, p]) => ({ ...p, taskId: id, resources: resOf(byId.get(id)) }))];
  const sId = spaceOf(task); const tId = talentOf(task); const rIds = resOf(task);
  for (const busy of all) {
    if (busy.taskId === task.id || !overlaps(c, busy)) continue;
    const other = byId.get(Number(busy.taskId));
    if (sId !== null && spaceOf(other) === sId) return `space ${sId} conflict`;
    if (tId !== null && talentOf(other) === tId) return `talent ${tId} conflict`;
    const shared = rIds.find((id) => (busy.resources ?? []).includes(id)); if (shared) return `resource ${shared} conflict`;
  }
  return null;
}

function mainGap(placed: Map<number, Interval>, byId: Map<number, TaskInput>, mainFlowId: number | null): number {
  if (mainFlowId === null) return 0;
  const items = [...placed].filter(([id]) => spaceOf(byId.get(id)) === mainFlowId || Number(byId.get(id)?.zoneId) === mainFlowId).map(([, p]) => p).sort((a, b) => a.start - b.start);
  return items.reduce((sum, item, i) => i ? sum + Math.max(0, item.start - items[i - 1].end) : 0, 0);
}

function findBestSlot(input: EngineInput, byId: Map<number, TaskInput>, placed: Map<number, Interval>, task: TaskInput, earliest: number, opts: { maxSlotsEvaluatedPerTask: number; slotStepMinutes: number }, mainFlowId: number | null, criticalResources: Set<number>, criticalTalents: Set<number>, gapTargets?: V4MainFlowGapTargetingAnalysis): { slot: Interval | null; lastReason?: string } {
  const ws = toMin(input.workDay.start) ?? 0; const we = toMin(input.workDay.end) ?? 1440; const av = input.contestantAvailabilityById?.[talentOf(task) ?? -1];
  const start = Math.max(ws, earliest, toMin(task.fixedWindowStart) ?? ws, toMin(av?.start) ?? ws); const endMax = Math.min(we, toMin(task.fixedWindowEnd) ?? we, toMin(av?.end) ?? we);
  let checked = 0; let best: { slot: Interval; score: number } | null = null; let lastReason = "No candidate slots in task window";
  const beforeGap = mainGap(placed, byId, mainFlowId); const beforeEnd = Math.max(0, ...[...placed.values()].map((p) => p.end));
  for (let s = start; s + duration(task) <= endMax && checked < opts.maxSlotsEvaluatedPerTask; s += opts.slotStepMinutes, checked += 1) {
    const slot = { start: s, end: s + duration(task), taskId: task.id }; const reason = violates(input, byId, placed, task, slot); if (reason) { lastReason = reason; continue; }
    placed.set(task.id, slot); const afterGap = mainGap(placed, byId, mainFlowId); const gapPenalty = Math.max(0, afterGap - beforeGap); placed.delete(task.id);
    const gapReduction = Math.max(0, beforeGap - afterGap);
    const targeted = gapTargets?.gaps.find((gap) => gap.nextTaskId === task.id || gap.candidateTaskIds.map(Number).includes(task.id));
    const closesTarget = targeted && slot.start <= targeted.end && slot.end >= targeted.start ? -50000 : 0;
    const pullNextBonus = targeted?.nextTaskId === task.id && Math.abs(slot.start - targeted.start) <= opts.slotStepMinutes ? -100000 : 0;
    const makespanPenalty = Math.max(0, slot.end - beforeEnd); const jitPenalty = Math.max(0, slot.start - earliest); const resourceBonus = resOf(task).some((id) => criticalResources.has(id)) ? -2 : 0; const talentBonus = criticalTalents.has(talentOf(task) ?? -1) ? -2 : 0;
    const score = -gapReduction * 20000 + closesTarget + pullNextBonus + gapPenalty * 10000 + makespanPenalty * 100 + jitPenalty + slot.start / 100 + resourceBonus + talentBonus;
    if (!best || score < best.score) best = { slot, score };
  }
  return { slot: best?.slot ?? null, lastReason };
}

export function buildV4NativeCriticalCorePlan(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options: V4NativeCriticalCoreOptions = {}): V4NativeCriticalCoreResult {
  const started = Date.now(); const maxRuntimeMs = Number(options.maxRuntimeMs ?? 5000); const maxCoreIterations = Math.min(Number(options.maxCoreIterations ?? 500), options.baselineOutput ? 80 : 500);
  const slotOpts = { maxSlotsEvaluatedPerTask: Math.min(Number(options.maxSlotsEvaluatedPerTask ?? 120), options.baselineOutput ? 60 : 120), slotStepMinutes: Number(options.slotStepMinutes ?? 5) };
  const tasks = input.tasks ?? []; const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const criticalResources = new Set((strategicAnalysis.criticalResources ?? []).map((r) => Number(r.id))); const criticalTalents = new Set((strategicAnalysis.criticalTalents ?? []).map((t) => Number(t.id))); const continuousSpaces = new Set((strategicAnalysis.continuousSpaces ?? []).map((s) => Number(s.id))); const mainFlowId = strategicAnalysis.mainFlow?.id ?? null;
  const baselineOutput = options.baselineOutput ?? generatePlanV3(input, options);
  const baselineQuality = options.baselineQuality ?? evaluateV4PlanQuality(input, baselineOutput, strategicAnalysis);
  const gapTargets = analyzeMainFlowGapsForTargeting(input, baselineOutput, strategicAnalysis, baselineQuality);
  const coreIds = new Set<number>(); const addWithDeps = (task: TaskInput, depth = 0) => { if (depth > 20 || coreIds.has(task.id) || protectedTask(task)) return; coreIds.add(task.id); for (const depId of depsOf(task)) { const dep = byId.get(depId); if (dep?.status === "pending") addWithDeps(dep, depth + 1); } for (const tmpl of tmplDepsOf(task)) for (const dep of tasks) if (dep.templateId === tmpl && dep.contestantId === task.contestantId && dep.status === "pending") addWithDeps(dep, depth + 1); };
  for (const gap of gapTargets.gaps) {
    for (const id of [gap.nextTaskId, ...gap.candidateTaskIds].map(Number).filter(Number.isFinite)) { const task = byId.get(id); if (task?.status === "pending") addWithDeps(task); }
    const next = byId.get(Number(gap.nextTaskId)); if (next) {
      for (const task of tasks) if (task.status === "pending" && talentOf(task) === talentOf(next) && (spaceOf(task) === mainFlowId || depsOf(next).includes(task.id) || tmplDepsOf(next).includes(Number(task.templateId)))) addWithDeps(task);
    }
  }
  for (const task of tasks) if (task.status === "pending" && !protectedTask(task) && (mainFlowId !== null && (spaceOf(task) === mainFlowId || Number(task.zoneId) === mainFlowId) || resOf(task).some((id) => criticalResources.has(id)) || criticalTalents.has(talentOf(task) ?? -1) || continuousSpaces.has(spaceOf(task) ?? -1))) addWithDeps(task);
  const diag: V4NativeCriticalCoreDiagnostics = { applied: true, accepted: true, coreTasksSelected: coreIds.size, coreTasksPlaced: 0, coreTasksDelegated: 0, strategicInternalLocks: 0, v3FillUsed: false, flowGapMinutesBeforeV3Fill: 0, finalMainFlowGapMinutes: 0, finalMakespan: null, iterations: 0, blockers: [], warnings: [] };
  diag.sequenceVariantId = options.sequenceOverride?.id;
  diag.sequenceVariantLabel = options.sequenceOverride?.label;
  diag.gapTargeting = { applied: true, baselineGapMinutes: gapTargets.totalGapMinutes, candidateGapMinutes: gapTargets.totalGapMinutes, gapsTargeted: gapTargets.gaps.length, gapsClosed: 0, gapsPartiallyReduced: 0, attempts: gapTargets.gaps.map((gap) => ({ gapStart: hhmm(gap.start), gapEnd: hhmm(gap.end), previousTaskId: gap.previousTaskId, nextTaskId: gap.nextTaskId, operation: "PULL_NEXT_MAIN_FLOW_TASK_EARLIER", success: false, reason: gap.blockingReasons[0] ?? "Attempting to pull next main-flow task earlier or fill the gap with a main-flow alternative." })), blockers: gapTargets.gaps.flatMap((gap) => gap.blockingReasons) };
  if (options.baselineOutput && maxRuntimeMs < 6000) {
    diag.discarded = true; diag.accepted = false; diag.rejectionReason = gapTargets.totalGapMinutes > 0 ? "MAIN_FLOW_GAP_NOT_IMPROVED" : "RUNTIME_BUDGET_EXCEEDED"; diag.reason = "Native critical core gap targeting analyzed baseline gaps but skipped placement to preserve the V4 runtime budget."; diag.finalMainFlowGapMinutes = baselineQuality.mainFlowQuality?.internalGapMinutes ?? gapTargets.totalGapMinutes; diag.finalMakespan = baselineQuality.makespan.lastTaskEnd; diag.corePlacement = { selectedCoreTasks: diag.coreTasksSelected, placedCoreTasks: 0, delegatedCoreTasks: diag.coreTasksSelected, failedCoreTasks: 0, strategicInternalLocks: 0, topFailedTasks: [] };
    return { output: baselineOutput, delegatedInput: input, diagnostics: diag };
  }
  const pending = new Set([...coreIds].filter((id) => { const t = byId.get(id); if (!t || unsafeResources(t)) { if (t) diag.warnings.push(`Task ${id} delegated to V3: unsafe resource requirement.`); return false; } return true; }));
  const delegatedUnsafe = coreIds.size - pending.size; const placed = new Map<number, Interval>(); const order = new Map(tasks.map((t, i) => [t.id, i])); const sequence = options.sequenceOverride?.sequence ?? strategicAnalysis.mainFlowSequence ?? []; const flowRank = new Map(sequence.map((x, i) => [x.talentId, i]));
  while (pending.size && diag.iterations < maxCoreIterations && Date.now() - started <= maxRuntimeMs) {
    diag.iterations += 1; let progressed = false; const ready: Array<{ task: TaskInput; earliest: number }> = [];
    for (const id of pending) { const task = byId.get(id); if (!task) continue; const blockersBefore = diag.blockers.length; const earliest = depEnd(byId, placed, task, diag.blockers); if (earliest !== null) ready.push({ task, earliest }); else diag.blockers.splice(blockersBefore); }
    ready.sort((a, b) => (flowRank.get(talentOf(a.task) ?? -1) ?? INF) - (flowRank.get(talentOf(b.task) ?? -1) ?? INF) || duration(b.task) - duration(a.task) || (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0));
    for (const item of ready) { const found = findBestSlot(input, byId, placed, item.task, item.earliest, slotOpts, mainFlowId, criticalResources, criticalTalents, gapTargets); if (found.slot) { placed.set(item.task.id, found.slot); pending.delete(item.task.id); progressed = true; break; } }
    if (!progressed) break;
  }
  for (const id of pending) { const task = byId.get(id); if (!task) continue; const blockersBefore = diag.blockers.length; const earliest = depEnd(byId, placed, task, diag.blockers); if (earliest === null && blockersBefore === diag.blockers.length) diag.blockers.push({ taskId: id, reason: "Dependency not ready", details: "Dependency was not placed by the native critical core." }); else if (earliest !== null) diag.blockers.push({ taskId: id, reason: "No valid slot found", details: findBestSlot(input, byId, placed, task, earliest, slotOpts, mainFlowId, criticalResources, criticalTalents, gapTargets).lastReason }); }
  diag.coreTasksPlaced = placed.size; diag.coreTasksDelegated = pending.size + delegatedUnsafe; diag.flowGapMinutesBeforeV3Fill = mainGap(placed, byId, mainFlowId);
  if (Date.now() - started > Math.max(0, maxRuntimeMs - 5200)) {
    diag.discarded = true;
    diag.accepted = false;
    diag.rejectionReason = gapTargets.totalGapMinutes > 0 ? "MAIN_FLOW_GAP_NOT_IMPROVED" : "RUNTIME_BUDGET_EXCEEDED";
    diag.reason = "Native critical core discarded before V3 fill to preserve the V4 runtime budget.";
    diag.warnings.push("Native critical core skipped V3 fill because the runtime budget was nearly exhausted.");
    const baselineGap = baselineQuality.mainFlowQuality?.internalGapMinutes ?? gapTargets.totalGapMinutes;
    diag.finalMainFlowGapMinutes = baselineGap;
    diag.finalMakespan = baselineQuality.makespan.lastTaskEnd;
    if (diag.gapTargeting) { diag.gapTargeting.candidateGapMinutes = baselineGap; diag.gapTargeting.blockers = [...new Set([...diag.gapTargeting.blockers, ...(diag.blockers.map((b) => b.details ?? b.reason)), "Runtime budget exhausted before safe V3 fill."])]; }
    diag.corePlacement = { selectedCoreTasks: diag.coreTasksSelected, placedCoreTasks: diag.coreTasksPlaced, delegatedCoreTasks: diag.coreTasksDelegated, failedCoreTasks: Math.max(0, diag.coreTasksSelected - diag.coreTasksPlaced - diag.coreTasksDelegated), strategicInternalLocks: 0, topFailedTasks: diag.blockers.slice(0, 5) };
    return { output: baselineOutput, delegatedInput: input, diagnostics: diag };
  }
  const internalLocks: LockInput[] = [...placed].map(([taskId, p], i) => ({ id: -980000 - i, planId: input.planId, taskId, lockType: "time", lockedStart: hhmm(p.start), lockedEnd: hhmm(p.end) }));
  const delegatedInput = { ...input, locks: [...(input.locks ?? []), ...internalLocks] }; diag.strategicInternalLocks = internalLocks.length; diag.v3FillUsed = true;
  let output: EngineOutput;
  let qualityInput: EngineInput = delegatedInput;
  try {
    output = generatePlanV3(delegatedInput, options);
    const hard = validateHardConstraints(delegatedInput as any, output);
    if (!hard.hardValidationPassed) output = { ...output, hardFeasible: false } as EngineOutput;
  } catch (error) {
    diag.warnings.push(`Native critical core V3 fill failed; falling back to original V3 input: ${(error as Error).message}`);
    diag.discarded = true;
    diag.applied = false;
    diag.infeasible = true;
    diag.reason = "Native critical core discarded: V3 fill failed.";
    diag.accepted = false;
    diag.rejectionReason = "V3_FILL_INFEASIBLE";
    qualityInput = input;
    output = generatePlanV3(input, options);
  }
  const quality = evaluateV4PlanQuality(qualityInput, output, strategicAnalysis); diag.finalMainFlowGapMinutes = quality.mainFlowQuality?.internalGapMinutes ?? 0; if (diag.gapTargeting) { diag.gapTargeting.candidateGapMinutes = diag.finalMainFlowGapMinutes; diag.gapTargeting.gapsClosed = diag.finalMainFlowGapMinutes < gapTargets.totalGapMinutes ? gapTargets.gaps.filter((gap) => diag.finalMainFlowGapMinutes <= gapTargets.totalGapMinutes - gap.durationMinutes).length : 0; diag.gapTargeting.gapsPartiallyReduced = diag.finalMainFlowGapMinutes < gapTargets.totalGapMinutes && diag.gapTargeting.gapsClosed === 0 ? 1 : 0; diag.gapTargeting.attempts = diag.gapTargeting.attempts.map((attempt) => ({ ...attempt, success: diag.finalMainFlowGapMinutes < gapTargets.totalGapMinutes, reason: diag.finalMainFlowGapMinutes < gapTargets.totalGapMinutes ? "Reduced main-flow gap by targeting the next task, prerequisites, or an alternative main-flow task." : attempt.reason })); if (diag.finalMainFlowGapMinutes >= gapTargets.totalGapMinutes) diag.gapTargeting.blockers = [...new Set([...diag.gapTargeting.blockers, ...(diag.blockers.map((b) => b.details ?? b.reason))])]; } diag.finalMakespan = quality.makespan.lastTaskEnd; diag.infeasible = diag.infeasible || output.hardFeasible === false || (output.unplanned?.length ?? 0) > 0; diag.applied = diag.applied && output.hardFeasible !== false; diag.reason = diag.reason ?? (diag.applied ? "V4 placed the critical native core with temporary internal locks; V3 filled the remaining flexible work." : "Native critical core discarded: V3 fill or hard validation failed.");
  if (!diag.applied && !diag.rejectionReason) { diag.accepted = false; diag.rejectionReason = diag.infeasible ? "HARD_VALIDATION_FAILED" : "UNKNOWN"; }
  if (mainFlowId === null && !diag.rejectionReason) diag.rejectionReason = "NO_MAIN_FLOW";
  if (coreIds.size === 0 && !diag.rejectionReason) diag.rejectionReason = "CORE_TASK_SELECTION_EMPTY";
  if (coreIds.size > 0 && placed.size === 0 && !diag.rejectionReason) diag.rejectionReason = "CORE_TASKS_NOT_PLACED";
  diag.corePlacement = { selectedCoreTasks: diag.coreTasksSelected, placedCoreTasks: diag.coreTasksPlaced, delegatedCoreTasks: diag.coreTasksDelegated, failedCoreTasks: Math.max(0, diag.coreTasksSelected - diag.coreTasksPlaced - diag.coreTasksDelegated), strategicInternalLocks: diag.strategicInternalLocks, topFailedTasks: diag.blockers.slice(0, 5) };
  return { output, delegatedInput: qualityInput, diagnostics: diag };
}
