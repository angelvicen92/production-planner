import { createHash } from "node:crypto";
import type { EngineInput, ProtectedBreakInput, TimeWindow } from "../../types";
import { resolveEffectiveTaskResourceAssignments } from "./effectiveTaskResourceAssignments";
import { resolveEffectivePlanResourceAvailability } from "./effectivePlanResourceAvailability";
import { resolveEffectivePlanSpatialAvailability } from "./effectivePlanSpatialAvailability";
import { resolveEffectiveTaskFixedInterval } from "./effectiveTaskFixedInterval";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./plannerNextCapabilities";
import { resolveProjectedPlannerNextTaskResources, type ProjectedPlannerNextTaskResources } from "./projectedTaskResources";
import { resolveParticipantScopedMeals } from "./assignedParticipantMealBreaks";
import { isFlexibleParticipantMealTask, resolveFlexibleParticipantMealTasks } from "./flexibleParticipantMealTasks";
import { resolveAssignedResourceMealBreaks } from "./assignedResourceMealBreaks";
import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";
import { resolveFlexibleOperationalMealPolicies } from "./flexibleOperationalMealPolicies";
import {
  projectEngineInputCoachRouteTransitions,
  resolveEngineInputCoachRouteTransitions,
} from "./engineInputCoachRouteTransitions";
import {
  projectEngineInputRoundSynchronizations,
  resolveEngineInputRoundSynchronizations,
} from "./engineInputRoundSynchronizations";

export type EngineInputPreflightStatus = "SUPPORTED" | "UNSUPPORTED";

export type EngineInputPreflightReasonCode =
  | "ADAPTED_PROBLEM_NOT_REPRESENTABLE"
  | "AMBIGUOUS_ANCHORED_OPERATION"
  | "DEPENDENCY_CYCLE"
  | "DUPLICATE_DEPENDENCY_REFERENCE"
  | "DUPLICATE_ID"
  | "INCOMPLETE_ANCHORED_OPERATION"
  | "INCONSISTENT_SPACE_ZONE_REFERENCE"
  | "INVALID_SEARCH_BUDGET"
  | "INVALID_SEARCH_POLICY_CONFIGURATION"
  | "INVALID_TRANSITION_CONFIGURATION"
  | "MISSING_COACH_REFERENCE"
  | "MISSING_DEPENDENCY_REFERENCE"
  | "MISSING_MAIN_FLOW_CONFIGURATION"
  | "MISSING_PARTICIPANT_AVAILABILITY"
  | "MISSING_PARTICIPANT_REFERENCE"
  | "MISSING_PARTICIPANT_MEAL_WINDOW"
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
  | "PARTICIPANT_MEAL_IDENTITY_CONFLICT"
  | "RESOURCE_MEAL_IDENTITY_CONFLICT"
  | "UNREPRESENTABLE_ITINERANT_UNIT_BREAK"
  | "ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED"
  | "UNSUPPORTED_JOINT_GROUP_MAPPING"
  | "UNREPRESENTABLE_RESOURCE_BREAK"
  | "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE"
  | "PROTECTED_TASK_WITHOUT_FIXED_PLANNING"
  | "PROTECTED_PARTICIPANT_MEAL_WITHOUT_FIXED_INTERVAL"
  | "INVALID_PARTICIPANT_MEAL_DURATION"
  | "INVALID_PARTICIPANT_MEAL_CAPACITY"
  | "UNREPRESENTABLE_RESOURCE_LOCK"
  | "UNREPRESENTABLE_PARTICIPANT_BREAK"
  | "UNREPRESENTABLE_PARTICIPANT_MEAL_TASK"
  | "UNREPRESENTABLE_SPACE_LOCK"
  | "UNREPRESENTABLE_TIME_LOCK"
  | "UNSUPPORTED_BREAK_SCOPE"
  | "UNSUPPORTED_OPERATIONAL_MEAL_POLICY"
  | "UNSUPPORTED_COACH_ROUTE_TRANSITION"
  | "UNSUPPORTED_COACH_RESOURCE_MAPPING"
  | "UNSUPPORTED_LOCK_TYPE"
  | "UNSUPPORTED_RESOURCE_REQUIREMENT"
  | "UNSUPPORTED_ROUND_SYNCHRONIZATION"
  | "UNSUPPORTED_FLEXIBLE_SETUP_ORDER"
  | "UNSUPPORTED_SETUP_MAPPING"
  | "UNSUPPORTED_SPACE_CAPACITY"
  | "UNSUPPORTED_SPACE_OCCUPANCY"
  | "UNSUPPORTED_TASK_ROLE"
  | "UNSUPPORTED_TASK_STATUS"
  | "UNSUPPORTED_TIME_GRID"
  | "UNSUPPORTED_TIME_VALUE"
  | "UNSUPPORTED_TRANSPORT_CONTRACT";

