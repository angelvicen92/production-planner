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
  | "INVALID_SEARCH_POLICY_CONFIGURATION"
  | "INVALID_TRANSITION_CONFIGURATION"
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
  | "MISSING_TRANSITION_CONFIGURATION"
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
  | "UNSUPPORTED_SPACE_OCCUPANCY"
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
  integrationConfigurationPresent: boolean;
  mainFlowConfigurationComplete: boolean;
  searchPolicyConfigurationPresent: boolean;
  searchBudgetConfigurationComplete: boolean;
  timeGridVerifiable: boolean;
  transitionConfigurationComplete: boolean;
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

interface ConcreteMealRepresentation {
  source: string;
  start: string;
  end: string;
}

function concreteMealRepresentations(input: EngineInput): ConcreteMealRepresentation[] {
  const representations: ConcreteMealRepresentation[] = [{ source: "meal", ...input.meal }];
  const isGlobal = (entry: ProtectedBreakInput): boolean => entry.contestantId == null
    && entry.spaceId == null && entry.zoneId == null && entry.itinerantTeamId == null;
  if (input.actualMeal && isGlobal(input.actualMeal) && (input.actualMeal.kind == null || input.actualMeal.kind === "meal")) {
    representations.push({ source: "actualMeal", start: input.actualMeal.start, end: input.actualMeal.end });
  }
  if (input.actualMealStart != null && input.actualMealEnd != null) {
    representations.push({ source: "actualMealAliases", start: input.actualMealStart, end: input.actualMealEnd });
  }
  input.protectedBreaks?.filter((entry) => entry.kind === "meal" && isGlobal(entry)).forEach((entry) => {
    representations.push({ source: `protectedBreak:${String(entry.id ?? `${entry.start}-${entry.end}`)}`, start: entry.start, end: entry.end });
  });
  return representations;
}

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
  const runtime = input as unknown as Record<string, unknown>;
  const plannerNext = input.plannerNext as unknown;
  const plannerNextRecord = plannerNext && typeof plannerNext === "object" && !Array.isArray(plannerNext)
    ? plannerNext as unknown as Record<string, unknown> : undefined;
  const projectRecord = (value: unknown, keys: readonly string[]): unknown => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]))
    : value;
  const anchoredAccompaniments = Array.isArray(runtime.anchoredAccompaniments)
    ? runtime.anchoredAccompaniments.map((entry) => entry && typeof entry === "object" ? Object.fromEntries(
      ["id", "anchorTaskId", "anchor", "beforeTaskIds", "afterTaskIds", "segments", "adjacency", "internalTransition", "resourceContinuity"]
        .map((key) => [key, (entry as Record<string, unknown>)[key]]),
    ) : entry).sort((left, right) => compare(
      String((left as Record<string, unknown> | null)?.id ?? ""),
      String((right as Record<string, unknown> | null)?.id ?? ""),
    ))
    : runtime.anchoredAccompaniments;
  const tasks = input.tasks.map((task) => {
    const planifiable = task.status === "pending" || task.status === "interrupted";
    return {
      id: task.id, planId: task.planId, templateId: task.templateId, contestantId: task.contestantId,
      zoneId: task.zoneId, spaceId: task.spaceId, status: task.status, durationOverrideMin: task.durationOverrideMin,
      camerasOverride: task.camerasOverride, resourceRequirements: task.resourceRequirements,
      itinerantTeamId: task.itinerantTeamId, allowedItinerantTeamIds: task.allowedItinerantTeamIds,
      dependsOnTaskIds: task.dependsOnTaskIds, dependsOnTaskId: task.dependsOnTaskId,
      dependsOnTemplateIds: task.dependsOnTemplateIds, dependsOnTemplateId: task.dependsOnTemplateId,
      assignedResourceIds: task.assignedResourceIds, fixedWindowStart: task.fixedWindowStart, fixedWindowEnd: task.fixedWindowEnd,
      startReal: task.startReal, endReal: task.endReal, breakId: task.breakId, breakKind: task.breakKind,
      mealOccupiesSpace: task.mealOccupiesSpace, operationalRole: task.operationalRole,
      ...(task.status !== "cancelled" ? { plannerNextKind: task.plannerNextKind } : {}),
      blocksSpace: task.blocksSpace, allowsSpaceOverlap: task.allowsSpaceOverlap, spaceOccupancyMode: task.spaceOccupancyMode,
      transportGroupCapacityPresent: task.transportGroupCapacity != null,
      transportGroupingTargetPresent: task.transportGroupingTarget != null,
      transportGroupingWeightPresent: task.transportGroupingWeight != null,
      ...(planifiable
        ? { hasDiscardablePriorPlanning: task.startPlanned != null || task.endPlanned != null }
        : { startPlanned: task.startPlanned, endPlanned: task.endPlanned }),
    };
  });
  const planResourceItems = input.planResourceItems.map((resource) => ({
    id: resource.id,
    resourceItemId: resource.resourceItemId,
    typeId: resource.typeId,
  }));
  return stableValue({
    planId: input.planId,
    workDay: input.workDay,
    mealMode: input.mealMode,
    meal: input.meal,
    mealWindow: input.mealWindow,
    mealWindowStart: input.mealWindowStart,
    mealWindowEnd: input.mealWindowEnd,
    actualMeal: input.actualMeal && { ...input.actualMeal, label: undefined },
    actualMealStart: input.actualMealStart,
    actualMealEnd: input.actualMealEnd,
    globalHardBreaks: input.globalHardBreaks,
    protectedBreaks: input.protectedBreaks?.map((entry) => ({ ...entry, label: undefined })),
    contestantMealDurationMinutes: input.contestantMealDurationMinutes,
    contestantMealMaxSimultaneous: input.contestantMealMaxSimultaneous,
    mealTaskTemplateId: input.mealTaskTemplateId,
    tasks,
    locks: input.locks,
    planResourceItems,
    coachResourceIds: input.coachResourceIds,
    resourceItemComponents: input.resourceItemComponents,
    contestantAvailabilityById: input.contestantAvailabilityById,
    zoneResourceAssignments: input.zoneResourceAssignments,
    spaceResourceAssignments: input.spaceResourceAssignments,
    spaceParentById: input.spaceParentById,
    spaceCapacityById: input.spaceCapacityById,
    spaceConcurrencyById: input.spaceConcurrencyById,
    spaceIsExclusiveById: input.spaceIsExclusiveById,
    zoneIdBySpaceId: input.zoneIdBySpaceId,
    spaceIdsByZoneId: input.spaceIdsByZoneId,
    zoneResourceTypeRequirements: input.zoneResourceTypeRequirements,
    spaceResourceTypeRequirements: input.spaceResourceTypeRequirements,
    optimizerMainZoneId: input.optimizerMainZoneId,
    optimizerGroupBySpaceAndTemplateActive: input.optimizerGroupBySpaceAndTemplate === true,
    optimizerGroupingLevelActive: (input.optimizerGroupingLevel ?? 0) > 0,
    groupingZoneIds: input.groupingZoneIds,
    maxTemplateChangeZoneIds: mapKeys(input.maxTemplateChangesByZoneId),
    groupingBySpaceIds: mapKeys(input.groupingBySpaceId),
    minimizeChangesBySpaceIds: mapKeys(input.minimizeChangesBySpace),
    spaceMealBreakZoneIds: mapKeys(input.spaceMealBreakMinutesByZoneId),
    optimizerWeights: input.optimizerWeights && {
      arrivalDepartureGroupingActive: input.optimizerWeights.arrivalDepartureGrouping != null,
      groupBySpaceActive: (input.optimizerWeights.groupBySpaceActive ?? 0) !== 0,
      groupBySpaceTemplateMatchActive: (input.optimizerWeights.groupBySpaceTemplateMatch ?? 0) !== 0,
    },
    transportSettings: input.transportSettings && {
      present: true,
      arrivalTemplateId: input.transportSettings.arrivalTemplateId,
      departureTemplateId: input.transportSettings.departureTemplateId,
      transportSpaceId: input.transportSettings.transportSpaceId,
    },
    transportSpaceId: input.transportSpaceId,
    transportVanCapacityPresent: input.transportVanCapacity != null,
    vanCapacityPresent: input.vanCapacity != null,
    arrivalGroupingTargetPresent: input.arrivalGroupingTarget != null,
    departureGroupingTargetPresent: input.departureGroupingTarget != null,
    arrivalMinGapMinutesPresent: input.arrivalMinGapMinutes != null,
    departureMinGapMinutesPresent: input.departureMinGapMinutes != null,
    arrivalTaskTemplateNamePresent: input.arrivalTaskTemplateName !== undefined,
    departureTaskTemplateNamePresent: input.departureTaskTemplateName !== undefined,
    plannerNext: plannerNextRecord ? {
      searchPolicy: plannerNextRecord.searchPolicy,
      searchBudget: projectRecord(plannerNextRecord.searchBudget, ["bestK", "maxBacktracks", "maxPatterns", "maxBranchExpansions"]),
      timeGridMinutes: plannerNextRecord.timeGridMinutes,
      participantTransitionMinutes: plannerNextRecord.participantTransitionMinutes,
      resourceTransitionMinutes: plannerNextRecord.resourceTransitionMinutes,
      mainFlow: projectRecord(plannerNextRecord.mainFlow, ["spaceId", "preferredEnd", "continuity", "maxBlocksByKey", "minTasksPerBlock"]),
    } : plannerNext,
    anchoredAccompaniments,
  });
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

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;

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
    (task.dependsOnTaskIds ?? (task.dependsOnTaskId != null ? [task.dependsOnTaskId] : []))
      .forEach((id) => addIdentity("task", id, `${path}.dependencies`));
    (task.dependsOnTemplateIds ?? (task.dependsOnTemplateId != null ? [task.dependsOnTemplateId] : []))
      .forEach((id) => addIdentity("template", id, `${path}.templateDependencies`));
    task.allowedItinerantTeamIds?.forEach((id) => addIdentity("itinerant-team", id, `${path}.allowedItinerantTeamIds`));
    task.assignedResourceIds?.forEach((id) => addIdentity("plan-resource", id, `${path}.assignedResourceIds`));
    mapKeys(task.resourceRequirements?.byItem).forEach((id) => addIdentity("resource-item", id, `${path}.resourceRequirements.byItem`));
    mapKeys(task.resourceRequirements?.byType).forEach((id) => addIdentity("resource-type", id, `${path}.resourceRequirements.byType`));
    task.resourceRequirements?.anyOf?.flatMap((group) => group.resourceItemIds)
      .forEach((id) => addIdentity("resource-item", id, `${path}.resourceRequirements.anyOf`));
  }

  input.locks.forEach((lock) => {
    addIdentity("lock", lock.id, `locks.${lock.id}.id`, true);
    addIdentity("task", lock.taskId, `locks.${lock.id}.taskId`);
    addIdentity("plan-resource", lock.lockedResourceId, `locks.${lock.id}.lockedResourceId`);
  });
  input.planResourceItems.forEach((resource) => {
    addIdentity("plan-resource", resource.id, `planResourceItems.${resource.id}.id`, true);
    addIdentity("resource-item", resource.resourceItemId, `planResourceItems.${resource.id}.resourceItemId`, true);
    addIdentity("resource-type", resource.typeId, `planResourceItems.${resource.id}.typeId`);
  });
  input.coachResourceIds?.forEach((id) => addIdentity("plan-resource", id, "coachResourceIds"));
  addIdentity("template", input.mealTaskTemplateId, "mealTaskTemplateId");
  addIdentity("zone", input.optimizerMainZoneId, "optimizerMainZoneId");
  input.groupingZoneIds.forEach((id) => addIdentity("zone", id, "groupingZoneIds"));
  mapKeys(input.maxTemplateChangesByZoneId).forEach((id) => addIdentity("zone", id, "maxTemplateChangesByZoneId"));
  mapKeys(input.spaceMealBreakMinutesByZoneId).forEach((id) => addIdentity("zone", id, "spaceMealBreakMinutesByZoneId"));
  addIdentity("space", input.transportSpaceId, "transportSpaceId");
  addIdentity("space", input.transportSettings?.transportSpaceId, "transportSettings.transportSpaceId");
  addIdentity("template", input.transportSettings?.arrivalTemplateId, "transportSettings.arrivalTemplateId");
  addIdentity("template", input.transportSettings?.departureTemplateId, "transportSettings.departureTemplateId");

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
  if (input.transportSpaceId != null) referencedSpaceIds.add(String(input.transportSpaceId));
  if (input.transportSettings?.transportSpaceId != null) referencedSpaceIds.add(String(input.transportSettings.transportSpaceId));

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
  const runtimeInput = input as unknown as Record<string, unknown>;
  const integrationConfiguration = input.plannerNext as unknown;
  const integrationConfigurationRecord = integrationConfiguration && typeof integrationConfiguration === "object" && !Array.isArray(integrationConfiguration)
    ? integrationConfiguration as Record<string, unknown> : undefined;
  const mainFlowValue = integrationConfigurationRecord?.mainFlow;
  const mainFlow = mainFlowValue && typeof mainFlowValue === "object" && !Array.isArray(mainFlowValue)
    ? mainFlowValue as Record<string, unknown> : undefined;
  if (mainFlow?.spaceId !== null && mainFlow?.spaceId !== undefined && mainFlow.spaceId !== "") {
    const sourceId = String(mainFlow.spaceId);
    addIdentity("space", sourceId, "plannerNext.mainFlow.spaceId");
  }
  if (mainFlow?.spaceId != null) referencedSpaceIds.add(String(mainFlow.spaceId));
  const runtimeAnchors = runtimeInput.anchoredAccompaniments;
  if (Array.isArray(runtimeAnchors)) {
    runtimeAnchors.forEach((operation, index) => {
      if (!operation || typeof operation !== "object") return;
      const record = operation as Record<string, unknown>;
      addIdentity("task", record.anchorTaskId ?? record.anchor, `anchoredAccompaniments.${index}.anchor`);
      for (const key of ["beforeTaskIds", "afterTaskIds", "segments"]) {
        if (Array.isArray(record[key])) record[key].forEach((id) => addIdentity("task", id, `anchoredAccompaniments.${index}.${key}`));
      }
    });
  }
  identityMap.sort((left, right) => compare(`${left.namespace}\0${left.sourceId}`, `${right.namespace}\0${right.sourceId}`));

  const workDayStart = toMinutes(input.workDay?.start);
  const workDayEnd = toMinutes(input.workDay?.end);
  const auditedTimeValues: number[] = [];
  const auditedDurations: number[] = [];
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
    auditedTimeValues.push(start, end);
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
  let unresolvedTaskRoleCount = 0;
  const validStatuses = new Set(["pending", "interrupted", "in_progress", "done", "cancelled"]);
  const plannerNextTaskKinds = ["main", "vocal", "auxiliary", "technical"] as const;

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;
    if (task.planId !== input.planId) addIssue("PLAN_ID_MISMATCH", "task", task.id, `${path}.planId`, "Task belongs to another plan.");
    if (!validStatuses.has(task.status)) addIssue("UNSUPPORTED_TASK_STATUS", "task", task.id, `${path}.status`, "Unknown task status.");
    if (task.status !== "cancelled") {
      const plannerNextKind = (task as unknown as Record<string, unknown>).plannerNextKind;
      const recognizedKind = typeof plannerNextKind === "string"
        && plannerNextTaskKinds.some((allowed) => allowed === plannerNextKind);
      if (!recognizedKind) {
        unresolvedTaskRoleCount++;
        addIssue("UNSUPPORTED_TASK_ROLE", "task", task.id, `${path}.plannerNextKind`, "Planner Next task kind is absent or invalid.", {
          allowedValues: plannerNextTaskKinds,
          receivedValue: plannerNextKind === undefined ? null : plannerNextKind,
        });
      } else if (plannerNextKind === "technical" && task.contestantId != null) {
        unresolvedTaskRoleCount++;
        addIssue("UNSUPPORTED_TASK_ROLE", "task", task.id, `${path}.plannerNextKind`, "Technical task cannot preserve a participant relation.", {
          incompatibleFields: ["contestantId"],
          plannerNextKind,
        });
      } else if (plannerNextKind !== "technical"
        && (!Number.isFinite(task.contestantId) || !Number.isInteger(task.contestantId) || Number(task.contestantId) <= 0)) {
        addIssue("MISSING_PARTICIPANT_REFERENCE", "task", task.id, `${path}.contestantId`, "Participant task lacks a valid participant reference.", {
          plannerNextKind,
          receivedValue: task.contestantId === undefined ? null : task.contestantId,
        });
      }
    }

    if (task.status === "pending" || task.status === "interrupted") {
      if (task.startPlanned != null || task.endPlanned != null) pendingPlanningDiscardCount++;
      if (task.durationOverrideMin == null) {
        missingDurationTaskCount++;
        addIssue("MISSING_TASK_DURATION", "task", task.id, `${path}.durationOverrideMin`, "Authoritative duration is absent.");
      } else if (!Number.isFinite(task.durationOverrideMin) || task.durationOverrideMin <= 0) {
        addIssue("UNSUPPORTED_TIME_VALUE", "task", task.id, `${path}.durationOverrideMin`, "Duration must be finite and positive.", {
          receivedValue: Number.isNaN(task.durationOverrideMin) ? "NaN" : task.durationOverrideMin,
        });
      } else {
        auditedDurations.push(task.durationOverrideMin);
      }
    }

    if (task.fixedWindowStart != null || task.fixedWindowEnd != null) {
      validateInterval({ start: task.fixedWindowStart ?? "", end: task.fixedWindowEnd ?? "" }, "task", task.id, `${path}.fixedWindow`);
    }
    if (task.status === "done" || task.status === "in_progress") {
      const hasAnyReal = task.startReal != null || task.endReal != null;
      const hasCompleteReal = task.startReal != null && task.endReal != null;
      const hasCompletePlanned = task.startPlanned != null && task.endPlanned != null;
      if (hasAnyReal && !hasCompleteReal) {
        addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, `${path}.realPlanning`, "Protected task has only one real endpoint; real and planned times cannot be combined.", {
          endReal: task.endReal ?? null,
          startReal: task.startReal ?? null,
        });
      } else if ((!hasAnyReal && !hasCompletePlanned) || task.spaceId == null) {
        addIssue("PROTECTED_TASK_WITHOUT_FIXED_PLANNING", "task", task.id, path, "Protected task lacks complete fixed planning.");
      } else {
        const start = hasCompleteReal ? task.startReal! : task.startPlanned!;
        const end = hasCompleteReal ? task.endReal! : task.endPlanned!;
        if (!validateInterval({ start, end }, "task", task.id, `${path}.protectedPlanning`)) {
        addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, path, "Protected planning cannot be represented exactly.");
        }
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
    if (task.camerasOverride != null) {
      if (!Number.isFinite(task.camerasOverride) || task.camerasOverride < 0) {
        addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.camerasOverride`, "Camera quantity is invalid.", { quantity: Number.isNaN(task.camerasOverride) ? "NaN" : task.camerasOverride });
      } else if (task.camerasOverride > 0) {
        addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.camerasOverride`, "Camera quantity has no explicit fixed resource identities.", { quantity: task.camerasOverride });
      }
    }
    const unsupportedOccupancy = task.blocksSpace === false || task.allowsSpaceOverlap === true
      || task.spaceOccupancyMode === "shared" || task.spaceOccupancyMode === "non_blocking";
    if (unsupportedOccupancy) {
      addIssue("UNSUPPORTED_SPACE_OCCUPANCY", "task", task.id, `${path}.spaceOccupancy`, "Task space occupancy cannot be represented as exclusive occupancy.", {
        allowsSpaceOverlap: task.allowsSpaceOverlap,
        blocksSpace: task.blocksSpace,
        spaceOccupancyMode: task.spaceOccupancyMode,
      });
    }
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
  for (const [path, rawId] of [
    ["transportSpaceId", input.transportSpaceId],
    ["transportSettings.transportSpaceId", input.transportSettings?.transportSpaceId],
    ["plannerNext.mainFlow.spaceId", mainFlow?.spaceId],
  ] as const) {
    if (rawId != null && !describedSpaceIds.has(String(rawId))) addIssue("MISSING_SPACE_REFERENCE", "plan", input.planId, path, "Configured space has no structured entity description.", { spaceId: String(rawId) });
  }
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
  for (const [spaceId, exclusive] of Object.entries(input.spaceIsExclusiveById ?? {})) {
    if (exclusive === false) addIssue("UNSUPPORTED_SPACE_OCCUPANCY", "space", spaceId, `spaceIsExclusiveById.${spaceId}`, "Non-exclusive space occupancy is not representable.", { exclusive });
  }

  input.planResourceItems.forEach((resource) => addIssue("MISSING_RESOURCE_AVAILABILITY", "plan-resource", resource.id, `planResourceItems.${resource.id}.isAvailable`, "Boolean availability is not temporal availability."));
  const participantIds = identities.get("participant") ?? new Set<string>();
  const availabilityIds = new Set(mapKeys(input.contestantAvailabilityById));
  participantIds.forEach((id) => {
    if (!availabilityIds.has(id)) addIssue("MISSING_PARTICIPANT_AVAILABILITY", "participant", id, `contestantAvailabilityById.${id}`, "Participant availability is absent.");
  });

  const classifyBreak = (entry: ProtectedBreakInput, path: string, concreteMeal = false): void => {
    const scoped = entry.contestantId != null || entry.spaceId != null || entry.zoneId != null || entry.itinerantTeamId != null;
    if (scoped || entry.kind === "global" || entry.kind === "protected" || (!concreteMeal && entry.kind == null)) {
      addIssue("UNSUPPORTED_BREAK_SCOPE", "break", entry.id ?? `${entry.start}-${entry.end}`, path, "Break scope cannot map exactly to the single Planner Next protected meal.", {
        scope: entry.contestantId != null ? "participant" : entry.spaceId != null ? "space" : entry.zoneId != null ? "zone" : entry.itinerantTeamId != null ? "itinerant-team" : entry.kind ?? "unspecified-protected-break",
      });
    }
  };
  if (input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "mealWindow", "Flexible meal window cannot map exactly to a fixed protected meal.", { scope: "flexible-window" });
  }
  if (input.actualMeal) classifyBreak(input.actualMeal, "actualMeal", true);
  input.protectedBreaks?.forEach((entry) => classifyBreak(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  const concreteMealsByInterval = new Map<string, { start: string; end: string; sources: string[] }>();
  for (const representation of concreteMealRepresentations(input)) {
    const key = `${representation.start}\0${representation.end}`;
    const existing = concreteMealsByInterval.get(key) ?? { start: representation.start, end: representation.end, sources: [] };
    existing.sources.push(representation.source);
    existing.sources.sort(compare);
    concreteMealsByInterval.set(key, existing);
  }
  const concreteMeals = [...concreteMealsByInterval.values()].sort((left, right) => compare(`${left.start}\0${left.end}`, `${right.start}\0${right.end}`));
  if (concreteMeals.length > 1) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "concreteMeals", "Concrete meal representations describe different intervals.", { representations: concreteMeals });
  }
  input.globalHardBreaks?.forEach((entry) => addIssue("UNSUPPORTED_BREAK_SCOPE", "break", `${entry.start}-${entry.end}`, `globalHardBreaks.${entry.start}-${entry.end}`, "Arbitrary global hard break cannot map to protectedMeal.", { scope: "global-hard-break" }));
  const isGlobalConcreteMeal = (entry: ProtectedBreakInput): boolean => entry.kind === "meal"
    && entry.contestantId == null && entry.spaceId == null && entry.zoneId == null && entry.itinerantTeamId == null;
  const nonConcreteProtectedBreakCount = input.protectedBreaks?.filter((entry) => !isGlobalConcreteMeal(entry)).length ?? 0;
  const scopedActualMealCount = input.actualMeal && !concreteMealRepresentations({ ...input, protectedBreaks: [] }).some((entry) => entry.source === "actualMeal") ? 1 : 0;
  const flexibleMealCount = input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd ? 1 : 0;
  if (input.contestantMealDurationMinutes != null || input.contestantMealMaxSimultaneous != null) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "contestantMeal", "Contestant meal duration/capacity has no exact Planner Next contract.", {
      durationMinutes: input.contestantMealDurationMinutes,
      maxSimultaneous: input.contestantMealMaxSimultaneous,
    });
  }
  if (mapKeys(input.spaceMealBreakMinutesByZoneId).length) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "spaceMealBreakMinutesByZoneId", "Zone-scoped space meals cannot become a global meal.");
  }
  for (const task of input.tasks) {
    const breakConfigured = task.breakId != null || task.breakKind != null || task.mealOccupiesSpace != null
      || task.operationalRole === "meal_break_placeholder" || task.operationalRole === "space_break_placeholder"
      || task.operationalRole === "global_break_placeholder";
    if (breakConfigured) addIssue("UNSUPPORTED_BREAK_SCOPE", "task", task.id, `tasks.${task.id}.breakContract`, "Task break/meal semantics have no exact Planner Next task mapping.", {
      breakId: task.breakId,
      breakKind: task.breakKind,
      mealOccupiesSpace: task.mealOccupiesSpace,
      operationalRole: task.operationalRole,
    });
  }
  const taskBreakCount = input.tasks.filter((task) => task.breakId != null || task.breakKind != null || task.mealOccupiesSpace != null
    || task.operationalRole === "meal_break_placeholder" || task.operationalRole === "space_break_placeholder"
    || task.operationalRole === "global_break_placeholder").length;
  const breakCount = concreteMeals.length + nonConcreteProtectedBreakCount + scopedActualMealCount
    + (input.globalHardBreaks?.length ?? 0) + flexibleMealCount
    + (input.contestantMealDurationMinutes != null || input.contestantMealMaxSimultaneous != null ? 1 : 0)
    + mapKeys(input.spaceMealBreakMinutesByZoneId).length + taskBreakCount;

  const transportConfigured = Boolean(
    input.transportSettings || input.transportSpaceId != null || input.transportVanCapacity != null || input.vanCapacity != null
    || input.arrivalGroupingTarget != null || input.departureGroupingTarget != null
    || input.arrivalMinGapMinutes != null || input.departureMinGapMinutes != null
    || input.arrivalTaskTemplateName !== undefined || input.departureTaskTemplateName !== undefined
    || input.optimizerWeights?.arrivalDepartureGrouping != null
    || input.tasks.some((task) => task.operationalRole === "transport_arrival" || task.operationalRole === "transport_departure"
      || task.transportGroupCapacity != null || task.transportGroupingTarget != null || task.transportGroupingWeight != null),
  );
  if (transportConfigured) addIssue("UNSUPPORTED_TRANSPORT_CONTRACT", "plan", input.planId, "transportSettings", "Planner Next has no equivalent transport contract.");

  const setupConfigurationDetected = Boolean(
    mapKeys(input.groupingBySpaceId).length || mapKeys(input.minimizeChangesBySpace).length
    || input.groupingZoneIds.length || input.optimizerGroupBySpaceAndTemplate || (input.optimizerGroupingLevel ?? 0) > 0
    || mapKeys(input.maxTemplateChangesByZoneId).length
    || (input.optimizerWeights?.groupBySpaceTemplateMatch ?? 0) !== 0
    || (input.optimizerWeights?.groupBySpaceActive ?? 0) !== 0,
  );
  if (setupConfigurationDetected) addIssue("UNSUPPORTED_SETUP_MAPPING", "plan", input.planId, "groupingBySpaceId", "No explicit reversible setup-family mapping exists.");

  const integrationConfigurationPresent = integrationConfigurationRecord !== undefined;
  const searchPolicy = integrationConfigurationRecord?.searchPolicy;
  const searchPolicyConfigurationPresent = searchPolicy === "COMPATIBILITY_PRESERVING" || searchPolicy === "EXACT_CONSTRUCTIVE";
  if (searchPolicy === undefined) {
    addIssue("MISSING_SEARCH_POLICY_CONFIGURATION", "plan", input.planId, "plannerNext.searchPolicy", "Explicit Planner Next search policy is absent.");
  } else if (!searchPolicyConfigurationPresent) {
    addIssue("INVALID_SEARCH_POLICY_CONFIGURATION", "plan", input.planId, "plannerNext.searchPolicy", "Search policy is not a supported explicit policy.", { receivedValue: searchPolicy });
  }

  const budgetKeys = ["bestK", "maxBacktracks", "maxPatterns", "maxBranchExpansions"] as const;
  const searchBudget = integrationConfigurationRecord?.searchBudget;
  const budgetRecord = searchBudget && typeof searchBudget === "object" && !Array.isArray(searchBudget)
    ? searchBudget as Record<string, unknown> : undefined;
  const missingBudgetKeys = budgetKeys.filter((key) => !(budgetRecord && key in budgetRecord && budgetRecord[key] !== undefined));
  const invalidBudgetEntries = budgetRecord
    ? budgetKeys.filter((key) => key in budgetRecord && budgetRecord[key] !== undefined && !isPositiveInteger(budgetRecord[key])).map((key) => ({ key, value: budgetRecord[key] }))
    : [];
  const searchBudgetConfigurationComplete = Boolean(budgetRecord && !missingBudgetKeys.length && !invalidBudgetEntries.length);
  if (!budgetRecord || missingBudgetKeys.length) {
    addIssue("MISSING_SEARCH_BUDGET_CONFIGURATION", "plan", input.planId, "plannerNext.searchBudget", "Complete Planner Next search budget is absent.", {
      invalidEntries: invalidBudgetEntries,
      missingKeys: missingBudgetKeys,
      receivedValue: searchBudget,
    });
  }
  if (invalidBudgetEntries.length) {
    addIssue("INVALID_SEARCH_BUDGET", "plan", input.planId, "plannerNext.searchBudget", "Search budget contains non-positive, non-integer, or non-finite values.", {
      invalidEntries: invalidBudgetEntries,
      missingKeys: missingBudgetKeys,
      receivedValue: searchBudget,
    });
  }

  const preferredEnd = mainFlow?.preferredEnd;
  const preferredEndMinutes = toMinutes(preferredEnd);
  const preferredEndValid = preferredEndMinutes !== null && workDayStart !== null && workDayEnd !== null
    && preferredEndMinutes >= workDayStart && preferredEndMinutes <= workDayEnd;
  if (preferredEndValid && !auditedTimeValues.includes(preferredEndMinutes)) auditedTimeValues.push(preferredEndMinutes);
  const mainFlowMissingKeys = ["spaceId", "preferredEnd", "continuity", "maxBlocksByKey", "minTasksPerBlock"]
    .filter((key) => !(mainFlow && key in mainFlow && mainFlow[key] !== undefined));
  const mainFlowInvalidKeys = [
    ...(!mainFlow || !isPositiveInteger(mainFlow.spaceId) || !describedSpaceIds.has(String(mainFlow.spaceId)) ? ["spaceId"] : []),
    ...(!preferredEndValid ? ["preferredEnd"] : []),
    ...(mainFlow?.continuity !== "REQUIRED" ? ["continuity"] : []),
    ...(!isPositiveInteger(mainFlow?.maxBlocksByKey) ? ["maxBlocksByKey"] : []),
    ...(!isPositiveInteger(mainFlow?.minTasksPerBlock) ? ["minTasksPerBlock"] : []),
  ];
  const mainFlowConfigurationComplete = Boolean(
    mainFlow && !mainFlowMissingKeys.length && !mainFlowInvalidKeys.length,
  );
  if (!mainFlowConfigurationComplete) {
    addIssue("MISSING_MAIN_FLOW_CONFIGURATION", "plan", input.planId, "plannerNext.mainFlow", "Complete, valid Planner Next main-flow configuration is absent.", {
      invalidKeys: mainFlowInvalidKeys,
      missingKeys: mainFlowMissingKeys,
      receivedValue: mainFlowValue,
    });
  }

  const transitionKeys = ["participantTransitionMinutes", "resourceTransitionMinutes"] as const;
  const missingTransitionKeys = transitionKeys.filter((key) => !(integrationConfigurationRecord && key in integrationConfigurationRecord && integrationConfigurationRecord[key] !== undefined));
  const invalidTransitionEntries = transitionKeys
    .filter((key) => integrationConfigurationRecord && key in integrationConfigurationRecord && integrationConfigurationRecord[key] !== undefined
      && !(typeof integrationConfigurationRecord[key] === "number" && Number.isFinite(integrationConfigurationRecord[key])
        && Number.isInteger(integrationConfigurationRecord[key]) && integrationConfigurationRecord[key] >= 0))
    .map((key) => ({ key, value: integrationConfigurationRecord?.[key] }));
  const transitionConfigurationComplete = !missingTransitionKeys.length && !invalidTransitionEntries.length;
  if (missingTransitionKeys.length) {
    addIssue("MISSING_TRANSITION_CONFIGURATION", "plan", input.planId, "plannerNext", "Explicit participant and resource transition configuration is incomplete.", { missingKeys: missingTransitionKeys });
  }
  if (invalidTransitionEntries.length) {
    addIssue("INVALID_TRANSITION_CONFIGURATION", "plan", input.planId, "plannerNext", "Transition values must be finite non-negative integers.", { invalidEntries: invalidTransitionEntries });
  }

  const grid = integrationConfigurationRecord?.timeGridMinutes;
  const dayDuration = workDayStart !== null && workDayEnd !== null ? workDayEnd - workDayStart : null;
  const gridShapeValid = isPositiveInteger(grid) && dayDuration !== null && grid <= dayDuration;
  const incompatibleTimes = gridShapeValid && workDayStart !== null
    ? auditedTimeValues.filter((value) => (value - workDayStart) % grid !== 0) : [];
  const incompatibleDurations = gridShapeValid ? auditedDurations.filter((value) => value % grid !== 0) : [];
  const timeGridVerifiable = Boolean(gridShapeValid && !incompatibleTimes.length && !incompatibleDurations.length);
  if (!timeGridVerifiable) {
    addIssue("UNSUPPORTED_TIME_GRID", "plan", input.planId, "plannerNext.timeGridMinutes", "Time grid is absent, invalid, or incompatible with audited values.", {
      incompatibleDurations,
      incompatibleTimes,
      receivedValue: grid,
    });
  }

  let anchoredOperationContractPresent = false;
  if (runtimeAnchors !== undefined) {
    if (!Array.isArray(runtimeAnchors)) {
      addIssue("INCOMPLETE_ANCHORED_OPERATION", "plan", input.planId, "anchoredAccompaniments", "Anchored operation contract must be an array.");
    } else {
      const operationIds = new Set<string>();
      const memberOwners = new Map<string, string>();
      anchoredOperationContractPresent = runtimeAnchors.length > 0;
      runtimeAnchors.forEach((operation, index) => {
        const path = `anchoredAccompaniments.${index}`;
        if (!operation || typeof operation !== "object") {
          anchoredOperationContractPresent = false;
          addIssue("INCOMPLETE_ANCHORED_OPERATION", "anchored-operation", index, path, "Anchored operation entry is not structured.");
          return;
        }
        const record = operation as Record<string, unknown>;
        const id = String(record.id ?? index);
        const anchor = record.anchorTaskId ?? record.anchor;
        const before = record.beforeTaskIds;
        const after = record.afterTaskIds;
        const segments = record.segments;
        const effectiveSegments = [
          ...(Array.isArray(before) ? before : []),
          ...(Array.isArray(after) ? after : []),
          ...(Array.isArray(segments) ? segments : []),
        ].map(String);
        const hasEffectiveSegments = effectiveSegments.length > 0;
        const referencedTaskIds = [anchor, ...effectiveSegments].filter((value) => value != null).map(String);
        const missingTaskIds = [...new Set(referencedTaskIds.filter((taskId) => !taskById.has(taskId)))].sort(compare);
        const complete = record.id != null && anchor != null && hasEffectiveSegments && !missingTaskIds.length
          && record.adjacency === "REQUIRED"
          && record.internalTransition === "INCLUDED" && record.resourceContinuity === "REQUIRED";
        if (!complete) {
          anchoredOperationContractPresent = false;
          addIssue("INCOMPLETE_ANCHORED_OPERATION", "anchored-operation", id, path, "Anchored operation lacks required fields, effective segments, or existing tasks.", {
            hasEffectiveSegments,
            missingTaskIds,
          });
        }
        const members = referencedTaskIds;
        const ambiguous = operationIds.has(id) || new Set(members).size !== members.length
          || members.some((member) => memberOwners.has(member) && memberOwners.get(member) !== id);
        if (ambiguous) {
          anchoredOperationContractPresent = false;
          addIssue("AMBIGUOUS_ANCHORED_OPERATION", "anchored-operation", id, path, "Anchored operation reuses operation or task identities ambiguously.", { memberTaskIds: members });
        }
        operationIds.add(id);
        members.forEach((member) => memberOwners.set(member, id));
      });
    }
  }

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
    planResourceCount: new Set(input.planResourceItems.map((resource) => String(resource.id))).size,
    resourceItemCount: new Set(input.planResourceItems.map((resource) => String(resource.resourceItemId))).size,
    resourceAssignmentReferenceCount,
    resourceComponentReferenceCount,
    missingResourceReferenceCount,
    dependencyCount,
    breakCount,
    transportConfigured,
    setupConfigurationDetected,
    integrationConfigurationPresent,
    mainFlowConfigurationComplete,
    searchPolicyConfigurationPresent,
    searchBudgetConfigurationComplete,
    timeGridVerifiable,
    transitionConfigurationComplete,
    anchoredOperationContractPresent,
    unresolvedTaskRoleCount,
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
    identityMapFingerprint: mainFlow?.spaceId === null || mainFlow?.spaceId === undefined || mainFlow.spaceId === ""
      ? fingerprint(identityMap)
      : fingerprint({ identityMap, plannerNextMainFlowSpaceId: String(mainFlow.spaceId) }),
    readOnly: true,
  });
}
