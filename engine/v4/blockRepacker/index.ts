import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { validateHardConstraints } from "../../v3/hardValidation";
import type { V4StrategicAnalysis } from "../analysis";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";
import { isV4QualityBetter } from "../postOptimizer";

type Planned = EngineOutput["plannedTasks"][number];
type Interval = { start: number; end: number };
type BlockType = "TalentChainBlock" | "DependencyChainBlock" | "CriticalResourceBlock" | "MainFlowSegmentBlock";
type MoveKind = "shiftEarlier" | "shiftLater" | "pullFinalBlockEarlier";

interface MovableBlock { type: BlockType; taskIds: number[]; start: number; end: number; reason: string }
export interface V4BlockRepackerAcceptedMove { blockType: BlockType; taskIds: number[]; from: string; to: string; reason: string }
export interface V4BlockRepackerDiagnostics {
  applied: boolean;
  skippedReason?: string;
  blocksDetected: number;
  blocksEvaluated: number;
  movesAccepted: number;
  movesRejected: number;
  makespanBefore: string | null;
  makespanAfter: string | null;
  mainFlowGapMinutesBefore: number;
  mainFlowGapMinutesAfter: number;
  totalTalentStayBefore: number;
  totalTalentStayAfter: number;
  acceptedMoves: V4BlockRepackerAcceptedMove[];
  warnings: string[];
}
export interface V4BlockRepackerResult { output: EngineOutput; quality: V4PlanQualityEvaluation; diagnostics: V4BlockRepackerDiagnostics }
interface V4BlockRepackerOptions extends EngineV3Options { blockRepacker?: Partial<{ maxBlocks: number; maxMovesPerBlock: number; maxRuntimeMs: number; slotStepMinutes: number }> }

const DEFAULT_LIMITS = { maxBlocks: 40, maxMovesPerBlock: 20, maxRuntimeMs: 3000, slotStepMinutes: 5 };
const INF = Number.POSITIVE_INFINITY;
const toMinutes = (value?: string | null): number | null => { const [h, m] = String(value ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const startOf = (p: Planned): number => toMinutes(p.startPlanned) ?? INF;
const endOf = (p: Planned): number => toMinutes(p.endPlanned) ?? -INF;
const taskDuration = (p: Planned, task?: TaskInput): number => Math.max(1, endOf(p) - startOf(p) || Number(task?.durationOverrideMin ?? 30) || 30);
const uniq = (ids: number[]): number[] => [...new Set(ids.filter(Number.isFinite))];
const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

function windowToInterval(window?: TimeWindow | null): Interval | null { const start = toMinutes(window?.start); const end = toMinutes(window?.end); return start === null || end === null || end <= start ? null : { start, end }; }
function excludedIntervals(input: EngineInput): Interval[] { return [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])].map(windowToInterval).filter((i): i is Interval => i !== null); }
function dayInterval(input: EngineInput): Interval { return { start: toMinutes(input.workDay?.start) ?? 0, end: toMinutes(input.workDay?.end) ?? 24 * 60 }; }
function metric(q: V4PlanQualityEvaluation) { return { makespan: toMinutes(q.makespan.lastTaskEnd) ?? INF, stay: q.talentStayTime.totalStayMinutes, mainFlowGap: q.mainFlowQuality?.internalGapMinutes ?? 0 }; }
function taskMap(input: EngineInput): Map<number, TaskInput> { return new Map((input.tasks ?? []).map((task) => [Number(task.id), task])); }
function plannedMap(output: EngineOutput): Map<number, Planned> { return new Map((output.plannedTasks ?? []).map((p) => [Number(p.taskId), p])); }
function dependencyIds(task?: TaskInput): number[] { return uniq([...(task?.dependsOnTaskIds ?? []), Number(task?.dependsOnTaskId)]); }
function dependentIds(tasks: TaskInput[], id: number): number[] { return tasks.filter((task) => dependencyIds(task).includes(id)).map((task) => Number(task.id)); }
function resourceIds(task: TaskInput | undefined, planned: Planned | undefined): number[] { return uniq([...(planned?.assignedResources ?? []), ...Object.keys(task?.resourceRequirements?.byItem ?? {}).map(Number), ...(task?.assignedResourceIds ?? [])]); }
function isMovableTask(task: TaskInput | undefined, locked: Set<number>): boolean { const status = String(task?.status ?? "").toLowerCase(); return Boolean(task) && status === "pending" && !locked.has(Number(task?.id)) && !task?.startReal && !task?.endReal; }

function hasUnsafeExternalDependency(blockIds: Set<number>, tasks: TaskInput[], planned: Map<number, Planned>): boolean {
  const minStart = Math.min(...[...blockIds].map((id) => startOf(planned.get(id)!)));
  const maxEnd = Math.max(...[...blockIds].map((id) => endOf(planned.get(id)!)));
  for (const id of blockIds) {
    const task = tasks.find((t) => Number(t.id) === id);
    for (const dep of dependencyIds(task)) if (!blockIds.has(dep) && planned.has(dep) && endOf(planned.get(dep)!) > minStart) return true;
    for (const dependent of dependentIds(tasks, id)) if (!blockIds.has(dependent) && planned.has(dependent) && startOf(planned.get(dependent)!) < maxEnd) return true;
  }
  return false;
}

