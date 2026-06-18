import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { validateHardConstraints } from "../../v3/hardValidation";
import type { V4StrategicAnalysis } from "../analysis";
import { repackV4StrategicBlocks } from "../blockRepacker";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";

type Planned = EngineOutput["plannedTasks"][number];
type Interval = { start: number; end: number };
type FamilyName = "singleTaskPullEarlier" | "tailCompression" | "strategicBlockShift" | "mainFlowGapFill" | "talentStayCompression" | "criticalResourceCompression";

export interface V4ImprovementEngineFamilyDiagnostics { name: FamilyName; candidates: number; accepted: number; rejected: number }
export interface V4ImprovementEngineAcceptedMove { family: FamilyName; taskIds: number[]; from: string; to: string; reason: string }
export interface V4ImprovementEngineDiagnostics {
  applied: boolean; runtimeMs: number; iterations: number; movesAccepted: number; movesRejected: number;
  qualityBefore: V4PlanQualityEvaluation; qualityAfter: V4PlanQualityEvaluation;
  makespanBefore: string | null; makespanAfter: string | null;
  mainFlowGapMinutesBefore: number; mainFlowGapMinutesAfter: number;
  totalTalentStayBefore: number; totalTalentStayAfter: number;
  families: V4ImprovementEngineFamilyDiagnostics[]; acceptedMoves: V4ImprovementEngineAcceptedMove[]; warnings: string[];
}
export interface V4ImprovementEngineResult { output: EngineOutput; quality: V4PlanQualityEvaluation; diagnostics: V4ImprovementEngineDiagnostics }
interface V4ImprovementEngineOptions extends EngineV3Options { improvementEngine?: Partial<{ maxRuntimeMs: number; maxIterations: number; maxCandidatesPerFamily: number; slotStepMinutes: number }> }

