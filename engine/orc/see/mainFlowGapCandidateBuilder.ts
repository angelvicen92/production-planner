import type { Candidate, Evidence, OperationalState, SearchSpace } from "../contracts";
import { classifyORCPlanningEntryOperationalRole, isORCProductiveRole } from "../state/nonWorkTaskClassifier";

export interface MainFlowGapCandidateBuilderOptions {
  readonly minMainFlowGapMinutes?: number;
  readonly maxMovedTasksPerCandidate?: number;
  readonly maxCandidates?: number;
  readonly internalBlockGapToleranceMinutes?: number;
}

export interface MainFlowGapClosureSummary {
  readonly executed: boolean;
  readonly skippedReason: string | null;
  readonly mainFlowConfigured: boolean;
  readonly mainFlowId: number | null;
  readonly generatedCandidateCount: number;
  readonly candidateIds: string[];
  readonly candidatesWithAssignments: number;
  readonly assignmentCount: number;
  readonly discardedByPrefilter: number;
  readonly prefilterDiscardReasons: Record<string, number>;
  readonly prefilterDiscardDetails?: ReadonlyArray<Record<string, unknown>>;
  readonly candidateStateCount: number;
  readonly simulatedStateCount: number;
  readonly validSimulationCount: number;
  readonly invalidSimulationCount: number;
  readonly selectedCandidateId: string | null;
  readonly selectedAsBest: boolean;
  readonly selectedAsCommit: boolean;
  readonly movedTaskIds: number[];
  readonly gapBeforeMinutes: number | null;
  readonly expectedGapAfterMinutes: number | null;
  readonly readOnly: true;
  readonly planningInfluence: "candidate-generation-diagnostics-only";
  /** @deprecated */ readonly generated?: number;
  /** @deprecated */ readonly acceptedBeforePrefilter?: number;
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
const emptySummary = (reason: string | null = null, mainFlowId: number | null = null): MainFlowGapClosureSummary => ({ executed: reason !== "main_flow_not_configured", skippedReason: reason, mainFlowConfigured: mainFlowId != null, mainFlowId, generatedCandidateCount: 0, candidateIds: [], candidatesWithAssignments: 0, assignmentCount: 0, discardedByPrefilter: 0, prefilterDiscardReasons: {}, prefilterDiscardDetails: [], candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, movedTaskIds: [], gapBeforeMinutes: null, expectedGapAfterMinutes: null, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", generated: 0, acceptedBeforePrefilter: 0 });
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
    const role = classifyORCPlanningEntryOperationalRole({ entry, task, mealWindow: state.availability?.actualMeal ?? state.availability?.meal ?? state.availability?.mealWindow ?? null });
    return configured && isORCProductiveRole(role) ? [{ ...entry, assignedResourceIds: [...(entry.assignedResourceIds ?? [])], start, end, task }] : [];
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
  if (operationalState == null || opts.maxCandidates <= 0 || opts.maxMovedTasksPerCandidate <= 0) return { candidates: [], evidence: [], summary: emptySummary("builder_disabled") };
  const { mainFlowId, entries } = mainFlowPlanning(operationalState);
  if (mainFlowId == null) return { candidates: [], evidence: [], summary: emptySummary("main_flow_not_configured", null) };
  const earlyBlock = firstBlock(entries, opts.internalBlockGapToleranceMinutes).slice(0, opts.maxMovedTasksPerCandidate);
  const anchor = entries.find((entry) => earlyBlock.length > 0 && entry.start - earlyBlock[earlyBlock.length - 1].end >= opts.minMainFlowGapMinutes);
  if (earlyBlock.length === 0 || anchor == null || earlyBlock.length > opts.maxMovedTasksPerCandidate) return { candidates: [], evidence: [], summary: emptySummary("no_gap_above_threshold", mainFlowId) };
  if (earlyBlock.some((entry) => isProtected(entry.task) || hasBlockingLock(operationalState, entry.taskId))) return { candidates: [], evidence: [], summary: emptySummary("no_gap_above_threshold", mainFlowId) };
  const gapBefore = anchor.start - earlyBlock[earlyBlock.length - 1].end;
  const blockStart = earlyBlock[0].start;
  const blockEnd = earlyBlock[earlyBlock.length - 1].end;
  const delta = anchor.start - blockEnd;
  const dayStart = toMinutes(operationalState.workDay?.start ?? operationalState.availability?.workDay?.start) ?? 0;
  const dayEnd = toMinutes(operationalState.workDay?.end ?? operationalState.availability?.workDay?.end) ?? 24 * 60;
  if (gapBefore < opts.minMainFlowGapMinutes || blockStart + delta < dayStart || blockEnd + delta > dayEnd) return { candidates: [], evidence: [], summary: emptySummary("no_gap_above_threshold", mainFlowId) };
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
  const evidence: Evidence = { id: evidenceId, source: "orc-see", kind: "main-flow-gap-closure-candidate-generated", subjectId: candidateId, createdAt, data: { candidateId, mainFlowId, mainFlowConfigured: true, movedTaskIds, anchorTaskIds: [anchor.taskId], originalWindows, proposedWindows, gapBeforeMinutes: gapBefore, expectedGapAfterMinutes: 0, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } };
  return { candidates: [candidate].slice(0, opts.maxCandidates), evidence: [evidence], summary: { executed: true, skippedReason: null, mainFlowConfigured: true, mainFlowId, generatedCandidateCount: 1, candidateIds: [candidateId], candidatesWithAssignments: 1, assignmentCount: assignments.length, discardedByPrefilter: 0, prefilterDiscardReasons: {}, prefilterDiscardDetails: [], candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, movedTaskIds, gapBeforeMinutes: gapBefore, expectedGapAfterMinutes: 0, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", generated: 1, acceptedBeforePrefilter: 1 } };
}
