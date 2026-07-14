import type { EngineInput } from "../../types";
import type { Candidate, CandidateAssignment, OperationalState, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { createHash } from "node:crypto";
import { resolveInitialConstructionProtectedIntervalsForAnchor } from "./initialConstructionSearchSpace";
import { evaluateInitialConstructionPlacementFeasibility } from "./initialConstructionPlacementFeasibility";
import { generateInitialConstructionAnchorTemporalCandidates, type InitialConstructionAnchorTemporalCandidate } from "./initialConstructionAnchorTemporalCandidates";

const protectedStatus = new Set(["done", "in_progress"]);

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
type Blocker = { code: string; taskId?: number | null; dependentTaskId?: number | null; [key: string]: unknown };

export type Stage2BranchStatus = "candidate" | "closure-incomplete" | "unsupported";

export interface InitialConstructionBranch {
  branchId: string;
  status: Stage2BranchStatus;
  assignments: CandidateAssignment[];
  rejectionReason?: string | null;
  blockers: Blocker[];
  unsupportedRequirementCodes: string[];
  evidence: Blocker[];
  searchEvidence?: AssignmentSearchEvidence;
  anchorPlacementEvidence?: AnchorPlacementEvidence;
}

export interface AnchorPlacementEvidence {
  windowIndex: number;
  candidateRankWithinWindow: number;
  sourceKinds: readonly string[];
  startPlanned: string;
  endPlanned: string;
  feasibilityChecked: boolean;
  feasible: boolean;
  reasonCodes: readonly string[];
  resourceAlternativeIds: readonly number[][];
  temporalCandidateFingerprint: string;
  fingerprint: string;
  readOnly: true;
}

export interface AssignmentSearchEvidence {
  closureComplete: boolean;
  failedTaskId: number | null;
  placementAttemptCount: number;
  temporalCandidateCount: number;
  resourceAlternativeCount: number;
  recursiveBacktrackCount: number;
  temporalDecisionBacktrackCount: number;
  resourceDecisionBacktrackCount: number;
  backtrackEventsSample: AssignmentBacktrackEvent[];
  repeatedStatePruneCount: number;
  searchDepthReached: number;
  budgetExhausted: boolean;
  deadEndReasonCounts: Record<string, number>;
  placementFeasibilityVersion: "initial-construction-placement-feasibility-v1";
  taskWindowConflictCount: number;
  protectedIntervalConflictCount: number;
  contestantOverlapConflictCount: number;
  spaceOverlapConflictCount: number;
  resourceOverlapConflictCount: number;
  assignmentSearchFingerprint: string;
}

export interface AssignmentBacktrackEvent {
  depth: number;
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  resourceIds: number[];
  failedDeeperTaskId: number | null;
  kind: "TEMPORAL_DECISION_UNDONE" | "RESOURCE_DECISION_UNDONE";
  nextAlternativeAvailable: boolean;
  readOnly: true;
}

export interface InitialConstructionBranchBuilderResult {
  selectedAnchorTaskId: number | null;
  closureTaskIds: number[];
  topologicalTaskOrder: number[];
  branches: InitialConstructionBranch[];
  structuralFingerprint: string;
  readOnly: true;
}

const toMin = (value?: string | null): number | null => {
  if (!/^\d{2}:\d{2}$/.test(String(value ?? ""))) return null;
  return Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3));
};

const hh = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const durationOf = (task: TaskLike | null | undefined): number => Number(task?.durationOverrideMin ?? task?.durationMin ?? task?.durationMinutes ?? task?.duration ?? 0) || 0;

const overlaps = (left: { startPlanned?: string | null; endPlanned?: string | null; start?: string | null; end?: string | null }, right: { startPlanned?: string | null; endPlanned?: string | null; start?: string | null; end?: string | null }): boolean => {
  const leftStart = toMin(left.startPlanned ?? left.start);
  const leftEnd = toMin(left.endPlanned ?? left.end);
  const rightStart = toMin(right.startPlanned ?? right.start);
  const rightEnd = toMin(right.endPlanned ?? right.end);
  return leftStart != null && leftEnd != null && rightStart != null && rightEnd != null && leftStart < rightEnd && rightStart < leftEnd;
};

