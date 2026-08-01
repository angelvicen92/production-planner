import { createHash } from "node:crypto";
import type { EngineInput, ProtectedBreakInput, TimeWindow } from "../../types";

export type EngineInputPreflightStatus = "SUPPORTED" | "UNSUPPORTED";

export type EngineInputPreflightReasonCode =
  | "AMBIGUOUS_ANCHORED_OPERATION"
  | "DEPENDENCY_CYCLE"
  | "DUPLICATE_DEPENDENCY_REFERENCE"
  | "DUPLICATE_ID"
  | "INCOMPLETE_ANCHORED_OPERATION"
  | "INVALID_SEARCH_BUDGET"
  | "MISSING_COACH_REFERENCE"
  | "MISSING_DEPENDENCY_REFERENCE"
  | "MISSING_MAIN_FLOW_CONFIGURATION"
  | "MISSING_PARTICIPANT_AVAILABILITY"
  | "MISSING_PARTICIPANT_REFERENCE"
  | "MISSING_RESOURCE_AVAILABILITY"
  | "MISSING_RESOURCE_REFERENCE"
  | "MISSING_SEARCH_BUDGET_CONFIGURATION"
  | "MISSING_SEARCH_POLICY_CONFIGURATION"
  | "MISSING_SPACE_AVAILABILITY"
  | "MISSING_SPACE_REFERENCE"
  | "MISSING_TASK_DURATION"
  | "MISSING_TASK_REFERENCE"
  | "PLAN_ID_MISMATCH"
  | "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE"
  | "PROTECTED_TASK_WITHOUT_FIXED_PLANNING"
  | "UNREPRESENTABLE_RESOURCE_LOCK"
  | "UNREPRESENTABLE_SPACE_LOCK"
  | "UNREPRESENTABLE_TIME_LOCK"
  | "UNSUPPORTED_BREAK_SCOPE"
  | "UNSUPPORTED_LOCK_TYPE"
  | "UNSUPPORTED_RESOURCE_REQUIREMENT"
  | "UNSUPPORTED_SETUP_MAPPING"
  | "UNSUPPORTED_SPACE_CAPACITY"
  | "UNSUPPORTED_TASK_ROLE"
  | "UNSUPPORTED_TASK_STATUS"
  | "UNSUPPORTED_TIME_GRID"
  | "UNSUPPORTED_TIME_VALUE"
  | "UNSUPPORTED_TRANSPORT_CONTRACT";

export type EngineInputIdentityNamespace =
  | "break"
  | "itinerant-team"
  | "lock"
  | "participant"
  | "plan"
  | "plan-resource"
  | "resource-item"
  | "resource-type"
  | "space"
  | "task"
  | "template"
  | "zone";

export interface EngineInputIdentity {
  namespace: EngineInputIdentityNamespace;
  sourceId: string;
  canonicalId: string;
}

export interface EngineInputPreflightIssue {
  code: EngineInputPreflightReasonCode;
  entityKind: string;
  entityId: string;
  path: string;
  message: string;
  blocking: true;
  details?: Readonly<Record<string, unknown>>;
}

export interface EngineInputPreflightDiagnostics {
  taskCount: number;
  planifiableTaskCount: number;
  protectedTaskCount: number;
  cancelledTaskCount: number;
  pendingPlanningDiscardCount: number;
  lockCount: number;
  participantCount: number;
  coachReferenceCount: number;
  missingCoachReferenceCount: number;
  spaceCount: number;
  referencedSpaceCount: number;
  describedSpaceCount: number;
  zoneCount: number;
  planResourceCount: number;
  resourceItemCount: number;
  resourceAssignmentReferenceCount: number;
  resourceComponentReferenceCount: number;
  missingResourceReferenceCount: number;
  dependencyCount: number;
  breakCount: number;
  transportConfigured: boolean;
  setupConfigurationDetected: boolean;
  mainFlowConfigurationComplete: boolean;
  searchPolicyConfigurationPresent: boolean;
  searchBudgetConfigurationComplete: boolean;
  timeGridVerifiable: boolean;
  anchoredOperationContractPresent: boolean;
  unresolvedTaskRoleCount: number;
  missingDurationTaskCount: number;
  missingAvailabilityCounts: Readonly<{ participants: number; spaces: number; resources: number }>;
  unsupportedCapabilityCodes: readonly EngineInputPreflightReasonCode[];
  readOnly: true;
}

export interface EngineInputPreflightResult {
  status: EngineInputPreflightStatus;
  identityMap: readonly EngineInputIdentity[];
  diagnostics: EngineInputPreflightDiagnostics;
  issues: readonly EngineInputPreflightIssue[];
  reasonCodes: readonly EngineInputPreflightReasonCode[];
  sourceFingerprint: string;
  identityMapFingerprint: string;
  readOnly: true;
}

const PREFIX: Record<EngineInputIdentityNamespace, string> = {
  break: "break",
  "itinerant-team": "itinerant-team",
  lock: "lock",
  participant: "participant",
  plan: "plan",
  "plan-resource": "plan-resource",
  "resource-item": "resource-item",
  "resource-type": "resource-type",
  space: "space",
  task: "task",
  template: "template",
  zone: "zone",
};

