import type { Evidence, OperationalState, SimulatedState, ValidationResult, ValidationViolationDetail, ValidationConstraintGroup } from "../contracts";
import { deepFreeze } from "../immutability";
import { configuredHardBreaks, hardBreakAppliesToPlanningEntry, protectedBreakDiagnostic, sampleViolationDetailsByCode } from "./protectedBreakScope";
import { resolveORCPlanningEntryOperationalRoleMetadata, isORCProductiveRole, occupiesContestantTime } from "../state/nonWorkTaskClassifier";
import { resolveORCMealSemantics, hardMealWindowsFromSemantics } from "../state/mealSemanticsResolver";
import { evaluateORCSpaceCapacitySemantics } from "../state/spaceCapacitySemantics";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import { resolveORCTaskDependencyGraph } from "../state/dependencySemantics";

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
const MAX_VALIDATION_DETAILS = 100;
const EVIDENCE_DETAIL_SAMPLE_SIZE = 20;

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
type WindowDetail = { start: string; end: string };
type DetailInput = Partial<Omit<ValidationViolationDetail, "code" | "constraintGroup" | "severity" | "taskIds" | "resourceIds" | "spaceIds" | "lockIds" | "breakWindow" | "timeWindow" | "relatedTimeWindow" | "message" | "diagnosticHint" | "readOnly">> & {
  code: string;
  constraintGroup: ValidationConstraintGroup;
  taskIds?: readonly number[];
  resourceIds?: readonly number[];
  spaceIds?: readonly number[];
  lockIds?: readonly string[];
  breakWindow?: ValidationViolationDetail["breakWindow"];
  timeWindow?: ValidationViolationDetail["timeWindow"];
  relatedTimeWindow?: ValidationViolationDetail["relatedTimeWindow"];
  message?: string;
  diagnosticHint?: string;
};

function detail(input: DetailInput): ValidationViolationDetail {
  return {
    code: input.code,
    constraintGroup: input.constraintGroup,
    severity: "hard",
    taskIds: [...new Set(input.taskIds ?? [])].filter(Number.isFinite),
    resourceIds: [...new Set(input.resourceIds ?? [])].filter(Number.isFinite).sort((a, b) => a - b),
    spaceIds: [...new Set(input.spaceIds ?? [])].filter(Number.isFinite).sort((a, b) => a - b),
    lockIds: [...new Set(input.lockIds ?? [])].sort(),
    breakWindow: input.breakWindow ?? null,
    timeWindow: input.timeWindow ?? null,
    relatedTimeWindow: input.relatedTimeWindow ?? null,
    message: input.message ?? input.code,
    diagnosticHint: input.diagnosticHint ?? "Inspect this hard-constraint violation before changing planning behavior.",
    ...(input.taskLabels ? { taskLabels: [...input.taskLabels] } : {}),
    ...(input.spaceLabels ? { spaceLabels: [...input.spaceLabels] } : {}),
    ...(input.resourceLabels ? { resourceLabels: [...input.resourceLabels] } : {}),
    ...((input as any).roleLabels ? { roleLabels: [...(input as any).roleLabels] } : {}),
    ...((input as any).spaceOccupancyModes ? { spaceOccupancyModes: [...(input as any).spaceOccupancyModes] } : {}),
    ...((input as any).blocksSpaceFlags ? { blocksSpaceFlags: [...(input as any).blocksSpaceFlags] } : {}),
    ...Object.fromEntries(Object.entries(input as any).filter(([key]) => !["code","constraintGroup","severity","taskIds","resourceIds","spaceIds","lockIds","breakWindow","timeWindow","relatedTimeWindow","message","diagnosticHint","taskLabels","spaceLabels","resourceLabels","roleLabels","spaceOccupancyModes","blocksSpaceFlags","readOnly"].includes(key))),
    readOnly: true,
  };
}

function windowOf(entry?: PlanningEntry | null): WindowDetail | null {
  return entry?.startPlanned && entry?.endPlanned ? { start: entry.startPlanned, end: entry.endPlanned } : null;
}

function sortDetails(details: ValidationViolationDetail[]): ValidationViolationDetail[] {
  const key = (d: ValidationViolationDetail) => [d.code, d.taskIds[0] ?? -1, d.taskIds[1] ?? -1, d.timeWindow?.start ?? "", d.timeWindow?.end ?? "", d.spaceIds[0] ?? -1, d.resourceIds[0] ?? -1, d.lockIds[0] ?? ""].join("|");
  return [...new Map(details.map((d) => [JSON.stringify(d), d])).values()].sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }));
}

