import type { Candidate, Evidence, OperationalState } from "../contracts";
import type { ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";
import { deepFreeze } from "../immutability";
import { classifyORCPlanningEntryOperationalRole, isORCProductiveRole } from "../state/nonWorkTaskClassifier";

export type BaselineOverlapRepairSkippedReason = "baseline_hard_feasible" | "no_space_overlap_violation" | "unsupported_overlap_cardinality" | "protected_task_in_overlap" | "locked_task_in_overlap" | "no_repair_window_available" | "unsupported_overlap_roles" | "unknown";
export type BaselineRepairLocalBlockingReason = "outside_workday" | "moved_task_done" | "moved_task_in_progress" | "moved_task_locked" | "obvious_resource_overlap" | "obvious_space_overlap" | "duplicate_assignment" | "unsupported_dependency_risk";
export interface BaselineRepairLocalFeasibility { locallyFeasible: boolean; warnings: string[]; blockingReason: BaselineRepairLocalBlockingReason | null; checkedConstraints: string[]; readOnly: true; }
export interface BaselineOverlapRepairSummary { executed: boolean; skippedReason: BaselineOverlapRepairSkippedReason | null; generatedCandidateCount: number; candidateIds: string[]; conflictingTaskIds: number[]; movedTaskIds: number[]; assignmentCount: number; discardedByPrefilter: number; prefilterDiscardReasons: Record<string, number>; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number; selectedCandidateId: string | null; selectedAsBest: boolean; selectedAsCommit: boolean; readOnly: true; planningInfluence: "candidate-generation-diagnostics-only"; variantCount: number; variantsGenerated: number; variantsSkipped: number; skippedVariantReasons: Record<string, number>; locallyFeasibleCandidateCount: number; locallyBlockedCandidateCount: number; repairWindowStrategy: "both-tasks-before-after-v1"; }
export interface BaselineOverlapRepairCandidateBuilderResult { candidates: Candidate[]; evidence: Evidence[]; summary: BaselineOverlapRepairSummary; }
export interface BaselineOverlapRepairCandidateBuilderOptions { createdAt?: string | null; maxCandidates?: number; baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit | null; }

type Entry = OperationalState["planning"][number];
type Planned = Entry & { start: number; end: number; duration: number; task: OperationalState["tasks"][number] | undefined };
const SOURCE = "orc-see";
const toMinutes = (v: unknown): number | null => { if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return null; const [h,m]=v.split(":").map(Number); return Number.isInteger(h)&&Number.isInteger(m)&&h>=0&&h<24&&m>=0&&m<60?h*60+m:null; };
const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const overlaps = (a: Planned, b: Planned) => a.start < b.end && b.start < a.end;
const emptySummary = (executed: boolean, skippedReason: BaselineOverlapRepairSkippedReason | null): BaselineOverlapRepairSummary => ({ executed, skippedReason, generatedCandidateCount: 0, candidateIds: [], conflictingTaskIds: [], movedTaskIds: [], assignmentCount: 0, discardedByPrefilter: 0, prefilterDiscardReasons: {}, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", variantCount: 0, variantsGenerated: 0, variantsSkipped: 0, skippedVariantReasons: {}, locallyFeasibleCandidateCount: 0, locallyBlockedCandidateCount: 0, repairWindowStrategy: "both-tasks-before-after-v1" });
const isProtected = (task: OperationalState["tasks"][number] | undefined) => ["done", "in_progress"].includes(String(task?.status ?? ""));
const hasBlockingLock = (state: OperationalState, taskId: number) => (state.locks ?? []).some((l) => l.taskId === taskId && ["full", "time"].includes(String(l.lockType)));
const isMainFlow = (state: OperationalState, e: Entry, task: OperationalState["tasks"][number] | undefined) => { const opt = state.constraints?.optimizer; const raw = opt && typeof opt === "object" ? (opt as Record<string, unknown>).mainZoneId : null; const id = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null; return id != null && ((e.spaceId ?? null) === id || task?.spaceId === id || (task as any)?.zoneId === id); };
const roleOk = (state: OperationalState, p: Planned) => { const role = classifyORCPlanningEntryOperationalRole({ entry: p, task: p.task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null }); return isORCProductiveRole(role) && (p.spaceOccupancyMode ?? (state.spaces?.exclusiveById?.[p.spaceId ?? -1] ? "exclusive" : null)) !== "shared" && p.allowsSpaceOverlap !== true; };

function planned(state: OperationalState): Planned[] { const tasks = new Map((state.tasks ?? []).map((t) => [t.id, t])); return (state.planning ?? []).flatMap((e): Planned[] => { const start=toMinutes(e.startPlanned), end=toMinutes(e.endPlanned); if (start == null || end == null || end <= start) return []; return [{ ...e, assignedResourceIds: [...(e.assignedResourceIds ?? [])], start, end, duration: end-start, task: tasks.get(e.taskId) }]; }); }
function findPair(state: OperationalState, audit?: ORCBaselineSeedHardFeasibilityAudit | null): { pair: [Planned, Planned] | null; reason: BaselineOverlapRepairSkippedReason | null } {
  if (audit?.hardFeasible === true) return { pair: null, reason: "baseline_hard_feasible" };
  const entries = planned(state).sort((a,b)=>a.start-b.start||a.end-b.end||a.taskId-b.taskId);
  const pairs: [Planned, Planned][] = [];
  for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) { const a=entries[i], b=entries[j]; if ((a.spaceId ?? null) == null || a.spaceId !== b.spaceId || !overlaps(a,b)) continue; if (!roleOk(state,a) || !roleOk(state,b)) continue; pairs.push([a,b]); }
  if (pairs.length === 0) return { pair: null, reason: audit && !audit.dominantViolationCodes?.includes("SPACE_OVERLAP") ? "no_space_overlap_violation" : "no_space_overlap_violation" };
  if (pairs.length > 1) return { pair: null, reason: "unsupported_overlap_cardinality" };
  const [a,b] = pairs[0];
  if (isProtected(a.task) && isProtected(b.task)) return { pair: null, reason: "protected_task_in_overlap" };
  if (hasBlockingLock(state, a.taskId) && hasBlockingLock(state, b.taskId)) return { pair: null, reason: "locked_task_in_overlap" };
  return { pair: pairs[0], reason: null };
}
function localBlock(reason: BaselineRepairLocalBlockingReason): BaselineRepairLocalFeasibility { return { locallyFeasible: false, warnings: [reason], blockingReason: reason, checkedConstraints: ["workday", "locks", "protected-status", "space-overlap", "resource-overlap", "contestant-overlap", "team-overlap"], readOnly: true }; }
function localOk(warnings: string[] = []): BaselineRepairLocalFeasibility { return { locallyFeasible: true, warnings, blockingReason: null, checkedConstraints: ["workday", "locks", "protected-status", "space-overlap", "resource-overlap", "contestant-overlap", "team-overlap"], readOnly: true }; }
export function estimateBaselineRepairLocalFeasibility(state: OperationalState, moved: Planned, fixed: Planned, start: number): BaselineRepairLocalFeasibility {
  const end = start + moved.duration; const dayStart = toMinutes(state.workDay?.start ?? state.availability?.workDay?.start) ?? 0; const dayEnd = toMinutes(state.workDay?.end ?? state.availability?.workDay?.end) ?? 24*60;
  if (start < dayStart || end > dayEnd) return localBlock("outside_workday");
  const status = String(moved.task?.status ?? ""); if (status === "done") return localBlock("moved_task_done"); if (status === "in_progress") return localBlock("moved_task_in_progress");
  if (hasBlockingLock(state, moved.taskId)) return localBlock("moved_task_locked");
  if (start === moved.start && end === moved.end) return localBlock("duplicate_assignment");
  for (const other of planned(state)) {
    if (other.taskId === moved.taskId || other.taskId === fixed.taskId) continue;
    if (!(start < other.end && other.start < end)) continue;
    if ((moved.spaceId ?? null) != null && moved.spaceId === other.spaceId && roleOk(state, moved) && roleOk(state, other)) return localBlock("obvious_space_overlap");
    if ((moved.assignedResourceIds ?? []).some((id) => (other.assignedResourceIds ?? []).includes(id))) return localBlock("obvious_resource_overlap");
    if (moved.task?.contestantId != null && moved.task.contestantId === other.task?.contestantId) return localBlock("unsupported_dependency_risk");
    if (moved.task?.itinerantTeamId != null && moved.task.itinerantTeamId === other.task?.itinerantTeamId) return localBlock("unsupported_dependency_risk");
  }
  return localOk();
}
function variantRank(state: OperationalState, v: {variant:string;moved:Planned;fixed:Planned;start:number;localFeasibility:BaselineRepairLocalFeasibility}) { return [(v.moved.assignedResourceIds ?? []).length === 0 ? 0 : 1, v.moved.duration, isMainFlow(state, v.moved, v.moved.task) ? 1 : 0, Math.abs(v.start - v.moved.start), v.moved.taskId, v.variant]; }
function makeCandidate(state: OperationalState, variant: string, moved: Planned, fixed: Planned, start: number, createdAt: string | null, localFeasibility: BaselineRepairLocalFeasibility): { candidate: Candidate; evidence: Evidence } {
  const assignment = { taskId: moved.taskId, startPlanned: toTime(start), endPlanned: toTime(start + moved.duration), spaceId: moved.spaceId ?? moved.task?.spaceId ?? null, resourceIds: [...(moved.assignedResourceIds ?? moved.task?.assignedResourceIds ?? [])].sort((a,b)=>a-b) };
  const conflictingTaskIds = [moved.taskId, fixed.taskId].sort((a,b)=>a-b); const candidateId = `orc-see:baseline-overlap-repair:productive-space-overlap:${variant}:${conflictingTaskIds.join("-")}:move-${moved.taskId}:${assignment.startPlanned}-${assignment.endPlanned}`; const evidenceId = `evidence:${candidateId}`;
  const originalWindows = [moved, fixed].sort((a,b)=>a.taskId-b.taskId).map((e)=>({ taskId: e.taskId, startPlanned: e.startPlanned, endPlanned: e.endPlanned })); const proposedWindows = [{ taskId: moved.taskId, startPlanned: assignment.startPlanned, endPlanned: assignment.endPlanned }];
  const metadata = { strategy: "BASELINE_SPACE_OVERLAP_REPAIR", strategyFamily: "baseline-repair", strategyType: "repair_space_overlap", baselineRepairCandidate: true, baselineRepairType: "productive-space-overlap", repairVariant: variant, movedTaskId: moved.taskId, fixedTaskId: fixed.taskId, conflictingTaskIds, originalWindows, proposedWindows, localFeasibility, generationReason: variant, expectedImpact: "restore-hard-feasibility", planningInfluence: "candidate-assignments", executesTransformations: true, readOnly: false, repairedViolationCode: "SPACE_OVERLAP", movedTaskIds: [moved.taskId], spaceId: moved.spaceId ?? null };
  return { candidate: { id: candidateId, state: { status: "draft", evidenceIds: [evidenceId], metadata: { ...metadata } }, assignments: [assignment], operationalValues: [], evidenceIds: [evidenceId], metadata }, evidence: deepFreeze({ id: evidenceId, source: SOURCE, kind: "baseline-overlap-repair-candidate-generated", subjectId: candidateId, createdAt, data: { candidateId, repairType: "productive-space-overlap", variant, repairedViolationCode: "SPACE_OVERLAP", spaceId: moved.spaceId ?? null, conflictingTaskIds, movedTaskIds: [moved.taskId], originalWindows, proposedWindows, localFeasibility, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } }) as Evidence };
}
export function buildBaselineOverlapRepairCandidates(operationalState: OperationalState | null | undefined, options: BaselineOverlapRepairCandidateBuilderOptions = {}): BaselineOverlapRepairCandidateBuilderResult {
  if (!operationalState) return { candidates: [], evidence: [], summary: emptySummary(false, "unknown") };
  const createdAt = options.createdAt ?? null; const max = Math.max(0, options.maxCandidates ?? 4); const found = findPair(operationalState, options.baselineSeedHardFeasibility);
  if (!found.pair || max === 0) return { candidates: [], evidence: [], summary: emptySummary(true, found.reason ?? "unknown") };
  const [a,b] = found.pair;
  const specs = [
    { variant: "move-a-before-b", moved: a, fixed: b, start: b.start - a.duration },
    { variant: "move-a-after-b", moved: a, fixed: b, start: b.end },
    { variant: "move-b-before-a", moved: b, fixed: a, start: a.start - b.duration },
    { variant: "move-b-after-a", moved: b, fixed: a, start: a.end },
  ];
  const skipped: Record<string, number> = {}; const variants = specs.map((v) => ({ ...v, localFeasibility: estimateBaselineRepairLocalFeasibility(operationalState, v.moved, v.fixed, v.start) }));
  const buildable = variants.filter((v) => { if (!v.localFeasibility.locallyFeasible && ["outside_workday", "moved_task_done", "moved_task_in_progress", "moved_task_locked", "duplicate_assignment"].includes(String(v.localFeasibility.blockingReason))) { const r=String(v.localFeasibility.blockingReason); skipped[r]=(skipped[r]??0)+1; return false; } return true; });
  buildable.sort((x,y)=>{ const sx=variantRank(operationalState,x), sy=variantRank(operationalState,y); for(let i=0;i<sx.length;i++) if(sx[i]!==sy[i]) return sx[i]<sy[i]?-1:1; return 0; });
  const kept = buildable.slice(0,max).map((v)=>makeCandidate(operationalState, v.variant, v.moved, v.fixed, v.start, createdAt, v.localFeasibility));
  if (kept.length === 0) return { candidates: [], evidence: [], summary: { ...emptySummary(true, Object.keys(skipped).some((r)=>r.startsWith("moved_task")) ? "protected_task_in_overlap" : "no_repair_window_available"), conflictingTaskIds: [a.taskId,b.taskId].sort((x,y)=>x-y), variantCount: specs.length, variantsSkipped: specs.length, skippedVariantReasons: skipped } };
  const movedTaskIds = [...new Set(kept.map((x)=>Number(x.candidate.metadata.movedTaskId)))].sort((x,y)=>x-y); const conflictingTaskIds = [a.taskId,b.taskId].sort((x,y)=>x-y);
  return deepFreeze({ candidates: kept.map((x)=>x.candidate), evidence: kept.map((x)=>x.evidence), summary: { ...emptySummary(true, null), generatedCandidateCount: kept.length, candidateIds: kept.map((x)=>x.candidate.id), conflictingTaskIds, movedTaskIds, assignmentCount: kept.reduce((s,x)=>s+x.candidate.assignments.length,0), variantCount: specs.length, variantsGenerated: kept.length, variantsSkipped: specs.length - kept.length, skippedVariantReasons: skipped, locallyFeasibleCandidateCount: kept.filter((x)=>(x.candidate.metadata.localFeasibility as BaselineRepairLocalFeasibility | undefined)?.locallyFeasible === true).length, locallyBlockedCandidateCount: kept.filter((x)=>(x.candidate.metadata.localFeasibility as BaselineRepairLocalFeasibility | undefined)?.locallyFeasible === false).length } }) as BaselineOverlapRepairCandidateBuilderResult;
}