const taskMap = (input: EngineInput): Map<number, TaskLike> => new Map((input.tasks ?? []).map((task) => [Number(task.id), task as TaskLike]));

function prereqMap(stage1: any): Map<number, number[]> {
  return new Map((stage1.initialConstructionMap?.dependencyGraph?.nodes ?? []).map((node: any) => [Number(node.taskId), (node.directPrerequisiteTaskIds ?? []).map(Number).sort((a: number, b: number) => a - b)]));
}

function cycleSet(stage1: any): Set<number> {
  return new Set((stage1.initialConstructionMap?.dependencyGraph?.nodes ?? []).filter((node: any) => node.inDependencyCycle).map((node: any) => Number(node.taskId)));
}

function protectedFinish(task: TaskLike): number | null {
  return toMin(String(task.endPlanned ?? task.fixedWindowEnd ?? task.end ?? ""));
}

export function buildInitialConstructionClosure(args: { input: EngineInput; stage1: any; anchorTaskId: number }) {
  const tasks = taskMap(args.input);
  const prerequisites = prereqMap(args.stage1);
  const cycles = cycleSet(args.stage1);
  const seen = new Set<number>();
  const order: number[] = [];
  const blockers: Blocker[] = [];

  const visit = (taskId: number, dependentTaskId: number | null): void => {
    if (seen.has(taskId)) return;
    if (cycles.has(taskId)) {
      blockers.push({ code: "DEPENDENCY_CYCLE_IN_CLOSURE", taskId, dependentTaskId });
      return;
    }

    const task = tasks.get(taskId);
    if (!task) {
      blockers.push({ code: "MISSING_PREREQUISITE_TASK", taskId, dependentTaskId });
      return;
    }

    if (taskId !== args.anchorTaskId && protectedStatus.has(String(task.status))) {
      const finish = protectedFinish(task);
      const anchorStart = toMin(String(tasks.get(args.anchorTaskId)?.fixedWindowStart ?? ""));
      if (String(task.status) === "done" || (finish != null && (anchorStart == null || finish <= anchorStart))) return;
      blockers.push({ code: "PROTECTED_PREREQUISITE_TASK_BLOCKS_ANCHOR", taskId, dependentTaskId, protectedEnd: finish == null ? null : hh(finish) });
      return;
    }

    if (task.status !== "pending" && task.status !== "interrupted") {
      if (taskId !== args.anchorTaskId) blockers.push({ code: "PROTECTED_PREREQUISITE_TASK", taskId, dependentTaskId });
      return;
    }

    seen.add(taskId);
    for (const prerequisiteId of prerequisites.get(taskId) ?? []) visit(prerequisiteId, taskId);
    order.push(taskId);
  };

  visit(args.anchorTaskId, null);
  return { closureTaskIds: order, topologicalTaskOrder: order, blockers };
}

