import type { Candidate, Evidence, OperationalState, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import { configuredHardBreaks, hardBreakAppliesToPlanningEntry } from "../validation/protectedBreakScope";
import { resolveORCPlanningEntryOperationalRoleMetadata, isORCProductiveRole } from "../state/nonWorkTaskClassifier";
import { resolveORCMealSemantics, hardMealWindowsFromSemantics } from "../state/mealSemanticsResolver";
import { resolveORCSpaceOccupancy } from "../state/spaceOccupancyResolver";
import { resolveORCTransportContract } from "../state/transportContractResolver";

const SOURCE = "orc-see";
const DEFAULT_MAX_DETAILED = 50;
const PROTECTED_STATUSES = new Set(["done", "in_progress"]);
const FILTERING_ONLY = "candidate-filtering-only";

type PlanningEntry = OperationalState["planning"][number];
type Reason =
  | "task-not-found" | "invalid-task-id" | "invalid-time-format" | "invalid-time-range" | "protected-task-status"
  | "lock-full" | "lock-time" | "lock-space" | "lock-resource" | "outside-work-day" | "hard-break-overlap"
  | "contestant-overlap" | "itinerant-team-overlap" | "resource-overlap" | "space-overlap" | "preexisting-baseline-overlap" | "candidate-introduced-space-overlap" | "candidate-worsened-space-overlap" | "transport-capacity-exceeded" | "direct-dependency-broken";

export interface CandidateHardPrefilterDiscard {
  readonly candidateId: string;
  readonly reason: string;
  readonly violatedConstraint: string;
  readonly affectedTaskIds: ReadonlyArray<number>;
  readonly conflictingTaskIds?: ReadonlyArray<number>; readonly spaceIds?: ReadonlyArray<number>; readonly timeWindow?: { start: string; end: string } | null; readonly relatedTimeWindow?: { start: string; end: string } | null; readonly roleLabels?: ReadonlyArray<string>; readonly spaceOccupancyModes?: ReadonlyArray<string>; readonly diagnosticHint?: string;
}

export interface CandidateHardPrefilterSummary {
  readonly receivedCandidateCount: number;
  readonly acceptedCandidateCount: number;
  readonly discardedCandidateCount: number;
  readonly discardedByReason: Record<string, number>;
  readonly detailedDiscardEvidenceCount: number;
  readonly overflowDiscardCount: number;
  readonly readOnly: true;
  readonly planningInfluence: "candidate-filtering-only";
}

export interface CandidateHardPrefilterResult {
  readonly candidates: Candidate[];
  readonly discardedCandidates: CandidateHardPrefilterDiscard[];
  readonly evidence: Evidence[];
  readonly summary: CandidateHardPrefilterSummary;
}

export interface CandidateHardPrefilterOptions {
  readonly createdAt?: string | null;
  readonly maxDetailedDiscardEvidence?: number;
}

const timeToMinutes = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};
const overlaps = (as: number, ae: number, bs: number, be: number) => as < be && bs < ae;
const sameNumbers = (a: readonly number[] = [], b: readonly number[] = []) => {
  const aa = [...a].sort((x, y) => x - y), bb = [...b].sort((x, y) => x - y);
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
};
const cloneCandidate = (candidate: Candidate): Candidate => ({ ...candidate, state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds], metadata: { ...candidate.state.metadata } }, assignments: candidate.assignments.map((a) => ({ ...a, resourceIds: [...a.resourceIds] })), evidenceIds: [...candidate.evidenceIds], operationalValues: [...candidate.operationalValues], metadata: { ...candidate.metadata } });
const isSafeNoop = (candidate: Candidate) => candidate.id === "PRESERVE_BASELINE" || candidate.metadata?.baselinePreservation === true || ((candidate.assignments ?? []).length === 0 && (candidate.metadata?.readOnly === true || candidate.metadata?.executesTransformations === false || candidate.state?.metadata?.readOnly === true));

