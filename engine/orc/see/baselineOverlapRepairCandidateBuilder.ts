import type { Candidate, Evidence, OperationalState } from "../contracts";
import type { ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";
import { deepFreeze } from "../immutability";
import { resolveORCPlanningEntryOperationalRoleMetadata, isORCProductiveRole } from "../state/nonWorkTaskClassifier";
import { resolveORCSpaceOccupancy } from "../state/spaceOccupancyResolver";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import { validateSimulatedStates } from "../validation/validationEngine";
import type { BaselineRepairRuntimeInvariantResult } from "./baselineRepairRuntimeInvariant";
import { BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224 } from "../active/runActiveBaselineRepairPreflight";
import { buildBaselineRepairConflictClosure, closureCandidateToORCCandidate, DEFAULT_BASELINE_REPAIR_CONFLICT_CLOSURE_LIMITS, type BaselineRepairConflictClosureResult, type BaselineRepairConflictClosureLimits } from "./baselineOverlapRepairConflictClosure";
import { admitBaselineRepairCandidate, fingerprintBaselineRepairAssignments, incrementReasonCount, type BaselineRepairCandidateSource } from "./baselineRepairCandidateAdmission";

export type BaselineOverlapRepairSkippedReason = "baseline_hard_feasible" | "no_space_overlap_violation" | "no_repairable_space_overlap_group" | "unsupported_overlap_cardinality" | "protected_task_in_overlap" | "locked_task_in_overlap" | "no_repair_window_available" | "unsupported_overlap_roles" | "multiple_repairable_groups_limited_to_first" | "unknown";
export type BaselineRepairLocalBlockingReason = "outside_workday" | "moved_task_done" | "moved_task_in_progress" | "moved_task_locked" | "obvious_resource_overlap" | "obvious_space_overlap" | "duplicate_assignment" | "contestant_overlap" | "itinerant_team_overlap" | "direct_dependency_broken" | "template_dependency_broken" | "availability_violation" | "hard_break_overlap";
export interface BaselineRepairLocalFeasibility { locallyFeasible: boolean; warnings: string[]; blockingReason: BaselineRepairLocalBlockingReason | null; checkedConstraints: string[]; readOnly: true; }
export type BaselineRepairSourceOfTruth = "baseline-hard-feasibility-audit" | "operational-state-embedded-audit" | "validation-recalculation" | "planning-scan";
export interface BaselineRepairableGroupSelection { source: BaselineRepairSourceOfTruth; selectedTaskIds: number[]; selectedSpaceId: number | null; selectedTimeWindow: { start: string; end: string } | null; repairableGroupCount: number; unsupportedGroupCount: number; unsupportedGroupsSample: Record<string, unknown>[]; selectionReason: string; readOnly: true; }
export interface BaselineOverlapRepairSummary { summaryContractVersion?: typeof BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224; executed: boolean; skippedReason: BaselineOverlapRepairSkippedReason | null; generatedCandidateCount: number; candidateIds: string[]; conflictingTaskIds: number[]; movedTaskIds: number[]; assignmentCount: number; discardedByPrefilter: number; prefilterDiscardReasons: Record<string, number>; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number; selectedCandidateId: string | null; selectedAsBest: boolean; selectedAsCommit: boolean; readOnly: true; planningInfluence: "candidate-generation-diagnostics-only"; variantCount: number; variantsGenerated: number; variantsSkipped: number; skippedVariantReasons: Record<string, number>; locallyFeasibleCandidateCount: number; locallyBlockedCandidateCount: number; repairWindowStrategy: "both-tasks-before-after-v1"; repairableGroupSelection: BaselineRepairableGroupSelection | null; unsupportedGroupCount: number; unsupportedGroupsSample: Record<string, unknown>[]; sourceOfTruth: BaselineRepairSourceOfTruth | null; auditSpaceOverlapGroupCount: number; auditRepairableGroupCount: number; auditAvailable: boolean; auditPassedToCandidateBuilder: boolean; auditPassedToRepairBuilder: boolean; fallbackSourceUsed: BaselineRepairSourceOfTruth | null; runtimeWiringWarnings: string[]; runtimeInvariant: BaselineRepairRuntimeInvariantResult | null; lateAuditRepairPass: { executed: boolean; reason: string | null; candidateIds: string[]; generatedCandidateCount: number; candidateStateCount: number; simulatedStateCount: number; validSimulationCount: number; invalidSimulationCount: number; selectedAsCommit: boolean; warnings: string[]; readOnly: true }; baselineOverlapRepairConflictClosure?: BaselineRepairConflictClosureResult["summary"]; generatedSimpleCandidateCount?: number; generatedClosureCandidateCount?: number; simplePreviewAcceptedCount?: number; simplePreviewRejectedCount?: number; simplePreviewRejectedReasonCounts?: Record<string, number>; closurePreviewAcceptedCount?: number; closurePreviewRejectedCount?: number; closurePreviewRejectedReasonCounts?: Record<string, number>; duplicateCandidateCount?: number; deduplicatedCandidateCount?: number; previewCleanCandidateCount?: number; repairCandidateAdmissionSummary?: Record<string, unknown>; }
export interface BaselineOverlapRepairCandidateBuilderResult { candidates: Candidate[]; evidence: Evidence[]; summary: BaselineOverlapRepairSummary; }
export interface BaselineOverlapRepairCandidateBuilderOptions { createdAt?: string | null; maxCandidates?: number | null; deferCandidateLimitUntilAfterHardPrefilter?: boolean; baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit | null; auditPassedToCandidateBuilder?: boolean; closureLimits?: Partial<BaselineRepairConflictClosureLimits>; }

type Entry = OperationalState["planning"][number];
type Planned = Entry & { start: number; end: number; duration: number; task: OperationalState["tasks"][number] | undefined };
const SOURCE = "orc-see";
const toMinutes = (v: unknown): number | null => { if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return null; const [h,m]=v.split(":").map(Number); return Number.isInteger(h)&&Number.isInteger(m)&&h>=0&&h<24&&m>=0&&m<60?h*60+m:null; };
const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const overlaps = (a: Planned, b: Planned) => a.start < b.end && b.start < a.end;
const emptySummary = (executed: boolean, skippedReason: BaselineOverlapRepairSkippedReason | null, extras: Partial<BaselineOverlapRepairSummary> = {}): BaselineOverlapRepairSummary => ({ summaryContractVersion: BASELINE_OVERLAP_REPAIR_SUMMARY_CONTRACT_VERSION_ID224, executed, skippedReason, generatedCandidateCount: 0, candidateIds: [], conflictingTaskIds: [], movedTaskIds: [], assignmentCount: 0, discardedByPrefilter: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", variantCount: 0, variantsGenerated: 0, variantsSkipped: 0, skippedVariantReasons: {}, locallyFeasibleCandidateCount: 0, locallyBlockedCandidateCount: 0, repairWindowStrategy: "both-tasks-before-after-v1", repairableGroupSelection: null, unsupportedGroupCount: 0, unsupportedGroupsSample: [], sourceOfTruth: null, auditSpaceOverlapGroupCount: 0, auditRepairableGroupCount: 0, auditAvailable: false, auditPassedToCandidateBuilder: false, auditPassedToRepairBuilder: false, fallbackSourceUsed: null, runtimeWiringWarnings: [], runtimeInvariant: null, lateAuditRepairPass: { executed: false, reason: null, candidateIds: [], generatedCandidateCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, warnings: [], readOnly: true }, ...extras, prefilterDiscardReasons: extras.prefilterDiscardReasons ?? {} });
const isProtected = (task: OperationalState["tasks"][number] | undefined) => ["done", "in_progress"].includes(String(task?.status ?? ""));
const hasBlockingLock = (state: OperationalState, taskId: number) => (state.locks ?? []).some((l) => l.taskId === taskId && ["full", "time"].includes(String(l.lockType)));
const isMainFlow = (state: OperationalState, e: Entry, task: OperationalState["tasks"][number] | undefined) => { const opt = state.constraints?.optimizer; const raw = opt && typeof opt === "object" ? (opt as Record<string, unknown>).mainZoneId : null; const id = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null; return id != null && ((e.spaceId ?? null) === id || task?.spaceId === id || (task as any)?.zoneId === id); };
const roleOk = (state: OperationalState, p: Planned) => {
  const transportContract = (state.constraints as any)?.transportContract ?? resolveORCTransportContract(state as any);
  const role = resolveORCPlanningEntryOperationalRoleMetadata({ entry: p, task: p.task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null, transportContract });
  const occ = resolveORCSpaceOccupancy({ entry: p, task: p.task, roleMetadata: role, spaceConfig: state.spaces, transportContract });
  return isORCProductiveRole(role) && occ.blocksSpace && occ.spaceOccupancyMode === "exclusive" && !occ.allowsSpaceOverlap;
};

function planned(state: OperationalState): Planned[] { const tasks = new Map((state.tasks ?? []).map((t) => [t.id, t])); return (state.planning ?? []).flatMap((e): Planned[] => { const start=toMinutes(e.startPlanned), end=toMinutes(e.endPlanned); if (start == null || end == null || end <= start) return []; return [{ ...e, assignedResourceIds: [...(e.assignedResourceIds ?? [])], start, end, duration: end-start, task: tasks.get(e.taskId) }]; }); }

type RepairGroup = { taskIds: number[]; spaceId: number | null; timeWindow: { start: string; end: string } | null; source: BaselineRepairSourceOfTruth; raw: Record<string, unknown> };
type PairSelection = { pair: [Planned, Planned] | null; reason: BaselineOverlapRepairSkippedReason | null; selection: BaselineRepairableGroupSelection | null; source: BaselineRepairSourceOfTruth | null; auditSpaceOverlapGroupCount: number; auditRepairableGroupCount: number; unsupportedGroupCount: number; unsupportedGroupsSample: Record<string, unknown>[]; auditAvailable: boolean; auditPassedToRepairBuilder: boolean; fallbackSourceUsed: BaselineRepairSourceOfTruth | null; runtimeWiringWarnings: string[] };
const asRecord = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown): number | null => Number.isFinite(Number(v)) ? Number(v) : null;
const ids = (v: unknown): number[] => Array.isArray(v) ? v.map(num).filter((x): x is number => x != null) : [];
const productiveRoles = (g: Record<string, unknown>) => { const roles = Array.isArray(g.roleLabels) ? g.roleLabels.map(String) : []; return roles.length >= 2 && roles.every((r) => r === "productive_task"); };
const exclusiveModes = (g: Record<string, unknown>) => { const modes = Array.isArray(g.occupancyModes) ? g.occupancyModes : Array.isArray(g.spaceOccupancyModes) ? g.spaceOccupancyModes : []; return modes.length >= 2 && modes.every((m) => String(m) === "exclusive"); };
function groupFromDetail(d: Record<string, unknown>, source: BaselineRepairSourceOfTruth): RepairGroup { return { taskIds: ids(d.taskIds).sort((a,b)=>a-b), spaceId: ids(d.spaceIds)[0] ?? num(d.spaceId), timeWindow: asRecord(d.timeWindow) as any, source, raw: d }; }
function unsupportedReason(g: RepairGroup): BaselineOverlapRepairSkippedReason | null { const r=g.raw; if ((Number(r.taskCount ?? g.taskIds.length)) !== 2 || g.taskIds.length !== 2) return "unsupported_overlap_cardinality"; if (!productiveRoles(r) || !exclusiveModes(r)) return "unsupported_overlap_roles"; if (g.spaceId == null) return "no_repairable_space_overlap_group"; return null; }
function compareGroup(state: OperationalState, a: RepairGroup, b: RepairGroup): number { const as=toMinutes(a.timeWindow?.start) ?? 99999, bs=toMinutes(b.timeWindow?.start) ?? 99999; if (as!==bs) return as-bs; const main=(state.constraints?.optimizer as any)?.mainZoneId; const am=main!=null && String(a.spaceId)===String(main), bm=main!=null && String(b.spaceId)===String(main); if (am!==bm) return am?-1:1; if ((a.spaceId??999999)!==(b.spaceId??999999)) return (a.spaceId??999999)-(b.spaceId??999999); return a.taskIds.join("-").localeCompare(b.taskIds.join("-")); }
function groupsFromValidation(state: OperationalState): RepairGroup[] { const v=validateSimulatedStates([{ id:"baseline-overlap-repair-source", candidateStateId:"baseline", baseStateId:String(state.id ?? "baseline"), operationalStateSnapshot: state, appliedTransformations: [], simulationMode:"READ_ONLY_BASELINE", readOnly:true, createdAt:null }]); return (v.validationResults[0]?.violationDetails ?? []).filter((d)=>d.code==="SPACE_OVERLAP").map((d)=>groupFromDetail(d as any, "validation-recalculation")); }
function groupsFromPlanningScan(state: OperationalState): RepairGroup[] { const entries=planned(state).sort((a,b)=>a.start-b.start||a.end-b.end||a.taskId-b.taskId); const out: RepairGroup[]=[]; for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++){ const a=entries[i], b=entries[j]; if ((a.spaceId??null)==null || a.spaceId!==b.spaceId || !overlaps(a,b)) continue; if (!roleOk(state,a)||!roleOk(state,b)) continue; out.push({ taskIds:[a.taskId,b.taskId].sort((x,y)=>x-y), spaceId:a.spaceId??null, timeWindow:{ start: a.startPlanned, end: a.endPlanned }, source:"planning-scan", raw:{ taskIds:[a.taskId,b.taskId], taskCount:2, spaceId:a.spaceId, timeWindow:{ start:a.startPlanned,end:a.endPlanned }, roleLabels:["productive_task","productive_task"], occupancyModes:["exclusive","exclusive"] }}); } return out; }
function selectPair(state: OperationalState, audit?: ORCBaselineSeedHardFeasibilityAudit | null): PairSelection {
  const embeddedAudit = (state as any)?.baselineSeedHardFeasibility ?? (state as any)?.metadata?.baselineSeedHardFeasibility ?? null;
  const effectiveAudit = audit ?? embeddedAudit ?? null;
  const auditAvailable = effectiveAudit != null;
  const auditPassedToRepairBuilder = audit != null;
  const runtimeWiringWarnings = auditPassedToRepairBuilder ? [] : ["baseline_repair_audit_missing_at_candidate_generation"];
  const common = { auditAvailable, auditPassedToRepairBuilder, runtimeWiringWarnings };
  if (effectiveAudit?.hardFeasible === true) return { pair:null, reason:"baseline_hard_feasible", selection:null, source:null, auditSpaceOverlapGroupCount:0, auditRepairableGroupCount:0, unsupportedGroupCount:0, unsupportedGroupsSample:[], fallbackSourceUsed:null, ...common };
  const auditGroupsRaw = Array.isArray((effectiveAudit as any)?.spaceOverlapGroups) ? (effectiveAudit as any).spaceOverlapGroups.map(asRecord) : [];
  const auditGroups = auditGroupsRaw.map((g: Record<string, unknown>) => ({ taskIds: ids(g.taskIds).sort((a,b)=>a-b), spaceId: num(g.spaceId), timeWindow: asRecord(g.timeWindow) as any, source: "baseline-hard-feasibility-audit" as const, raw: g }));
  let source: BaselineRepairSourceOfTruth = "baseline-hard-feasibility-audit";
  let groups = auditGroups;
  if (groups.length === 0 && Array.isArray((effectiveAudit as any)?.violationDetailsSample)) groups = (effectiveAudit as any).violationDetailsSample.filter((d:any)=>d?.code==="SPACE_OVERLAP").map((d:any)=>groupFromDetail(asRecord(d), "baseline-hard-feasibility-audit"));
  if (groups.length === 0) { groups = groupsFromValidation(state); source = "validation-recalculation"; }
  if (groups.length === 0) { groups = groupsFromPlanningScan(state); source = "planning-scan"; }
  const fallbackSourceUsed = source === "baseline-hard-feasibility-audit" ? null : source;
  if (groups.length === 0) return { pair:null, reason:"no_space_overlap_violation", selection:null, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:0, unsupportedGroupCount:0, unsupportedGroupsSample:[], fallbackSourceUsed, ...common };
  const repairable: RepairGroup[]=[]; const unsupported: Record<string, unknown>[]=[];
  for (const g of groups) { const reason=unsupportedReason(g); if (reason) unsupported.push({ ...g.raw, skippedReason: reason }); else repairable.push(g); }
  repairable.sort((a,b)=>compareGroup(state,a,b));
  const selected=repairable[0];
  const selection: BaselineRepairableGroupSelection | null = selected ? { source, selectedTaskIds:[...selected.taskIds], selectedSpaceId:selected.spaceId, selectedTimeWindow:selected.timeWindow, repairableGroupCount:repairable.length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), selectionReason: repairable.length>1 ? "multiple_repairable_groups_limited_to_first" : "first_repairable_group", readOnly:true } : null;
  const entriesByTask = new Map(planned(state).map((e)=>[e.taskId,e]));
  if (!selected) return { pair:null, reason:"no_repairable_space_overlap_group", selection, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:auditGroups.filter((g: RepairGroup)=>!unsupportedReason(g)).length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), fallbackSourceUsed, ...common };
  const a=entriesByTask.get(selected.taskIds[0]), b=entriesByTask.get(selected.taskIds[1]);
  if (!a || !b) return { pair:null, reason:"no_repairable_space_overlap_group", selection, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:auditGroups.filter((g: RepairGroup)=>!unsupportedReason(g)).length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), fallbackSourceUsed, ...common };
  if (isProtected(a.task) && isProtected(b.task)) return { pair:null, reason:"protected_task_in_overlap", selection, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:auditGroups.filter((g: RepairGroup)=>!unsupportedReason(g)).length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), fallbackSourceUsed, ...common };
  if (hasBlockingLock(state, a.taskId) && hasBlockingLock(state, b.taskId)) return { pair:null, reason:"locked_task_in_overlap", selection, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:auditGroups.filter((g: RepairGroup)=>!unsupportedReason(g)).length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), fallbackSourceUsed, ...common };
  return { pair:[a,b], reason:null, selection, source, auditSpaceOverlapGroupCount:auditGroups.length, auditRepairableGroupCount:auditGroups.filter((g: RepairGroup)=>!unsupportedReason(g)).length, unsupportedGroupCount:unsupported.length, unsupportedGroupsSample:unsupported.slice(0,5), fallbackSourceUsed, ...common };
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
    if (moved.task?.contestantId != null && moved.task.contestantId === other.task?.contestantId) return localBlock("contestant_overlap");
    if (moved.task?.itinerantTeamId != null && moved.task.itinerantTeamId === other.task?.itinerantTeamId) return localBlock("itinerant_team_overlap");
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
  const createdAt = options.createdAt ?? null; const max = options.deferCandidateLimitUntilAfterHardPrefilter ? Number.POSITIVE_INFINITY : Math.max(0, options.maxCandidates ?? 4); const found = selectPair(operationalState, options.baselineSeedHardFeasibility);
  const summaryContract = { repairableGroupSelection: found.selection, sourceOfTruth: found.source, auditSpaceOverlapGroupCount: found.auditSpaceOverlapGroupCount, auditRepairableGroupCount: found.auditRepairableGroupCount, unsupportedGroupCount: found.unsupportedGroupCount, unsupportedGroupsSample: found.unsupportedGroupsSample, auditAvailable: found.auditAvailable, auditPassedToCandidateBuilder: options.auditPassedToCandidateBuilder === true, auditPassedToRepairBuilder: found.auditPassedToRepairBuilder, fallbackSourceUsed: found.fallbackSourceUsed, runtimeWiringWarnings: found.runtimeWiringWarnings };
  if (!found.pair || max === 0) return { candidates: [], evidence: [], summary: emptySummary(true, found.reason ?? "unknown", summaryContract) };
  const [a,b] = found.pair;
  const specs = [
    { variant: "move-a-before-b", moved: a, fixed: b, start: b.start - a.duration },
    { variant: "move-a-after-b", moved: a, fixed: b, start: b.end },
    { variant: "move-b-before-a", moved: b, fixed: a, start: a.start - b.duration },
    { variant: "move-b-after-a", moved: b, fixed: a, start: a.end },
  ];
  const skipped: Record<string, number> = {}; const variants = specs.map((v) => ({ ...v, localFeasibility: estimateBaselineRepairLocalFeasibility(operationalState, v.moved, v.fixed, v.start) }));
  const buildable = variants.filter((v) => { if (!v.localFeasibility.locallyFeasible || v.localFeasibility.blockingReason) { const r=String(v.localFeasibility.blockingReason ?? "locally_infeasible"); skipped[r]=(skipped[r]??0)+1; return false; } return true; });
  buildable.sort((x,y)=>{ const sx=variantRank(operationalState,x), sy=variantRank(operationalState,y); for(let i=0;i<sx.length;i++) if(sx[i]!==sy[i]) return sx[i]<sy[i]?-1:1; return 0; });
  const conflictingTaskIds = [a.taskId,b.taskId].sort((x,y)=>x-y);
  const simpleGenerated = buildable.map((v)=>makeCandidate(operationalState, v.variant, v.moved, v.fixed, v.start, createdAt, v.localFeasibility));
  const simpleRejected: Record<string, number> = {};
  const simpleKept = simpleGenerated.filter((x) => {
    const admission = admitBaselineRepairCandidate({ operationalState, candidate: x.candidate, candidateSource: "simple_variant", originalConflictTaskIds: conflictingTaskIds });
    (x.candidate.metadata as any).repairAdmission = admission;
    if (admission.previewClean && admission.residualConflictCount === 0 && admission.rejectedReason == null) return true;
    incrementReasonCount(simpleRejected, admission.rejectedReason ?? "residual_conflicts");
    return false;
  });
  const closureRuns = [a, b].flatMap((root) => (["forward", "backward"] as const).map((direction) => buildBaselineRepairConflictClosure({ operationalState, originalConflictTaskIds: conflictingTaskIds, originalViolationCodes: ["SPACE_OVERLAP"], rootTaskId: root.taskId, direction, limits: options.closureLimits, createdAt })));
  const closureRejected: Record<string, number> = {};
  const closureConverted = closureRuns.flatMap((r) => r.candidates.filter((c) => c.residualConflictCount === 0 && c.blockingReason == null).map((c) => closureCandidateToORCCandidate(c, conflictingTaskIds, createdAt))).filter((x) => {
    const admission = admitBaselineRepairCandidate({ operationalState, candidate: x.candidate, candidateSource: "conflict_closure", originalConflictTaskIds: conflictingTaskIds, displacedTaskIds: (x.candidate.metadata as any)?.movedTaskIds ?? [] });
    (x.candidate.metadata as any).repairAdmission = admission;
    if (admission.previewClean && admission.residualConflictCount === 0 && admission.rejectedReason == null) return true;
    incrementReasonCount(closureRejected, admission.rejectedReason ?? "residual_conflicts");
    return false;
  });
  for (const r of closureRuns) for (const [reason,count] of Object.entries(r.summary.rejectedReasonCounts)) skipped[reason]=(skipped[reason]??0)+count;
  const duplicateCandidateCount = simpleKept.length + closureConverted.length;
  const byFingerprint = new Map<string, { candidate: Candidate; evidence: Evidence; source: BaselineRepairCandidateSource }>();
  for (const x of [...simpleKept.map((y)=>({ ...y, source: "simple_variant" as const })), ...closureConverted.map((y)=>({ ...y, source: "conflict_closure" as const }))]) {
    const fp = fingerprintBaselineRepairAssignments(x.candidate);
    const prev = byFingerprint.get(fp);
    if (!prev) byFingerprint.set(fp, x);
  }
  const admitted = [...byFingerprint.values()];
  const metric = (c: Candidate, kind: "total"|"max"|"depth") => {
    const cc:any = (c.metadata as any).conflictClosure;
    if (kind === "depth") return Number(cc?.depthUsed ?? 0);
    const closureValue = kind === "total" ? cc?.totalDisplacementMinutes : cc?.maximumDisplacementMinutes;
    if (closureValue != null) return Number(closureValue);
    const originals = new Map((((c.metadata as any).originalWindows ?? []) as any[]).map((w:any)=>[Number(w.taskId), toMinutes(w.startPlanned) ?? 0]));
    const disps = (((c.metadata as any).proposedWindows ?? []) as any[]).map((w:any)=>Math.abs((toMinutes(w.startPlanned) ?? 0) - (originals.get(Number(w.taskId)) ?? 0)));
    return kind === "max" ? Math.max(0, ...disps) : disps.reduce((s:number,n:number)=>s+n,0);
  };
  const kept = admitted.sort((x,y)=>{
    const ax=x.candidate.assignments.length, ay=y.candidate.assignments.length; if(ax!==ay) return ax-ay;
    const ad=metric(x.candidate,"total"), bd=metric(y.candidate,"total"); if(ad!==bd) return ad-bd;
    const am=metric(x.candidate,"max"), bm=metric(y.candidate,"max"); if(am!==bm) return am-bm;
    const ap=metric(x.candidate,"depth"), bp=metric(y.candidate,"depth"); if(ap!==bp) return ap-bp;
    const ai=(((x.candidate.metadata as any).movedTaskIds as number[] | undefined)?.length ?? ax) - ax, bi=(((y.candidate.metadata as any).movedTaskIds as number[] | undefined)?.length ?? ay) - ay; if(ai!==bi) return ai-bi;
    return x.candidate.id.localeCompare(y.candidate.id);
  }).slice(0,max);
  const closureSummaryBase = closureRuns[0]?.summary ?? buildBaselineRepairConflictClosure({ operationalState, originalConflictTaskIds: conflictingTaskIds, rootTaskId: a.taskId, direction: "forward", limits: { maxBoundaryCandidatesPerRoot: 0, maxGeneratedClosureCandidates: 0 }, createdAt }).summary;
  const closureSummary = closureRuns.reduce((acc, r) => ({ ...acc, rootVariantsEvaluated: acc.rootVariantsEvaluated + r.summary.rootVariantsEvaluated, boundaryCandidatesEvaluated: acc.boundaryCandidatesEvaluated + r.summary.boundaryCandidatesEvaluated, generatedCandidateCount: acc.generatedCandidateCount + r.summary.generatedCandidateCount, locallyRejectedCandidateCount: acc.locallyRejectedCandidateCount + r.summary.locallyRejectedCandidateCount, rejectedReasonCounts: { ...acc.rejectedReasonCounts, ...Object.fromEntries(Object.entries(r.summary.rejectedReasonCounts).map(([k,v])=>[k,(acc.rejectedReasonCounts[k]??0)+v])) }, searchLimitReached: acc.searchLimitReached || r.summary.searchLimitReached }), { ...closureSummaryBase, rootVariantsEvaluated:0, boundaryCandidatesEvaluated:0, generatedCandidateCount:0, locallyRejectedCandidateCount:0, rejectedReasonCounts:{} as Record<string,number>, searchLimitReached:false });
  const admissionSummary = { generatedSimpleCandidateCount: simpleGenerated.length, generatedClosureCandidateCount: closureConverted.length + Object.values(closureRejected).reduce((s,n)=>s+n,0), simplePreviewAcceptedCount: simpleKept.length, simplePreviewRejectedCount: simpleGenerated.length - simpleKept.length, simplePreviewRejectedReasonCounts: simpleRejected, closurePreviewAcceptedCount: closureConverted.length, closurePreviewRejectedCount: Object.values(closureRejected).reduce((s,n)=>s+n,0), closurePreviewRejectedReasonCounts: closureRejected, duplicateCandidateCount: duplicateCandidateCount - admitted.length, deduplicatedCandidateCount: admitted.length, previewCleanCandidateCount: admitted.length, readOnly: true as const };
  if (kept.length === 0) return { candidates: [], evidence: [], summary: { ...emptySummary(true, Object.keys(skipped).some((r)=>r.startsWith("moved_task") || r === "protected_task") ? "protected_task_in_overlap" : "no_repair_window_available", summaryContract), ...admissionSummary, repairCandidateAdmissionSummary: admissionSummary, conflictingTaskIds, variantCount: specs.length + closureSummary.boundaryCandidatesEvaluated, variantsSkipped: specs.length + closureSummary.locallyRejectedCandidateCount, skippedVariantReasons: { ...skipped, ...simpleRejected, ...closureRejected }, baselineOverlapRepairConflictClosure: { ...closureSummary, selectedCandidateId: null } } };
  const movedTaskIds = [...new Set(kept.flatMap((x)=>((x.candidate.metadata.movedTaskIds as number[] | undefined) ?? [Number(x.candidate.metadata.movedTaskId)])))].filter(Number.isFinite).sort((x,y)=>x-y);
  return deepFreeze({ candidates: kept.map((x)=>x.candidate), evidence: kept.map((x)=>x.evidence), summary: { ...emptySummary(true, null, summaryContract), ...admissionSummary, repairCandidateAdmissionSummary: admissionSummary, generatedCandidateCount: kept.length, candidateIds: kept.map((x)=>x.candidate.id), conflictingTaskIds, movedTaskIds, assignmentCount: kept.reduce((s,x)=>s+x.candidate.assignments.length,0), variantCount: specs.length + closureSummary.boundaryCandidatesEvaluated, variantsGenerated: kept.length, variantsSkipped: specs.length + closureSummary.locallyRejectedCandidateCount, skippedVariantReasons: { ...skipped, ...simpleRejected, ...closureRejected }, locallyFeasibleCandidateCount: kept.length, locallyBlockedCandidateCount: 0, baselineOverlapRepairConflictClosure: { ...closureSummary, selectedCandidateId: null, executableCandidateCount: admitted.length } } }) as BaselineOverlapRepairCandidateBuilderResult;
}