function resourceAlternatives(input: EngineInput, task: TaskLike, occupied: CandidateAssignment[], start: string, end: string): { ids: number[]; unsupported?: Blocker }[] {
  const req = (task.resourceRequirements ?? {}) as any;
  if (req.byType && Object.values(req.byType).some((quantity: any) => Number(quantity) > 0)) {
    return [{ ids: [], unsupported: { code: "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT", contract: "byType", taskId: Number(task.id), evidence: req.byType } }];
  }

  let byItemAlternatives: number[][] = [[]];
  for (const [resourceItemId, quantity] of Object.entries(req.byItem ?? {})) {
    if (Number(quantity) !== 1) {
      return [{ ids: [], unsupported: { code: "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT", contract: "byItem.quantity", taskId: Number(task.id), evidence: { resourceItemId: Number(resourceItemId), quantity } } }];
    }
    const items = (input.planResourceItems ?? [])
      .filter((candidate) => candidate.isAvailable !== false && Number(candidate.resourceItemId) === Number(resourceItemId))
      .sort((a, b) => a.id - b.id);
    if (!items.length) return [{ ids: [], unsupported: { code: "REQUIRED_RESOURCE_UNAVAILABLE", contract: "byItem", taskId: Number(task.id), evidence: { resourceItemId: Number(resourceItemId) } } }];
    byItemAlternatives = byItemAlternatives.flatMap((baseIds) => items.map((item) => [...baseIds, item.id]));
  }

  const groups = req.anyOf ?? [];
  if (groups.some((group: any) => Number(group.quantity) !== 1)) {
    return [{ ids: [], unsupported: { code: "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT", contract: "ANY_OF.quantity", taskId: Number(task.id), evidence: groups } }];
  }

  let alternatives = byItemAlternatives;
  for (const group of groups) {
    const usable = (group.resourceItemIds ?? [])
      .flatMap((resourceItemId: number) => (input.planResourceItems ?? []).filter((item) => item.isAvailable !== false && Number(item.resourceItemId) === Number(resourceItemId)))
      .sort((a: any, b: any) => a.id - b.id);
    if (!usable.length) return [{ ids: [], unsupported: { code: "REQUIRED_RESOURCE_UNAVAILABLE", contract: "ANY_OF", taskId: Number(task.id), evidence: group } }];
    alternatives = alternatives.flatMap((baseIds) => usable.map((item: any) => [...baseIds, item.id]));
  }

  return alternatives.map((ids) => ({ ids: [...new Set(ids)].sort((a, b) => a - b) }));
}

function taskProtectedIntervals(input: EngineInput, task: TaskLike) {
  return resolveInitialConstructionProtectedIntervalsForAnchor({
    input,
    anchor: { anchorTaskId: task.id, contestantId: task.contestantId ?? null, spaceId: task.spaceId ?? null, zoneId: task.zoneId ?? null },
  });
}

function canPlace(input: EngineInput, originOperationalState: OperationalState, task: TaskLike, assignment: CandidateAssignment, occupied: CandidateAssignment[], tasks: Map<number, TaskLike>) {
  return evaluateInitialConstructionPlacementFeasibility({ input, originOperationalState, task, assignment, occupiedAssignments: occupied, tasks });
}


function addReason(counts: Record<string, number>, code: string): void { counts[code] = (counts[code] ?? 0) + 1; }

function makeSearchEvidence(assignments: CandidateAssignment[], metrics: Omit<AssignmentSearchEvidence, "assignmentSearchFingerprint" | "closureComplete" | "placementFeasibilityVersion" | "taskWindowConflictCount" | "protectedIntervalConflictCount" | "contestantOverlapConflictCount" | "spaceOverlapConflictCount" | "resourceOverlapConflictCount"> & { closureComplete?: boolean }): AssignmentSearchEvidence {
  const payload = { assignments: assignments.map((a) => ({ taskId: a.taskId, startPlanned: a.startPlanned, endPlanned: a.endPlanned, spaceId: a.spaceId ?? null, resourceIds: [...a.resourceIds].sort((x, y) => x - y) })).sort((a, b) => a.taskId - b.taskId), metrics: { ...metrics, deadEndReasonCounts: Object.fromEntries(Object.entries(metrics.deadEndReasonCounts).sort()) } };
  return { closureComplete: metrics.closureComplete ?? false, failedTaskId: metrics.failedTaskId, placementAttemptCount: metrics.placementAttemptCount, temporalCandidateCount: metrics.temporalCandidateCount, resourceAlternativeCount: metrics.resourceAlternativeCount, recursiveBacktrackCount: metrics.recursiveBacktrackCount, temporalDecisionBacktrackCount: metrics.temporalDecisionBacktrackCount, resourceDecisionBacktrackCount: metrics.resourceDecisionBacktrackCount, backtrackEventsSample: metrics.backtrackEventsSample.slice(0, 8), repeatedStatePruneCount: metrics.repeatedStatePruneCount, searchDepthReached: metrics.searchDepthReached, budgetExhausted: metrics.budgetExhausted, deadEndReasonCounts: Object.fromEntries(Object.entries(metrics.deadEndReasonCounts).sort()), placementFeasibilityVersion: "initial-construction-placement-feasibility-v1", taskWindowConflictCount: metrics.deadEndReasonCounts.TASK_WINDOW_CONFLICT ?? 0, protectedIntervalConflictCount: metrics.deadEndReasonCounts.PROTECTED_INTERVAL_CONFLICT ?? 0, contestantOverlapConflictCount: metrics.deadEndReasonCounts.CONTESTANT_OVERLAP ?? 0, spaceOverlapConflictCount: metrics.deadEndReasonCounts.SPACE_OVERLAP ?? 0, resourceOverlapConflictCount: metrics.deadEndReasonCounts.RESOURCE_OVERLAP ?? 0, assignmentSearchFingerprint: createHash("sha256").update(stableStringify(payload)).digest("hex") };
}