function baselineEntry(state: OperationalState, taskId: number): PlanningEntry | undefined {
  const planned = state.planning.find((entry) => entry.taskId === taskId);
  if (planned) return planned;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return undefined;
  const startPlanned = typeof task.startPlanned === "string" ? task.startPlanned : "";
  const endPlanned = typeof task.endPlanned === "string" ? task.endPlanned : "";
  return { taskId, startPlanned, endPlanned, assignedResourceIds: [...(task.assignedResourceIds ?? [])], spaceId: task.spaceId ?? null };
}

function changedFields(current: PlanningEntry | undefined, assignment: Candidate["assignments"][number]) {
  return {
    time: (assignment.startPlanned != null && assignment.startPlanned !== current?.startPlanned) || (assignment.endPlanned != null && assignment.endPlanned !== current?.endPlanned),
    space: assignment.spaceId !== undefined && assignment.spaceId !== (current?.spaceId ?? null),
    resource: assignment.resourceIds !== undefined && !sameNumbers(assignment.resourceIds, current?.assignedResourceIds ?? []),
  };
}

function preview(state: OperationalState, candidate: Candidate): PlanningEntry[] {
  const byTask = new Map<number, PlanningEntry>((state.planning ?? []).map((entry) => [entry.taskId, { ...entry, assignedResourceIds: [...(entry.assignedResourceIds ?? [])] }]));
  for (const assignment of candidate.assignments ?? []) {
    const current = byTask.get(assignment.taskId) ?? baselineEntry(state, assignment.taskId);
    if (!current) continue;
    byTask.set(assignment.taskId, { taskId: assignment.taskId, startPlanned: assignment.startPlanned ?? current.startPlanned, endPlanned: assignment.endPlanned ?? current.endPlanned, assignedResourceIds: [...(assignment.resourceIds ?? current.assignedResourceIds ?? [])], spaceId: assignment.spaceId !== undefined ? assignment.spaceId : current.spaceId ?? null });
  }
  return [...byTask.values()].sort((a, b) => a.taskId - b.taskId);
}

function spaceViolationKey(ids: number[], spaceId: number, start: string, end: string): string { return `${spaceId}|${start}|${end}|${[...ids].sort((a,b)=>a-b).join(",")}`; }
function collectSpaceViolationKeys(plan: readonly PlanningEntry[], state: OperationalState, transportContract: any): Array<{key:string; taskIds:number[]}> {
  const tasks = new Map((state.tasks ?? []).map((task) => [task.id, task]));
  const windows = plan.map((entry) => { const task = tasks.get(entry.taskId); return { entry, start: timeToMinutes(entry.startPlanned), end: timeToMinutes(entry.endPlanned), task, role: resolveORCPlanningEntryOperationalRoleMetadata({ entry, task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null, transportContract }) }; }).filter((x): x is typeof x & { start: number; end: number } => x.start != null && x.end != null);
  const out: Array<{key:string; taskIds:number[]}> = [];
  for (let i=0;i<windows.length;i++) for (let j=i+1;j<windows.length;j++){ const a=windows[i], b=windows[j]; if(!overlaps(a.start,a.end,b.start,b.end)) continue; const spaceId=a.entry.spaceId ?? null; if(spaceId==null || spaceId !== (b.entry.spaceId ?? null)) continue; const occA=resolveORCSpaceOccupancy({entry:a.entry, task:a.task, roleMetadata:a.role, spaceConfig:state.spaces, transportContract}); const occB=resolveORCSpaceOccupancy({entry:b.entry, task:b.task, roleMetadata:b.role, spaceConfig:state.spaces, transportContract}); if(occA.blocksSpace && occB.blocksSpace && !occA.allowsSpaceOverlap && !occB.allowsSpaceOverlap){ const capacity=state.spaces?.exclusiveById?.[spaceId]===true?1:Math.max(1,state.spaces?.concurrencyById?.[spaceId]??state.spaces?.capacityById?.[spaceId]??1); if(capacity<2){ const ids=[a.entry.taskId,b.entry.taskId]; out.push({key:spaceViolationKey(ids,spaceId,a.entry.startPlanned,a.entry.endPlanned),taskIds:ids}); } } }
  return out;
}