const DISPLAY_KEYS = new Set([
  "arrivalTaskTemplateName", "arrivalTemplateName", "contestantName", "departureTaskTemplateName",
  "departureTemplateName", "description", "label", "mealTaskTemplateName", "name", "spaceNameById",
  "taskTemplateNameById", "templateName", "typeName",
]);

const SET_ARRAY_KEYS = new Set([
  "allowedItinerantTeamIds", "anyOf", "assignedResourceIds", "coachResourceIds", "globalHardBreaks",
  "planResourceItems", "protectedBreaks", "resourceItemIds", "tasks", "locks", "dependsOnTaskIds",
  "groupingZoneIds", "resourceItemComponents", "spaceIdsByZoneId", "spaceResourceAssignments",
  "zoneResourceAssignments",
]);

const compare = (left: string, right: string): number => left.localeCompare(right, "en");

function stableValue(value: unknown, path: readonly string[] = []): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => stableValue(item, path));
    const key = path.at(-1) ?? "";
    return (SET_ARRAY_KEYS.has(key) || path.some((segment) => SET_ARRAY_KEYS.has(segment)))
      ? values.sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)))
      : values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => item !== undefined && !DISPLAY_KEYS.has(key))
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [key, stableValue(item, [...path, key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

function sourceProjection(input: EngineInput): unknown {
  const projection = structuredClone(input) as EngineInput;
  for (const task of projection.tasks) {
    if (task.status === "pending" || task.status === "interrupted") {
      task.startPlanned = task.startPlanned == null ? task.startPlanned : "PRESENT_DISCARDED";
      task.endPlanned = task.endPlanned == null ? task.endPlanned : "PRESENT_DISCARDED";
    }
  }
  return stableValue(projection);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function toMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function mapKeys(map: unknown): string[] {
  return Object.keys((map ?? {}) as Record<string, unknown>);
}

function mapArrayValues(map: Record<number, number[]> | undefined): number[] {
  return Object.values(map ?? {}).flat();
}

function currentContractChecks(input: EngineInput) {
  const record = input as unknown as Record<string, unknown>;
  const mainFlowConfigurationComplete = Boolean(record.mainFlow && typeof record.mainFlow === "object");
  const searchPolicyConfigurationPresent = typeof record.searchPolicy === "string";
  const budget = record.searchBudget as Record<string, unknown> | undefined;
  const searchBudgetConfigurationComplete = Boolean(
    budget && ["bestK", "maxBacktracks", "maxPatterns", "maxBranchExpansions"].every((key) => key in budget),
  );
  const anchoredOperationContractPresent = Array.isArray(record.anchoredAccompaniments);
  const timeGridVerifiable = typeof record.timeGridMinutes === "number";
  return {
    anchoredOperationContractPresent,
    mainFlowConfigurationComplete,
    searchBudgetConfigurationComplete,
    searchPolicyConfigurationPresent,
    timeGridVerifiable,
  };
}

export function preflightEngineInputForPlannerNext(input: EngineInput): EngineInputPreflightResult {
  const issues: EngineInputPreflightIssue[] = [];
  const identities = new Map<EngineInputIdentityNamespace, Set<string>>();
  const authoritativeDefinitions = new Map<EngineInputIdentityNamespace, Set<string>>();
  const identityMap: EngineInputIdentity[] = [];

  const addIssue = (
    code: EngineInputPreflightReasonCode,
    entityKind: string,
    entityId: unknown,
    path: string,
    message: string,
    details?: Record<string, unknown>,
  ): void => {
    issues.push({
      code,
      entityKind,
      entityId: String(entityId ?? "input"),
      path,
      message,
      blocking: true,
      ...(details ? { details: stableValue(details) as Record<string, unknown> } : {}),
    });
  };

  const addIdentity = (
    namespace: EngineInputIdentityNamespace,
    rawId: unknown,
    path: string,
    authoritativeDefinition = false,
  ): void => {
    if (rawId === null || rawId === undefined || rawId === "") return;
    const sourceId = String(rawId);
    const known = identities.get(namespace) ?? new Set<string>();
    const definitions = authoritativeDefinitions.get(namespace) ?? new Set<string>();
    if (known.has(sourceId)) {
      if (authoritativeDefinition && definitions.has(sourceId)) {
        addIssue("DUPLICATE_ID", namespace, sourceId, path, "Duplicate authoritative identity definition.", { namespace });
      }
      if (authoritativeDefinition) {
        definitions.add(sourceId);
        authoritativeDefinitions.set(namespace, definitions);
      }
      return;
    }
    known.add(sourceId);
    identities.set(namespace, known);
    if (authoritativeDefinition) {
      definitions.add(sourceId);
      authoritativeDefinitions.set(namespace, definitions);
    }
    identityMap.push({ namespace, sourceId, canonicalId: `${PREFIX[namespace]}:${sourceId}` });
  };

  addIdentity("plan", input.planId, "planId", true);

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;
    addIdentity("task", task.id, `${path}.id`, true);
    addIdentity("template", task.templateId, `${path}.templateId`);
    addIdentity("participant", task.contestantId, `${path}.contestantId`);
    addIdentity("space", task.spaceId, `${path}.spaceId`);
    addIdentity("zone", task.zoneId, `${path}.zoneId`);
    addIdentity("break", task.breakId, `${path}.breakId`);
    addIdentity("itinerant-team", task.itinerantTeamId, `${path}.itinerantTeamId`);
    task.allowedItinerantTeamIds?.forEach((id) => addIdentity("itinerant-team", id, `${path}.allowedItinerantTeamIds`));
    task.assignedResourceIds?.forEach((id) => addIdentity("plan-resource", id, `${path}.assignedResourceIds`));
    mapKeys(task.resourceRequirements?.byItem).forEach((id) => addIdentity("resource-item", id, `${path}.resourceRequirements.byItem`));
    mapKeys(task.resourceRequirements?.byType).forEach((id) => addIdentity("resource-type", id, `${path}.resourceRequirements.byType`));
    task.resourceRequirements?.anyOf?.flatMap((group) => group.resourceItemIds)
      .forEach((id) => addIdentity("resource-item", id, `${path}.resourceRequirements.anyOf`));
  }

  input.locks.forEach((lock) => addIdentity("lock", lock.id, `locks.${lock.id}.id`, true));
  input.planResourceItems.forEach((resource) => {
    addIdentity("plan-resource", resource.id, `planResourceItems.${resource.id}.id`, true);
    addIdentity("resource-item", resource.resourceItemId, `planResourceItems.${resource.id}.resourceItemId`, true);
    addIdentity("resource-type", resource.typeId, `planResourceItems.${resource.id}.typeId`);
  });
  input.coachResourceIds?.forEach((id) => addIdentity("plan-resource", id, "coachResourceIds"));

  for (const [parentId, components] of Object.entries(input.resourceItemComponents)) {
    addIdentity("resource-item", parentId, `resourceItemComponents.${parentId}`);
    components.forEach((component) => addIdentity("resource-item", component.componentResourceItemId, `resourceItemComponents.${parentId}`));
  }

  const describedSpaceIds = new Set<string>();
  const referencedSpaceIds = new Set<string>();
  const describeSpaceMap = (map: unknown, path: string): void => {
    for (const id of mapKeys(map)) {
      describedSpaceIds.add(id);
      addIdentity("space", id, `${path}.${id}`);
    }
  };

  input.tasks.forEach((task) => { if (task.spaceId != null) referencedSpaceIds.add(String(task.spaceId)); });
  input.protectedBreaks?.forEach((entry) => { if (entry.spaceId != null) referencedSpaceIds.add(String(entry.spaceId)); });
  if (input.actualMeal?.spaceId != null) referencedSpaceIds.add(String(input.actualMeal.spaceId));

  for (const [spaceId, parentId] of Object.entries(input.spaceParentById ?? {})) {
    describedSpaceIds.add(spaceId);
    addIdentity("space", spaceId, `spaceParentById.${spaceId}`);
    addIdentity("space", parentId, `spaceParentById.${spaceId}`);
    if (parentId != null) describedSpaceIds.add(String(parentId));
  }
  [
    [input.spaceResourceAssignments, "spaceResourceAssignments"],
    [input.spaceResourceTypeRequirements, "spaceResourceTypeRequirements"],
    [input.spaceCapacityById, "spaceCapacityById"],
    [input.spaceConcurrencyById, "spaceConcurrencyById"],
    [input.spaceIsExclusiveById, "spaceIsExclusiveById"],
    [input.groupingBySpaceId, "groupingBySpaceId"],
    [input.minimizeChangesBySpace, "minimizeChangesBySpace"],
  ].forEach(([map, path]) => describeSpaceMap(map, path as string));

  for (const [spaceId, zoneId] of Object.entries(input.zoneIdBySpaceId ?? {})) {
    describedSpaceIds.add(spaceId);
    addIdentity("space", spaceId, `zoneIdBySpaceId.${spaceId}`);
    addIdentity("zone", zoneId, `zoneIdBySpaceId.${spaceId}`);
  }
  for (const [zoneId, spaceIds] of Object.entries(input.spaceIdsByZoneId ?? {})) {
    addIdentity("zone", zoneId, `spaceIdsByZoneId.${zoneId}`);
    spaceIds.forEach((spaceId) => {
      describedSpaceIds.add(String(spaceId));
      addIdentity("space", spaceId, `spaceIdsByZoneId.${zoneId}`);
    });
  }
  for (const zoneId of new Set([
    ...mapKeys(input.zoneResourceAssignments),
    ...mapKeys(input.zoneResourceTypeRequirements),
    ...input.groupingZoneIds.map(String),
  ])) addIdentity("zone", zoneId, `zones.${zoneId}`);

  for (const requirements of Object.values(input.spaceResourceTypeRequirements)) {
    mapKeys(requirements).forEach((id) => addIdentity("resource-type", id, "spaceResourceTypeRequirements"));
  }
  for (const requirements of Object.values(input.zoneResourceTypeRequirements)) {
    mapKeys(requirements).forEach((id) => addIdentity("resource-type", id, "zoneResourceTypeRequirements"));
  }

  mapArrayValues(input.spaceResourceAssignments).forEach((id) => addIdentity("plan-resource", id, "spaceResourceAssignments"));
  mapArrayValues(input.zoneResourceAssignments).forEach((id) => addIdentity("plan-resource", id, "zoneResourceAssignments"));

  const addBreakIdentities = (entry: ProtectedBreakInput | undefined, path: string): void => {
    if (!entry) return;
    addIdentity("break", entry.id, `${path}.id`, true);
    addIdentity("participant", entry.contestantId, `${path}.contestantId`);
    addIdentity("space", entry.spaceId, `${path}.spaceId`);
    addIdentity("zone", entry.zoneId, `${path}.zoneId`);
    addIdentity("itinerant-team", entry.itinerantTeamId, `${path}.itinerantTeamId`);
  };
  addBreakIdentities(input.actualMeal, "actualMeal");
  input.protectedBreaks?.forEach((entry) => addBreakIdentities(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  identityMap.sort((left, right) => compare(`${left.namespace}\0${left.sourceId}`, `${right.namespace}\0${right.sourceId}`));

  const workDayStart = toMinutes(input.workDay?.start);
  const workDayEnd = toMinutes(input.workDay?.end);
  const validateInterval = (
    window: TimeWindow | undefined,
    entityKind: string,
    entityId: unknown,
    path: string,
    contained = true,
  ): boolean => {
    if (!window) return false;
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    const invalid = start === null || end === null || start >= end;
    const outside = contained && workDayStart !== null && workDayEnd !== null && start !== null && end !== null
      && (start < workDayStart || end > workDayEnd);
    if (invalid || outside) {
      addIssue("UNSUPPORTED_TIME_VALUE", entityKind, entityId, path, "Invalid time interval.", {
        start: window.start,
        end: window.end,
        outsideWorkDay: outside,
      });
      return false;
    }
    return true;
  };

  const validateAliases = (
    objectWindow: TimeWindow | undefined,
    aliasStart: string | undefined,
    aliasEnd: string | undefined,
    path: string,
  ): void => {
    if (aliasStart === undefined && aliasEnd === undefined) return;
    if (aliasStart === undefined || aliasEnd === undefined) {
      addIssue("UNSUPPORTED_TIME_VALUE", "plan", input.planId, path, "Both time alias endpoints are required.", { aliasStart, aliasEnd });
      return;
    }
    validateInterval({ start: aliasStart, end: aliasEnd }, "plan", input.planId, path);
    if (objectWindow && (objectWindow.start !== aliasStart || objectWindow.end !== aliasEnd)) {
      addIssue("UNSUPPORTED_TIME_VALUE", "plan", input.planId, path, "Object and alias time contracts contradict each other.", {
        aliasEnd,
        aliasStart,
        objectEnd: objectWindow.end,
        objectStart: objectWindow.start,
      });
    }
  };

  validateInterval(input.workDay, "plan", input.planId, "workDay", false);
  validateInterval(input.meal, "plan", input.planId, "meal");
  validateInterval(input.mealWindow, "plan", input.planId, "mealWindow");
  validateInterval(input.actualMeal, "break", input.actualMeal?.id, "actualMeal");
  validateAliases(input.mealWindow, input.mealWindowStart, input.mealWindowEnd, "mealWindowAliases");
  validateAliases(input.actualMeal, input.actualMealStart, input.actualMealEnd, "actualMealAliases");
  input.globalHardBreaks?.forEach((entry) => validateInterval(entry, "break", `${entry.start}-${entry.end}`, `globalHardBreaks.${entry.start}-${entry.end}`));
  input.protectedBreaks?.forEach((entry) => validateInterval(entry, "break", entry.id ?? `${entry.start}-${entry.end}`, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  Object.entries(input.contestantAvailabilityById ?? {}).forEach(([id, window]) => validateInterval(window, "participant", id, `contestantAvailabilityById.${id}`));

  const taskById = new Map(input.tasks.map((task) => [String(task.id), task]));
  const dependencies = new Map<string, string[]>();
  let dependencyCount = 0;
  let missingDurationTaskCount = 0;
  let pendingPlanningDiscardCount = 0;
  const validStatuses = new Set(["pending", "interrupted", "in_progress", "done", "cancelled"]);

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;
    if (task.planId !== input.planId) addIssue("PLAN_ID_MISMATCH", "task", task.id, `${path}.planId`, "Task belongs to another plan.");
    if (!validStatuses.has(task.status)) addIssue("UNSUPPORTED_TASK_STATUS", "task", task.id, `${path}.status`, "Unknown task status.");
    if (task.status !== "cancelled") addIssue("UNSUPPORTED_TASK_ROLE", "task", task.id, `${path}.kind`, "Planner Next task kind is not explicit.");

    if (task.status === "pending" || task.status === "interrupted") {
      if (task.startPlanned != null || task.endPlanned != null) pendingPlanningDiscardCount++;
      if (task.durationOverrideMin == null) {
        missingDurationTaskCount++;
        addIssue("MISSING_TASK_DURATION", "task", task.id, `${path}.durationOverrideMin`, "Authoritative duration is absent.");
      } else if (!Number.isFinite(task.durationOverrideMin) || task.durationOverrideMin <= 0) {
        addIssue("UNSUPPORTED_TIME_VALUE", "task", task.id, `${path}.durationOverrideMin`, "Duration must be finite and positive.", {
          receivedValue: Number.isNaN(task.durationOverrideMin) ? "NaN" : task.durationOverrideMin,
        });
      }
    }

    if (task.fixedWindowStart != null || task.fixedWindowEnd != null) {
      validateInterval({ start: task.fixedWindowStart ?? "", end: task.fixedWindowEnd ?? "" }, "task", task.id, `${path}.fixedWindow`);
    }
    if (task.status === "done" || task.status === "in_progress") {
      const start = task.startReal ?? task.startPlanned;
      const end = task.endReal ?? task.endPlanned;
      if (!start || !end || task.spaceId == null) {
        addIssue("PROTECTED_TASK_WITHOUT_FIXED_PLANNING", "task", task.id, path, "Protected task lacks complete fixed planning.");
      } else if (!validateInterval({ start, end }, "task", task.id, `${path}.protectedPlanning`)) {
        addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, path, "Protected planning cannot be represented exactly.");
      }
    }

    const rawDependencies = task.dependsOnTaskIds != null
      ? task.dependsOnTaskIds.map(String)
      : task.dependsOnTaskId != null ? [String(task.dependsOnTaskId)] : [];
    dependencyCount += rawDependencies.length;
    const uniqueDependencies = [...new Set(rawDependencies)].sort(compare);
    dependencies.set(String(task.id), uniqueDependencies);
    if (uniqueDependencies.length !== rawDependencies.length) {
      addIssue("DUPLICATE_DEPENDENCY_REFERENCE", "task", task.id, `${path}.dependsOnTaskIds`, "Dependency reference is repeated.", {
        duplicateTaskIds: [...new Set(rawDependencies.filter((id, index) => rawDependencies.indexOf(id) !== index))].sort(compare),
      });
    }
    if (uniqueDependencies.includes(String(task.id))) {
      addIssue("DEPENDENCY_CYCLE", "task", task.id, `${path}.dependsOnTaskIds`, "Task depends on itself.", { cycleTaskIds: [String(task.id)] });
    }
    uniqueDependencies.filter((id) => !taskById.has(id)).forEach((id) => {
      addIssue("MISSING_DEPENDENCY_REFERENCE", "task", task.id, `${path}.dependsOnTaskIds`, "Dependency task does not exist.", { dependencyTaskId: id });
    });
  }

  const cycleMembers = new Set<string>();
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (visitState.get(id) === 2) return;
    if (visitState.get(id) === 1) {
      stack.slice(stack.indexOf(id)).forEach((member) => cycleMembers.add(member));
      return;
    }
    visitState.set(id, 1);
    stack.push(id);
    for (const dependency of dependencies.get(id) ?? []) if (taskById.has(dependency) && dependency !== id) visit(dependency);
    stack.pop();
    visitState.set(id, 2);
  };
  [...taskById.keys()].sort(compare).forEach(visit);
  cycleMembers.forEach((id) => addIssue("DEPENDENCY_CYCLE", "task", id, `tasks.${id}.dependsOnTaskIds`, "Dependency graph contains a cycle.", {
    cycleTaskIds: [...cycleMembers].sort(compare),
  }));

  const planResourceIds = new Set(input.planResourceItems.map((resource) => String(resource.id)));
  const resourceItemIds = new Set(input.planResourceItems.map((resource) => String(resource.resourceItemId)));
  const resourceTypeIds = new Set(input.planResourceItems.map((resource) => String(resource.typeId)));
  let missingResourceReferenceCount = 0;
  let resourceAssignmentReferenceCount = 0;
  let resourceComponentReferenceCount = 0;
  const missingResource = (entityKind: string, entityId: unknown, path: string, referencedId: unknown, namespace: string): void => {
    missingResourceReferenceCount++;
    addIssue("MISSING_RESOURCE_REFERENCE", entityKind, entityId, path, "Resource reference does not exist in its namespace.", {
      namespace,
      referencedId: String(referencedId),
    });
  };

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;
    for (const id of task.assignedResourceIds ?? []) {
      resourceAssignmentReferenceCount++;
      if (!planResourceIds.has(String(id))) missingResource("task", task.id, `${path}.assignedResourceIds`, id, "plan-resource");
    }
    const requirements = task.resourceRequirements;
    for (const [id, quantity] of Object.entries(requirements?.byItem ?? {})) {
      if (!resourceItemIds.has(id)) missingResource("task", task.id, `${path}.resourceRequirements.byItem.${id}`, id, "resource-item");
      if (quantity !== 1) addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.resourceRequirements.byItem.${id}`, "Resource quantity is not representable.", { quantity });
    }
    for (const [id, quantity] of Object.entries(requirements?.byType ?? {})) {
      if (!resourceTypeIds.has(id)) missingResource("task", task.id, `${path}.resourceRequirements.byType.${id}`, id, "resource-type");
      addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.resourceRequirements.byType.${id}`, "Resource type cannot be selected without loss.", { quantity });
    }
    requirements?.anyOf?.forEach((group, index) => {
      addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.resourceRequirements.anyOf.${index}`, "Resource alternatives cannot be converted to a fixed resource.", { quantity: group.quantity });
      group.resourceItemIds.forEach((id) => {
        if (!resourceItemIds.has(String(id))) missingResource("task", task.id, `${path}.resourceRequirements.anyOf.${index}`, id, "resource-item");
      });
    });
    if ((task.camerasOverride ?? 0) > 1) addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.camerasOverride`, "Camera quantity above one is not representable.", { quantity: task.camerasOverride });
  }

  const auditAssignments = (map: Record<number, number[]>, path: string, ownerKind: string): void => {
    for (const [ownerId, resourceIds] of Object.entries(map)) {
      for (const id of resourceIds) {
        resourceAssignmentReferenceCount++;
        if (!planResourceIds.has(String(id))) missingResource(ownerKind, ownerId, `${path}.${ownerId}`, id, "plan-resource");
      }
    }
  };
  auditAssignments(input.spaceResourceAssignments, "spaceResourceAssignments", "space");
  auditAssignments(input.zoneResourceAssignments, "zoneResourceAssignments", "zone");
  const auditTypeRequirements = (map: Record<number, Record<number, number>>, path: string, ownerKind: string): void => {
    for (const [ownerId, requirements] of Object.entries(map)) {
      for (const [typeId, quantity] of Object.entries(requirements)) {
        if (!resourceTypeIds.has(typeId)) missingResource(ownerKind, ownerId, `${path}.${ownerId}.${typeId}`, typeId, "resource-type");
        addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", ownerKind, ownerId, `${path}.${ownerId}.${typeId}`, "Resource type requirement cannot select an instance without loss.", { quantity });
      }
    }
  };
  auditTypeRequirements(input.spaceResourceTypeRequirements, "spaceResourceTypeRequirements", "space");
  auditTypeRequirements(input.zoneResourceTypeRequirements, "zoneResourceTypeRequirements", "zone");
  for (const [parentId, components] of Object.entries(input.resourceItemComponents)) {
    if (!resourceItemIds.has(parentId)) missingResource("resource-item", parentId, `resourceItemComponents.${parentId}`, parentId, "resource-item");
    for (const component of components) {
      resourceComponentReferenceCount++;
      if (!resourceItemIds.has(String(component.componentResourceItemId))) {
        missingResource("resource-item", parentId, `resourceItemComponents.${parentId}`, component.componentResourceItemId, "resource-item");
      }
      if (!Number.isFinite(component.quantity) || component.quantity <= 0) {
        addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "resource-item", parentId, `resourceItemComponents.${parentId}`, "Component quantity is invalid.", { quantity: component.quantity });
      }
    }
  }

  let missingCoachReferenceCount = 0;
  for (const id of input.coachResourceIds ?? []) {
    if (!planResourceIds.has(String(id))) {
      missingCoachReferenceCount++;
      addIssue("MISSING_COACH_REFERENCE", "plan-resource", id, "coachResourceIds", "Coach plan-resource reference does not exist.", { referencedId: String(id) });
    }
  }

  for (const lock of input.locks) {
    const path = `locks.${lock.id}`;
    if (lock.planId !== input.planId) addIssue("PLAN_ID_MISMATCH", "lock", lock.id, `${path}.planId`, "Lock belongs to another plan.");
    if (!taskById.has(String(lock.taskId))) addIssue("MISSING_TASK_REFERENCE", "lock", lock.id, `${path}.taskId`, "Lock task does not exist.", { taskId: String(lock.taskId) });
    if (!["time", "space", "resource", "full"].includes(lock.lockType)) {
      addIssue("UNSUPPORTED_LOCK_TYPE", "lock", lock.id, `${path}.lockType`, "Unknown lock type.", { lockType: lock.lockType });
      continue;
    }
    if (lock.lockType === "time" || lock.lockType === "full") {
      const valid = lock.lockedStart != null && lock.lockedEnd != null
        && validateInterval({ start: lock.lockedStart, end: lock.lockedEnd }, "lock", lock.id, `${path}.time`);
      if (!valid) addIssue("UNREPRESENTABLE_TIME_LOCK", "lock", lock.id, path, "Time dimension of lock is incomplete or invalid.");
    }
    if (lock.lockType === "space" || lock.lockType === "full") {
      addIssue("UNREPRESENTABLE_SPACE_LOCK", "lock", lock.id, path, "LockInput has no explicit locked-space identity.");
    }
    if (lock.lockType === "resource" || lock.lockType === "full") {
      if (lock.lockedResourceId == null || !planResourceIds.has(String(lock.lockedResourceId))) {
        addIssue("UNREPRESENTABLE_RESOURCE_LOCK", "lock", lock.id, `${path}.lockedResourceId`, "Resource dimension of lock is incomplete or invalid.", {
          lockedResourceId: lock.lockedResourceId ?? null,
        });
      }
    }
  }

  for (const task of input.tasks) {
    if (task.spaceId == null) {
      if (task.status !== "cancelled") addIssue("MISSING_SPACE_REFERENCE", "task", task.id, `tasks.${task.id}.spaceId`, "Task has no physical-space reference.");
      continue;
    }
    const spaceId = String(task.spaceId);
    if (!describedSpaceIds.has(spaceId)) {
      addIssue("MISSING_SPACE_REFERENCE", "task", task.id, `tasks.${task.id}.spaceId`, "Referenced physical space has no structured entity description.", { spaceId });
    }
  }
  const auditBreakSpace = (entry: ProtectedBreakInput | undefined, path: string): void => {
    if (entry?.spaceId == null) return;
    const spaceId = String(entry.spaceId);
    if (!describedSpaceIds.has(spaceId)) addIssue("MISSING_SPACE_REFERENCE", "break", entry.id ?? `${entry.start}-${entry.end}`, `${path}.spaceId`, "Scoped break space has no structured entity description.", { spaceId });
  };
  auditBreakSpace(input.actualMeal, "actualMeal");
  input.protectedBreaks?.forEach((entry) => auditBreakSpace(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  describedSpaceIds.forEach((spaceId) => addIssue("MISSING_SPACE_AVAILABILITY", "space", spaceId, `spaces.${spaceId}.availability`, "No temporal space availability contract exists."));

  const capacitySpaceIds = new Set([...mapKeys(input.spaceCapacityById), ...mapKeys(input.spaceConcurrencyById)]);
  for (const spaceId of capacitySpaceIds) {
    const capacity = input.spaceCapacityById?.[Number(spaceId)];
    const concurrency = input.spaceConcurrencyById?.[Number(spaceId)];
    if (capacity != null && concurrency != null && capacity !== concurrency) {
      addIssue("UNSUPPORTED_SPACE_CAPACITY", "space", spaceId, `spaceCapacityAliases.${spaceId}`, "Capacity aliases contradict each other.", { capacity, concurrency });
    }
    for (const [path, value] of [[`spaceCapacityById.${spaceId}`, capacity], [`spaceConcurrencyById.${spaceId}`, concurrency]] as const) {
      if (value != null && (!Number.isFinite(value) || value > 1 || value <= 0)) {
        addIssue("UNSUPPORTED_SPACE_CAPACITY", "space", spaceId, path, "Space capacity is not representable.", { capacity: value });
      }
    }
  }

  input.planResourceItems.forEach((resource) => addIssue("MISSING_RESOURCE_AVAILABILITY", "plan-resource", resource.id, `planResourceItems.${resource.id}.isAvailable`, "Boolean availability is not temporal availability."));
  const participantIds = identities.get("participant") ?? new Set<string>();
  const availabilityIds = new Set(mapKeys(input.contestantAvailabilityById));
  participantIds.forEach((id) => {
    if (!availabilityIds.has(id)) addIssue("MISSING_PARTICIPANT_AVAILABILITY", "participant", id, `contestantAvailabilityById.${id}`, "Participant availability is absent.");
  });

  const classifyBreak = (entry: ProtectedBreakInput, path: string): void => {
    const scoped = entry.contestantId != null || entry.spaceId != null || entry.zoneId != null || entry.itinerantTeamId != null;
    if (scoped || entry.kind === "global" || entry.kind === "protected") {
      addIssue("UNSUPPORTED_BREAK_SCOPE", "break", entry.id ?? `${entry.start}-${entry.end}`, path, "Break scope cannot map exactly to the single Planner Next protected meal.", {
        scope: entry.contestantId != null ? "participant" : entry.spaceId != null ? "space" : entry.zoneId != null ? "zone" : entry.itinerantTeamId != null ? "itinerant-team" : entry.kind ?? "global",
      });
    }
  };
  if (input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "mealWindow", "Flexible meal window cannot map exactly to a fixed protected meal.", { scope: "flexible-window" });
  }
  if (input.actualMeal) classifyBreak(input.actualMeal, "actualMeal");
  input.protectedBreaks?.forEach((entry) => classifyBreak(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  input.globalHardBreaks?.forEach((entry) => addIssue("UNSUPPORTED_BREAK_SCOPE", "break", `${entry.start}-${entry.end}`, `globalHardBreaks.${entry.start}-${entry.end}`, "Arbitrary global hard break cannot map to protectedMeal.", { scope: "global-hard-break" }));
  const additionalBreakCount = (input.actualMeal ? 1 : 0) + (input.protectedBreaks?.length ?? 0) + (input.globalHardBreaks?.length ?? 0);
  if (additionalBreakCount > 1) addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "breaks", "Multiple break contracts cannot collapse into one protected meal.", { breakCount: additionalBreakCount });

  const transportConfigured = Boolean(
    input.transportSettings || input.transportSpaceId != null || input.transportVanCapacity != null || input.vanCapacity != null
    || input.arrivalGroupingTarget != null || input.departureGroupingTarget != null
    || input.tasks.some((task) => task.operationalRole === "transport_arrival" || task.operationalRole === "transport_departure"),
  );
  if (transportConfigured) addIssue("UNSUPPORTED_TRANSPORT_CONTRACT", "plan", input.planId, "transportSettings", "Planner Next has no equivalent transport contract.");

  const setupConfigurationDetected = Boolean(
    mapKeys(input.groupingBySpaceId).length || mapKeys(input.minimizeChangesBySpace).length
    || input.optimizerGroupBySpaceAndTemplate || mapKeys(input.maxTemplateChangesByZoneId).length,
  );
  if (setupConfigurationDetected) addIssue("UNSUPPORTED_SETUP_MAPPING", "plan", input.planId, "groupingBySpaceId", "No explicit reversible setup-family mapping exists.");

  const contracts = currentContractChecks(input);
  if (!contracts.timeGridVerifiable) addIssue("UNSUPPORTED_TIME_GRID", "plan", input.planId, "timeGrid", "No authoritative exported time-grid contract exists.");
  if (!contracts.mainFlowConfigurationComplete) addIssue("MISSING_MAIN_FLOW_CONFIGURATION", "plan", input.planId, "mainFlow", "Complete Planner Next main-flow configuration is absent.");
  if (!contracts.searchPolicyConfigurationPresent) addIssue("MISSING_SEARCH_POLICY_CONFIGURATION", "plan", input.planId, "searchPolicy", "Normalized Planner Next search policy is absent.");
  if (!contracts.searchBudgetConfigurationComplete) addIssue("MISSING_SEARCH_BUDGET_CONFIGURATION", "plan", input.planId, "searchBudget", "Complete Planner Next search budget is absent.");

  issues.sort((left, right) => compare(
    `${left.code}\0${left.entityKind}\0${left.entityId}\0${left.path}`,
    `${right.code}\0${right.entityKind}\0${right.entityId}\0${right.path}`,
  ));
  const reasonCodes = [...new Set(issues.map((issue) => issue.code))].sort(compare);
  const participantMissingAvailability = [...participantIds].filter((id) => !availabilityIds.has(id)).length;

  const diagnostics: EngineInputPreflightDiagnostics = {
    taskCount: input.tasks.length,
    planifiableTaskCount: input.tasks.filter((task) => task.status === "pending" || task.status === "interrupted").length,
    protectedTaskCount: input.tasks.filter((task) => task.status === "done" || task.status === "in_progress").length,
    cancelledTaskCount: input.tasks.filter((task) => task.status === "cancelled").length,
    pendingPlanningDiscardCount,
    lockCount: input.locks.length,
    participantCount: participantIds.size,
    coachReferenceCount: input.coachResourceIds?.length ?? 0,
    missingCoachReferenceCount,
    spaceCount: identities.get("space")?.size ?? 0,
    referencedSpaceCount: referencedSpaceIds.size,
    describedSpaceCount: describedSpaceIds.size,
    zoneCount: identities.get("zone")?.size ?? 0,
    planResourceCount: identities.get("plan-resource")?.size ?? 0,
    resourceItemCount: identities.get("resource-item")?.size ?? 0,
    resourceAssignmentReferenceCount,
    resourceComponentReferenceCount,
    missingResourceReferenceCount,
    dependencyCount,
    breakCount: additionalBreakCount,
    transportConfigured,
    setupConfigurationDetected,
    mainFlowConfigurationComplete: contracts.mainFlowConfigurationComplete,
    searchPolicyConfigurationPresent: contracts.searchPolicyConfigurationPresent,
    searchBudgetConfigurationComplete: contracts.searchBudgetConfigurationComplete,
    timeGridVerifiable: contracts.timeGridVerifiable,
    anchoredOperationContractPresent: contracts.anchoredOperationContractPresent,
    unresolvedTaskRoleCount: input.tasks.filter((task) => task.status !== "cancelled").length,
    missingDurationTaskCount,
    missingAvailabilityCounts: {
      participants: participantMissingAvailability,
      spaces: describedSpaceIds.size,
      resources: input.planResourceItems.length,
    },
    unsupportedCapabilityCodes: reasonCodes.filter((code) => code.startsWith("UNSUPPORTED_") || code.startsWith("UNREPRESENTABLE_")),
    readOnly: true,
  };

  return deepFreeze({
    status: issues.length === 0 ? "SUPPORTED" : "UNSUPPORTED",
    identityMap,
    diagnostics,
    issues,
    reasonCodes,
    sourceFingerprint: fingerprint(sourceProjection(input)),
    identityMapFingerprint: fingerprint(identityMap),
    readOnly: true,
  });
}