const DEFAULTS = { maxRuntimeMs: 5000, maxIterations: 200, maxCandidatesPerFamily: 80, slotStepMinutes: 5 };
const INF = Number.POSITIVE_INFINITY;
const toMinutes = (v?: string | null): number | null => { const [h,m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const toHHMM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;
const metric = (q: V4PlanQualityEvaluation) => ({ unplanned: q.risk.unplannedTasks, mainFlowGap: q.mainFlowQuality?.internalGapMinutes ?? 0, makespan: toMinutes(q.makespan.lastTaskEnd) ?? INF, score: q.qualityScore, talentStay: q.talentStayTime.totalStayMinutes, resourceGap: q.criticalResourceUsage.reduce((s, r) => s + r.internalGapMinutes, 0) });
export function isV4CandidatePlanBetter(candidateQuality: V4PlanQualityEvaluation, currentQuality: V4PlanQualityEvaluation): boolean {
  const a = metric(candidateQuality), b = metric(currentQuality);
  return a.unplanned < b.unplanned ||
    (a.unplanned === b.unplanned && a.mainFlowGap < b.mainFlowGap) ||
    (a.unplanned === b.unplanned && a.mainFlowGap === b.mainFlowGap && a.makespan < b.makespan) ||
    (a.unplanned === b.unplanned && a.mainFlowGap === b.mainFlowGap && a.makespan === b.makespan && a.score > b.score) ||
    (a.unplanned === b.unplanned && a.mainFlowGap === b.mainFlowGap && a.makespan === b.makespan && a.score === b.score && a.talentStay < b.talentStay) ||
    (a.unplanned === b.unplanned && a.mainFlowGap === b.mainFlowGap && a.makespan === b.makespan && a.score === b.score && a.talentStay === b.talentStay && a.resourceGap < b.resourceGap);
}
const taskMap = (input: EngineInput) => new Map((input.tasks ?? []).map((t) => [Number(t.id), t]));
const plannedMap = (output: EngineOutput) => new Map((output.plannedTasks ?? []).map((p) => [Number(p.taskId), p]));
const startOf = (p: Planned) => toMinutes(p.startPlanned) ?? INF;
const endOf = (p: Planned) => toMinutes(p.endPlanned) ?? -INF;
const duration = (p: Planned, t?: TaskInput) => Math.max(1, (toMinutes(p.endPlanned) ?? 0) - (toMinutes(p.startPlanned) ?? 0) || Number(t?.durationOverrideMin ?? 30) || 30);
const win = (w?: TimeWindow | null): Interval | null => { const s = toMinutes(w?.start), e = toMinutes(w?.end); return s === null || e === null || e <= s ? null : { start: s, end: e }; };
const exclusions = (input: EngineInput): Interval[] => [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])].map(win).filter((x): x is Interval => x !== null);
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const protectedIds = (input: EngineInput) => new Set([...(input.locks ?? []).map((l) => Number(l.taskId)), ...(input.tasks ?? []).filter((t) => ["done","in_progress"].includes(String(t.status ?? "").toLowerCase())).map((t) => Number(t.id))].filter(Number.isFinite));
function movable(input: EngineInput, task?: TaskInput) { return !!task && String(task.status ?? "").toLowerCase() === "pending" && !protectedIds(input).has(Number(task.id)) && !(task as any).startReal && !(task as any).endReal; }
function move(output: EngineOutput, id: number, start: number, end: number): EngineOutput { return { ...output, plannedTasks: (output.plannedTasks ?? []).map((p) => Number(p.taskId) === id ? { ...p, startPlanned: toHHMM(start), endPlanned: toHHMM(end) } : p) }; }
function resourceIds(task: TaskInput | undefined, planned: Planned): number[] { return [...(planned.assignedResources ?? []), ...Object.keys(task?.resourceRequirements?.byItem ?? {}).map(Number), ...(task?.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite); }

export function runV4HierarchicalImprovementEngine(input: EngineInput, output: EngineOutput, strategicAnalysis: V4StrategicAnalysis, quality: V4PlanQualityEvaluation, options?: V4ImprovementEngineOptions): V4ImprovementEngineResult {
  const limits = { ...DEFAULTS, ...(options?.improvementEngine ?? {}) }, started = Date.now(), warnings: string[] = [], acceptedMoves: V4ImprovementEngineAcceptedMove[] = [];
  let currentOutput = output, currentQuality = quality, iterations = 0, movesAccepted = 0, movesRejected = 0;
  const before = quality, families: V4ImprovementEngineFamilyDiagnostics[] = [], tasks = taskMap(input), day = { start: toMinutes(input.workDay?.start) ?? 0, end: toMinutes(input.workDay?.end) ?? 1440 }, excluded = exclusions(input);
  const timedOut = () => Date.now() - started >= limits.maxRuntimeMs || iterations >= limits.maxIterations;
  const tryCandidate = (family: FamilyName, taskId: number, toStart: number, reason: string, fd: V4ImprovementEngineFamilyDiagnostics): boolean => {
    iterations += 1; fd.candidates += 1;
    const p = plannedMap(currentOutput).get(taskId), t = tasks.get(taskId); if (!p || !movable(input, t)) { fd.rejected++; movesRejected++; return false; }
    const len = duration(p, t), toEnd = toStart + len;
    if (toStart < day.start || toEnd > day.end || excluded.some((ex) => overlaps({ start: toStart, end: toEnd }, ex))) { fd.rejected++; movesRejected++; return false; }
    const candidateOutput = move(currentOutput, taskId, toStart, toEnd);
    if (!validateHardConstraints(input as any, candidateOutput).hardValidationPassed) { fd.rejected++; movesRejected++; return false; }
    const candidateQuality = evaluateV4PlanQuality(input, candidateOutput, strategicAnalysis);
    if (!isV4CandidatePlanBetter(candidateQuality, currentQuality)) { fd.rejected++; movesRejected++; return false; }
    acceptedMoves.push({ family, taskIds: [taskId], from: String(p.startPlanned), to: toHHMM(toStart), reason });
    currentOutput = candidateOutput; currentQuality = candidateQuality; fd.accepted++; movesAccepted++; return true;
  };
  const rows = () => [...plannedMap(currentOutput).values()].map((p) => ({ p, id: Number(p.taskId), task: tasks.get(Number(p.taskId)), start: startOf(p), end: endOf(p) })).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));
  const runSingleFamily = (family: FamilyName, seedRows: ReturnType<typeof rows>, reason: string) => {
    const fd = { name: family, candidates: 0, accepted: 0, rejected: 0 }; families.push(fd);
    for (const r of seedRows.slice(0, limits.maxCandidatesPerFamily)) {
      if (timedOut()) break;
      for (let s = r.start - limits.slotStepMinutes; s >= day.start && fd.candidates < limits.maxCandidatesPerFamily; s -= limits.slotStepMinutes) if (tryCandidate(family, r.id, s, reason, fd)) break;
    }
  };
  runSingleFamily("tailCompression", rows().sort((a,b) => b.end - a.end), "Reduced makespan without hurting main flow.");
  runSingleFamily("singleTaskPullEarlier", rows().sort((a,b) => a.start - b.start), "Filled a useful earlier slot without hurting main flow.");
  const mainIds = new Set((input.tasks ?? []).filter((t) => strategicAnalysis.mainFlow && (Number(t.spaceId ?? t.zoneId) === strategicAnalysis.mainFlow.id || Number(t.zoneId) === strategicAnalysis.mainFlow.id)).map((t) => Number(t.id)));
  runSingleFamily("mainFlowGapFill", rows().filter((r) => mainIds.has(r.id)).sort((a,b) => a.start - b.start), "Reduced an internal gap in the main flow.");
  const topTalents = new Set((currentQuality.talentStayTime.topWaitingTalents ?? []).slice(0, 5).map((t) => Number(t.talentId)));
  runSingleFamily("talentStayCompression", rows().filter((r) => topTalents.has(Number(r.task?.contestantId))).sort((a,b) => b.end - a.end), "Compressed stay for high-wait talent without hurting higher-priority metrics.");
  const critical = new Set((strategicAnalysis.criticalResources ?? []).map((r) => Number(r.id)));
  runSingleFamily("criticalResourceCompression", rows().filter((r) => resourceIds(r.task, r.p).some((id) => critical.has(id))).sort((a,b) => b.end - a.end), "Compacted a critical resource lane without hurting higher-priority metrics.");
  const blockFd = { name: "strategicBlockShift" as FamilyName, candidates: 0, accepted: 0, rejected: 0 }; families.push(blockFd);
  if (!timedOut()) {
    const block = repackV4StrategicBlocks(input, currentOutput, strategicAnalysis, currentQuality, { ...(options as any), blockRepacker: { maxRuntimeMs: Math.max(50, limits.maxRuntimeMs - (Date.now() - started)), maxBlocks: limits.maxCandidatesPerFamily, maxMovesPerBlock: 20, slotStepMinutes: limits.slotStepMinutes } });
    blockFd.candidates = block.diagnostics.blocksEvaluated; blockFd.accepted = block.diagnostics.movesAccepted; blockFd.rejected = block.diagnostics.movesRejected;
    if (isV4CandidatePlanBetter(block.quality, currentQuality)) { currentOutput = block.output; currentQuality = block.quality; movesAccepted += block.diagnostics.movesAccepted; acceptedMoves.push(...block.diagnostics.acceptedMoves.map((m) => ({ family: "strategicBlockShift" as FamilyName, taskIds: m.taskIds, from: m.from, to: m.to, reason: m.reason }))); }
    else movesRejected += Math.max(1, block.diagnostics.movesRejected);
    warnings.push(...block.diagnostics.warnings);
  }
  if (timedOut()) warnings.push(`Improvement engine stopped at runtime/iteration budget (${Date.now() - started}ms, ${iterations} iterations).`);
  return { output: currentOutput, quality: currentQuality, diagnostics: { applied: true, runtimeMs: Date.now() - started, iterations, movesAccepted, movesRejected, qualityBefore: before, qualityAfter: currentQuality, makespanBefore: before.makespan.lastTaskEnd, makespanAfter: currentQuality.makespan.lastTaskEnd, mainFlowGapMinutesBefore: before.mainFlowQuality?.internalGapMinutes ?? 0, mainFlowGapMinutesAfter: currentQuality.mainFlowQuality?.internalGapMinutes ?? 0, totalTalentStayBefore: before.talentStayTime.totalStayMinutes, totalTalentStayAfter: currentQuality.talentStayTime.totalStayMinutes, families, acceptedMoves, warnings } };
}