function temporalCandidates(input: EngineInput, task: TaskLike, latestEnd: number, branchWindow: { start: string; end: string }, occupied: CandidateAssignment[]): number[] {
  const duration = durationOf(task);
  const boundaries = new Set<number>();
  const push = (v: number | null) => { if (v != null && Number.isFinite(v)) boundaries.add(v); };
  push(latestEnd); push(toMin(input.workDay?.start)); push(toMin(input.workDay?.end)); push(toMin(branchWindow.start)); push(toMin(branchWindow.end));
  const availability = task.contestantId != null ? (input.contestantAvailabilityById ?? {})[Number(task.contestantId)] : null;
  push(toMin(availability?.start ?? input.workDay?.start)); push(toMin(availability?.end ?? input.workDay?.end));
  push(toMin(String(task.fixedWindowStart ?? ""))); push(toMin(String(task.fixedWindowEnd ?? "")));
  for (const assignment of occupied) { push(toMin(assignment.startPlanned)); push(toMin(assignment.endPlanned)); }
  for (const interval of taskProtectedIntervals(input, task)) { push(toMin(interval.start)); push(toMin(interval.end)); }
  const starts = new Set<number>();
  for (const boundary of boundaries) { starts.add(boundary - duration); starts.add(boundary); }
  return [...starts].filter((start) => start + duration <= latestEnd).sort((a, b) => b - a);
}

