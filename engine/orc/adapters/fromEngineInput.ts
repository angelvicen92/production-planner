import type { EngineInput, TimeWindow } from "../../types";
import type { CognitiveArtifacts, OperationalState, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import { resolveORCMainFlowConfig } from "../state/mainFlowConfigResolver";
import { resolveORCPlanningEntryOperationalRoleMetadata } from "../state/nonWorkTaskClassifier";

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const record = <T>(value: T | null | undefined, fallback: T): T => clone(value ?? fallback);
const timeWindow = (value: TimeWindow | null | undefined): TimeWindow | null => value ? clone(value) : null;

const cognitiveEmpty = (): CognitiveArtifacts => ({
  opportunities: [],
  searchSpaces: [],
  candidates: [],
  candidateStates: [],
  simulatedStates: [],
  validationResults: [],
  operationalValues: [],
  commitDecisions: [],
  evidence: [],
  metadata: {},
});

export function buildOperationalStateFromEngineInput(input: EngineInput): OperationalState {
  const tasks = record(input.tasks, []);
  const locks = record(input.locks, []);
  const resources = record(input.planResourceItems, []);
  const planning = tasks
    .filter((task) => task?.startPlanned && task?.endPlanned)
    .map((task) => {
      const base = {
      taskId: Number(task.id),
      startPlanned: String(task.startPlanned),
      endPlanned: String(task.endPlanned),
      assignedResourceIds: [...(task.assignedResourceIds ?? [])],
      spaceId: task.spaceId ?? null,
      seedSource: task.seedSource,
      operationalRole: task.operationalRole,
      blocksSpace: task.blocksSpace,
      countsAsWork: task.countsAsWork,
      countsForMainFlow: task.countsForMainFlow,
      countsForResourceLoad: task.countsForResourceLoad,
      countsForTalentLoad: task.countsForTalentLoad,
      };
      const meta = resolveORCPlanningEntryOperationalRoleMetadata({ entry: base as any, task, mealWindow: input.actualMeal ?? input.mealWindow ?? input.meal ?? null });
      return { ...base, operationalRole: task.operationalRole ?? meta.role, blocksSpace: task.blocksSpace ?? meta.blocksSpace, countsAsWork: task.countsAsWork ?? meta.countsAsWork, countsForMainFlow: task.countsForMainFlow ?? meta.countsForMainFlow, countsForResourceLoad: task.countsForResourceLoad ?? meta.countsForResourceLoad, countsForTalentLoad: task.countsForTalentLoad ?? meta.countsForTalentLoad, allowsSpaceOverlap: (task as any).allowsSpaceOverlap ?? meta.allowsSpaceOverlap, spaceOccupancyMode: (task as any).spaceOccupancyMode ?? meta.spaceOccupancyMode };
    });

  const dependencies = tasks.map((task) => ({
    taskId: Number(task.id),
    dependsOnTaskIds: [...(task.dependsOnTaskIds ?? (task.dependsOnTaskId != null ? [task.dependsOnTaskId] : []))],
    dependsOnTemplateIds: [...(task.dependsOnTemplateIds ?? (task.dependsOnTemplateId != null ? [task.dependsOnTemplateId] : []))],
  })).filter((item) => item.dependsOnTaskIds.length > 0 || item.dependsOnTemplateIds.length > 0);

  const mainFlowConfig = resolveORCMainFlowConfig(input);
  const constraints: ORCRecord = {
    camerasAvailable: input.camerasAvailable ?? null,
    mealMode: input.mealMode ?? null,
    zoneResourceAssignments: record(input.zoneResourceAssignments, {}),
    spaceResourceAssignments: record(input.spaceResourceAssignments, {}),
    zoneResourceTypeRequirements: record(input.zoneResourceTypeRequirements, {}),
    spaceResourceTypeRequirements: record(input.spaceResourceTypeRequirements, {}),
    resourceItemComponents: record(input.resourceItemComponents, {}),
    resourceBundles: record(input.resourceBundles, []),
    resourceBundleComponents: record(input.resourceBundleComponents, []),
    resourceBundleSpaceAffinities: record(input.resourceBundleSpaceAffinities, []),
    resourceBundleLoadWarnings: record(input.resourceBundleLoadWarnings, []),
    optimizer: {
      mainZoneId: mainFlowConfig.mainFlowId,
      prioritizeMainZone: input.optimizerPrioritizeMainZone ?? null,
      groupBySpaceAndTemplate: input.optimizerGroupBySpaceAndTemplate ?? null,
      groupingZoneIds: record(input.groupingZoneIds, []),
      maxTemplateChangesByZoneId: record(input.maxTemplateChangesByZoneId, {}),
      weights: record(input.optimizerWeights, {}),
      mainFlowConfig,
    },
  };

  const state: OperationalState = {
    id: `operational-state:${input.planId}`,
    planId: input.planId,
    workDay: timeWindow(input.workDay),
    planning,
    tasks,
    resources,
    spaces: {
      parentById: record(input.spaceParentById, {}),
      nameById: record(input.spaceNameById, {}),
      capacityById: record(input.spaceCapacityById, {}),
      concurrencyById: record(input.spaceConcurrencyById, {}),
      exclusiveById: record(input.spaceIsExclusiveById, {}),
      priorityById: record(input.spacePriorityById, {}),
    },
    availability: {
      workDay: timeWindow(input.workDay),
      meal: timeWindow(input.meal),
      mealWindow: timeWindow(input.mealWindow ?? (input.mealWindowStart && input.mealWindowEnd ? { start: input.mealWindowStart, end: input.mealWindowEnd } : null)),
      actualMeal: timeWindow(input.actualMeal ?? (input.actualMealStart && input.actualMealEnd ? { start: input.actualMealStart, end: input.actualMealEnd } : null)),
      globalHardBreaks: record(input.globalHardBreaks, []),
      protectedBreaks: record(input.protectedBreaks, []),
      contestantAvailabilityById: record(input.contestantAvailabilityById, {}),
    },
    dependencies,
    locks,
    constraints,
    operationalMetrics: {
      taskCount: tasks.length,
      plannedTaskCount: planning.length,
      resourceCount: resources.length,
      lockCount: locks.length,
    },
    cognitive: cognitiveEmpty(),
    source: "EngineInput",
    schemaVersion: "ORC-SPEC-01",
  };

  return deepFreeze(state) as OperationalState;
}