function makeBlock(type: BlockType, ids: number[], planned: Map<number, Planned>, reason: string): MovableBlock | null {
  const taskIds = uniq(ids).filter((id) => planned.has(id));
  if (taskIds.length < 2) return null;
  return { type, taskIds, start: Math.min(...taskIds.map((id) => startOf(planned.get(id)!))), end: Math.max(...taskIds.map((id) => endOf(planned.get(id)!))), reason };
}

function chainBlocks<T>(items: Array<{ key: T; id: number; start: number; end: number }>, type: BlockType, maxGap: number, reason: string, planned: Map<number, Planned>): MovableBlock[] {
  const blocks: MovableBlock[] = [];
  const byKey = new Map<T, typeof items>();
  for (const item of items) byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
  for (const group of byKey.values()) {
    let chain: number[] = [];
    let prevEnd = -INF;
    for (const item of [...group].sort((a, b) => a.start - b.start)) {
      if (!chain.length || item.start - prevEnd <= maxGap) chain.push(item.id); else { const b = makeBlock(type, chain, planned, reason); if (b) blocks.push(b); chain = [item.id]; }
      prevEnd = item.end;
    }
    const b = makeBlock(type, chain, planned, reason); if (b) blocks.push(b);
  }
  return blocks;
}

function detectBlocks(input: EngineInput, output: EngineOutput, analysis: V4StrategicAnalysis): MovableBlock[] {
  const tasks = taskMap(input), planned = plannedMap(output), criticalIds = new Set((analysis.criticalResources ?? []).map((r) => Number(r.id)));
  const rows = [...planned.values()].map((p) => ({ id: Number(p.taskId), task: tasks.get(Number(p.taskId)), start: startOf(p), end: endOf(p), planned: p })).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));
  const blocks: MovableBlock[] = [];
  blocks.push(...chainBlocks(rows.filter((r) => Number.isFinite(Number(r.task?.contestantId))).map((r) => ({ key: Number(r.task?.contestantId), id: r.id, start: r.start, end: r.end })), "TalentChainBlock", 15, "Compacta una cadena consecutiva de talent.", planned));
  for (const row of rows) blocks.push(makeBlock("DependencyChainBlock", [...dependencyIds(row.task), row.id, ...dependentIds(input.tasks ?? [], row.id)], planned, "Recoloca prerequisitos, tarea principal y dependientes directos.")!);
  for (const rid of criticalIds) blocks.push(...chainBlocks(rows.filter((r) => resourceIds(r.task, r.planned).includes(rid)).map((r) => ({ key: rid, id: r.id, start: r.start, end: r.end })), "CriticalResourceBlock", 15, "Compacta uso consecutivo de recurso crítico.", planned));
  const mainFlowIds = new Set((analysis.mainFlowSequence ?? []).map((item: any) => Number(item.taskId ?? item.id)).filter(Number.isFinite));
  const fallbackMainFlowId = analysis.mainFlow?.id;
  const mainRows = rows.filter((r) => mainFlowIds.has(r.id) || (fallbackMainFlowId !== undefined && (Number(r.task?.spaceId ?? r.task?.zoneId) === fallbackMainFlowId || Number(r.task?.zoneId) === fallbackMainFlowId)));
  blocks.push(...chainBlocks(mainRows.map((r) => ({ key: 1, id: r.id, start: r.start, end: r.end })), "MainFlowSegmentBlock", 20, "Recoloca un segmento consecutivo del flujo principal.", planned));
  return blocks.filter(Boolean).sort((a, b) => (b.end - b.start) - (a.end - a.start));
}

function blockIsMovable(input: EngineInput, block: MovableBlock, planned: Map<number, Planned>, exclusions: Interval[]): boolean {
  const tasks = taskMap(input), locked = new Set((input.locks ?? []).map((l) => Number(l.taskId)).filter(Number.isFinite));
  if (block.taskIds.some((id) => !isMovableTask(tasks.get(id), locked))) return false;
  if (block.taskIds.some((id) => exclusions.some((ex) => overlaps({ start: startOf(planned.get(id)!), end: endOf(planned.get(id)!) }, ex)))) return false;
  return !hasUnsafeExternalDependency(new Set(block.taskIds), input.tasks ?? [], planned);
}

function moveBlock(output: EngineOutput, block: MovableBlock, toStart: number, planned: Map<number, Planned>, tasks: Map<number, TaskInput>): EngineOutput {
  const offsets = new Map(block.taskIds.map((id) => [id, startOf(planned.get(id)!) - block.start]));
  const ids = new Set(block.taskIds);
  return { ...output, plannedTasks: (output.plannedTasks ?? []).map((p) => {
    const id = Number(p.taskId); if (!ids.has(id)) return p;
    const start = toStart + (offsets.get(id) ?? 0); const end = start + taskDuration(p, tasks.get(id));
    return { ...p, startPlanned: toHHMM(start), endPlanned: toHHMM(end) };
  }) };
}