function findViolation(candidate: Candidate, state: OperationalState): CandidateHardPrefilterDiscard | null {
  const tasks = new Map((state.tasks ?? []).map((task) => [task.id, task]));
  const locks = state.locks ?? [];
  for (const assignment of candidate.assignments ?? []) {
    if (!Number.isFinite(assignment.taskId)) return discard(candidate, "invalid-task-id", "INVALID_ASSIGNMENT_TASK_ID", []);
    const task = tasks.get(assignment.taskId);
    if (!task) return discard(candidate, "task-not-found", "ASSIGNMENT_REFERENCES_UNKNOWN_TASK", [assignment.taskId]);
    const current = baselineEntry(state, assignment.taskId);
    const start = assignment.startPlanned ?? current?.startPlanned;
    const end = assignment.endPlanned ?? current?.endPlanned;
    const startMin = timeToMinutes(start), endMin = timeToMinutes(end);
    if ((assignment.startPlanned != null && startMin == null) || (assignment.endPlanned != null && endMin == null)) return discard(candidate, "invalid-time-format", "INVALID_ASSIGNMENT_TIME_FORMAT", [assignment.taskId]);
    if (startMin != null && endMin != null && startMin >= endMin) return discard(candidate, "invalid-time-range", "INVALID_ASSIGNMENT_TIME_RANGE", [assignment.taskId]);
    const changed = changedFields(current, assignment);
    if (PROTECTED_STATUSES.has(String(task.status)) && (changed.time || changed.space || changed.resource)) return discard(candidate, "protected-task-status", `PROTECTED_TASK_MODIFIED:${task.status}`, [assignment.taskId]);
    if (locks.some((l) => l.taskId === assignment.taskId && l.lockType === "full")) return discard(candidate, "lock-full", "FULL_LOCK_BROKEN", [assignment.taskId]);
    if (changed.time && locks.some((l) => l.taskId === assignment.taskId && l.lockType === "time")) return discard(candidate, "lock-time", "TIME_LOCK_BROKEN", [assignment.taskId]);
    if (changed.space && locks.some((l) => l.taskId === assignment.taskId && l.lockType === "space")) return discard(candidate, "lock-space", "SPACE_LOCK_BROKEN", [assignment.taskId]);
    if (changed.resource && locks.some((l) => l.taskId === assignment.taskId && l.lockType === "resource")) return discard(candidate, "lock-resource", "RESOURCE_LOCK_BROKEN", [assignment.taskId]);
    const wd = state.workDay ?? state.availability?.workDay;
    const dayStart = timeToMinutes(wd?.start), dayEnd = timeToMinutes(wd?.end);
    if (startMin != null && endMin != null && dayStart != null && dayEnd != null && (startMin < dayStart || endMin > dayEnd)) return discard(candidate, "outside-work-day", "PLANNING_OUTSIDE_WORK_DAY", [assignment.taskId]);
    const hardMealKeys = new Set(hardMealWindowsFromSemantics(resolveORCMealSemantics(state)).map((w) => `${w.start}|${w.end}`));
    for (const br of configuredHardBreaks(state).filter((b) => b.kind !== "meal" || hardMealKeys.has(`${b.start}|${b.end}`))) {
      const bs = timeToMinutes(br.start), be = timeToMinutes(br.end);
      const previewEntry = { taskId: assignment.taskId, startPlanned: start ?? "", endPlanned: end ?? "", assignedResourceIds: [...(assignment.resourceIds ?? current?.assignedResourceIds ?? [])], spaceId: assignment.spaceId !== undefined ? assignment.spaceId : current?.spaceId ?? null };
      if (startMin != null && endMin != null && bs != null && be != null && overlaps(startMin, endMin, bs, be) && isORCProductiveRole(resolveORCPlanningEntryOperationalRoleMetadata({ entry: previewEntry, task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null })) && hardBreakAppliesToPlanningEntry(br, previewEntry, task)) return discard(candidate, "hard-break-overlap", br.code, [assignment.taskId]);
    }
  }

  const transportContract = (state.constraints as any)?.transportContract ?? resolveORCTransportContract(state as any);
  const moved = new Set((candidate.assignments ?? []).map((a) => a.taskId));
  const baselineSpaceKeys = new Set(collectSpaceViolationKeys(state.planning as any, state, transportContract).map((v) => v.key));
  const plan = preview(state, candidate);
  const windows = plan.map((entry) => { const task = tasks.get(entry.taskId); return { entry, start: timeToMinutes(entry.startPlanned), end: timeToMinutes(entry.endPlanned), task, role: resolveORCPlanningEntryOperationalRoleMetadata({ entry, task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null, transportContract }) }; }).filter((x): x is typeof x & { start: number; end: number } => x.start != null && x.end != null);
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i], b = windows[j];
    if (!overlaps(a.start, a.end, b.start, b.end)) continue;
    const ids = [a.entry.taskId, b.entry.taskId];
    const productivePair = isORCProductiveRole(a.role) && isORCProductiveRole(b.role);
    if (productivePair && a.task?.contestantId != null && a.task.contestantId === b.task?.contestantId) return discard(candidate, "contestant-overlap", "CONTESTANT_OVERLAP", ids);
    if (productivePair && a.task?.itinerantTeamId != null && a.task.itinerantTeamId === b.task?.itinerantTeamId) return discard(candidate, "itinerant-team-overlap", "ITINERANT_TEAM_OVERLAP", ids);
    if (productivePair && (a.entry.assignedResourceIds ?? []).some((id) => (b.entry.assignedResourceIds ?? []).includes(id))) return discard(candidate, "resource-overlap", "RESOURCE_OVERLAP", ids);
    const spaceId = a.entry.spaceId ?? null;
    if (spaceId != null && spaceId === (b.entry.spaceId ?? null)) {
      const occA = resolveORCSpaceOccupancy({ entry: a.entry, task: a.task, roleMetadata: a.role, spaceConfig: state.spaces, transportContract });
      const occB = resolveORCSpaceOccupancy({ entry: b.entry, task: b.task, roleMetadata: b.role, spaceConfig: state.spaces, transportContract });
      if (occA.blocksSpace && occB.blocksSpace && !occA.allowsSpaceOverlap && !occB.allowsSpaceOverlap) {
        const capacity = state.spaces?.exclusiveById?.[spaceId] === true ? 1 : Math.max(1, state.spaces?.concurrencyById?.[spaceId] ?? state.spaces?.capacityById?.[spaceId] ?? 1);
        if (capacity < 2) { const key = spaceViolationKey(ids, spaceId, a.entry.startPlanned, a.entry.endPlanned); if (baselineSpaceKeys.has(key) && !ids.some((id) => moved.has(id))) continue; return discard(candidate, baselineSpaceKeys.has(key) ? "candidate-worsened-space-overlap" : "candidate-introduced-space-overlap", "SPACE_OVERLAP", ids, { conflictingTaskIds: ids, spaceIds: [spaceId], timeWindow: { start: a.entry.startPlanned, end: a.entry.endPlanned }, relatedTimeWindow: { start: b.entry.startPlanned, end: b.entry.endPlanned }, roleLabels: [a.role.role, b.role.role], spaceOccupancyModes: [occA.spaceOccupancyMode, occB.spaceOccupancyMode], diagnosticHint: `Exclusive space overlap between roles ${a.role.role} and ${b.role.role}.` }); }
      }
    }
  }
  const byTask = new Map(windows.map((item) => [item.entry.taskId, item]));
  for (const item of windows) {
    const direct = [...(item.task?.dependsOnTaskIds ?? []), ...(item.task?.dependsOnTaskId != null ? [item.task.dependsOnTaskId] : [])];
    for (const predecessorId of direct) { const pred = byTask.get(predecessorId); if (pred && item.start < pred.end) return discard(candidate, "direct-dependency-broken", "DIRECT_DEPENDENCY_BROKEN", [predecessorId, item.entry.taskId]); }
  }
  return null;
}