export function searchInitialConstructionClosureAssignments(args: { input: EngineInput; originOperationalState: OperationalState; stage1: any; closureTopologicalTaskIds: number[]; anchorAssignment: CandidateAssignment; branchWindow: { start: string; end: string }; reasoningBudget?: ReasoningBudgetProfile | null; tasks?: Map<number, TaskLike>; prerequisites?: Map<number, number[]>; baseProvisionalAssignments?: readonly CandidateAssignment[] }): { ok: boolean; assignments: CandidateAssignment[]; blockers: Blocker[]; evidence: AssignmentSearchEvidence } {
  const tasks = args.tasks ?? taskMap(args.input);
  const prerequisites = args.prerequisites ?? prereqMap(args.stage1);
  const baseOccupied: CandidateAssignment[] = [
    ...(args.originOperationalState.planning ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.assignedResourceIds ?? [])] })),
    ...(args.baseProvisionalAssignments ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.resourceIds ?? entry.assignedResourceIds ?? [])] })),
  ];
  const order = [...args.closureTopologicalTaskIds].reverse().filter((id) => id !== args.anchorAssignment.taskId);
  const budget = {
    maxDepth: args.reasoningBudget?.maxDepth ?? args.closureTopologicalTaskIds.length + 1,
    maxPositions: args.reasoningBudget?.maxSearchSpaceSize ?? Math.max(8, args.closureTopologicalTaskIds.length * 32),
    maxResources: args.reasoningBudget?.maxSearchSpaceSize ?? Math.max(8, args.closureTopologicalTaskIds.length * 32),
    maxStates: args.reasoningBudget?.explorationBudget ?? Math.max(16, args.closureTopologicalTaskIds.length * 64),
    maxBacktracks: args.reasoningBudget?.explorationBudget ?? 64,
  };
  const metrics = { failedTaskId: null as number | null, placementAttemptCount: 0, temporalCandidateCount: 0, resourceAlternativeCount: 0, recursiveBacktrackCount: 0, temporalDecisionBacktrackCount: 0, resourceDecisionBacktrackCount: 0, backtrackEventsSample: [] as AssignmentBacktrackEvent[], repeatedStatePruneCount: 0, searchDepthReached: 0, budgetExhausted: false, deadEndReasonCounts: {} as Record<string, number> };
  const seen = new Set<string>();
  const fingerprint = (idx: number, provisional: CandidateAssignment[]) => stableStringify({ next: order[idx] ?? null, placed: provisional.map((a) => ({ t: a.taskId, s: a.startPlanned, e: a.endPlanned, p: a.spaceId ?? null, r: [...a.resourceIds].sort((x, y) => x - y) })).sort((a, b) => a.t - b.t) });
  const exhausted = () => metrics.budgetExhausted || metrics.placementAttemptCount >= budget.maxPositions || metrics.resourceAlternativeCount >= budget.maxResources || seen.size >= budget.maxStates || metrics.recursiveBacktrackCount >= budget.maxBacktracks;
  const markBudgetExhausted = () => { metrics.budgetExhausted = true; addReason(metrics.deadEndReasonCounts, "ASSIGNMENT_SEARCH_BUDGET_EXHAUSTED"); };
  const dfs = (idx: number, provisional: CandidateAssignment[]): CandidateAssignment[] | null => {
    metrics.searchDepthReached = Math.max(metrics.searchDepthReached, idx + 1);
    if (idx >= order.length) return provisional;
    if (idx >= budget.maxDepth) { markBudgetExhausted(); return null; }
    const key = fingerprint(idx, provisional);
    if (seen.has(key)) { metrics.repeatedStatePruneCount += 1; return null; }
    seen.add(key);
    const taskId = order[idx]; const task = tasks.get(taskId);
    if (!task) { metrics.failedTaskId = taskId; addReason(metrics.deadEndReasonCounts, "MISSING_TASK"); return null; }
    const dependentStarts = provisional.filter((assignment) => (prerequisites.get(assignment.taskId) ?? []).includes(taskId)).map((assignment) => toMin(assignment.startPlanned)).filter((v): v is number => v != null);
    if (!dependentStarts.length) { metrics.failedTaskId = taskId; addReason(metrics.deadEndReasonCounts, "DEPENDENT_NOT_PLACED"); return null; }
    const candidates = temporalCandidates(args.input, task, Math.min(...dependentStarts), args.branchWindow, [...baseOccupied, ...provisional]);
    metrics.temporalCandidateCount += candidates.length;
    const viable: CandidateAssignment[] = [];
    for (const start of candidates) {
      if (exhausted()) { markBudgetExhausted(); return null; }
      metrics.placementAttemptCount += 1;
      if (metrics.placementAttemptCount > budget.maxPositions) { markBudgetExhausted(); return null; }
      const base = { taskId, startPlanned: hh(start), endPlanned: hh(start + durationOf(task)), spaceId: task.spaceId ?? null, resourceIds: [] as number[] };
      const alts = resourceAlternatives(args.input, task, [...baseOccupied, ...provisional], base.startPlanned, base.endPlanned);
      if (metrics.resourceAlternativeCount + alts.length > budget.maxResources) { markBudgetExhausted(); return null; }
      metrics.resourceAlternativeCount += alts.length;
      for (const alt of alts) {
        if (alt.unsupported) { metrics.failedTaskId = taskId; addReason(metrics.deadEndReasonCounts, alt.unsupported.code); continue; }
        const assignment = { ...base, resourceIds: alt.ids };
        const feasibility = canPlace(args.input, args.originOperationalState, task, assignment, [...baseOccupied, ...provisional], tasks);
        if (!feasibility.valid) {
          for (const code of feasibility.reasonCodes) addReason(metrics.deadEndReasonCounts, code);
          continue;
        }
        viable.push(assignment);
      }
    }
    for (let i = 0; i < viable.length; i += 1) {
      const assignment = viable[i];
      const found = dfs(idx + 1, [...provisional, assignment]);
      if (found) return found;
      if (!metrics.budgetExhausted) {
        const next = viable[i + 1] ?? null;
        const kind = next && next.startPlanned === assignment.startPlanned && next.endPlanned === assignment.endPlanned && stableStringify(next.resourceIds) !== stableStringify(assignment.resourceIds) ? "RESOURCE_DECISION_UNDONE" : "TEMPORAL_DECISION_UNDONE";
        if (kind === "RESOURCE_DECISION_UNDONE") metrics.resourceDecisionBacktrackCount += 1;
        else metrics.temporalDecisionBacktrackCount += 1;
        metrics.recursiveBacktrackCount = metrics.temporalDecisionBacktrackCount + metrics.resourceDecisionBacktrackCount;
        if (metrics.backtrackEventsSample.length < 8) metrics.backtrackEventsSample.push({ depth: idx, taskId, startPlanned: String(assignment.startPlanned), endPlanned: String(assignment.endPlanned), resourceIds: [...assignment.resourceIds].sort((a, b) => a - b), failedDeeperTaskId: metrics.failedTaskId, kind, nextAlternativeAvailable: !!next, readOnly: true });
      }
      if (exhausted()) { markBudgetExhausted(); return null; }
    }
    metrics.failedTaskId = metrics.failedTaskId ?? taskId; return null;
  };
  const found = dfs(0, [args.anchorAssignment]);
  const blockers = found ? [] : [{ code: metrics.budgetExhausted ? "ASSIGNMENT_SEARCH_BUDGET_EXHAUSTED" : "PREREQUISITE_PLACEMENT_FAILED", taskId: metrics.failedTaskId }];
  const assignments = found ?? [args.anchorAssignment];
  return { ok: !!found, assignments, blockers, evidence: makeSearchEvidence(assignments, { ...metrics, closureComplete: !!found }) };
}