export function repackV4StrategicBlocks(input: EngineInput, output: EngineOutput, strategicAnalysis: V4StrategicAnalysis, quality: V4PlanQualityEvaluation, options?: V4BlockRepackerOptions): V4BlockRepackerResult {
  const limits = { ...DEFAULT_LIMITS, ...(options?.blockRepacker ?? {}) }, started = Date.now(), warnings: string[] = [], acceptedMoves: V4BlockRepackerAcceptedMove[] = [];
  let currentOutput = output, currentQuality = quality, evaluated = 0, accepted = 0, rejected = 0;
  const before = quality, day = dayInterval(input), exclusions = excludedIntervals(input), tasks = taskMap(input);
  const blocks = detectBlocks(input, output, strategicAnalysis).filter((b, i, arr) => arr.findIndex((x) => x.type === b.type && x.taskIds.join(",") === b.taskIds.join(",")) === i).slice(0, limits.maxBlocks);
  const limitReached = () => Date.now() - started >= limits.maxRuntimeMs;
  for (const detectedBlock of blocks) {
    if (limitReached()) { warnings.push(`Block repacker stopped after maxRuntimeMs=${limits.maxRuntimeMs}.`); break; }
    const pmap = plannedMap(currentOutput);
    const currentStarts = detectedBlock.taskIds.map((id) => startOf(pmap.get(id)!));
    const currentEnds = detectedBlock.taskIds.map((id) => endOf(pmap.get(id)!));
    const block: MovableBlock = { ...detectedBlock, start: Math.min(...currentStarts), end: Math.max(...currentEnds) };
    if (!blockIsMovable(input, block, pmap, exclusions)) continue;
    evaluated += 1;
    const span = block.end - block.start;
    const candidates: Array<{ start: number; kind: MoveKind }> = [];
    for (let t = Math.max(day.start, block.start - limits.slotStepMinutes); t >= day.start && candidates.length < limits.maxMovesPerBlock; t -= limits.slotStepMinutes) candidates.push({ start: t, kind: metric(currentQuality).makespan === block.end ? "pullFinalBlockEarlier" : "shiftEarlier" });
    for (let t = block.start + limits.slotStepMinutes; t + span <= Math.min(day.end, metric(currentQuality).makespan); t += limits.slotStepMinutes) if (candidates.length < limits.maxMovesPerBlock) candidates.push({ start: t, kind: "shiftLater" });
    for (const candidate of candidates) {
      if (limitReached()) break;
      const taskIntervals = block.taskIds.map((id) => ({ start: candidate.start + (startOf(pmap.get(id)!) - block.start), end: candidate.start + (endOf(pmap.get(id)!) - block.start) }));
      if (candidate.start < day.start || candidate.start + span > day.end || taskIntervals.some((iv) => exclusions.some((ex) => overlaps(iv, ex)))) { rejected += 1; continue; }
      const candidateOutput = moveBlock(currentOutput, block, candidate.start, pmap, tasks);
      if (!validateHardConstraints(input as any, candidateOutput).hardValidationPassed) { rejected += 1; continue; }
      const candidateQuality = evaluateV4PlanQuality(input, candidateOutput, strategicAnalysis);
      const m = metric(candidateQuality), c = metric(currentQuality);
      const allowedLater = candidate.kind === "shiftLater" ? m.makespan <= c.makespan && m.stay <= c.stay : true;
      if (allowedLater && isV4QualityBetter(candidateQuality, currentQuality)) {
        currentOutput = candidateOutput; currentQuality = candidateQuality; accepted += 1;
        acceptedMoves.push({ blockType: block.type, taskIds: block.taskIds, from: toHHMM(block.start), to: toHHMM(candidate.start), reason: candidate.kind === "pullFinalBlockEarlier" ? "Reduced makespan by pulling the final operational block earlier." : block.reason });
        break;
      }
      rejected += 1;
    }
  }
  return { output: currentOutput, quality: currentQuality, diagnostics: { applied: true, blocksDetected: blocks.length, blocksEvaluated: evaluated, movesAccepted: accepted, movesRejected: rejected, makespanBefore: before.makespan.lastTaskEnd, makespanAfter: currentQuality.makespan.lastTaskEnd, mainFlowGapMinutesBefore: before.mainFlowQuality?.internalGapMinutes ?? 0, mainFlowGapMinutesAfter: currentQuality.mainFlowQuality?.internalGapMinutes ?? 0, totalTalentStayBefore: before.talentStayTime.totalStayMinutes, totalTalentStayAfter: currentQuality.talentStayTime.totalStayMinutes, acceptedMoves, warnings } };
}