function discard(candidate: Candidate, reason: Reason, violatedConstraint: string, affectedTaskIds: number[], extra: Partial<CandidateHardPrefilterDiscard> = {}): CandidateHardPrefilterDiscard {
  return { candidateId: candidate.id, reason, violatedConstraint, affectedTaskIds, ...extra };
}

function evidenceForDiscard(discarded: CandidateHardPrefilterDiscard, createdAt: string | null): Evidence {
  return deepFreeze({ id: `evidence:${SOURCE}:candidate-hard-prefilter:discarded:${discarded.candidateId}`, source: SOURCE, kind: "candidate-hard-prefilter-discarded", subjectId: discarded.candidateId, createdAt, data: { ...discarded, readOnly: true, mutatesOperationalState: false, commitsPlanning: false, planningInfluence: FILTERING_ONLY } satisfies ORCRecord }) as Evidence;
}

export function prefilterCandidatesByHardConstraints(candidates: readonly Candidate[], operationalState: OperationalState | null, options: CandidateHardPrefilterOptions = {}): CandidateHardPrefilterResult {
  const createdAt = options.createdAt ?? null;
  const maxDetailed = Math.max(0, Math.floor(options.maxDetailedDiscardEvidence ?? DEFAULT_MAX_DETAILED));
  const accepted: Candidate[] = [];
  const discarded: CandidateHardPrefilterDiscard[] = [];
  const evidence: Evidence[] = [];
  if (operationalState == null) {
    const summary = buildSummary(candidates.length, candidates.length, {}, 0, 0);
    evidence.push(deepFreeze({ id: `evidence:${SOURCE}:candidate-hard-prefilter:skipped`, source: SOURCE, kind: "candidate-hard-prefilter-skipped", subjectId: "candidate-hard-prefilter", createdAt, data: { reason: "operational-state-unavailable", readOnly: true, planningInfluence: FILTERING_ONLY } }) as Evidence);
    evidence.push(summaryEvidence(summary, createdAt));
    return deepFreeze({ candidates: candidates.map(cloneCandidate), discardedCandidates: [], evidence, summary }) as CandidateHardPrefilterResult;
  }
  for (const candidate of candidates ?? []) {
    if (isSafeNoop(candidate)) { accepted.push(cloneCandidate(candidate)); continue; }
    const violation = findViolation(candidate, operationalState);
    if (!violation) accepted.push(cloneCandidate(candidate));
    else discarded.push(violation);
  }
  const byReason = discarded.reduce<Record<string, number>>((acc, item) => { acc[item.reason] = (acc[item.reason] ?? 0) + 1; return acc; }, {});
  for (const item of discarded.slice(0, maxDetailed)) evidence.push(evidenceForDiscard(item, createdAt));
  const summary = buildSummary(candidates.length, accepted.length, byReason, Math.min(discarded.length, maxDetailed), Math.max(0, discarded.length - maxDetailed));
  evidence.push(summaryEvidence(summary, createdAt));
  return deepFreeze({ candidates: accepted, discardedCandidates: discarded, evidence, summary }) as CandidateHardPrefilterResult;
}

function buildSummary(received: number, accepted: number, discardedByReason: Record<string, number>, detailed: number, overflow: number): CandidateHardPrefilterSummary {
  return deepFreeze({ receivedCandidateCount: received, acceptedCandidateCount: accepted, discardedCandidateCount: received - accepted, discardedByReason: { ...discardedByReason }, detailedDiscardEvidenceCount: detailed, overflowDiscardCount: overflow, readOnly: true, planningInfluence: FILTERING_ONLY }) as CandidateHardPrefilterSummary;
}
function summaryEvidence(summary: CandidateHardPrefilterSummary, createdAt: string | null): Evidence {
  return deepFreeze({ id: `evidence:${SOURCE}:candidate-hard-prefilter:summary`, source: SOURCE, kind: "candidate-hard-prefilter-summary", subjectId: "candidate-hard-prefilter", createdAt, data: { ...summary, deterministic: true } satisfies ORCRecord }) as Evidence;
}