export function buildInitialConstructionBranches(args: { input: EngineInput; originOperationalState: OperationalState; stage1: any; maxBranches?: number; reasoningBudget?: ReasoningBudgetProfile | null; baseProvisionalAssignments?: readonly CandidateAssignment[]; closureTaskIds?: readonly number[] }): InitialConstructionBranchBuilderResult {
  const anchorId = Number(args.stage1.selectedAnchor?.anchorTaskId);
  const originalClosure = buildInitialConstructionClosure({ input: args.input, stage1: args.stage1, anchorTaskId: anchorId });
  const closure = args.closureTaskIds ? { closureTaskIds: [...args.closureTaskIds].map(Number), topologicalTaskOrder: [...args.closureTaskIds].map(Number), blockers: originalClosure.blockers.filter((b) => args.closureTaskIds?.includes(Number(b.taskId))) } : originalClosure;
  const tasks = taskMap(args.input);
  const search = (args.stage1.searchSpaces ?? []).find((space: any) => Number(space.anchorTaskId) === anchorId);
  const maxBranches = args.maxBranches ?? 8;
  const branches: InitialConstructionBranch[] = [];
  const baseOccupied: CandidateAssignment[] = [
    ...(args.originOperationalState.planning ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.assignedResourceIds ?? [])] })),
    ...(args.baseProvisionalAssignments ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.resourceIds ?? entry.assignedResourceIds ?? [])] })),
  ];
  let sequence = 0;

  const anchor = tasks.get(anchorId);
  const windows = ((search?.provisionalWindows ?? []) as any[]).map((window, index) => ({ window, index }));
  const perWindow = anchor ? windows.map(({ window, index }) => generateInitialConstructionAnchorTemporalCandidates({ input: args.input, anchorTask: anchor, provisionalWindow: window, provisionalAssignments: baseOccupied, originOperationalState: args.originOperationalState, maxCandidates: maxBranches, windowIndex: index }).map((candidate) => ({ window, candidate }))) : [];
  const globalCandidates: { window: any; candidate: InitialConstructionAnchorTemporalCandidate }[] = [];
  const seenCandidates = new Set<string>();
  const maxRank = Math.max(0, ...perWindow.map((items) => items.length));
  for (let rank = 0; rank < maxRank && globalCandidates.length < maxBranches; rank += 1) {
    for (const items of perWindow) {
      const item = items[rank];
      if (!item) continue;
      const key = `${item.candidate.startPlanned}|${item.candidate.endPlanned}`;
      if (seenCandidates.has(key)) {
        const existing = globalCandidates.find((existing) => existing.candidate.startPlanned === item.candidate.startPlanned && existing.candidate.endPlanned === item.candidate.endPlanned);
        if (existing) {
          const windowIndex = Math.min(existing.candidate.windowIndex, item.candidate.windowIndex);
          const sourceKinds = [...new Set([...existing.candidate.sourceKinds, ...item.candidate.sourceKinds])].sort() as any;
          existing.candidate = { ...existing.candidate, windowIndex, sourceKinds, fingerprint: createHash("sha256").update(stableStringify({ windowIndex, candidateRankWithinWindow: existing.candidate.candidateRankWithinWindow, sourceKinds, startPlanned: existing.candidate.startPlanned, endPlanned: existing.candidate.endPlanned, readOnly: true })).digest("hex") };
        }
        continue;
      }
      seenCandidates.add(key);
      globalCandidates.push(item);
      if (globalCandidates.length >= maxBranches) break;
    }
  }

  for (const { window, candidate } of globalCandidates) {
    if (branches.length >= maxBranches) break;
    if (!anchor) continue;
    const anchorResources = resourceAlternatives(args.input, anchor, baseOccupied, candidate.startPlanned, candidate.endPlanned);

    for (const resourceAlternative of anchorResources) {
      if (branches.length >= maxBranches) break;
      sequence += 1;
      const branchId = `stage2-branch:${String(sequence).padStart(3, "0")}`;
      const blockers = [...closure.blockers];
      const provisional: CandidateAssignment[] = [];
      const makeEvidence = (feasible: boolean, reasonCodes: string[], resourceIds: number[][]): AnchorPlacementEvidence => {
        const temporalCandidateFingerprint = createHash("sha256").update(stableStringify({ windowIndex: candidate.windowIndex, candidateRankWithinWindow: candidate.candidateRankWithinWindow, sourceKinds: candidate.sourceKinds, startPlanned: candidate.startPlanned, endPlanned: candidate.endPlanned })).digest("hex");
        const ev: AnchorPlacementEvidence = { windowIndex: candidate.windowIndex, candidateRankWithinWindow: candidate.candidateRankWithinWindow, sourceKinds: candidate.sourceKinds, startPlanned: candidate.startPlanned, endPlanned: candidate.endPlanned, feasibilityChecked: true, feasible, reasonCodes: [...reasonCodes].sort(), resourceAlternativeIds: resourceIds.map((ids) => [...ids].sort((a,b)=>a-b)).sort((a,b)=>stableStringify(a).localeCompare(stableStringify(b))), temporalCandidateFingerprint, fingerprint: "", readOnly: true };
        ev.fingerprint = createHash("sha256").update(stableStringify({ ...ev, fingerprint: undefined })).digest("hex");
        return ev;
      };

      if (resourceAlternative.unsupported) {
        const evidence = makeEvidence(false, [resourceAlternative.unsupported.code], []);
        branches.push(rejectedBranch(branchId, resourceAlternative.unsupported, [], evidence));
        continue;
      }

      const anchorAssignment = { taskId: anchorId, startPlanned: candidate.startPlanned, endPlanned: candidate.endPlanned, spaceId: anchor.spaceId ?? null, resourceIds: resourceAlternative.ids };
      const anchorFeasibility = canPlace(args.input, args.originOperationalState, anchor, anchorAssignment, baseOccupied, tasks);
      const placementEvidence = makeEvidence(anchorFeasibility.valid, anchorFeasibility.reasonCodes, [resourceAlternative.ids]);
      if (!anchorFeasibility.valid) {
        const anchorBlockers = anchorFeasibility.reasonCodes.map((code) => ({ code, taskId: anchorId }));
        branches.push({ branchId, status: "closure-incomplete", assignments: [], rejectionReason: anchorFeasibility.reasonCodes[0] ?? "ANCHOR_WINDOW_INFEASIBLE", blockers: [...blockers, ...anchorBlockers].slice(0, 10), evidence: [...blockers, ...anchorBlockers].slice(0, 5), unsupportedRequirementCodes: [], anchorPlacementEvidence: placementEvidence });
        continue;
      }
      provisional.push(anchorAssignment);

      const searchResult = blockers.length === 0 ? searchInitialConstructionClosureAssignments({ input: args.input, originOperationalState: args.originOperationalState, stage1: args.stage1, closureTopologicalTaskIds: closure.topologicalTaskOrder, anchorAssignment, branchWindow: window, reasoningBudget: args.reasoningBudget, tasks, prerequisites: prereqMap(args.stage1), baseProvisionalAssignments: args.baseProvisionalAssignments }) : null;
      const ok = blockers.length === 0 && !!searchResult?.ok;
      branches.push(materializeBranch(branchId, ok, [...blockers, ...(searchResult?.blockers ?? [])], searchResult?.assignments ?? provisional, searchResult?.evidence, placementEvidence));
    }
  }

  const structuralFingerprint = createHash("sha256").update(stableStringify({ anchorId, closure: closure.closureTaskIds, branches: branches.map((branch) => ({ id: branch.branchId, status: branch.status, assignments: branch.assignments, anchorPlacementEvidence: branch.anchorPlacementEvidence ?? null })) })).digest("hex");
  return deepFreeze({ selectedAnchorTaskId: anchorId || null, closureTaskIds: closure.closureTaskIds, topologicalTaskOrder: closure.topologicalTaskOrder, branches, structuralFingerprint, readOnly: true }) as InitialConstructionBranchBuilderResult;
}

