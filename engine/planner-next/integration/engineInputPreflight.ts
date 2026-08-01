import { createHash } from "node:crypto";
import type { EngineInput, LockInput, TaskInput, TimeWindow } from "../../types";

export type EngineInputPreflightStatus = "SUPPORTED" | "UNSUPPORTED";
export type EngineInputPreflightReasonCode =
  | "UNSUPPORTED_TASK_ROLE" | "UNSUPPORTED_TASK_STATUS" | "UNSUPPORTED_TIME_VALUE" | "UNSUPPORTED_TIME_GRID"
  | "UNSUPPORTED_LOCK_TYPE" | "UNREPRESENTABLE_TIME_LOCK" | "UNREPRESENTABLE_SPACE_LOCK" | "UNREPRESENTABLE_RESOURCE_LOCK"
  | "MISSING_PARTICIPANT_REFERENCE" | "MISSING_COACH_REFERENCE" | "MISSING_SPACE_REFERENCE" | "MISSING_RESOURCE_REFERENCE"
  | "MISSING_DEPENDENCY_REFERENCE" | "DEPENDENCY_CYCLE" | "UNSUPPORTED_SPACE_CAPACITY" | "UNSUPPORTED_RESOURCE_REQUIREMENT"
  | "UNSUPPORTED_BREAK_SCOPE" | "INCOMPLETE_ANCHORED_OPERATION" | "AMBIGUOUS_ANCHORED_OPERATION"
  | "MISSING_SEARCH_POLICY_CONFIGURATION" | "INVALID_SEARCH_BUDGET" | "PROTECTED_TASK_WITHOUT_FIXED_PLANNING"
  | "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE" | "DUPLICATE_ID" | "PLAN_ID_MISMATCH" | "MISSING_TASK_DURATION"
  | "MISSING_MAIN_FLOW_CONFIGURATION" | "MISSING_SEARCH_BUDGET_CONFIGURATION" | "MISSING_SPACE_AVAILABILITY"
  | "MISSING_RESOURCE_AVAILABILITY" | "MISSING_PARTICIPANT_AVAILABILITY" | "UNSUPPORTED_TRANSPORT_CONTRACT"
  | "UNSUPPORTED_SETUP_MAPPING";

export type EngineInputIdentityNamespace = "plan" | "task" | "lock" | "participant" | "space" | "zone" |
  "plan-resource" | "resource-item" | "resource-type" | "template" | "itinerant-team" | "break";
export interface EngineInputIdentity { namespace: EngineInputIdentityNamespace; sourceId: string; canonicalId: string }
export interface EngineInputPreflightIssue { code: EngineInputPreflightReasonCode; entityKind: string; entityId: string; path: string; message: string; blocking: true; details?: Readonly<Record<string, unknown>> }
export interface EngineInputPreflightDiagnostics {
  taskCount: number; planifiableTaskCount: number; protectedTaskCount: number; cancelledTaskCount: number;
  pendingPlanningDiscardCount: number; lockCount: number; participantCount: number; spaceCount: number; zoneCount: number;
  planResourceCount: number; resourceItemCount: number; dependencyCount: number; breakCount: number;
  transportConfigured: boolean; setupConfigurationDetected: boolean; mainFlowConfigurationComplete: boolean;
  searchPolicyConfigurationPresent: boolean; searchBudgetConfigurationComplete: boolean; timeGridVerifiable: boolean;
  anchoredOperationContractPresent: boolean; unresolvedTaskRoleCount: number; missingDurationTaskCount: number;
  missingAvailabilityCounts: Readonly<{ participants: number; spaces: number; resources: number }>;
  unsupportedCapabilityCodes: readonly EngineInputPreflightReasonCode[]; readOnly: true;
}
export interface EngineInputPreflightResult {
  status: EngineInputPreflightStatus; identityMap: readonly EngineInputIdentity[]; diagnostics: EngineInputPreflightDiagnostics;
  issues: readonly EngineInputPreflightIssue[]; reasonCodes: readonly EngineInputPreflightReasonCode[];
  sourceFingerprint: string; identityMapFingerprint: string; readOnly: true;
}

