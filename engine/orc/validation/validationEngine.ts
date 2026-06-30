import type { Evidence, OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";

export interface ValidationEngineOptions {
  createdAt?: string | null;
}

export interface ValidationEngineResult {
  validationResults: ValidationResult[];
  evidence: Evidence[];
  summary: {
    simulatedStateCount: number;
    validCount: number;
    invalidCount: number;
  };
}

const VALIDATION_SOURCE = "orc-validation";
const VALID_SIMULATION_MODES = new Set(["READ_ONLY_BASELINE", "ASSIGNMENT_APPLICATION_SHADOW"]);
const VALIDATED_CONSTRAINT_GROUPS = ["structure", "time", "protected_tasks", "locks", "contestants_and_teams", "resources", "spaces", "dependencies"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const timeToMinutes = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => aStart < bEnd && bStart < aEnd;
const sameNumberSet = (a: readonly number[] = [], b: readonly number[] = []): boolean => {
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
};

type PlanningEntry = OperationalState["planning"][number];

function add(violations: string[], code: string): void {
  if (!violations.includes(code)) violations.push(code);
}

function configuredHardBreaks(snapshot: OperationalState): Array<{ start: string; end: string; code: string }> {
  const availability = snapshot.availability;
  const breaks: Array<{ start: string; end: string; code: string }> = [];
  for (const key of ["meal", "actualMeal", "mealWindow"] as const) {
    const window = availability?.[key];
    if (window?.start && window?.end) breaks.push({ start: window.start, end: window.end, code: "PLANNING_CROSSES_HARD_MEAL_BREAK" });
  }
  for (const window of availability?.globalHardBreaks ?? []) breaks.push({ start: window.start, end: window.end, code: "PLANNING_CROSSES_GLOBAL_HARD_BREAK" });
  for (const window of availability?.protectedBreaks ?? []) {
    const hard = (window as unknown as Record<string, unknown>).hard === true || (window as unknown as Record<string, unknown>).isHard === true || (window as unknown as Record<string, unknown>).hardConstraint === true || window.kind === "protected" || window.kind === "global";
    if (hard) breaks.push({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK" });
  }
  return breaks;
}

function validateStructure(simulatedState: SimulatedState): string[] {
  const violations: string[] = [];

  if (!isNonEmptyString(simulatedState?.id)) add(violations, "MISSING_SIMULATED_STATE_ID");
  if (!isNonEmptyString(simulatedState?.candidateStateId)) add(violations, "MISSING_CANDIDATE_STATE_ID");
  if (!isNonEmptyString(simulatedState?.baseStateId)) add(violations, "MISSING_BASE_STATE_ID");
  if (simulatedState?.operationalStateSnapshot == null) add(violations, "MISSING_OPERATIONAL_STATE_SNAPSHOT");
  if (simulatedState?.operationalStateSnapshot != null && !Object.isFrozen(simulatedState.operationalStateSnapshot)) add(violations, "MUTABLE_OPERATIONAL_STATE_SNAPSHOT");
  if (!Array.isArray(simulatedState?.appliedTransformations)) add(violations, "INVALID_APPLIED_TRANSFORMATIONS");
  if (!VALID_SIMULATION_MODES.has(String(simulatedState?.simulationMode))) add(violations, "INVALID_SIMULATION_MODE");
  if (simulatedState?.readOnly !== true) add(violations, "SIMULATED_STATE_NOT_READ_ONLY");

  const snapshot = simulatedState?.operationalStateSnapshot;
  if (snapshot != null) {
    if (!isNonEmptyString(snapshot.id)) add(violations, "MISSING_SNAPSHOT_ID");
    if (snapshot.id !== simulatedState.baseStateId) add(violations, "SNAPSHOT_ID_BASE_STATE_MISMATCH");
    if (snapshot.schemaVersion !== "ORC-SPEC-01") add(violations, "INVALID_SNAPSHOT_SCHEMA_VERSION");
    if (!Array.isArray(snapshot.planning)) add(violations, "INVALID_SNAPSHOT_PLANNING");
    if (!Array.isArray(snapshot.tasks)) add(violations, "INVALID_SNAPSHOT_TASKS");
    if (!Array.isArray(snapshot.resources)) add(violations, "INVALID_SNAPSHOT_RESOURCES");
    if (!Array.isArray(snapshot.locks)) add(violations, "INVALID_SNAPSHOT_LOCKS");
    if (!isRecord(snapshot.spaces)) add(violations, "INVALID_SNAPSHOT_SPACES");
    if (!isRecord(snapshot.availability)) add(violations, "INVALID_SNAPSHOT_AVAILABILITY");
    if (snapshot.cognitive == null) add(violations, "MISSING_SNAPSHOT_COGNITIVE_STATE");
  }

  return violations;
}

function validateHardConstraints(snapshot: OperationalState, violations: string[]): void {
  const tasks = new Map((snapshot.tasks ?? []).map((task) => [task.id, task]));
  const planning = snapshot.planning ?? [];
  const byTask = new Map<number, PlanningEntry>();
  const windows = new Map<number, { start: number; end: number; entry: PlanningEntry }>();

  for (const entry of planning) {
    if (!Number.isFinite(entry.taskId) || !isNonEmptyString(entry.startPlanned) || !isNonEmptyString(entry.endPlanned)) {
      add(violations, "INVALID_PLANNING_ENTRY");
      continue;
    }
    if (!tasks.has(entry.taskId)) add(violations, "PLANNING_REFERENCES_UNKNOWN_TASK");
    byTask.set(entry.taskId, entry);
    const start = timeToMinutes(entry.startPlanned);
    const end = timeToMinutes(entry.endPlanned);
    if (start == null || end == null) { add(violations, "INVALID_PLANNING_TIME_FORMAT"); continue; }
    if (start >= end) add(violations, "INVALID_PLANNING_TIME_RANGE");
    windows.set(entry.taskId, { start, end, entry });
  }

  const workDay = snapshot.workDay ?? snapshot.availability?.workDay;
  const dayStart = timeToMinutes(workDay?.start);
  const dayEnd = timeToMinutes(workDay?.end);
  const breaks = configuredHardBreaks(snapshot).map((b) => ({ ...b, startMin: timeToMinutes(b.start), endMin: timeToMinutes(b.end) }));
  for (const { start, end } of windows.values()) {
    if (dayStart != null && dayEnd != null && (start < dayStart || end > dayEnd)) add(violations, "PLANNING_OUTSIDE_WORK_DAY");
    for (const br of breaks) if (br.startMin != null && br.endMin != null && overlaps(start, end, br.startMin, br.endMin)) add(violations, br.code);
  }

  for (const task of snapshot.tasks ?? []) {
    const planned = byTask.get(task.id);
    if (task.status === "done" || task.status === "in_progress") {
      const wasPlanned = task.startPlanned != null && task.endPlanned != null;
      if (wasPlanned && !planned) add(violations, `PROTECTED_TASK_REMOVED:${task.status}`);
      if (planned) {
        if (planned.startPlanned !== task.startPlanned || planned.endPlanned !== task.endPlanned) add(violations, `PROTECTED_TASK_TIME_CHANGED:${task.status}`);
        if ((planned.spaceId ?? null) !== (task.spaceId ?? null)) add(violations, `PROTECTED_TASK_SPACE_CHANGED:${task.status}`);
        if (!sameNumberSet(planned.assignedResourceIds ?? [], task.assignedResourceIds ?? [])) add(violations, `PROTECTED_TASK_RESOURCES_CHANGED:${task.status}`);
      }
    }
  }

  for (const lock of snapshot.locks ?? []) {
    const task = tasks.get(lock.taskId);
    const planned = byTask.get(lock.taskId);
    if (!task) { add(violations, "LOCK_REFERENCES_UNKNOWN_TASK"); continue; }
    if (!planned) { add(violations, "LOCKED_TASK_NOT_PLANNED"); continue; }
    if ((lock.lockType === "time" || lock.lockType === "full") && (planned.startPlanned !== (lock.lockedStart ?? task.startPlanned) || planned.endPlanned !== (lock.lockedEnd ?? task.endPlanned))) add(violations, "TIME_LOCK_BROKEN");
    if ((lock.lockType === "space" || lock.lockType === "full") && (planned.spaceId ?? null) !== (task.spaceId ?? null)) add(violations, "SPACE_LOCK_BROKEN");
    if ((lock.lockType === "resource" || lock.lockType === "full") && lock.lockedResourceId != null && !(planned.assignedResourceIds ?? []).includes(lock.lockedResourceId)) add(violations, "RESOURCE_LOCK_BROKEN");
  }

  const planned = [...windows.values()];
  for (let i = 0; i < planned.length; i++) for (let j = i + 1; j < planned.length; j++) {
    const a = planned[i], b = planned[j];
    if (!overlaps(a.start, a.end, b.start, b.end)) continue;
    const ta = tasks.get(a.entry.taskId), tb = tasks.get(b.entry.taskId);
    if (ta?.contestantId != null && ta.contestantId === tb?.contestantId) add(violations, "CONTESTANT_OVERLAP");
    if (ta?.itinerantTeamId != null && ta.itinerantTeamId === tb?.itinerantTeamId) add(violations, "ITINERANT_TEAM_OVERLAP");
    if ((a.entry.assignedResourceIds ?? []).some((id) => (b.entry.assignedResourceIds ?? []).includes(id))) add(violations, "RESOURCE_OVERLAP");
    const spaceId = a.entry.spaceId ?? null;
    if (spaceId != null && spaceId === (b.entry.spaceId ?? null)) {
      const spaces = snapshot.spaces;
      const capacity = spaces?.exclusiveById?.[spaceId] === true ? 1 : Math.max(1, spaces?.concurrencyById?.[spaceId] ?? spaces?.capacityById?.[spaceId] ?? 1);
      if (capacity < 2) add(violations, "SPACE_OVERLAP");
    }
  }

  for (const task of snapshot.tasks ?? []) {
    const dependent = windows.get(task.id);
    if (!dependent) continue;
    const directIds = [...(task.dependsOnTaskIds ?? []), ...(task.dependsOnTaskId != null ? [task.dependsOnTaskId] : [])];
    for (const predecessorId of directIds) {
      const predecessor = windows.get(predecessorId);
      if (predecessor && dependent.start < predecessor.end) add(violations, "DIRECT_DEPENDENCY_BROKEN");
    }
    const templateIds = [...(task.dependsOnTemplateIds ?? []), ...(task.dependsOnTemplateId != null ? [task.dependsOnTemplateId] : [])];
    for (const templateId of templateIds) {
      for (const predecessorTask of snapshot.tasks ?? []) {
        if (predecessorTask.id === task.id || predecessorTask.templateId !== templateId) continue;
        const sameContestant = task.contestantId != null && task.contestantId === predecessorTask.contestantId;
        const sameTeam = task.itinerantTeamId != null && task.itinerantTeamId === predecessorTask.itinerantTeamId;
        if (!sameContestant && !sameTeam) continue;
        const predecessor = windows.get(predecessorTask.id);
        if (predecessor && dependent.start < predecessor.end) add(violations, "TEMPLATE_DEPENDENCY_BROKEN");
      }
    }
  }
}

function validateSimulatedState(simulatedState: SimulatedState): string[] {
  const violations = validateStructure(simulatedState);
  const snapshot = simulatedState?.operationalStateSnapshot;
  if (snapshot != null && Array.isArray(snapshot.planning) && Array.isArray(snapshot.tasks) && Array.isArray(snapshot.resources) && Array.isArray(snapshot.locks)) {
    validateHardConstraints(snapshot, violations);
  }
  return violations;
}

function buildExplanation(violatedConstraints: string[]): string {
  if (violatedConstraints.length === 0) return "SimulatedState passed hard constraints validation.";
  return `SimulatedState failed hard constraints validation: ${violatedConstraints.join(", ")}.`;
}

export function validateSimulatedStates(
  simulatedStates: SimulatedState[],
  options: ValidationEngineOptions = {},
): ValidationEngineResult {
  const validatedAt = options.createdAt ?? null;
  const validationResults: ValidationResult[] = [];
  const evidence: Evidence[] = [];

  for (const simulatedState of simulatedStates ?? []) {
    const violatedConstraints = validateSimulatedState(simulatedState);
    const result = violatedConstraints.length === 0 ? "VALID" : "INVALID";
    const simulatedStateId = isNonEmptyString(simulatedState?.id) ? simulatedState.id : "unknown";
    const explanation = buildExplanation(violatedConstraints);
    const evidenceId = `evidence:orc-validation:simulated-state:${simulatedStateId}`;

    validationResults.push(deepFreeze({
      id: `orc-validation:result:${simulatedStateId}`,
      simulatedStateId,
      result,
      violatedConstraints,
      explanation,
      validatedAt,
      evidenceIds: [evidenceId],
    }) as ValidationResult);

    evidence.push(deepFreeze({
      id: evidenceId,
      source: VALIDATION_SOURCE,
      kind: "simulated-state-validated",
      subjectId: simulatedStateId,
      createdAt: validatedAt,
      data: {
        simulatedStateId,
        result,
        violatedConstraints,
        explanation,
        validationScope: "hard-constraints-v1",
        simulationMode: simulatedState?.simulationMode ?? null,
        validatedConstraintGroups: VALIDATED_CONSTRAINT_GROUPS,
        readOnly: true,
        evaluatesCandidate: false,
        mutatesOperationalState: false,
        commitsPlanning: false,
      },
    }) as Evidence);
  }

  const validCount = validationResults.filter((validationResult) => validationResult.result === "VALID").length;
  const invalidCount = validationResults.length - validCount;

  return deepFreeze({
    validationResults,
    evidence,
    summary: {
      simulatedStateCount: (simulatedStates ?? []).length,
      validCount,
      invalidCount,
    },
  }) as ValidationEngineResult;
}