function materializeBranch(branchId: string, ok: boolean, blockers: Blocker[], provisional: CandidateAssignment[], searchEvidence?: AssignmentSearchEvidence, anchorPlacementEvidence?: AnchorPlacementEvidence): InitialConstructionBranch {
  const unsupportedCodes = [...new Set(blockers.filter((blocker) => blocker.code === "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT").map((blocker) => blocker.code))];
  return {
    branchId,
    status: ok && blockers.length === 0 ? "candidate" : unsupportedCodes.length > 0 ? "unsupported" : "closure-incomplete",
    assignments: [...provisional].sort((a, b) => (toMin(a.startPlanned) ?? 0) - (toMin(b.startPlanned) ?? 0) || a.taskId - b.taskId),
    rejectionReason: ok && blockers.length === 0 ? null : blockers.at(-1)?.code ?? "CLOSURE_INCOMPLETE",
    blockers: blockers.slice(0, 10),
    unsupportedRequirementCodes: unsupportedCodes,
    evidence: blockers.slice(0, 5),
    searchEvidence,
    anchorPlacementEvidence,
  };
}

function rejectedBranch(branchId: string, blocker: Blocker, assignments: CandidateAssignment[], anchorPlacementEvidence?: AnchorPlacementEvidence): InitialConstructionBranch {
  return { branchId, status: blocker.code === "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT" ? "unsupported" : "closure-incomplete", assignments, rejectionReason: blocker.code, blockers: [blocker], unsupportedRequirementCodes: blocker.code === "UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT" ? [blocker.code] : [], evidence: [blocker], anchorPlacementEvidence };
}

export function branchToCandidate(branch: InitialConstructionBranch): Candidate {
  return {
    id: `candidate:${branch.branchId}`,
    assignments: branch.assignments,
    state: { status: "draft", evidenceIds: [], metadata: { readOnly: true } },
    metadata: {
      strategy: "SCHEDULE_PENDING_TASKS",
      planningInfluence: "candidate-assignments",
      initialConstructionStage: 2,
      branchId: branch.branchId,
      taskIds: branch.assignments.map((assignment) => assignment.taskId),
      executesTransformations: branch.assignments.length > 0,
      commitsPlanning: false,
      readOnly: true,
    },
    evidenceIds: [],
    operationalValues: [],
  };
}