function boundedDetails(details: ValidationViolationDetail[]): ValidationViolationDetail[] {
  const sorted = sortDetails(details);
  if (sorted.length <= MAX_VALIDATION_DETAILS) return sorted;
  return [
    ...sorted.slice(0, MAX_VALIDATION_DETAILS - 1),
    detail({ code: "VALIDATION_DETAILS_TRUNCATED", constraintGroup: "structure", message: "Validation diagnostics were truncated.", diagnosticHint: `${sorted.length - (MAX_VALIDATION_DETAILS - 1)} violation detail(s) were omitted to keep the result bounded.` }),
  ];
}

function hasTruncated(details: readonly ValidationViolationDetail[]): boolean {
  return details.some((item) => item.code === "VALIDATION_DETAILS_TRUNCATED");
}

function add(violations: string[], code: string): void {
  if (!violations.includes(code)) violations.push(code);
}
function addDetail(violations: string[], details: ValidationViolationDetail[], input: DetailInput): void {
  add(violations, input.code);
  details.push(detail(input));
}

function validateStructure(simulatedState: SimulatedState, details: ValidationViolationDetail[]): string[] {
  const violations: string[] = [];

  if (!isNonEmptyString(simulatedState?.id)) add(violations, "MISSING_SIMULATED_STATE_ID");
  if (!isNonEmptyString(simulatedState?.candidateStateId)) add(violations, "MISSING_CANDIDATE_STATE_ID");
  if (!isNonEmptyString(simulatedState?.baseStateId)) add(violations, "MISSING_BASE_STATE_ID");
  if (simulatedState?.operationalStateSnapshot == null) addDetail(violations, details, { code: "MISSING_OPERATIONAL_STATE_SNAPSHOT", constraintGroup: "structure" });
  if (simulatedState?.operationalStateSnapshot != null && !Object.isFrozen(simulatedState.operationalStateSnapshot)) add(violations, "MUTABLE_OPERATIONAL_STATE_SNAPSHOT");
  if (!Array.isArray(simulatedState?.appliedTransformations)) add(violations, "INVALID_APPLIED_TRANSFORMATIONS");
  if (!VALID_SIMULATION_MODES.has(String(simulatedState?.simulationMode))) addDetail(violations, details, { code: "INVALID_SIMULATION_MODE", constraintGroup: "structure" });
  if (simulatedState?.readOnly !== true) add(violations, "SIMULATED_STATE_NOT_READ_ONLY");

  const snapshot = simulatedState?.operationalStateSnapshot;
  if (snapshot != null) {
    if (!isNonEmptyString(snapshot.id)) add(violations, "MISSING_SNAPSHOT_ID");
    if (snapshot.id !== simulatedState.baseStateId) add(violations, "SNAPSHOT_ID_BASE_STATE_MISMATCH");
    if (snapshot.schemaVersion !== "ORC-SPEC-01") addDetail(violations, details, { code: "INVALID_SNAPSHOT_SCHEMA_VERSION", constraintGroup: "structure" });
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

function validateHardConstraints(snapshot: OperationalState, violations: string[], details: ValidationViolationDetail[]): void {
  const tasks = new Map((snapshot.tasks ?? []).map((task) => [task.id, task]));
  const planning = snapshot.planning ?? [];
  const byTask = new Map<number, PlanningEntry>();
  const windows = new Map<number, { start: number; end: number; entry: PlanningEntry }>();
  const transportContract = (snapshot.constraints as any)?.transportContract ?? resolveORCTransportContract(snapshot as any);
  const roleByTask = new Map<number, ReturnType<typeof resolveORCPlanningEntryOperationalRoleMetadata>>();

  for (const entry of planning) {
    if (!Number.isFinite(entry.taskId) || !isNonEmptyString(entry.startPlanned) || !isNonEmptyString(entry.endPlanned)) {
      addDetail(violations, details, { code: "INVALID_PLANNING_ENTRY", constraintGroup: "structure", taskIds: [Number(entry?.taskId)].filter(Number.isFinite) });
      continue;
    }
    if (!tasks.has(entry.taskId)) addDetail(violations, details, { code: "PLANNING_REFERENCES_UNKNOWN_TASK", constraintGroup: "structure", taskIds: [entry.taskId], timeWindow: windowOf(entry) });
    byTask.set(entry.taskId, entry);
    const start = timeToMinutes(entry.startPlanned);
    const end = timeToMinutes(entry.endPlanned);
    if (start == null || end == null) { addDetail(violations, details, { code: "INVALID_PLANNING_TIME_FORMAT", constraintGroup: "structure", taskIds: [entry.taskId], timeWindow: windowOf(entry) }); continue; }
    if (start >= end) addDetail(violations, details, { code: "INVALID_PLANNING_TIME_RANGE", constraintGroup: "structure", taskIds: [entry.taskId], timeWindow: windowOf(entry) });
    const task = tasks.get(entry.taskId);
    roleByTask.set(entry.taskId, resolveORCPlanningEntryOperationalRoleMetadata({ entry, task, mealWindow: snapshot.availability?.actualMeal ?? snapshot.availability?.meal ?? snapshot.availability?.mealWindow ?? null, transportContract }));
    windows.set(entry.taskId, { start, end, entry });
  }

  const workDay = snapshot.workDay ?? snapshot.availability?.workDay;
  const dayStart = timeToMinutes(workDay?.start);
  const dayEnd = timeToMinutes(workDay?.end);
  const mealSemantics = resolveORCMealSemantics(snapshot);
  const hardMealKeys = new Set(hardMealWindowsFromSemantics(mealSemantics).map((w) => `${w.start}|${w.end}`));
  const breaks = configuredHardBreaks(snapshot).filter((b) => b.kind !== "meal" || hardMealKeys.has(`${b.start}|${b.end}`)).map((b) => ({ ...b, startMin: timeToMinutes(b.start), endMin: timeToMinutes(b.end) }));
  for (const { start, end, entry } of windows.values()) {
    if (dayStart != null && dayEnd != null && (start < dayStart || end > dayEnd)) addDetail(violations, details, { code: "PLANNING_OUTSIDE_WORK_DAY", constraintGroup: "time", taskIds: [entry.taskId], timeWindow: windowOf(entry), diagnosticHint: "Task is planned outside the configured work day. Check V4 output, seed adapter time mapping, or work day fixture constraints." });
    for (const br of breaks) {
      if (br.startMin == null || br.endMin == null || !overlaps(start, end, br.startMin, br.endMin)) continue;
      const task = tasks.get(entry.taskId);
      const role = roleByTask.get(entry.taskId) ?? "productive_task";
      if (!isORCProductiveRole(role)) continue;
      if (!hardBreakAppliesToPlanningEntry(br, entry, task)) continue;
      const protectedDiagnostic = br.code === "PLANNING_CROSSES_PROTECTED_HARD_BREAK" ? protectedBreakDiagnostic(br) : null;
      addDetail(violations, details, {
        code: br.code,
        constraintGroup: "time",
        taskIds: [entry.taskId],
        resourceIds: br.scopeType === "resource" ? br.resourceIds : [],
        spaceIds: br.scopeType === "space" && br.spaceId != null ? [br.spaceId] : [],
        timeWindow: windowOf(entry),
        breakWindow: { start: br.start, end: br.end, kind: br.kind },
        message: protectedDiagnostic?.message,
        diagnosticHint: protectedDiagnostic?.diagnosticHint ?? "Task overlaps a configured hard break. Check whether this break should be hard for ORC, whether V4 should avoid it, or whether the seed adapter mapped the break incorrectly.",
      });
    }
  }

  for (const task of snapshot.tasks ?? []) {
    const planned = byTask.get(task.id);
    if (task.status === "done" || task.status === "in_progress") {
      const wasPlanned = task.startPlanned != null && task.endPlanned != null;
      if (wasPlanned && !planned) addDetail(violations, details, { code: `PROTECTED_TASK_REMOVED:${task.status}`, constraintGroup: "protected_tasks", taskIds: [task.id], relatedTimeWindow: task.startPlanned && task.endPlanned ? { start: task.startPlanned, end: task.endPlanned } : null, diagnosticHint: "Done or in-progress tasks are protected and must not be removed by ORC planning." });
      if (planned) {
        if (planned.startPlanned !== task.startPlanned || planned.endPlanned !== task.endPlanned) addDetail(violations, details, { code: `PROTECTED_TASK_TIME_CHANGED:${task.status}`, constraintGroup: "protected_tasks", taskIds: [task.id], timeWindow: windowOf(planned), relatedTimeWindow: task.startPlanned && task.endPlanned ? { start: task.startPlanned, end: task.endPlanned } : null, diagnosticHint: "Done or in-progress task time windows are protected and must not be changed." });
        if ((planned.spaceId ?? null) !== (task.spaceId ?? null)) addDetail(violations, details, { code: `PROTECTED_TASK_SPACE_CHANGED:${task.status}`, constraintGroup: "protected_tasks", taskIds: [task.id], spaceIds: [Number(planned.spaceId ?? task.spaceId)].filter(Number.isFinite), timeWindow: windowOf(planned), diagnosticHint: "Done or in-progress task spaces are protected and must not be changed." });
        if (!sameNumberSet(planned.assignedResourceIds ?? [], task.assignedResourceIds ?? [])) addDetail(violations, details, { code: `PROTECTED_TASK_RESOURCES_CHANGED:${task.status}`, constraintGroup: "protected_tasks", taskIds: [task.id], resourceIds: [...(planned.assignedResourceIds ?? []), ...(task.assignedResourceIds ?? [])], timeWindow: windowOf(planned), diagnosticHint: "Done or in-progress task resources are protected and must not be changed." });
      }
    }
  }

  for (const lock of snapshot.locks ?? []) {
    const task = tasks.get(lock.taskId);
    const planned = byTask.get(lock.taskId);
    if (!task) { addDetail(violations, details, { code: "LOCK_REFERENCES_UNKNOWN_TASK", constraintGroup: "locks", taskIds: [lock.taskId], lockIds: [String(lock.id ?? lock.taskId)] }); continue; }
    if (!planned) { addDetail(violations, details, { code: "LOCKED_TASK_NOT_PLANNED", constraintGroup: "locks", taskIds: [lock.taskId], lockIds: [String(lock.id ?? lock.taskId)] }); continue; }
    if ((lock.lockType === "time" || lock.lockType === "full") && (planned.startPlanned !== (lock.lockedStart ?? task.startPlanned) || planned.endPlanned !== (lock.lockedEnd ?? task.endPlanned))) addDetail(violations, details, { code: "TIME_LOCK_BROKEN", constraintGroup: "locks", taskIds: [lock.taskId], lockIds: [String(lock.id ?? lock.taskId)], timeWindow: windowOf(planned), relatedTimeWindow: (lock.lockedStart ?? task.startPlanned) && (lock.lockedEnd ?? task.endPlanned) ? { start: (lock.lockedStart ?? task.startPlanned)!, end: (lock.lockedEnd ?? task.endPlanned)! } : null, diagnosticHint: "Locked task time differs from its locked window. Verify locks, V4 output, or seed adapter lock mapping." });
    if ((lock.lockType === "space" || lock.lockType === "full") && (planned.spaceId ?? null) !== (task.spaceId ?? null)) addDetail(violations, details, { code: "SPACE_LOCK_BROKEN", constraintGroup: "locks", taskIds: [lock.taskId], lockIds: [String(lock.id ?? lock.taskId)], spaceIds: [Number(planned.spaceId ?? task.spaceId)].filter(Number.isFinite), timeWindow: windowOf(planned), diagnosticHint: "Locked task space differs from its protected space. Verify locks, V4 output, or seed adapter lock mapping." });
    if ((lock.lockType === "resource" || lock.lockType === "full") && lock.lockedResourceId != null && !(planned.assignedResourceIds ?? []).includes(lock.lockedResourceId)) addDetail(violations, details, { code: "RESOURCE_LOCK_BROKEN", constraintGroup: "locks", taskIds: [lock.taskId], lockIds: [String(lock.id ?? lock.taskId)], resourceIds: [lock.lockedResourceId], timeWindow: windowOf(planned), diagnosticHint: "Locked task resource is missing from planning. Verify locks, V4 output, or seed adapter lock mapping." });
  }

  const planned = [...windows.values()];
  for (let i = 0; i < planned.length; i++) for (let j = i + 1; j < planned.length; j++) {
    const a = planned[i], b = planned[j];
    if (!overlaps(a.start, a.end, b.start, b.end)) continue;
    const ta = tasks.get(a.entry.taskId), tb = tasks.get(b.entry.taskId);
    const roleA = roleByTask.get(a.entry.taskId) ?? resolveORCPlanningEntryOperationalRoleMetadata({ entry: a.entry, task: ta, transportContract });
    const roleB = roleByTask.get(b.entry.taskId) ?? resolveORCPlanningEntryOperationalRoleMetadata({ entry: b.entry, task: tb, transportContract });
    const productivePair = isORCProductiveRole(roleA) && isORCProductiveRole(roleB);
    if (occupiesContestantTime({ task: ta, entry: a.entry, roleMetadata: roleA, mealWindow: snapshot.availability?.actualMeal ?? snapshot.availability?.meal ?? snapshot.availability?.mealWindow ?? null, transportContract }) && occupiesContestantTime({ task: tb, entry: b.entry, roleMetadata: roleB, mealWindow: snapshot.availability?.actualMeal ?? snapshot.availability?.meal ?? snapshot.availability?.mealWindow ?? null, transportContract }) && ta?.contestantId != null && Number(ta.contestantId) > 0 && ta.contestantId === tb?.contestantId) addDetail(violations, details, { code: "CONTESTANT_OVERLAP", constraintGroup: "contestants_and_teams", taskIds: [a.entry.taskId, b.entry.taskId], timeWindow: windowOf(a.entry), relatedTimeWindow: windowOf(b.entry), diagnosticHint: "Two tasks for the same contestant overlap. Check V4 sequencing, fixture timing, or seed adapter mapping." });
    if (productivePair && ta?.itinerantTeamId != null && ta.itinerantTeamId === tb?.itinerantTeamId) addDetail(violations, details, { code: "ITINERANT_TEAM_OVERLAP", constraintGroup: "contestants_and_teams", taskIds: [a.entry.taskId, b.entry.taskId], timeWindow: windowOf(a.entry), relatedTimeWindow: windowOf(b.entry), diagnosticHint: "Two tasks for the same itinerant team overlap. Check V4 sequencing, fixture timing, or seed adapter mapping." });
    const sharedResources = (a.entry.assignedResourceIds ?? []).filter((id) => (b.entry.assignedResourceIds ?? []).includes(id));
    if (productivePair && sharedResources.length > 0) addDetail(violations, details, { code: "RESOURCE_OVERLAP", constraintGroup: "resources", taskIds: [a.entry.taskId, b.entry.taskId], resourceIds: sharedResources, timeWindow: windowOf(a.entry), relatedTimeWindow: windowOf(b.entry), diagnosticHint: "Two overlapping tasks share a resource. Check V4 resource assignment, fixture resource availability, or seed adapter mapping." });
  }
  for (const violation of evaluateORCSpaceCapacitySemantics({ entries: planning as any, tasks: tasks as any, spaces: snapshot.spaces, mealWindow: snapshot.availability?.actualMeal ?? snapshot.availability?.meal ?? snapshot.availability?.mealWindow ?? null, transportContract })) {
    addDetail(violations, details, { code: "SPACE_OVERLAP", constraintGroup: "spaces", taskIds: violation.taskIds, spaceIds: [violation.spaceId], timeWindow: { start: violation.start, end: violation.end }, relatedTimeWindow: { start: violation.start, end: violation.end }, message: `Space ${violation.spaceId} has ${violation.occupied} concurrent occupancies with effective capacity ${violation.capacity}.`, diagnosticHint: "Space capacity uses canonical concurrent cardinality semantics.", roleLabels: violation.roleLabels, spaceOccupancyModes: violation.spaceOccupancyModes, blocksSpaceFlags: violation.blocksSpaceFlags, spaceCapacity: violation.capacity, spaceConcurrentOccupancy: violation.occupied, spaceContractSource: violation.spaceContractSource ?? null, transportContractSource: transportContract.source ?? null } as any);
  }

  const transportGroups = new Map<string, any[]>();
  for (const item of planned) {
    const task = tasks.get(item.entry.taskId);
    const role = roleByTask.get(item.entry.taskId) ?? resolveORCPlanningEntryOperationalRoleMetadata({ entry: item.entry, task, transportContract });
    if (role.role !== "transport_arrival" && role.role !== "transport_departure") continue;
    const spaceKey = item.entry.spaceId == null ? "no-space" : String(item.entry.spaceId);
    const key = `${role.role}|${spaceKey}|${item.entry.startPlanned}|${item.entry.endPlanned}`;
    const group = transportGroups.get(key) ?? []; group.push({ item, role }); transportGroups.set(key, group);
  }
  for (const group of transportGroups.values()) {
    const capacity = Math.max(1, Number(group[0]?.role?.transportGroupCapacity ?? transportContract.vehicleCapacity ?? 1));
    if (group.length > capacity) addDetail(violations, details, { code: "TRANSPORT_GROUP_CAPACITY_EXCEEDED", constraintGroup: "spaces", taskIds: group.map((g) => g.item.entry.taskId).sort((a,b)=>a-b), spaceIds: [group[0]?.item.entry.spaceId].filter((v) => v != null), timeWindow: windowOf(group[0].item.entry), relatedTimeWindow: windowOf(group[0].item.entry), message: `Transport group capacity ${capacity} exceeded by ${group.length} tasks.`, diagnosticHint: "Transport template occupancy exceeds configured vehicleCapacity.", roleLabels: group.map((g) => g.role.role), spaceOccupancyModes: group.map(() => "shared"), blocksSpaceFlags: group.map(() => false), transportGroupCapacity: capacity, transportGroupCount: group.length, transportContractSource: transportContract.source ?? null } as any);
  }


  const dependencyGraph = resolveORCTaskDependencyGraph(snapshot.tasks ?? []);
  const taskById = new Map((snapshot.tasks ?? []).map((task) => [task.id, task]));
  for (const edge of dependencyGraph.edges) {
    const dependent = windows.get(edge.toTaskId);
    const predecessor = windows.get(edge.fromTaskId);
    if (!dependent || !predecessor || dependent.start >= predecessor.end) continue;
    const code = edge.sourceTypes.includes("template") && !edge.sourceTypes.includes("explicit_task") ? "TEMPLATE_DEPENDENCY_BROKEN" : "DIRECT_DEPENDENCY_BROKEN";
    addDetail(violations, details, { code, constraintGroup: "dependencies", taskIds: [edge.toTaskId, edge.fromTaskId], timeWindow: windowOf(dependent.entry), relatedTimeWindow: windowOf(predecessor.entry), diagnosticHint: code === "TEMPLATE_DEPENDENCY_BROKEN" ? "Dependent task starts before predecessor template finishes. Dependency semantics are resolved through shared ORC canonical dependency graph." : "Dependent task starts before predecessor finishes. Dependency semantics are resolved through shared ORC canonical dependency graph.", dependencySourceTypes: edge.sourceTypes, dependentTemplateId: (taskById.get(edge.toTaskId) as any)?.templateId ?? null, predecessorTemplateId: (taskById.get(edge.fromTaskId) as any)?.templateId ?? null } as any);
  }

}

function validateSimulatedState(simulatedState: SimulatedState): { violatedConstraints: string[]; violationDetails: ValidationViolationDetail[] } {
  const details: ValidationViolationDetail[] = [];
  const violations = validateStructure(simulatedState, details);
  const snapshot = simulatedState?.operationalStateSnapshot;
  if (snapshot != null && Array.isArray(snapshot.planning) && Array.isArray(snapshot.tasks) && Array.isArray(snapshot.resources) && Array.isArray(snapshot.locks)) {
    validateHardConstraints(snapshot, violations, details);
  }
  return { violatedConstraints: violations, violationDetails: boundedDetails(details) };
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
    const validationDiagnostics = validateSimulatedState(simulatedState);
    const violatedConstraints = validationDiagnostics.violatedConstraints;
    const violationDetails = validationDiagnostics.violationDetails;
    const result = violatedConstraints.length === 0 ? "VALID" : "INVALID";
    const simulatedStateId = isNonEmptyString(simulatedState?.id) ? simulatedState.id : "unknown";
    const explanation = buildExplanation(violatedConstraints);
    const evidenceId = `evidence:orc-validation:simulated-state:${simulatedStateId}`;

    validationResults.push(deepFreeze({
      id: `orc-validation:result:${simulatedStateId}`,
      simulatedStateId,
      result,
      violatedConstraints,
      violationDetails,
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
        violationDetailCount: violationDetails.length,
        violationDetailsSample: sampleViolationDetailsByCode(violationDetails, { maxTotal: EVIDENCE_DETAIL_SAMPLE_SIZE }),
        scopedProtectedBreakValidation: true,
        validationSemanticsVersion: "orc-baseline-viability-semantics-v1",
        mealSemanticsMode: resolveORCMealSemantics(simulatedState?.operationalStateSnapshot as any).mode,
        violationDetailsTruncated: hasTruncated(violationDetails),
        explanation,
        validationScope: "hard-constraints-v2-diagnostics",
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
