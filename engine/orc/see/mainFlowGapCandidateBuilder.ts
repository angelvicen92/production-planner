import type { Candidate, Evidence, OperationalState, SearchSpace } from "../contracts";

export interface MainFlowGapCandidateBuilderOptions {
  readonly minMainFlowGapMinutes?: number;
  readonly maxMovedTasksPerCandidate?: number;
  readonly maxCandidates?: number;
  readonly internalBlockGapToleranceMinutes?: number;
}

export interface MainFlowGapClosureSummary {
  readonly generated: number;
  readonly acceptedBeforePrefilter: number;
  readonly discardedByPrefilter: number;
  readonly candidateIds: string[];
  readonly movedTaskIds: number[];
  readonly gapBeforeMinutes: number | null;
  readonly expectedGapAfterMinutes: number | null;
  readonly readOnly: true;
  readonly planningInfluence: "candidate-generation-only";
}

export interface MainFlowGapCandidateBuilderResult {
  readonly candidates: Candidate[];
  readonly evidence: Evidence[];
  readonly summary: MainFlowGapClosureSummary;
}

type Planned = OperationalState["planning"][number] & { start: number; end: number; task: OperationalState["tasks"][number] | undefined };

const DEFAULTS = { minMainFlowGapMinutes: 30, maxMovedTasksPerCandidate: 6, maxCandidates: 3, internalBlockGapToleranceMinutes: 5 };
const toMinutes = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
};
const toTime = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const cloneAssignment = (assignment: Candidate["assignments"][number]) => ({ ...assignment, resourceIds: [...assignment.resourceIds] });
const emptySummary = (): MainFlowGapClosureSummary => ({ generated: 0, acceptedBeforePrefilter: 0, discardedByPrefilter: 0, candidateIds: [], movedTaskIds: [], gapBeforeMinutes: null, expectedGapAfterMinutes: null, readOnly: true, planningInfluence: "candidate-generation-only" });
const hasBlockingLock = (state: OperationalState, taskId: number): boolean => (state.locks ?? []).some((lock) => lock.taskId === taskId && ["full", "time", "space", "resource"].includes(String(lock.lockType)));
const isProtected = (task: OperationalState["tasks"][number] | undefined): boolean => ["done", "in_progress"].includes(String(task?.status ?? ""));

function configuredMainFlowId(state: OperationalState): number | null {
  const optimizer = state.constraints?.optimizer;
  if (optimizer && typeof optimizer === "object") {
    const raw = (optimizer as Record<string, unknown>).mainZoneId;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  }
  return null;
}