export type EngineInputIdentityNamespace =
  | "anchored-operation"
  | "break"
  | "itinerant-team"
  | "joint-group"
  | "lock"
  | "participant"
  | "plan"
  | "plan-resource"
  | "resource-item"
  | "resource-type"
  | "round-synchronization"
  | "setup-family"
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
  requiredPlanResourceCount: number;
  usableRequiredPlanResourceCount: number;
  unusableRequiredPlanResourceCount: number;
  protectedTaskResourceAvailabilityConflictCount: number;
  requiredSpaceCount: number;
  usableRequiredSpaceCount: number;
  unusableRequiredSpaceCount: number;
  requiredZoneCount: number;
  protectedTaskSpatialAvailabilityConflictCount: number;
  resourceItemCount: number;
  resourceAssignmentReferenceCount: number;
  resourceComponentReferenceCount: number;
  missingResourceReferenceCount: number;
  dependencyCount: number;
  breakCount: number;
  participantScopedMealCount: number;
  supportedParticipantScopedMealCount: number;
  unsupportedParticipantScopedMealCount: number;
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
  "anchored-operation": "anchored-operation",
  break: "break",
  "itinerant-team": "itinerant-team",
  "joint-group": "joint-group",
  lock: "lock",
  participant: "participant",
  plan: "plan",
  "plan-resource": "plan-resource",
  "resource-item": "resource-item",
  "resource-type": "resource-type",
  "round-synchronization": "round-synchronization",
  "setup-family": "setup-family",
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
  "planZoneSettings", "planSpaceSettings", "setupPolicies", "families", "coachRouteTransitions",
  "roundSynchronizations", "operationalMealPolicies", "planResourceItemIds",
]);
const ORDERED_ARRAY_KEYS = new Set(["beforeTaskIds", "afterTaskIds", "familyOrder"]);

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
    return !ORDERED_ARRAY_KEYS.has(key) && (SET_ARRAY_KEYS.has(key) || path.some((segment) => SET_ARRAY_KEYS.has(segment)))
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
  const mappingPresent = Object.prototype.hasOwnProperty.call(runtime, "vocalCoachPlanResourceItemIdByContestantId");
  const plannerNext = input.plannerNext as unknown;
  const plannerNextRecord = plannerNext && typeof plannerNext === "object" && !Array.isArray(plannerNext)
    ? plannerNext as unknown as Record<string, unknown> : undefined;
  const projectRecord = (value: unknown, keys: readonly string[]): unknown => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]))
    : value;
  const anchoredAccompaniments = Array.isArray(runtime.anchoredAccompaniments)
    ? runtime.anchoredAccompaniments.map((entry) => entry && typeof entry === "object" ? Object.fromEntries(
      ["id", "anchorTaskId", "beforeTaskIds", "afterTaskIds", "adjacency", "internalTransition", "resourceContinuity"]
        .map((key) => [key, (entry as Record<string, unknown>)[key]]),
    ) : entry).sort((left, right) => compare(
      String((left as Record<string, unknown> | null)?.id ?? ""),
      String((right as Record<string, unknown> | null)?.id ?? ""),
    ))
    : runtime.anchoredAccompaniments;
  const tasks = input.tasks.map((task) => {
    const planifiable = task.status === "pending" || task.status === "interrupted";
    const runtimeJointGroupId = (task as unknown as Record<string, unknown>).jointGroupId;
    return {
      id: task.id, planId: task.planId, templateId: task.templateId, contestantId: task.contestantId,
      zoneId: task.zoneId, spaceId: task.spaceId, status: task.status, durationOverrideMin: task.durationOverrideMin,
      camerasOverride: task.camerasOverride, resourceRequirements: task.resourceRequirements,
      itinerantTeamId: task.itinerantTeamId, allowedItinerantTeamIds: task.allowedItinerantTeamIds,
      ...(runtimeJointGroupId == null ? {} : { jointGroupId: runtimeJointGroupId }),
      ...(((task as unknown as Record<string, unknown>).setupFamilyId) == null ? {} : { setupFamilyId: (task as unknown as Record<string, unknown>).setupFamilyId }),
      dependsOnTaskIds: task.dependsOnTaskIds, dependsOnTaskId: task.dependsOnTaskId,
      dependsOnTemplateIds: task.dependsOnTemplateIds, dependsOnTemplateId: task.dependsOnTemplateId,
      ...(task.status !== "cancelled" ? { assignedResourceIds: task.assignedResourceIds } : {}),
      fixedWindowStart: task.fixedWindowStart, fixedWindowEnd: task.fixedWindowEnd,
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
  const projectAvailabilityEndpoint = (
    resource: EngineInput["planResourceItems"][number],
    key: "availabilityStart" | "availabilityEnd",
  ): unknown => resource[key] === undefined ? { absent: true } : resource[key];
  const planResourceItems = input.planResourceItems.map((resource) => ({
    id: resource.id,
    resourceItemId: resource.resourceItemId,
    typeId: resource.typeId,
    isAvailable: resource.isAvailable,
    availabilityStart: projectAvailabilityEndpoint(resource, "availabilityStart"),
    availabilityEnd: projectAvailabilityEndpoint(resource, "availabilityEnd"),
  }));
  const endpoint = (row: Record<string, unknown>, key: string): unknown => Object.prototype.hasOwnProperty.call(row, key) && row[key] === undefined ? { undefined: true } : Object.prototype.hasOwnProperty.call(row, key) ? row[key] : { absent: true };
  const planZoneSettings = input.planZoneSettings?.map((row) => ({ id: endpoint(row as unknown as Record<string, unknown>, "id"), zoneId: row.zoneId, availabilityStart: endpoint(row as unknown as Record<string, unknown>, "availabilityStart"), availabilityEnd: endpoint(row as unknown as Record<string, unknown>, "availabilityEnd"), source: endpoint(row as unknown as Record<string, unknown>, "source") }));
  const planSpaceSettings = input.planSpaceSettings?.map((row) => ({ id: endpoint(row as unknown as Record<string, unknown>, "id"), spaceId: row.spaceId, zoneId: row.zoneId, availabilityStart: endpoint(row as unknown as Record<string, unknown>, "availabilityStart"), availabilityEnd: endpoint(row as unknown as Record<string, unknown>, "availabilityEnd"), source: endpoint(row as unknown as Record<string, unknown>, "source") }));
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
    operationalMealPolicies: input.operationalMealPolicies,
    contestantMealDurationMinutes: input.contestantMealDurationMinutes,
    contestantMealMaxSimultaneous: input.contestantMealMaxSimultaneous,
    mealTaskTemplateId: input.mealTaskTemplateId,
    tasks,
    locks: input.locks,
    planResourceItems,
    planZoneSettings,
    planSpaceSettings,
    coachResourceIds: input.coachResourceIds,
    ...(mappingPresent ? { vocalCoachPlanResourceItemIdByContestantId: runtime.vocalCoachPlanResourceItemIdByContestantId } : {}),
    resourceItemComponents: input.resourceItemComponents,
    contestantAvailabilityById: input.contestantAvailabilityById,
    zoneResourceAssignments: input.zoneResourceAssignments,
    spaceResourceAssignments: input.spaceResourceAssignments,
    spaceParentById: input.spaceParentById,
    spaceCapacityById: input.spaceCapacityById,
    spaceConcurrencyById: input.spaceConcurrencyById,
    spaceIsExclusiveById: input.spaceIsExclusiveById,
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
      ...input.transportSettings,
    },
    transportSpaceId: input.transportSpaceId,
    transportVanCapacityPresent: input.transportVanCapacity ?? false,
    vanCapacityPresent: input.vanCapacity ?? false,
    arrivalGroupingTargetPresent: input.arrivalGroupingTarget ?? false,
    departureGroupingTargetPresent: input.departureGroupingTarget ?? false,
    arrivalMinGapMinutesPresent: input.arrivalMinGapMinutes ?? false,
    departureMinGapMinutesPresent: input.departureMinGapMinutes ?? false,
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
    setupPolicies: Array.isArray(runtime.setupPolicies) && runtime.setupPolicies.length === 0 ? undefined : runtime.setupPolicies,
    roundSynchronizations: projectEngineInputRoundSynchronizations(input),
    coachRouteTransitions: projectEngineInputCoachRouteTransitions(input),
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

type ProtectedTaskIntervalResolution =
  | Readonly<{ status: "COMPLETE_REAL" | "COMPLETE_PLANNED"; interval: TimeWindow; source: "real" | "planned" }>
  | Readonly<{ status: "PARTIAL_REAL" | "MISSING" }>;

export function resolveProtectedTaskInterval(task: EngineInput["tasks"][number]): ProtectedTaskIntervalResolution {
  const anyReal = task.startReal != null || task.endReal != null;
  if (anyReal && (task.startReal == null || task.endReal == null)) return Object.freeze({ status: "PARTIAL_REAL" });
  if (task.startReal != null && task.endReal != null) return Object.freeze({ status: "COMPLETE_REAL", interval: Object.freeze({ start: task.startReal, end: task.endReal }), source: "real" });
  if (task.startPlanned != null && task.endPlanned != null) return Object.freeze({ status: "COMPLETE_PLANNED", interval: Object.freeze({ start: task.startPlanned, end: task.endPlanned }), source: "planned" });
  return Object.freeze({ status: "MISSING" });
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
  const effectiveTaskResourceAssignments = resolveEffectiveTaskResourceAssignments(input);
  const issues: EngineInputPreflightIssue[] = [];
  const identities = new Map<EngineInputIdentityNamespace, Set<string>>();
  const authoritativeDefinitions = new Map<EngineInputIdentityNamespace, Set<string>>();
  const identityMap: EngineInputIdentity[] = [];
  const participantsRequiringAvailability = new Set<string>();
  const flexibleParticipantMealTaskIds = new Set(input.tasks.filter((task) => isFlexibleParticipantMealTask(input, task)).map((task) => task.id));
  const flexibleParticipantMeals = resolveFlexibleParticipantMealTasks(input);
  const resourceMealTaskIds = new Set(input.tasks.filter(task=>task.breakKind==="resource_meal").map(task=>task.id));
  const resourceMeals = resolveAssignedResourceMealBreaks(input);
  const operationalMealPolicies = resolveFlexibleOperationalMealPolicies(input);
  const setupPoliciesValue = (input as unknown as Record<string, unknown>).setupPolicies;
  const setupPoliciesPresent = Object.prototype.hasOwnProperty.call(
    input as unknown as Record<string, unknown>,
    "setupPolicies",
  );
  const setupPoliciesRuntime = Array.isArray(setupPoliciesValue)
    ? setupPoliciesValue.map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : {})
    : [];

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

  for (const defect of flexibleParticipantMeals.defects) addIssue(defect.code, "task", defect.taskId, `tasks.${defect.taskId}.participantMeal`, "Flexible participant meal task cannot be represented exactly.", defect.details);
  for (const policy of operationalMealPolicies) if (policy.status === "UNSUPPORTED") addIssue(
    "UNSUPPORTED_OPERATIONAL_MEAL_POLICY", "break", policy.id || "missing", `operationalMealPolicies.${policy.id || "missing"}`,
    "Flexible operational meal policy cannot be represented exactly.", { defects: policy.defects, resourceIds: policy.resourceIds, spaceIds: policy.spaceIds, window: policy.window, duration: policy.duration },
  );

  addIdentity("plan", input.planId, "planId", true);

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;
    addIdentity("task", task.id, `${path}.id`, true);
    addIdentity("template", task.templateId, `${path}.templateId`);
    addIdentity("participant", task.contestantId, `${path}.contestantId`);
    if (task.contestantId != null) participantsRequiringAvailability.add(String(task.contestantId));
    if (isPositiveInteger(task.spaceId)) addIdentity("space", task.spaceId, `${path}.spaceId`);
    addIdentity("zone", task.zoneId, `${path}.zoneId`);
    addIdentity("break", task.breakId, `${path}.breakId`);
    addIdentity("itinerant-team", task.itinerantTeamId, `${path}.itinerantTeamId`);
    if (task.status !== "cancelled" && typeof task.jointGroupId === "string" && task.jointGroupId.trim() === task.jointGroupId && task.jointGroupId !== "") addIdentity("joint-group", task.jointGroupId, `${path}.jointGroupId`);
    (task.dependsOnTaskIds ?? (task.dependsOnTaskId != null ? [task.dependsOnTaskId] : []))
      .forEach((id) => addIdentity("task", id, `${path}.dependencies`));
    (task.dependsOnTemplateIds ?? (task.dependsOnTemplateId != null ? [task.dependsOnTemplateId] : []))
      .forEach((id) => addIdentity("template", id, `${path}.templateDependencies`));
    task.allowedItinerantTeamIds?.forEach((id) => addIdentity("itinerant-team", id, `${path}.allowedItinerantTeamIds`));
    if (task.status !== "cancelled") task.assignedResourceIds?.forEach((id) => addIdentity("plan-resource", id, `${path}.assignedResourceIds`));
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
  (input.operationalMealPolicies ?? []).forEach((policy, index) => {
    addIdentity("break", policy.id, `operationalMealPolicies.${index}.id`, true);
    policy.planResourceItemIds?.forEach((id) => addIdentity("plan-resource", id, `operationalMealPolicies.${index}.planResourceItemIds`));
    policy.spaceIds?.forEach((id) => addIdentity("space", id, `operationalMealPolicies.${index}.spaceIds`));
  });
  const runtimeInput = input as unknown as Record<string, unknown>;
  const coachMappingPresent = Object.prototype.hasOwnProperty.call(runtimeInput, "vocalCoachPlanResourceItemIdByContestantId");
  const rawCoachMapping = runtimeInput.vocalCoachPlanResourceItemIdByContestantId;
  const coachMappingValid = rawCoachMapping !== null && typeof rawCoachMapping === "object" && !Array.isArray(rawCoachMapping)
    && (Object.getPrototypeOf(rawCoachMapping) === Object.prototype || Object.getPrototypeOf(rawCoachMapping) === null);
  const coachMappingEntries = coachMappingPresent && coachMappingValid
    ? Object.entries(rawCoachMapping as Record<string, unknown>).sort(([left], [right]) => compare(left, right))
    : [];
  const validExplicitRelationCoachIds = new Set<number>();
  const auditedPositiveExplicitCoachIds = new Set<number>();
  if (coachMappingPresent && !coachMappingValid) {
    addIssue("MISSING_COACH_REFERENCE", "plan", input.planId, "vocalCoachPlanResourceItemIdByContestantId", "Contestant vocal-coach assignment mapping is not an indexable object.", {
      receivedType: rawCoachMapping === null ? "null" : Array.isArray(rawCoachMapping) ? "array" : typeof rawCoachMapping,
      mappingPresent: true,
      mappingValid: false,
    });
  }
  for (const [contestantKey, coachId] of coachMappingEntries) {
    const contestantId = Number(contestantKey);
    const contestantIdValid = /^[1-9]\d*$/.test(contestantKey) && Number.isFinite(contestantId) && Number.isInteger(contestantId);
    const coachReferenceValid = isPositiveInteger(coachId);
    if (contestantIdValid) {
      addIdentity("participant", contestantId, `vocalCoachPlanResourceItemIdByContestantId.${contestantKey}`);
    }
    if (coachReferenceValid) {
      auditedPositiveExplicitCoachIds.add(coachId);
      addIdentity("plan-resource", coachId, `vocalCoachPlanResourceItemIdByContestantId.${contestantKey}`);
      if (contestantIdValid) validExplicitRelationCoachIds.add(coachId);
    }
  }
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

  input.tasks.forEach((task) => { if (isPositiveInteger(task.spaceId)) referencedSpaceIds.add(String(task.spaceId)); });
  input.protectedBreaks?.forEach((entry) => { if (entry.spaceId != null) referencedSpaceIds.add(String(entry.spaceId)); });
  input.operationalMealPolicies?.flatMap((policy) => policy.spaceIds ?? []).forEach((id) => referencedSpaceIds.add(String(id)));
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

  input.planZoneSettings?.forEach((zone) => addIdentity("zone", zone.zoneId, `planZoneSettings.${zone.zoneId}`));
  input.planSpaceSettings?.forEach((space) => {
    describedSpaceIds.add(String(space.spaceId));
    addIdentity("space", space.spaceId, `planSpaceSettings.${space.spaceId}`);
    addIdentity("zone", space.zoneId, `planSpaceSettings.${space.spaceId}.zoneId`);
  });
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

  for (const [index, policy] of setupPoliciesRuntime.entries()) {
    const spaceId = policy.spaceId;
    addIdentity("space", spaceId, `setupPolicies.${index}.spaceId`);
    if (isPositiveInteger(spaceId)) {
      for (const family of [...(Array.isArray(policy.families) ? policy.families : []), ...(Array.isArray(policy.familyOrder) ? policy.familyOrder : [])]) {
        if (typeof family === "string" && family !== "") addIdentity("setup-family", `${spaceId}:${family}`, `setupPolicies.${index}.families`);
      }
    }
  }
  for (const task of input.tasks) {
    if (task.status !== "cancelled" && task.setupFamilyId != null && isPositiveInteger(task.spaceId) && typeof task.setupFamilyId === "string" && task.setupFamilyId !== "") {
      addIdentity("setup-family", `${task.spaceId}:${task.setupFamilyId}`, `tasks.${task.id}.setupFamilyId`);
    }
  }

  const rawRoundSynchronizations =
    (input as unknown as Record<string, unknown>).roundSynchronizations;
  if (Array.isArray(rawRoundSynchronizations)) {
    rawRoundSynchronizations.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const policy = raw as Record<string, unknown>;
      addIdentity("round-synchronization", policy.id, `roundSynchronizations.${index}.id`, true);
      if (!Array.isArray(policy.lanes)) return;
      policy.lanes.forEach((rawLane, laneIndex) => {
        if (!rawLane || typeof rawLane !== "object" || Array.isArray(rawLane)) return;
        const lane = rawLane as Record<string, unknown>;
        addIdentity("space", lane.spaceId, `roundSynchronizations.${index}.lanes.${laneIndex}.spaceId`);
        if (Array.isArray(lane.taskIds)) lane.taskIds.forEach((taskId) =>
          addIdentity("task", taskId, `roundSynchronizations.${index}.lanes.${laneIndex}.taskIds`));
      });
    });
  }

  const rawCoachRouteTransitions =
    (input as unknown as Record<string, unknown>).coachRouteTransitions;
  if (Array.isArray(rawCoachRouteTransitions)) {
    rawCoachRouteTransitions.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const route = raw as Record<string, unknown>;
      addIdentity("plan-resource", route.coachPlanResourceItemId, `coachRouteTransitions.${index}.coachPlanResourceItemId`);
      addIdentity("space", route.fromSpaceId, `coachRouteTransitions.${index}.fromSpaceId`);
      addIdentity("space", route.toSpaceId, `coachRouteTransitions.${index}.toSpaceId`);
    });
  }

  const addBreakIdentities = (entry: ProtectedBreakInput | undefined, path: string): void => {
    if (!entry) return;
    addIdentity("break", entry.id, `${path}.id`, true);
    addIdentity("participant", entry.contestantId, `${path}.contestantId`);
    if (entry.contestantId != null) participantsRequiringAvailability.add(String(entry.contestantId));
    addIdentity("space", entry.spaceId, `${path}.spaceId`);
    addIdentity("zone", entry.zoneId, `${path}.zoneId`);
    addIdentity("itinerant-team", entry.itinerantTeamId, `${path}.itinerantTeamId`);
  };
  addBreakIdentities(input.actualMeal, "actualMeal");
  input.protectedBreaks?.forEach((entry) => addBreakIdentities(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
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
  const runtimeAnchors = input.anchoredAccompaniments;
  if (Array.isArray(runtimeAnchors)) {
    runtimeAnchors.forEach((operation, index) => {
      if (!operation || typeof operation !== "object") return;
      addIdentity("anchored-operation", operation.id, `anchoredAccompaniments.${index}.id`, true);
      addIdentity("task", operation.anchorTaskId, `anchoredAccompaniments.${index}.anchorTaskId`);
      if (Array.isArray(operation.beforeTaskIds)) operation.beforeTaskIds.forEach((id) => addIdentity("task", id, `anchoredAccompaniments.${index}.beforeTaskIds`));
      if (Array.isArray(operation.afterTaskIds)) operation.afterTaskIds.forEach((id) => addIdentity("task", id, `anchoredAccompaniments.${index}.afterTaskIds`));
    });
  }
  identityMap.sort((left, right) => compare(`${left.namespace}\0${left.sourceId}`, `${right.namespace}\0${right.sourceId}`));

  effectiveTaskResourceAssignments.zoneConflicts.forEach((conflict) => addIssue(
    "INCONSISTENT_SPACE_ZONE_REFERENCE",
    "task",
    conflict.taskId,
    conflict.path,
    "Task zone contradicts the zone mapped from its exact space.",
    {
      taskId: conflict.taskId,
      spaceId: conflict.spaceId,
      explicitZoneId: conflict.explicitZoneId,
      mappedZoneId: conflict.mappedZoneId,
      zoneResourcesApplied: false,
    },
  ));

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
  const setupPolicyBySpace = new Map<number, { families: Set<string>; policy: Record<string, unknown> }>();
  const seenSetupPolicySpaces = new Set<number>();
  const timeGrid = (input.plannerNext as { timeGridMinutes?: unknown } | undefined)?.timeGridMinutes;
  const coachRouteTransitionResolution = resolveEngineInputCoachRouteTransitions(
    input,
    timeGrid,
    new Set<number>([
      ...validExplicitRelationCoachIds,
      ...(input.coachResourceIds ?? []),
    ]),
  );
  if (coachRouteTransitionResolution.invalidContainer) {
    addIssue(
      "UNSUPPORTED_COACH_ROUTE_TRANSITION",
      "plan",
      input.planId,
      "coachRouteTransitions",
      "coachRouteTransitions must be an array when present.",
    );
  }
  coachRouteTransitionResolution.defects.forEach((defect) => addIssue(
    "UNSUPPORTED_COACH_ROUTE_TRANSITION",
    "coachRouteTransition",
    defect.index,
    `coachRouteTransitions.${defect.index}`,
    "Coach route transition cannot be projected losslessly.",
    { ...defect.details },
  ));
  const roundSynchronizationResolution =
    resolveEngineInputRoundSynchronizations(input, timeGrid);
  if (roundSynchronizationResolution.invalidContainer) {
    addIssue(
      "UNSUPPORTED_ROUND_SYNCHRONIZATION",
      "plan",
      input.planId,
      "roundSynchronizations",
      "roundSynchronizations must be an array when present.",
    );
  }
  roundSynchronizationResolution.defects.forEach((defect) => addIssue(
    "UNSUPPORTED_ROUND_SYNCHRONIZATION",
    "roundSynchronization",
    defect.index,
    `roundSynchronizations.${defect.index}`,
    "Round synchronization cannot be projected losslessly.",
    { ...defect.details },
  ));

  if (setupPoliciesPresent && setupPoliciesValue !== undefined && !Array.isArray(setupPoliciesValue)) {
    addIssue(
      "UNSUPPORTED_SETUP_MAPPING",
      "plan",
      input.planId,
      "setupPolicies",
      "setupPolicies must be an array when present.",
      { receivedType: setupPoliciesValue === null ? "null" : typeof setupPoliciesValue },
    );
  }

  setupPoliciesRuntime.forEach((policy, index) => {
    const path = `setupPolicies.${index}`;
    const spaceId = policy.spaceId;
    if (!isPositiveInteger(spaceId) || !input.planSpaceSettings?.some((space) => space.spaceId === spaceId)) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.spaceId`, "Setup policy space must be a positive integer existing in daily spaces.", { spaceId });
    if (isPositiveInteger(spaceId)) {
      if (seenSetupPolicySpaces.has(spaceId)) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.spaceId`, "Duplicate setup policy for space.", { spaceId });
      seenSetupPolicySpaces.add(spaceId);
    }
    const families = Array.isArray(policy.families) ? policy.families : [];
    const invalidFamilies = families.filter((family) => typeof family !== "string" || family === "" || family.trim() !== family);
    const duplicateFamilies = families.filter((family, i) => typeof family === "string" && families.indexOf(family) !== i);
    if (families.length === 0 || invalidFamilies.length || duplicateFamilies.length) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.families`, "Setup policy families must be a non-empty set of trimmed strings.", { invalidFamilies, duplicateFamilies });
    if (policy.oneBlockPerFamily !== true) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.oneBlockPerFamily`, "oneBlockPerFamily must be exactly true.");
    if (policy.reentry !== "FORBIDDEN") addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.reentry`, "reentry must be exactly FORBIDDEN.");
    const prep = policy.preparationMinutesBetweenFamilies;
    if (!isPositiveInteger(prep) || (isPositiveInteger(timeGrid) && isPositiveInteger(prep) && prep % timeGrid !== 0)) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.preparationMinutesBetweenFamilies`, "Preparation minutes must be a positive integer compatible with timeGridMinutes.", { preparationMinutesBetweenFamilies: prep, timeGridMinutes: timeGrid });
    if (policy.orderConstraint === "UNSPECIFIED") {
      if (Object.prototype.hasOwnProperty.call(policy, "familyOrder")) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.familyOrder`, "UNSPECIFIED setup policy must omit familyOrder.");
    } else if (policy.orderConstraint === "EXPLICIT") {
      const order = policy.familyOrder;
      const missingOrder = !Array.isArray(order);
      const orderValues = Array.isArray(order) ? order : [];
      const duplicateOrder = orderValues.filter((family, i) => typeof family === "string" && orderValues.indexOf(family) !== i);
      const familySet = new Set(families);
      const exact = !missingOrder && orderValues.length === families.length && duplicateOrder.length === 0 && orderValues.every((family) => familySet.has(family));
      if (!exact) addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.familyOrder`, "EXPLICIT setup policy requires familyOrder to be an exact ordered permutation of families.", { familyOrder: order, families });
    } else {
      addIssue("UNSUPPORTED_SETUP_MAPPING", "setupPolicy", index, `${path}.orderConstraint`, "Unsupported setup order constraint.", { orderConstraint: policy.orderConstraint });
    }
    if (isPositiveInteger(spaceId)) setupPolicyBySpace.set(spaceId, { families: new Set(families.filter((f): f is string => typeof f === "string")), policy });
  });

  for (const task of input.tasks) {
    const path = `tasks.${task.id}`;

    const runtimeJointGroupId = (task as unknown as Record<string, unknown>).jointGroupId;
    const hasJointGroupId = Object.prototype.hasOwnProperty.call(task as unknown as Record<string, unknown>, "jointGroupId");
    if (hasJointGroupId && runtimeJointGroupId !== null && runtimeJointGroupId !== undefined) {
      const active = task.status !== "cancelled";
      const isMeal = flexibleParticipantMealTaskIds.has(task.id);
      const isResourceBreak = resourceMealTaskIds.has(task.id);
      const validString = typeof runtimeJointGroupId === "string" && runtimeJointGroupId !== "" && runtimeJointGroupId.trim() === runtimeJointGroupId;
      if (typeof runtimeJointGroupId !== "string" || !validString || (active && (task.plannerNextKind === "technical" || task.contestantId == null || task.plannerNextKind !== "auxiliary" || isMeal || isResourceBreak))) {
        addIssue("UNSUPPORTED_JOINT_GROUP_MAPPING", "task", task.id, `${path}.jointGroupId`, "Task jointGroupId cannot be projected losslessly to Planner Next.", { jointGroupId: runtimeJointGroupId, status: task.status, plannerNextKind: task.plannerNextKind ?? null, contestantId: task.contestantId ?? null, flexibleParticipantMeal: isMeal, resourceMeal: isResourceBreak });
      }
    }
    const runtimeSetupFamilyId = (task as unknown as Record<string, unknown>).setupFamilyId;
    if (task.status !== "cancelled" && runtimeSetupFamilyId != null) {
      const activeSetupPolicy = isPositiveInteger(task.spaceId) ? setupPolicyBySpace.get(task.spaceId) : undefined;
      const isMeal = flexibleParticipantMealTaskIds.has(task.id);
      const isResourceBreak = resourceMealTaskIds.has(task.id);
      const validString = typeof runtimeSetupFamilyId === "string" && runtimeSetupFamilyId !== "" && runtimeSetupFamilyId.trim() === runtimeSetupFamilyId;
      if (!validString || task.plannerNextKind !== "auxiliary" || task.contestantId == null || !isPositiveInteger(task.spaceId) || isMeal || isResourceBreak || !activeSetupPolicy || !activeSetupPolicy.families.has(runtimeSetupFamilyId)) {
        addIssue("UNSUPPORTED_SETUP_MAPPING", "task", task.id, `${path}.setupFamilyId`, "Task setupFamilyId cannot be projected losslessly to Planner Next.", { setupFamilyId: runtimeSetupFamilyId, status: task.status, plannerNextKind: task.plannerNextKind ?? null, contestantId: task.contestantId ?? null, spaceId: task.spaceId ?? null, flexibleParticipantMeal: isMeal, resourceMeal: isResourceBreak, policyFound: Boolean(activeSetupPolicy) });
      }
    }
    if (task.planId !== input.planId) addIssue("PLAN_ID_MISMATCH", "task", task.id, `${path}.planId`, "Task belongs to another plan.");
    if (!validStatuses.has(task.status)) addIssue("UNSUPPORTED_TASK_STATUS", "task", task.id, `${path}.status`, "Unknown task status.");
    if (task.status !== "cancelled" && !flexibleParticipantMealTaskIds.has(task.id) && !resourceMealTaskIds.has(task.id)) {
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
      if(resourceMealTaskIds.has(task.id)) continue;
      const effectiveDuration = task.durationOverrideMin ?? (flexibleParticipantMealTaskIds.has(task.id) ? input.contestantMealDurationMinutes : undefined);
      if (effectiveDuration == null) {
        missingDurationTaskCount++;
        addIssue("MISSING_TASK_DURATION", "task", task.id, `${path}.durationOverrideMin`, "Authoritative duration is absent.");
      } else if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) {
        addIssue("UNSUPPORTED_TIME_VALUE", "task", task.id, `${path}.durationOverrideMin`, "Duration must be finite and positive.", {
          receivedValue: Number.isNaN(effectiveDuration) ? "NaN" : effectiveDuration,
        });
      } else {
        auditedDurations.push(effectiveDuration);
      }
    }

    if (task.fixedWindowStart != null || task.fixedWindowEnd != null) {
      validateInterval({ start: task.fixedWindowStart ?? "", end: task.fixedWindowEnd ?? "" }, "task", task.id, `${path}.fixedWindow`);
    }
    if (task.status === "done" || task.status === "in_progress") {
      const protectedTime = resolveProtectedTaskInterval(task);
      if (protectedTime.status === "PARTIAL_REAL") {
        addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, `${path}.realPlanning`, "Protected task has only one real endpoint; real and planned times cannot be combined.", {
          endReal: task.endReal ?? null,
          startReal: task.startReal ?? null,
        });
      } else if (protectedTime.status === "MISSING") {
        addIssue("PROTECTED_TASK_WITHOUT_FIXED_PLANNING", "task", task.id, path, "Protected task lacks complete fixed planning.");
      } else {
        const { start, end } = protectedTime.interval;
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
    if(resourceMealTaskIds.has(task.id)){
      const meal=resourceMeals.meals.find(entry=>entry.sourceTaskId===task.id);
      if(task.status!=="cancelled"&&meal?.status!=="SUPPORTED") addIssue(meal?.defects.includes("INVALID_ID")?"RESOURCE_MEAL_IDENTITY_CONFLICT":"UNREPRESENTABLE_RESOURCE_BREAK","task",task.id,`${path}.breakContract`,"Fixed resource meal is not exactly representable.",{defects:meal?.defects??["INVALID_TIME"]});
      if(task.status!=="cancelled")for(const id of task.assignedResourceIds??[]){resourceAssignmentReferenceCount++;if(!planResourceIds.has(String(id)))missingResource("task",task.id,`${path}.assignedResourceIds`,id,"plan-resource");}
      continue;
    }
    if (flexibleParticipantMealTaskIds.has(task.id)) {
      const hardResources = (task.assignedResourceIds?.length ?? 0) > 0 || Object.keys(task.resourceRequirements?.byItem ?? {}).length > 0 || Object.keys(task.resourceRequirements?.byType ?? {}).length > 0 || (task.resourceRequirements?.anyOf?.length ?? 0) > 0;
      if (hardResources || task.spaceId != null || task.blocksSpace === true || task.mealOccupiesSpace === true) addIssue("UNREPRESENTABLE_PARTICIPANT_MEAL_TASK", "task", task.id, `${path}.participantMealChannels`, "Participant meal must not consume space or resources.", { spaceId: task.spaceId ?? null, assignedResourceIds: task.assignedResourceIds ?? [], hardResources });
      continue;
    }
    if (task.status !== "cancelled") {
      for (const id of task.assignedResourceIds ?? []) {
        resourceAssignmentReferenceCount++;
        if (!planResourceIds.has(String(id))) missingResource("task", task.id, `${path}.assignedResourceIds`, id, "plan-resource");
      }
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
  for (const [contestantKey, coachId] of coachMappingEntries) {
    const contestantId = Number(contestantKey);
    const path = `vocalCoachPlanResourceItemIdByContestantId.${contestantKey}`;
    const contestantIdValid = /^[1-9]\d*$/.test(contestantKey) && Number.isFinite(contestantId) && Number.isInteger(contestantId);
    if (!contestantIdValid) {
      missingCoachReferenceCount++;
      addIssue("MISSING_COACH_REFERENCE", "contestant", contestantKey, path, "Contestant vocal-coach assignment has an invalid contestant ID.", {
        receivedContestantId: contestantKey,
        contestantIdValid: false,
      });
    } else if (!isPositiveInteger(coachId)) {
      missingCoachReferenceCount++;
      addIssue("MISSING_COACH_REFERENCE", "contestant", contestantId, path, "Contestant vocal-coach assignment has an invalid plan-resource reference.", {
        contestantId,
        receivedVocalCoachPlanResourceItemId: coachId,
        coachReferenceValid: false,
      });
    } else if (!planResourceIds.has(String(coachId))) {
      missingCoachReferenceCount++;
      addIssue("MISSING_COACH_REFERENCE", "contestant", contestantId, path, "Assigned vocal-coach plan-resource does not exist.", {
        contestantId,
        vocalCoachPlanResourceItemId: coachId,
        planResourceItemDefined: false,
      });
    }
  }
  for (const id of input.coachResourceIds ?? []) {
    if (!auditedPositiveExplicitCoachIds.has(id) && !planResourceIds.has(String(id))) {
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

  const spatial = resolveEffectivePlanSpatialAvailability(input.workDay, input.planZoneSettings, input.planSpaceSettings);
  spatial.defects.filter((defect) => defect.reason === "DUPLICATE_ZONE_SNAPSHOT" || defect.reason === "DUPLICATE_SPACE_SNAPSHOT")
    .forEach((defect) => addIssue("DUPLICATE_ID", defect.entity, defect.entityId,
      `${defect.entity === "zone" ? "planZoneSettings" : "planSpaceSettings"}.${String(defect.entityId)}`,
      `Duplicate authoritative daily ${defect.entity} snapshot identity.`, { reason: defect.reason }));
  const requiredSpaces = new Map<number, Set<number>>();
  const requireSpace = (spaceId: number, taskId?: number): void => {
    const tasks = requiredSpaces.get(spaceId) ?? new Set<number>();
    if (taskId !== undefined) tasks.add(taskId);
    requiredSpaces.set(spaceId, tasks);
  };
  input.tasks.filter((task) => task.status !== "cancelled").forEach((task) => {
    if (flexibleParticipantMealTaskIds.has(task.id) || resourceMealTaskIds.has(task.id)) return;
    if (isPositiveInteger(task.spaceId)) {
      requireSpace(task.spaceId, task.id);
      return;
    }
    addIssue("MISSING_SPACE_REFERENCE", "task", task.id, `tasks.${task.id}.spaceId`,
      "Active task lacks the concrete physical-space identity required by Planner Next.");
  });
  const requireBreakSpace = (entry: ProtectedBreakInput | undefined): void => { if (entry?.spaceId != null) requireSpace(entry.spaceId); };
  requireBreakSpace(input.actualMeal);
  input.protectedBreaks?.forEach(requireBreakSpace);
  [input.transportSpaceId, input.transportSettings?.transportSpaceId, mainFlow?.spaceId].forEach((id) => { if (isPositiveInteger(id)) requireSpace(id); });
  coachRouteTransitionResolution.routes.forEach((route) => {
    requireSpace(route.fromSpaceId);
    requireSpace(route.toSpaceId);
  });

  let usableRequiredSpaceCount = 0;
  let unusableRequiredSpaceCount = 0;
  const requiredZoneIds = new Set<number>();
  for (const [spaceId, taskIds] of [...requiredSpaces].sort(([a], [b]) => a - b)) {
    const effective = spatial.spacesById.get(spaceId);
    if (!effective) {
      unusableRequiredSpaceCount++;
      addIssue("MISSING_SPACE_REFERENCE", "space", spaceId, `planSpaceSettings.${spaceId}`, "Required space has no authoritative daily snapshot.", { spaceId, requiredByTaskIds: [...taskIds].sort((a, b) => a - b) });
      continue;
    }
    requiredZoneIds.add(effective.zoneId);
    if (effective.effectiveWindow) { usableRequiredSpaceCount++; continue; }
    unusableRequiredSpaceCount++;
    if (effective.defect?.reason === "DUPLICATE_SPACE_SNAPSHOT" || effective.defect?.reason === "DUPLICATE_ZONE_SNAPSHOT") continue;
    const temporal = effective.defect?.reason !== "MISSING_ZONE_SNAPSHOT";
    addIssue(temporal ? "UNSUPPORTED_TIME_VALUE" : "MISSING_SPACE_AVAILABILITY", "space", spaceId, `planSpaceSettings.${spaceId}.availability`, "Required daily space has no usable effective availability.", { spaceId, zoneId: effective.zoneId, reason: effective.defect?.reason });
  }

  for (const lock of [...input.locks].sort((left, right) => left.id - right.id)) {
    if (lock.lockType !== "time" && lock.lockType !== "full") continue;
    const lockedStart = toMinutes(lock.lockedStart);
    const lockedEnd = toMinutes(lock.lockedEnd);
    if (lockedStart === null || lockedEnd === null || lockedStart >= lockedEnd) continue;
    const task = taskById.get(String(lock.taskId));
    if (!task || task.status === "cancelled") continue;
    if (!isPositiveInteger(task.spaceId)) {
      addIssue("UNREPRESENTABLE_TIME_LOCK", "lock", lock.id, `locks.${lock.id}.spatialAvailability`,
        "Time lock has no concrete task space to audit against daily availability.", {
          lockId: lock.id, taskId: task.id, spaceId: null, zoneId: null,
          lockedInterval: { start: lock.lockedStart, end: lock.lockedEnd }, effectiveWindow: null,
          reason: "MISSING_TASK_SPACE_REFERENCE",
        });
      continue;
    }
    const effective = spatial.spacesById.get(task.spaceId);
    const effectiveStart = toMinutes(effective?.effectiveWindow?.start);
    const effectiveEnd = toMinutes(effective?.effectiveWindow?.end);
    const unavailableReason = !effective ? "MISSING_SPACE_SNAPSHOT" : effective.defect?.reason ?? "MISSING_EFFECTIVE_SPACE_WINDOW";
    const outside = effectiveStart !== null && effectiveEnd !== null && (lockedStart < effectiveStart || lockedEnd > effectiveEnd);
    if (effectiveStart !== null && effectiveEnd !== null && !outside) continue;
    addIssue("UNREPRESENTABLE_TIME_LOCK", "lock", lock.id, `locks.${lock.id}.spatialAvailability`,
      "Time lock is not contained by the authoritative daily space availability.", {
        lockId: lock.id,
        taskId: task.id,
        spaceId: task.spaceId,
        zoneId: effective?.zoneId ?? null,
        lockedInterval: { start: lock.lockedStart, end: lock.lockedEnd },
        effectiveWindow: effective?.effectiveWindow ?? null,
        reason: outside ? "LOCK_OUTSIDE_EFFECTIVE_SPACE_WINDOW" : unavailableReason,
      });
  }

  let protectedTaskSpatialAvailabilityConflictCount = 0;
  for (const task of input.tasks) {
    if ((task.status !== "done" && task.status !== "in_progress") || task.spaceId == null) continue;
    const protectedTime = resolveProtectedTaskInterval(task);
    if (protectedTime.status === "PARTIAL_REAL" || protectedTime.status === "MISSING") continue;
    const protectedInterval = protectedTime.interval;
    const effective = spatial.spacesById.get(task.spaceId);
    if (!effective?.effectiveWindow) continue;
    const start = toMinutes(protectedInterval.start), end = toMinutes(protectedInterval.end);
    const availableStart = toMinutes(effective.effectiveWindow.start), availableEnd = toMinutes(effective.effectiveWindow.end);
    if (start === null || end === null || availableStart === null || availableEnd === null || (start >= availableStart && end <= availableEnd)) continue;
    protectedTaskSpatialAvailabilityConflictCount++;
    addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, `tasks.${task.id}.spatialAvailability.${task.spaceId}`, "Protected task interval is not contained by its effective daily space availability.", { taskId: task.id, spaceId: task.spaceId, zoneId: effective.zoneId, protectedInterval, effectiveWindow: effective.effectiveWindow, intervalSource: protectedTime.source });
  }

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

  const assignmentByTaskId = new Map(effectiveTaskResourceAssignments.assignments.map((entry) => [entry.taskId, entry]));
  const coachByParticipantId = new Map(coachMappingEntries
    .filter(([participantId, coachId]) => /^[1-9]\d*$/.test(participantId) && isPositiveInteger(coachId))
    .map(([participantId, coachId]) => [Number(participantId), coachId as number]));
  const active = input.tasks.filter((task) => task.status !== "cancelled" && !flexibleParticipantMealTaskIds.has(task.id) && !resourceMealTaskIds.has(task.id));
  const participantIdsByCoachId = new Map<number, readonly number[]>();
  for (const [participantId, coachId] of coachByParticipantId) participantIdsByCoachId.set(
    coachId,
    Object.freeze([...(participantIdsByCoachId.get(coachId) ?? []), participantId].sort((a, b) => a - b)),
  );
  const projectedResourcesByTaskId = new Map<number, ProjectedPlannerNextTaskResources>();
  for (const task of active) {
    const unit=task.itinerantTeamId,allowed=task.allowedItinerantTeamIds??[],requirement=task.itinerantTeamRequirement;
    const invalidUnit=unit!=null&&(!Number.isInteger(unit)||unit<=0),missingRequired=unit==null&&requirement!==undefined&&requirement!==null&&requirement!=="none",missingAllowed=unit==null&&allowed.length>0,incompatible=unit!=null&&allowed.length>0&&!allowed.includes(unit);
    if(invalidUnit||missingRequired||missingAllowed||incompatible)addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT","task",task.id,`tasks.${task.id}.itinerantTeamRequirement`,"Itinerant-unit requirement has no concrete compatible reversible assignment.",{itinerantTeamId:unit??null,allowedItinerantTeamIds:allowed,itinerantTeamRequirement:requirement??null});
    const assignment = assignmentByTaskId.get(task.id);
    if (assignment) projectedResourcesByTaskId.set(task.id,
      resolveProjectedPlannerNextTaskResources(task, assignment, input.locks, coachByParticipantId, participantIdsByCoachId));
  }
  for(const meal of resourceMeals.meals.filter(entry=>entry.status==="SUPPORTED")){
    for(const protectedTask of active.filter(task=>task.status==="done"||task.status==="in_progress")){
      const fixed=resolveEffectiveTaskFixedInterval(protectedTask,input.locks),projection=projectedResourcesByTaskId.get(protectedTask.id);
      if(fixed.status!=="EXACT"||projection?.status!=="REPRESENTABLE")continue;
      const interval={start:toMinutes(fixed.interval.start)!,end:toMinutes(fixed.interval.end)!};
      const projectedResourceIds=[...new Set([...projection.genericResourceIds,...(projection.coachResourceId===undefined?[]:[projection.coachResourceId])])].sort((a,b)=>a-b);
      const sharedResourceIds=projectedResourceIds.filter(id=>meal.resourceIds.includes(id));
      if(sharedResourceIds.length&&interval.start<meal.minuteInterval.end&&meal.minuteInterval.start<interval.end)addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE","task",protectedTask.id,`tasks.${meal.sourceTaskId}.protectedTaskConflict.${protectedTask.id}`,"A fixed resource meal overlaps a protected task using the same projected resource.",{resourceIds:sharedResourceIds,projectedResourceIds,mealTaskId:meal.sourceTaskId,protectedTaskId:protectedTask.id,mealInterval:meal.minuteInterval,protectedTaskInterval:interval});
    }
  }
  if (integrationConfigurationRecord !== undefined) for (const task of active) {
    const fixed = resolveEffectiveTaskFixedInterval(task, input.locks);
    if (fixed.status === "CONFLICT" || fixed.status === "INVALID") {
      addIssue("UNREPRESENTABLE_TIME_LOCK", "task", task.id, `tasks.${task.id}.effectiveFixedInterval`, "Fixed temporal obligations are incomplete, invalid, contradictory, or incompatible with task duration.", { resolution: fixed.status, sources: fixed.sources });
    }
    const dependencies = [...new Set(task.dependsOnTaskIds ?? (task.dependsOnTaskId != null ? [task.dependsOnTaskId] : []))];
    if (task.plannerNextKind === "technical" && dependencies.some((id) => taskById.get(String(id))?.plannerNextKind !== "technical")) {
      addIssue("UNSUPPORTED_TASK_ROLE", "task", task.id, `tasks.${task.id}.dependsOnTaskIds`, "Planner Next technical dependencies may reference only technical tasks.", { dependencyTaskIds: dependencies });
    }
    const assignment = assignmentByTaskId.get(task.id);
    if (assignment) {
      const projection = projectedResourcesByTaskId.get(task.id)!;
      if (projection.status === "UNSUPPORTED") {
        addIssue(projection.reasonCode, "task", task.id, `tasks.${task.id}.projectedResources`, "Task resources cannot be represented without crossing the Planner Next coach and generic-resource channels.", projection.details);
      } else if (task.plannerNextKind === "vocal" && projection.genericResourceIds.length > 0) {
        addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `tasks.${task.id}.projectedResources`, "Planner Next vocal feeders cannot preserve generic resources in addition to their explicit coach.", { participantId: task.contestantId ?? null, planResourceItemId: projection.coachResourceId ?? null, additionalResourceIds: projection.genericResourceIds });
      }
    }
  }

  const requiredResources = new Map<number, { taskIds: Set<number>; lockIds: Set<number> }>();
  const requireResource = (id: number, taskId?: number, lockId?: number): void => {
    const entry = requiredResources.get(id) ?? { taskIds: new Set<number>(), lockIds: new Set<number>() };
    if (taskId !== undefined) entry.taskIds.add(taskId);
    if (lockId !== undefined) entry.lockIds.add(lockId);
    requiredResources.set(id, entry);
  };
  effectiveTaskResourceAssignments.assignments.forEach((assignment) => assignment.effectiveResourceIds
    .forEach((id) => requireResource(id, assignment.taskId)));
  operationalMealPolicies.filter((policy) => policy.status === "SUPPORTED").forEach((policy) => policy.resourceIds.forEach((id) => requireResource(id)));
  coachRouteTransitionResolution.routes.forEach((route) => {
    requireResource(route.coachPlanResourceItemId);
  });
  input.locks.forEach((lock) => {
    const task = taskById.get(String(lock.taskId));
    if ((lock.lockType === "resource" || lock.lockType === "full") && isPositiveInteger(lock.lockedResourceId)
      && task && task.status !== "cancelled") requireResource(lock.lockedResourceId, undefined, lock.id);
  });

  const resourceById = new Map(input.planResourceItems.map((resource) => [resource.id, resource]));
  const effectiveAvailabilityById = new Map<number, ReturnType<typeof resolveEffectivePlanResourceAvailability>>();
  let usableRequiredPlanResourceCount = 0;
  let unusableRequiredPlanResourceCount = 0;
  [...requiredResources.entries()].sort(([left], [right]) => left - right).forEach(([id, requiredBy]) => {
    const resource = resourceById.get(id);
    if (!resource) {
      unusableRequiredPlanResourceCount++;
      return;
    }
    const availability = resolveEffectivePlanResourceAvailability(input.workDay, resource);
    effectiveAvailabilityById.set(id, availability);
    if (availability.status === "AVAILABLE") {
      usableRequiredPlanResourceCount++;
      return;
    }
    unusableRequiredPlanResourceCount++;
    const details = {
      planResourceItemId: id,
      requiredByTaskIds: [...requiredBy.taskIds].sort((left, right) => left - right),
      requiredByLockIds: [...requiredBy.lockIds].sort((left, right) => left - right),
      availabilityStatus: availability.status,
      reason: availability.reason,
      isAvailable: resource.isAvailable,
      availabilityStart: resource.availabilityStart,
      availabilityEnd: resource.availabilityEnd,
    };
    const invalidTime = availability.status === "INVALID" && availability.reason !== "MISSING_SNAPSHOT_WINDOW";
    addIssue(invalidTime ? "UNSUPPORTED_TIME_VALUE" : "MISSING_RESOURCE_AVAILABILITY", "plan-resource", id,
      `planResourceItems.${id}.availability`, "Required plan resource has no usable effective availability.", details);
  });

  let protectedTaskResourceAvailabilityConflictCount = 0;
  for (const assignment of effectiveTaskResourceAssignments.assignments) {
    if (assignment.status !== "done" && assignment.status !== "in_progress") continue;
    const task = taskById.get(String(assignment.taskId))!;
    const protectedTime = resolveProtectedTaskInterval(task);
    if (protectedTime.status === "PARTIAL_REAL" || protectedTime.status === "MISSING") continue;
    const protectedInterval = protectedTime.interval;
    const protectedStart = toMinutes(protectedInterval.start);
    const protectedEnd = toMinutes(protectedInterval.end);
    if (protectedStart === null || protectedEnd === null || protectedStart >= protectedEnd) continue;
    const projection = projectedResourcesByTaskId.get(task.id);
    if (projection?.status !== "REPRESENTABLE") continue;
    const seenResourceIds = new Set<number>();
    const hardResources = [
      ...(projection.coachResourceId === undefined ? [] : [{ resourceId: projection.coachResourceId, resourceChannel: "coach" as const }]),
      ...projection.genericResourceIds.map((resourceId) => ({ resourceId, resourceChannel: "generic" as const })),
    ].filter(({ resourceId }) => !seenResourceIds.has(resourceId) && Boolean(seenResourceIds.add(resourceId)));
    for (const { resourceId, resourceChannel } of hardResources) {
      const availability = effectiveAvailabilityById.get(resourceId);
      if (availability?.status !== "AVAILABLE") continue;
      const availableStart = toMinutes(availability.effectiveWindow.start)!;
      const availableEnd = toMinutes(availability.effectiveWindow.end)!;
      if (protectedStart >= availableStart && protectedEnd <= availableEnd) continue;
      protectedTaskResourceAvailabilityConflictCount++;
      addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, `tasks.${task.id}.resourceAvailability.${resourceId}`,
        "Protected task interval is not contained by its effective resource availability.", {
          taskId: task.id,
          planResourceItemId: resourceId,
          protectedInterval,
          effectiveWindow: availability.effectiveWindow,
          intervalSource: protectedTime.source,
          resourceChannel,
          assignmentSources: [
            ...(assignment.directResourceIds.includes(resourceId) ? ["direct"] : []),
            ...(assignment.spaceResourceIds.includes(resourceId) ? ["space"] : []),
            ...(assignment.zoneResourceIds.includes(resourceId) ? ["zone"] : []),
          ],
          resourceLockIds: [...new Set(input.locks
            .filter((lock) => lock.taskId === task.id && (lock.lockType === "resource" || lock.lockType === "full") && lock.lockedResourceId === resourceId)
            .map((lock) => lock.id))].sort((left, right) => left - right),
        });
    }
  }
  const participantIds = identities.get("participant") ?? new Set<string>();
  const availabilityIds = new Set(mapKeys(input.contestantAvailabilityById));
  participantsRequiringAvailability.forEach((id) => {
    if (!availabilityIds.has(id)) addIssue("MISSING_PARTICIPANT_AVAILABILITY", "participant", id, `contestantAvailabilityById.${id}`, "Participant availability is absent.");
  });

  if (integrationConfigurationRecord !== undefined) for (const participantId of [...new Set(active.filter((task) => task.plannerNextKind === "main" || task.plannerNextKind === "vocal").map((task) => task.contestantId!))].sort((a, b) => a - b)) {
    const mains = active.filter((task) => task.contestantId === participantId && task.plannerNextKind === "main");
    const vocals = active.filter((task) => task.contestantId === participantId && task.plannerNextKind === "vocal");
    const main = mains[0], vocal = vocals[0];
    const mainDependencies = main
      ? [...new Set(main.dependsOnTaskIds ?? (main.dependsOnTaskId != null ? [main.dependsOnTaskId] : []))]
      : [];
    const exact = mains.length === 1 && vocals.length === 1 && main && vocal
      && mainDependencies.includes(vocal.id);
    if (!exact) addIssue("UNSUPPORTED_TASK_ROLE", "participant", participantId, `participants.${participantId}.mainVocalPair`, "Each main participant requires exactly one vocal feeder and the main must depend on it; additional canonical prerequisites are allowed.", { mainTaskIds: mains.map((task) => task.id), vocalTaskIds: vocals.map((task) => task.id), mainDependencyTaskIds: mainDependencies });
  }

  const classifyBreak = (entry: ProtectedBreakInput, path: string, concreteMeal = false): void => {
    if(entry.kind==="meal"&&entry.itinerantTeamId!=null&&entry.contestantId==null&&entry.spaceId==null&&entry.zoneId==null)return;
    const participantMeal = entry.kind === "meal" && entry.contestantId != null
      && entry.spaceId == null && entry.zoneId == null && entry.itinerantTeamId == null;
    if (participantMeal) return;
    const scoped = entry.contestantId != null || entry.spaceId != null || entry.zoneId != null || entry.itinerantTeamId != null;
    if (scoped || entry.kind === "global" || entry.kind === "protected" || (!concreteMeal && entry.kind == null)) {
      addIssue("UNSUPPORTED_BREAK_SCOPE", "break", entry.id ?? `${entry.start}-${entry.end}`, path, "Break scope cannot map exactly to the single Planner Next protected meal.", {
        scope: entry.contestantId != null ? "participant" : entry.spaceId != null ? "space" : entry.zoneId != null ? "zone" : entry.itinerantTeamId != null ? "itinerant-team" : entry.kind ?? "unspecified-protected-break",
      });
    }
  };
  if ((input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd)
    && flexibleParticipantMeals.obligations.length === 0 && operationalMealPolicies.length === 0) {
    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "mealWindow", "Flexible meal window has no exact participant or operational meal obligation.", { scope: "flexible-window" });
  }
  if (input.actualMeal) classifyBreak(input.actualMeal, "actualMeal", true);
  input.protectedBreaks?.forEach((entry) => classifyBreak(entry, `protectedBreaks.${entry.id ?? `${entry.start}-${entry.end}`}`));
  const itinerantMeals=resolveAssignedItinerantUnitMealBreaks(input);
  for(const meal of itinerantMeals){const details={breakId:meal.breakId,itinerantTeamId:meal.itinerantTeamId,itinerantUnitId:meal.itinerantUnitId,interval:meal.interval,defects:meal.defects};
    if(meal.defects.includes("INVALID_ID"))addIssue("DUPLICATE_ID","break","missing",`${meal.sourcePath}.id`,"Itinerant-unit meal requires an explicit stable ID.",details);
    if(meal.defects.includes("AMBIGUOUS_DUPLICATE"))addIssue("DUPLICATE_ID","break",meal.breakId,meal.sourcePath,"Itinerant-unit meal identity is ambiguous across sources.",details);
    if(meal.defects.some(d=>d==="INVALID_UNIT"||d==="INVALID_TIME"||d==="OUTSIDE_DAY"||d==="OFF_GRID"||d==="OVERLAP"))addIssue("UNREPRESENTABLE_ITINERANT_UNIT_BREAK","break",meal.breakId,meal.sourcePath,"Itinerant-unit meal cannot be represented exactly.",details);
    if(meal.defects.includes("MIXED_SCOPE"))addIssue("UNSUPPORTED_BREAK_SCOPE","break",meal.breakId,meal.sourcePath,"Itinerant-unit meal combines scopes.",details);
    if(meal.status==="SUPPORTED")for(const task of input.tasks.filter(task=>task.itinerantTeamId===meal.itinerantTeamId&&(task.status==="done"||task.status==="in_progress"))){const fixed=resolveProtectedTaskInterval(task);if(fixed.status!=="COMPLETE_REAL"&&fixed.status!=="COMPLETE_PLANNED")continue;const start=toMinutes(fixed.interval.start),end=toMinutes(fixed.interval.end);if(start!=null&&end!=null&&start<meal.interval.end&&meal.interval.start<end)addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE","task",task.id,`tasks.${task.id}.itinerantUnitMeal.${meal.breakId}`,"Protected task overlaps its assigned unit meal.",{...details,taskId:task.id,taskInterval:fixed.interval});}
  }
  const participantMeals = resolveParticipantScopedMeals(input);
  for (const meal of participantMeals.meals) {
    const explicitlyLinkedMealTasks=input.tasks.filter(task=>task.breakId!=null&&String(task.breakId)===meal.breakId&&isFlexibleParticipantMealTask(input,task));
    const unlinkedProtectedMealTasks=input.tasks.filter(task=>task.contestantId===meal.participantId&&(task.status==="done"||task.status==="in_progress")&&isFlexibleParticipantMealTask(input,task)&&!explicitlyLinkedMealTasks.includes(task));
    if(unlinkedProtectedMealTasks.length)addIssue("PARTICIPANT_MEAL_IDENTITY_CONFLICT","break",meal.breakId,meal.sourcePath,"Protected participant meal break and task lack an explicit identity relation.",{breakId:meal.breakId,taskIds:unlinkedProtectedMealTasks.map(task=>task.id).sort((a,b)=>a-b),contestantId:meal.participantId});
    const details = {
      breakId: meal.breakId || null,
      contestantId: meal.participantId,
      interval: meal.interval,
      sourceAvailability: input.contestantAvailabilityById?.[meal.participantId] ?? null,
      resultingWindows: participantMeals.availabilityByParticipantId.get(meal.participantId) ?? [],
      sourcePath: meal.sourcePath,
      defects: meal.defects,
    };
    if (meal.defects.includes("INVALID_ID") && !meal.breakId) {
      addIssue("DUPLICATE_ID", "break", "missing", `${meal.sourcePath}.id`, "Participant-scoped meal requires an explicit stable ID.", details);
    }
    if (meal.defects.includes("INVALID_PARTICIPANT") || meal.defects.includes("MISSING_PARTICIPANT")) {
      addIssue("MISSING_PARTICIPANT_REFERENCE", "break", meal.breakId, `${meal.sourcePath}.contestantId`, "Participant-scoped meal references no existing participant.", details);
    }
    if (meal.defects.includes("MIXED_SCOPE")) {
      addIssue("UNSUPPORTED_BREAK_SCOPE", "break", meal.breakId, meal.sourcePath, "Participant-scoped meal combines unsupported scopes or kind.", details);
    }
    if (meal.defects.some((defect) => defect === "OUTSIDE_AVAILABILITY" || defect === "OVERLAP" || defect === "EMPTY_AVAILABILITY")) {
      addIssue("UNREPRESENTABLE_PARTICIPANT_BREAK", "break", meal.breakId, meal.sourcePath, "Participant-scoped meal cannot be represented as an exact availability interruption.", details);
    }
    if (meal.status === "SUPPORTED" && explicitlyLinkedMealTasks.length===0) {
      for (const task of input.tasks.filter((item) => item.contestantId === meal.participantId && (item.status === "done" || item.status === "in_progress"))) {
        const protectedTime = resolveProtectedTaskInterval(task);
        if (protectedTime.status !== "COMPLETE_REAL" && protectedTime.status !== "COMPLETE_PLANNED") continue;
        const taskStart = toMinutes(protectedTime.interval.start), taskEnd = toMinutes(protectedTime.interval.end);
        if (taskStart != null && taskEnd != null && taskStart < meal.minuteInterval.end && meal.minuteInterval.start < taskEnd) {
          addIssue("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "task", task.id, `tasks.${task.id}.participantMeal.${meal.breakId}`, "Protected task overlaps the participant-scoped meal and cannot be moved.", {
            ...details, taskId: task.id, taskInterval: protectedTime.interval, intervalSource: protectedTime.source,
          });
        }
      }
    }
  }
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
  if ((input.contestantMealDurationMinutes != null || input.contestantMealMaxSimultaneous != null) && flexibleParticipantMeals.obligations.length === 0) {
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
    if (breakConfigured && !flexibleParticipantMealTaskIds.has(task.id) && !resourceMealTaskIds.has(task.id)) addIssue("UNSUPPORTED_BREAK_SCOPE", "task", task.id, `tasks.${task.id}.breakContract`, "Task break/meal semantics have no exact Planner Next task mapping.", {
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
    + mapKeys(input.spaceMealBreakMinutesByZoneId).length + operationalMealPolicies.length + taskBreakCount;
  const participantScopedMealCount = participantMeals.meals.length;
  const supportedParticipantScopedMealCount = participantMeals.meals.filter((meal) => meal.status === "SUPPORTED").length;
  const unsupportedParticipantScopedMealCount = participantScopedMealCount - supportedParticipantScopedMealCount;

  const transportConfigured = Boolean(
    input.transportSettings || input.transportSpaceId != null || input.transportVanCapacity != null || input.vanCapacity != null
    || input.arrivalGroupingTarget != null || input.departureGroupingTarget != null
    || input.arrivalMinGapMinutes != null || input.departureMinGapMinutes != null
    || input.arrivalTaskTemplateName !== undefined || input.departureTaskTemplateName !== undefined
    || input.optimizerWeights?.arrivalDepartureGrouping != null
    || input.tasks.some((task) => task.operationalRole === "transport_arrival" || task.operationalRole === "transport_departure"
      || task.transportGroupCapacity != null || task.transportGroupingTarget != null || task.transportGroupingWeight != null),
  );
  if (transportConfigured) {
    const settings = input.transportSettings;
    const minimums = [
      input.arrivalGroupingTarget, settings?.arrivalTargetGroupSize,
      input.departureGroupingTarget, settings?.departureTargetGroupSize,
    ];
    const maximums = [input.vanCapacity, input.transportVanCapacity, settings?.vehicleCapacity, settings?.vanCapacity]
      .filter((value): value is number => value != null);
    const sizes = [input.arrivalGroupingTarget, input.departureGroupingTarget, input.vanCapacity,
      settings?.arrivalTargetGroupSize, settings?.departureTargetGroupSize];
    const gaps = [input.arrivalMinGapMinutes, input.departureMinGapMinutes,
      settings?.arrivalMinGapMinutes, settings?.departureMinGapMinutes];
    const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
    const nonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
    const nonNegativeFinite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const aliasesAgree = (values: readonly (number | null | undefined)[]) => new Set(values.filter((value) => value != null)).size <= 1;
    const valid = settings?.source === "engine-buildInput-optimizer-transport"
      && sizes.every(positiveInteger)
      && gaps.every(nonNegativeInteger)
      && nonNegativeFinite(settings.groupingWeight)
      && maximums.length > 0 && maximums.every(positiveInteger)
      && aliasesAgree([input.arrivalGroupingTarget, settings.arrivalTargetGroupSize])
      && aliasesAgree([input.departureGroupingTarget, settings.departureTargetGroupSize])
      && aliasesAgree([input.arrivalMinGapMinutes, settings.arrivalMinGapMinutes])
      && aliasesAgree([input.departureMinGapMinutes, settings.departureMinGapMinutes])
      && aliasesAgree(maximums)
      && minimums.every((minimum) => minimum! <= maximums[0]!)
      && input.tasks.some((task) => task.operationalRole === "transport_arrival")
      && input.tasks.some((task) => task.operationalRole === "transport_departure")
      && input.tasks.every((task) => {
        if (task.operationalRole !== "transport_arrival" && task.operationalRole !== "transport_departure") return task.transportGroupCapacity == null && task.transportGroupingTarget == null && task.transportGroupingWeight == null;
        const minimum = task.operationalRole === "transport_arrival" ? input.arrivalGroupingTarget : input.departureGroupingTarget;
        return (task.transportGroupCapacity == null || task.transportGroupCapacity === maximums[0])
          && (task.transportGroupingTarget == null || task.transportGroupingTarget === minimum)
          && (task.transportGroupingWeight == null || task.transportGroupingWeight === settings.groupingWeight);
      });
    if (!valid) addIssue("UNSUPPORTED_TRANSPORT_CONTRACT", "plan", input.planId, "transportSettings", "Transport policy must be complete, consistent, positive, and satisfy minimumGroupSize <= maximumGroupSize.");
  }

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
  const supportedGrid = grid === PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES;
  const timeGridVerifiable = Boolean(gridShapeValid && supportedGrid && !incompatibleTimes.length && !incompatibleDurations.length);
  if (!timeGridVerifiable) {
    addIssue("UNSUPPORTED_TIME_GRID", "plan", input.planId, "plannerNext.timeGridMinutes", "Time grid is absent, invalid, or incompatible with audited values.", {
      incompatibleDurations,
      incompatibleTimes,
      requestedTimeGridMinutes: grid,
      supportedTimeGridMinutes: PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES,
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
      (runtimeAnchors as unknown[]).forEach((rawOperation, index) => {
        const path = `anchoredAccompaniments.${index}`;
        const structured = rawOperation !== null && typeof rawOperation === "object" && !Array.isArray(rawOperation);
        const operation = structured ? rawOperation as Record<string, unknown> : {};
        const validId = typeof operation.id === "string" && operation.id.trim() !== "";
        const id = validId ? operation.id as string : String(index);
        const validAnchor = isPositiveInteger(operation.anchorTaskId);
        const anchor = validAnchor ? operation.anchorTaskId as number : null;
        const validBefore = Array.isArray(operation.beforeTaskIds) && operation.beforeTaskIds.every(isPositiveInteger);
        const validAfter = Array.isArray(operation.afterTaskIds) && operation.afterTaskIds.every(isPositiveInteger);
        const before = validBefore ? operation.beforeTaskIds as number[] : [];
        const after = validAfter ? operation.afterTaskIds as number[] : [];
        const effectiveSegments = [...before, ...after].map(String);
        const hasEffectiveSegments = effectiveSegments.length > 0;
        const referencedTaskIds = [anchor, ...effectiveSegments].filter((value) => value != null).map(String);
        const missingTaskIds = [...new Set(referencedTaskIds.filter((taskId) => !taskById.has(taskId)))].sort(compare);
        const memberTasks = referencedTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is NonNullable<typeof task> => task !== undefined);
        const anchorTask = taskById.get(String(anchor));
        const participantCompatible = Boolean(anchorTask?.plannerNextKind === "main" && memberTasks.every((task) => task.contestantId === anchorTask.contestantId)
          && memberTasks.filter((task) => task.id !== anchorTask.id).every((task) => task.plannerNextKind === "auxiliary"));
        const projectedResourceSets = memberTasks.map((task) => {
          const projection = projectedResourcesByTaskId.get(task.id);
          return new Set(projection?.status === "REPRESENTABLE" ? projection.genericResourceIds : []);
        });
        const continuousResourceIds = projectedResourceSets.length ? [...projectedResourceSets[0]!].filter((resourceId) => projectedResourceSets.slice(1).every((set) => set.has(resourceId))).sort((a, b) => a - b) : [];
        const resourceCompatible = continuousResourceIds.length > 0;
        const shapeValid = structured && validId && validAnchor && validBefore && validAfter
          && operation.adjacency === "REQUIRED" && operation.internalTransition === "INCLUDED" && operation.resourceContinuity === "REQUIRED";
        const complete = shapeValid && hasEffectiveSegments && !missingTaskIds.length
          && (integrationConfigurationRecord === undefined || (participantCompatible && resourceCompatible));
        if (!complete) {
          anchoredOperationContractPresent = false;
          addIssue("INCOMPLETE_ANCHORED_OPERATION", "anchored-operation", id, path, "Anchored operation lacks required fields, effective segments, or existing tasks.", {
            hasEffectiveSegments,
            missingTaskIds,
            ...(integrationConfigurationRecord !== undefined ? { participantCompatible, resourceCompatible, continuousResourceIds } : {}),
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
  const participantMissingAvailability = [...participantsRequiringAvailability].filter((id) => !availabilityIds.has(id)).length;

  const diagnostics: EngineInputPreflightDiagnostics = {
    taskCount: input.tasks.length,
    planifiableTaskCount: input.tasks.filter((task) => task.status === "pending" || task.status === "interrupted").length,
    protectedTaskCount: input.tasks.filter((task) => task.status === "done" || task.status === "in_progress").length,
    cancelledTaskCount: input.tasks.filter((task) => task.status === "cancelled").length,
    pendingPlanningDiscardCount,
    lockCount: input.locks.length,
    participantCount: participantIds.size,
    coachReferenceCount: coachMappingEntries.length + (input.coachResourceIds ?? []).filter((id) => !validExplicitRelationCoachIds.has(id)).length,
    missingCoachReferenceCount,
    spaceCount: identities.get("space")?.size ?? 0,
    referencedSpaceCount: referencedSpaceIds.size,
    describedSpaceCount: describedSpaceIds.size,
    zoneCount: identities.get("zone")?.size ?? 0,
    planResourceCount: new Set(input.planResourceItems.map((resource) => String(resource.id))).size,
    requiredPlanResourceCount: requiredResources.size,
    usableRequiredPlanResourceCount,
    unusableRequiredPlanResourceCount,
    protectedTaskResourceAvailabilityConflictCount,
    requiredSpaceCount: requiredSpaces.size,
    usableRequiredSpaceCount,
    unusableRequiredSpaceCount,
    requiredZoneCount: requiredZoneIds.size,
    protectedTaskSpatialAvailabilityConflictCount,
    resourceItemCount: new Set(input.planResourceItems.map((resource) => String(resource.resourceItemId))).size,
    resourceAssignmentReferenceCount,
    resourceComponentReferenceCount,
    missingResourceReferenceCount,
    dependencyCount,
    breakCount,
    participantScopedMealCount,
    supportedParticipantScopedMealCount,
    unsupportedParticipantScopedMealCount,
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
      spaces: unusableRequiredSpaceCount,
      resources: unusableRequiredPlanResourceCount,
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