const prefixes: Record<EngineInputIdentityNamespace, string> = {
  plan: "plan", task: "task", lock: "lock", participant: "participant", space: "space", zone: "zone",
  "plan-resource": "plan-resource", "resource-item": "resource-item", "resource-type": "resource-type",
  template: "template", "itinerant-team": "itinerant-team", break: "break",
};
const semanticNameKeys = new Set(["name", "label", "templateName", "contestantName", "typeName", "mealTaskTemplateName", "arrivalTaskTemplateName", "departureTaskTemplateName", "arrivalTemplateName", "departureTemplateName", "spaceNameById", "taskTemplateNameById"]);
const cmp = (a: string, b: string) => a.localeCompare(b, "en");
const stable = (value: unknown, omitNames = false): unknown => {
  if (Array.isArray(value)) return value.map(v => stable(v, omitNames)).sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, v]) => v !== undefined && !(omitNames && semanticNameKeys.has(key)))
    .sort(([a], [b]) => cmp(a, b)).map(([key, v]) => [key, stable(v, omitNames)]));
  return value;
};
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
};
const minutes = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number); return h * 60 + m;
};

export function preflightEngineInputForPlannerNext(input: EngineInput): EngineInputPreflightResult {
  const issues: EngineInputPreflightIssue[] = [];
  const add = (code: EngineInputPreflightReasonCode, entityKind: string, entityId: unknown, path: string, message: string, details?: Record<string, unknown>) =>
    issues.push({ code, entityKind, entityId: String(entityId ?? "input"), path, message, blocking: true, ...(details ? { details: stable(details) as Record<string, unknown> } : {}) });
  const ids = new Map<EngineInputIdentityNamespace, Set<string>>();
  const identityMap: EngineInputIdentity[] = [];
  const identity = (namespace: EngineInputIdentityNamespace, raw: unknown, path: string, uniqueDefinition = false) => {
    if (raw === null || raw === undefined || raw === "") return;
    const sourceId = String(raw); const set = ids.get(namespace) ?? new Set<string>();
    if (set.has(sourceId)) { if (uniqueDefinition) add("DUPLICATE_ID", namespace, sourceId, path, "Duplicate identifier in source namespace.", { namespace }); }
    else { set.add(sourceId); ids.set(namespace, set); identityMap.push({ namespace, sourceId, canonicalId: `${prefixes[namespace]}:${sourceId}` }); }
  };
  identity("plan", input.planId, "planId");
  input.tasks.forEach(t => { const p = `tasks.${t.id}`; identity("task", t.id, `${p}.id`, true); identity("template", t.templateId, `${p}.templateId`); identity("participant", t.contestantId, `${p}.contestantId`); identity("space", t.spaceId, `${p}.spaceId`); identity("zone", t.zoneId, `${p}.zoneId`); identity("itinerant-team", t.itinerantTeamId, `${p}.itinerantTeamId`); identity("break", t.breakId, `${p}.breakId`); });
  input.locks.forEach(l => identity("lock", l.id, `locks.${l.id}.id`, true));
  input.planResourceItems.forEach(r => { const p = `planResourceItems.${r.id}`; identity("plan-resource", r.id, `${p}.id`, true); identity("resource-item", r.resourceItemId, `${p}.resourceItemId`, true); identity("resource-type", r.typeId, `${p}.typeId`); });
  input.protectedBreaks?.forEach(b => { const p = `protectedBreaks.${b.id ?? `${b.start}-${b.end}`}`; identity("break", b.id, `${p}.id`, true); identity("participant", b.contestantId, `${p}.contestantId`); identity("space", b.spaceId, `${p}.spaceId`); identity("zone", b.zoneId, `${p}.zoneId`); identity("itinerant-team", b.itinerantTeamId, `${p}.itinerantTeamId`); });
  const mapIds = (ns: EngineInputIdentityNamespace, map: unknown, path: string) => Object.keys((map ?? {}) as object).forEach(k => identity(ns, k, `${path}.${k}`));
  mapIds("participant", input.contestantAvailabilityById, "contestantAvailabilityById"); mapIds("space", input.spaceParentById, "spaceParentById");
  [input.spaceCapacityById, input.spaceConcurrencyById, input.spaceIsExclusiveById, input.zoneIdBySpaceId, input.spaceResourceAssignments, input.spaceResourceTypeRequirements, input.groupingBySpaceId, input.minimizeChangesBySpace].forEach((m, i) => mapIds("space", m, `spaceMaps[${i}]`));
  [input.zoneResourceAssignments, input.zoneResourceTypeRequirements].forEach((m, i) => mapIds("zone", m, `zoneMaps[${i}]`));
  identityMap.sort((a, b) => cmp(`${a.namespace}\0${a.sourceId}`, `${b.namespace}\0${b.sourceId}`));

  const dayStart = minutes(input.workDay?.start), dayEnd = minutes(input.workDay?.end);
  const interval = (w: TimeWindow | undefined, entityKind: string, entityId: unknown, path: string, contained = true) => {
    if (!w) return false; const start = minutes(w.start), end = minutes(w.end);
    if (start === null || end === null || start >= end || (contained && dayStart !== null && dayEnd !== null && (start < dayStart || end > dayEnd))) {
      add("UNSUPPORTED_TIME_VALUE", entityKind, entityId, path, "Time interval is invalid or outside the work day.", { start: w.start, end: w.end }); return false;
    } return true;
  };
  interval(input.workDay, "plan", input.planId, "workDay", false); interval(input.meal, "plan", input.planId, "meal");
  interval(input.mealWindow, "plan", input.planId, "mealWindow"); interval(input.actualMeal, "break", input.actualMeal?.id, "actualMeal");
  input.globalHardBreaks?.forEach(b => interval(b, "break", `${b.start}-${b.end}`, `globalHardBreaks.${b.start}-${b.end}`));
  input.protectedBreaks?.forEach(b => { const id = b.id ?? `${b.start}-${b.end}`, path = `protectedBreaks.${id}`; interval(b, "break", id, path); if (b.contestantId != null || b.spaceId != null || b.zoneId != null || b.itinerantTeamId != null) add("UNSUPPORTED_BREAK_SCOPE", "break", id, path, "Scoped break cannot be translated exactly."); });
  Object.entries(input.contestantAvailabilityById ?? {}).forEach(([id, w]) => interval(w, "participant", id, `contestantAvailabilityById.${id}`));

  const taskById = new Map(input.tasks.map(t => [String(t.id), t])); let dependencyCount = 0;
  const dependencies = new Map<string, string[]>();
  let unresolvedTaskRoleCount = 0, missingDurationTaskCount = 0, pendingPlanningDiscardCount = 0;
  const validStatuses = new Set(["pending", "interrupted", "in_progress", "done", "cancelled"]);
  for (const t of input.tasks) {
    if (t.planId !== input.planId) add("PLAN_ID_MISMATCH", "task", t.id, `tasks.${t.id}.planId`, "Task belongs to another plan.");
    if (!validStatuses.has(t.status)) add("UNSUPPORTED_TASK_STATUS", "task", t.id, `tasks.${t.id}.status`, "Task status is not supported.");
    if (t.status !== "cancelled") { unresolvedTaskRoleCount++; add("UNSUPPORTED_TASK_ROLE", "task", t.id, `tasks.${t.id}.operationalRole`, "Planner Next task kind is not explicitly available."); }
    if (t.status === "pending" || t.status === "interrupted") {
      if (t.startPlanned != null || t.endPlanned != null) pendingPlanningDiscardCount++;
      if (!(typeof t.durationOverrideMin === "number" && t.durationOverrideMin > 0)) { missingDurationTaskCount++; add("MISSING_TASK_DURATION", "task", t.id, `tasks.${t.id}.durationOverrideMin`, "No explicit authoritative positive duration is available."); }
      else if (t.durationOverrideMin <= 0) add("UNSUPPORTED_TIME_VALUE", "task", t.id, `tasks.${t.id}.durationOverrideMin`, "Duration must be positive.");
    }
    if (t.fixedWindowStart != null || t.fixedWindowEnd != null) interval({ start: t.fixedWindowStart ?? "", end: t.fixedWindowEnd ?? "" }, "task", t.id, `tasks.${t.id}.fixedWindow`);
    if (t.status === "done" || t.status === "in_progress") {
      const start = t.startReal ?? t.startPlanned, end = t.endReal ?? t.endPlanned;
      if (!start || !end || t.spaceId == null) add("PROTECTED_TASK_WITHOUT_FIXED_PLANNING", "task", t.id, `tasks.${t.id}`, "Protected task lacks complete fixed planning.");
      else if (!interval({ start, end }, "task", t.id, `tasks.${t.id}.protectedPlanning`)) add("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", t.id, `tasks.${t.id}`, "Protected planning cannot be preserved exactly.");
    }
    const deps = t.dependsOnTaskIds != null ? t.dependsOnTaskIds : (t.dependsOnTaskId != null ? [t.dependsOnTaskId] : []);
    const normalized = [...new Set(deps.map(String))].sort(cmp); dependencies.set(String(t.id), normalized); dependencyCount += normalized.length;
    if (normalized.length !== deps.length || normalized.includes(String(t.id))) add("DEPENDENCY_CYCLE", "task", t.id, `tasks.${t.id}.dependsOnTaskIds`, "Dependency is duplicated or self-referential.");
    normalized.filter(id => !taskById.has(id)).forEach(id => add("MISSING_DEPENDENCY_REFERENCE", "task", t.id, `tasks.${t.id}.dependsOnTaskIds`, "Dependency references an unknown task.", { dependencyTaskId: id }));
    if (t.contestantId == null && t.status !== "cancelled") add("MISSING_PARTICIPANT_REFERENCE", "task", t.id, `tasks.${t.id}.contestantId`, "Participant relationship is absent.");
    if (t.contestantId != null && !(String(t.contestantId) in (input.contestantAvailabilityById ?? {}))) add("MISSING_PARTICIPANT_AVAILABILITY", "participant", t.contestantId, `contestantAvailabilityById.${t.contestantId}`, "Participant availability is absent.");
    if (t.spaceId == null && t.status !== "cancelled") add("MISSING_SPACE_REFERENCE", "task", t.id, `tasks.${t.id}.spaceId`, "Physical space relationship is absent.");
    for (const rid of t.assignedResourceIds ?? []) if (!input.planResourceItems.some(r => r.id === rid)) add("MISSING_RESOURCE_REFERENCE", "task", t.id, `tasks.${t.id}.assignedResourceIds`, "Assigned plan resource is unknown.", { resourceId: rid });
    const req = t.resourceRequirements; if (req?.anyOf?.length || Object.values(req?.byItem ?? {}).some(q => q !== 1) || Object.values(req?.byType ?? {}).some(q => q !== 1) || (t.camerasOverride ?? 0) > 1) add("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", t.id, `tasks.${t.id}.resourceRequirements`, "Resource alternatives, types, or quantities cannot be translated losslessly.");
    Object.keys(req?.byItem ?? {}).filter(id => !input.planResourceItems.some(r => String(r.resourceItemId) === id)).forEach(id => add("MISSING_RESOURCE_REFERENCE", "task", t.id, `tasks.${t.id}.resourceRequirements.byItem.${id}`, "Catalog resource item is unknown."));
    Object.keys(req?.byType ?? {}).filter(id => !input.planResourceItems.some(r => String(r.typeId) === id)).forEach(id => add("MISSING_RESOURCE_REFERENCE", "task", t.id, `tasks.${t.id}.resourceRequirements.byType.${id}`, "Resource type is unknown."));
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const cycle = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); const found = (dependencies.get(id) ?? []).some(d => taskById.has(d) && cycle(d)); visiting.delete(id); visited.add(id); return found; };
  [...dependencies.keys()].sort(cmp).forEach(id => { if (cycle(id)) add("DEPENDENCY_CYCLE", "task", id, `tasks.${id}.dependsOnTaskIds`, "Dependency graph contains a cycle."); });

  const resourceIds = new Set(input.planResourceItems.map(r => String(r.id)));
  for (const l of input.locks) {
    if (l.planId !== input.planId) add("PLAN_ID_MISMATCH", "lock", l.id, `locks.${l.id}.planId`, "Lock belongs to another plan.");
    if (!taskById.has(String(l.taskId))) add("MISSING_DEPENDENCY_REFERENCE", "lock", l.id, `locks.${l.id}.taskId`, "Lock references an unknown task.");
    if (!["time", "space", "resource", "full"].includes(l.lockType)) add("UNSUPPORTED_LOCK_TYPE", "lock", l.id, `locks.${l.id}.lockType`, "Lock type is unknown.");
    if (l.lockType === "time" || l.lockType === "full") { if (!l.lockedStart || !l.lockedEnd || !interval({ start: l.lockedStart ?? "", end: l.lockedEnd ?? "" }, "lock", l.id, `locks.${l.id}.time`)) add("UNREPRESENTABLE_TIME_LOCK", "lock", l.id, `locks.${l.id}`, "Time lock is incomplete or invalid."); }
    if (l.lockType === "space" || l.lockType === "full") add("UNREPRESENTABLE_SPACE_LOCK", "lock", l.id, `locks.${l.id}`, "Lock has no explicit locked-space contract.");
    if (l.lockType === "resource" || (l.lockType === "full" && l.lockedResourceId != null)) { if (l.lockedResourceId == null || !resourceIds.has(String(l.lockedResourceId))) add("UNREPRESENTABLE_RESOURCE_LOCK", "lock", l.id, `locks.${l.id}.lockedResourceId`, "Resource lock is incomplete or references an unknown plan resource."); }
  }
  const spaces = ids.get("space")?.size ?? 0, participants = ids.get("participant")?.size ?? 0;
  const availableParticipants = Object.keys(input.contestantAvailabilityById ?? {}).length;
  if (spaces) add("MISSING_SPACE_AVAILABILITY", "plan", input.planId, "spaces", "EngineInput has no explicit physical-space availability contract.");
  const capacities = { ...(input.spaceCapacityById ?? {}), ...(input.spaceConcurrencyById ?? {}) }; Object.entries(capacities).filter(([, n]) => n > 1).forEach(([id, n]) => add("UNSUPPORTED_SPACE_CAPACITY", "space", id, `spaceCapacityById.${id}`, "Space capacity above one is not representable.", { capacity: n }));
  input.planResourceItems.forEach(r => add("MISSING_RESOURCE_AVAILABILITY", "plan-resource", r.id, `planResourceItems.${r.id}.isAvailable`, "Boolean availability is not a temporal availability contract."));
  add("UNSUPPORTED_TIME_GRID", "plan", input.planId, "timeGrid", "No exported authoritative Planner Next time-grid contract exists.");
  add("MISSING_MAIN_FLOW_CONFIGURATION", "plan", input.planId, "mainFlow", "EngineInput lacks the complete explicit Planner Next main-flow contract.");
  add("MISSING_SEARCH_POLICY_CONFIGURATION", "plan", input.planId, "searchPolicy", "EngineInput does not carry normalized Planner Next search policy.");
  add("MISSING_SEARCH_BUDGET_CONFIGURATION", "plan", input.planId, "searchBudget", "EngineInput does not carry complete Planner Next search budget.");
  const transportConfigured = Boolean(input.transportSettings || input.transportSpaceId != null || input.transportVanCapacity != null || input.vanCapacity != null || input.arrivalGroupingTarget != null || input.departureGroupingTarget != null || input.tasks.some(t => t.operationalRole === "transport_arrival" || t.operationalRole === "transport_departure"));
  if (transportConfigured) add("UNSUPPORTED_TRANSPORT_CONTRACT", "plan", input.planId, "transportSettings", "Planner Next has no equivalent transport contract.");
  const setupConfigurationDetected = Boolean(Object.keys(input.groupingBySpaceId ?? {}).length || Object.keys(input.minimizeChangesBySpace ?? {}).length || input.optimizerGroupBySpaceAndTemplate || Object.keys(input.maxTemplateChangesByZoneId ?? {}).length);
  if (setupConfigurationDetected) add("UNSUPPORTED_SETUP_MAPPING", "plan", input.planId, "groupingBySpaceId", "No explicit reversible setup-family mapping exists.");
  issues.sort((a, b) => cmp(`${a.code}\0${a.entityKind}\0${a.entityId}\0${a.path}`, `${b.code}\0${b.entityKind}\0${b.entityId}\0${b.path}`));
  const reasonCodes = [...new Set(issues.map(i => i.code))].sort(cmp);
  const diagnostics: EngineInputPreflightDiagnostics = {
    taskCount: input.tasks.length, planifiableTaskCount: input.tasks.filter(t => t.status === "pending" || t.status === "interrupted").length,
    protectedTaskCount: input.tasks.filter(t => t.status === "done" || t.status === "in_progress").length, cancelledTaskCount: input.tasks.filter(t => t.status === "cancelled").length,
    pendingPlanningDiscardCount, lockCount: input.locks.length, participantCount: participants, spaceCount: spaces, zoneCount: ids.get("zone")?.size ?? 0,
    planResourceCount: ids.get("plan-resource")?.size ?? 0, resourceItemCount: ids.get("resource-item")?.size ?? 0, dependencyCount,
    breakCount: (input.globalHardBreaks?.length ?? 0) + (input.protectedBreaks?.length ?? 0) + (input.actualMeal ? 1 : 0), transportConfigured, setupConfigurationDetected,
    mainFlowConfigurationComplete: false, searchPolicyConfigurationPresent: false, searchBudgetConfigurationComplete: false, timeGridVerifiable: false,
    anchoredOperationContractPresent: false, unresolvedTaskRoleCount, missingDurationTaskCount,
    missingAvailabilityCounts: { participants: Math.max(0, participants - availableParticipants), spaces, resources: input.planResourceItems.length },
    unsupportedCapabilityCodes: reasonCodes.filter(c => c.startsWith("UNSUPPORTED_") || c.startsWith("UNREPRESENTABLE_")), readOnly: true,
  };
  const sourceProjection = stable(input, true);
  return deepFreeze({ status: issues.length ? "UNSUPPORTED" : "SUPPORTED", identityMap, diagnostics, issues, reasonCodes,
    sourceFingerprint: sha(sourceProjection), identityMapFingerprint: sha(identityMap), readOnly: true });
}