function mainFlowPlanning(state: OperationalState): { mainFlowId: number | null; entries: Planned[] } {
  const mainFlowId = configuredMainFlowId(state);
  const tasks = new Map((state.tasks ?? []).map((task) => [task.id, task]));
  const mainNameIds = new Set<number>();
  if (mainFlowId == null) {
    for (const [id, name] of Object.entries(state.spaces?.nameById ?? {})) if (/main|principal|plat[oó]|stage|set/i.test(String(name))) mainNameIds.add(Number(id));
  }
  const entries = (state.planning ?? []).flatMap((entry): Planned[] => {
    const task = tasks.get(entry.taskId);
    const start = toMinutes(entry.startPlanned);
    const end = toMinutes(entry.endPlanned);
    if (start == null || end == null || end <= start) return [];
    const planningSpace = entry.spaceId ?? null;
    const taskSpace = typeof task?.spaceId === "number" ? task.spaceId : null;
    const taskRecord = task as unknown as Record<string, unknown> | undefined;
    const taskZone = typeof taskRecord?.zoneId === "number" ? taskRecord.zoneId as number : null;
    const configured = mainFlowId != null && (planningSpace === mainFlowId || taskSpace === mainFlowId || taskZone === mainFlowId);
    const fallback = mainFlowId == null && ((planningSpace != null && mainNameIds.has(planningSpace)) || (taskSpace != null && mainNameIds.has(taskSpace)) || mainNameIds.size === 0);
    return configured || fallback ? [{ ...entry, assignedResourceIds: [...(entry.assignedResourceIds ?? [])], start, end, task }] : [];
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
  return { mainFlowId, entries };
}

const firstBlock = (entries: Planned[], tolerance: number): Planned[] => {
  if (entries.length === 0) return [];
  const block = [entries[0]];
  for (const entry of entries.slice(1)) {
    if (entry.start - block[block.length - 1].end > tolerance) break;
    block.push(entry);
  }
  return block;
};

export function buildMainFlowGapClosureCandidates(operationalState: OperationalState | null | undefined, searchSpaces: readonly SearchSpace[] = [], createdAt: string | null = null, options: MainFlowGapCandidateBuilderOptions = {}): MainFlowGapCandidateBuilderResult {
  const opts = { ...DEFAULTS, ...options };
  if (operationalState == null || opts.maxCandidates <= 0 || opts.maxMovedTasksPerCandidate <= 0) return { candidates: [], evidence: [], summary: emptySummary() };
  const { mainFlowId, entries } = mainFlowPlanning(operationalState);
  const earlyBlock = firstBlock(entries, opts.internalBlockGapToleranceMinutes).slice(0, opts.maxMovedTasksPerCandidate);
  const anchor = entries.find((entry) => earlyBlock.length > 0 && entry.start - earlyBlock[earlyBlock.length - 1].end >= opts.minMainFlowGapMinutes);
  if (earlyBlock.length === 0 || anchor == null || earlyBlock.length > opts.maxMovedTasksPerCandidate) return { candidates: [], evidence: [], summary: emptySummary() };
  if (earlyBlock.some((entry) => isProtected(entry.task) || hasBlockingLock(operationalState, entry.taskId))) return { candidates: [], evidence: [], summary: emptySummary() };
  const gapBefore = anchor.start - earlyBlock[earlyBlock.length - 1].end;
  const blockStart = earlyBlock[0].start;
  const blockEnd = earlyBlock[earlyBlock.length - 1].end;
  const delta = anchor.start - blockEnd;
  const dayStart = toMinutes(operationalState.workDay?.start ?? operationalState.availability?.workDay?.start) ?? 0;
  const dayEnd = toMinutes(operationalState.workDay?.end ?? operationalState.availability?.workDay?.end) ?? 24 * 60;
  if (gapBefore < opts.minMainFlowGapMinutes || blockStart + delta < dayStart || blockEnd + delta > dayEnd) return { candidates: [], evidence: [], summary: emptySummary() };
  const assignments = earlyBlock.map((entry) => ({ taskId: entry.taskId, startPlanned: toTime(entry.start + delta), endPlanned: toTime(entry.end + delta), spaceId: entry.spaceId ?? entry.task?.spaceId ?? null, resourceIds: [...(entry.assignedResourceIds ?? entry.task?.assignedResourceIds ?? [])].sort((a, b) => a - b) }));
  const candidateId = `orc-see:main-flow-gap-closure:${mainFlowId ?? "fallback"}:${earlyBlock.map((entry) => entry.taskId).join("-")}:before-${anchor.taskId}`;
  const evidenceId = `evidence:${candidateId}`;
  const movedTaskIds = earlyBlock.map((entry) => entry.taskId);
  const originalWindows = earlyBlock.map((entry) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned }));
  const proposedWindows = assignments.map((assignment) => ({ taskId: assignment.taskId, startPlanned: assignment.startPlanned, endPlanned: assignment.endPlanned }));
  const candidate: Candidate = {
    id: candidateId,
    state: { status: "draft", reason: "Executable main-flow gap closure candidate", evidenceIds: [evidenceId], metadata: { readOnly: false } },
    assignments: assignments.map(cloneAssignment), operationalValues: [], evidenceIds: [evidenceId],
    metadata: { strategy: "MAIN_FLOW_GAP_CLOSURE", strategyId: "MAIN_FLOW_GAP_CLOSURE", strategyFamily: "main-flow", strategyType: "close_initial_gap", mainFlowGapClosureCandidate: true, planningInfluence: "candidate-assignments", executesTransformations: true, readOnly: false, abstract: false, expectedImpact: "reduce-main-flow-gap", movedTaskIds, gapBeforeMinutes: gapBefore, expectedGapAfterMinutes: 0, generationReason: "Moved the first eligible main-flow block to end immediately before the following main-flow chain.", searchSpaceIds: searchSpaces.map((space) => space.id), transformations: [{ kind: "MOVE_CHAIN", reason: "Close the initial configured main-flow gap.", taskIds: movedTaskIds, coordinationRole: "primary" }] },
  };
  const evidence: Evidence = { id: evidenceId, source: "orc-see", kind: "main-flow-gap-closure-candidate-generated", subjectId: candidateId, createdAt, data: { candidateId, mainFlowId, movedTaskIds, anchorTaskIds: [anchor.taskId], originalWindows, proposedWindows, gapBeforeMinutes: gapBefore, expectedGapAfterMinutes: 0, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } };
  return { candidates: [candidate].slice(0, opts.maxCandidates), evidence: [evidence], summary: { generated: 1, acceptedBeforePrefilter: 1, discardedByPrefilter: 0, candidateIds: [candidateId], movedTaskIds, gapBeforeMinutes: gapBefore, expectedGapAfterMinutes: 0, readOnly: true, planningInfluence: "candidate-generation-only" } };
}
