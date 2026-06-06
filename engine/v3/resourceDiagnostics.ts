import type { EngineOutput, PlanResourceItemInput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";

export interface ResourcePoolPressure {
  poolKey: string;
  resourceNames: string[];
  quantity: number;
  capacity: number;
  competingTaskCount: number;
  peakConcurrency: number;
  peakDemand: number;
  maxUtilizationPercent: number | null;
  fragileTaskCount: number;
}

export interface CompositeResourceCandidate {
  kind: "resource_pair" | "resource_space";
  left: string;
  right: string;
  /** Backward-compatible alias retained for existing benchmark consumers. */
  occurrenceCount: number;
  suggestedBundleName: string;
  /** Global resource_items IDs when available; never plan snapshot IDs. */
  componentResourceIds: number[];
  componentRoles: string[];
  observedCount: number;
  /** Informative 0..1 consistency ratio; it does not affect feasibility or scoring. */
  confidence: number;
}

export interface ResourceSwitchDetail {
  spaceId: number;
  spaceName: string;
  resourceCategory: string;
  switchCount: number;
}

export interface ResourceDiagnosticWarning {
  code: "COMPOSITE_RESOURCE_INCONSISTENCY" | "RESOURCE_BUNDLE_CONFLICT" | "ANYOF_POOL_FRAGILITY" | "PARTIAL_DECLARED_BUNDLE" | "BUNDLE_SPACE_AFFINITY_MISMATCH";
  message: string;
  taskIds: number[];
}

export interface ResourceDiagnostics {
  resourcePoolPressure: ResourcePoolPressure[];
  resourcePoolPressureSummary: string | null;
  maxAnyOfPoolConcurrency: number | null;
  resourceSwitchCount: number | null;
  resourceSwitchDetails: ResourceSwitchDetail[];
  compositeResourceCandidates: CompositeResourceCandidate[];
  compositeResourceCandidateCount: number;
  resourceBundleConflictCount: number;
  declaredResourceBundleCount: number;
  bundleComponentUsageCount: number;
  partialBundleUsageWarnings: number;
  bundleSpaceAffinityMatches: number;
  bundleSpaceAffinityMismatches: number;
  bundleSwitchPenalty: number;
  declaredBundleCandidateMatches: number;
  resourceDiagnosticWarnings: ResourceDiagnosticWarning[];
}

export interface DeclaredBundleMetrics {
  declaredResourceBundleCount: number;
  bundleComponentUsageCount: number;
  partialBundleUsageWarnings: number;
  bundleSpaceAffinityMatches: number;
  bundleSpaceAffinityMismatches: number;
  bundleSwitchPenalty: number;
  bundleCoherencePenalty: number;
  warnings: ResourceDiagnosticWarning[];
}

type ScheduledTask = {
  task: TaskInput;
  start: number;
  end: number;
  assignedResources: PlanResourceItemInput[];
};

type PairObservation = {
  key: string;
  categoryKey: string;
  left: PlanResourceItemInput;
  right: PlanResourceItemInput;
  taskIds: number[];
};

const toMinutes = (value: string | null | undefined): number | null => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const normalizeText = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const resourceCategory = (resource: PlanResourceItemInput): string => {
  const name = normalizeText(resource.name);
  if (/camera|camara/.test(name)) return "camera";
  if (/sound|sonido|audio|microfono|microphone/.test(name)) return "sound";
  if (/coach|entrenador/.test(name)) return "coach";
  return `type:${resource.typeId}`;
};

const resourceLabel = (resource: PlanResourceItemInput): string => `${resource.name} (#${resource.id})`;
const overlaps = (left: ScheduledTask, right: ScheduledTask): boolean => left.start < right.end && right.start < left.end;

const getScheduledTasks = (input: EngineV3Input, output: EngineOutput): ScheduledTask[] => {
  const taskById = new Map(input.tasks.map((task) => [Number(task.id), task]));
  const resourceByPlanId = new Map(input.planResourceItems.map((resource) => [Number(resource.id), resource]));
  const outputByTaskId = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));

  return input.tasks.flatMap((task): ScheduledTask[] => {
    const planned = outputByTaskId.get(Number(task.id));
    const start = toMinutes(planned?.startPlanned ?? task.startPlanned);
    const end = toMinutes(planned?.endPlanned ?? task.endPlanned);
    if (start === null || end === null || end <= start || !taskById.has(Number(task.id))) return [];
    const assignedIds = planned?.assignedResources ?? task.assignedResourceIds ?? [];
    const assignedResources = assignedIds
      .map((id) => resourceByPlanId.get(Number(id)))
      .filter((resource): resource is PlanResourceItemInput => resource !== undefined);
    return [{ task, start, end, assignedResources }];
  });
};


const calculateDeclaredBundleMetricsFromScheduled = (input: EngineV3Input, scheduled: ScheduledTask[]): DeclaredBundleMetrics => {
  const bundles = (input.resourceBundles ?? []).filter((bundle) => bundle.isActive !== false);
  if (bundles.length === 0) {
    return {
      declaredResourceBundleCount: 0,
      bundleComponentUsageCount: 0,
      partialBundleUsageWarnings: 0,
      bundleSpaceAffinityMatches: 0,
      bundleSpaceAffinityMismatches: 0,
      bundleSwitchPenalty: 0,
      bundleCoherencePenalty: 0,
      warnings: [],
    };
  }

  const activeIds = new Set(bundles.map((bundle) => bundle.id));
  const componentsByBundle = new Map<string, NonNullable<EngineV3Input["resourceBundleComponents"]>>();
  for (const component of input.resourceBundleComponents ?? []) {
    if (!activeIds.has(component.bundleId) || component.resourceItemId == null) continue;
    const rows = componentsByBundle.get(component.bundleId) ?? [];
    rows.push(component);
    componentsByBundle.set(component.bundleId, rows);
  }
  const affinitiesByBundle = new Map<string, NonNullable<EngineV3Input["resourceBundleSpaceAffinities"]>>();
  for (const affinity of input.resourceBundleSpaceAffinities ?? []) {
    if (!activeIds.has(affinity.bundleId)) continue;
    const rows = affinitiesByBundle.get(affinity.bundleId) ?? [];
    rows.push(affinity);
    affinitiesByBundle.set(affinity.bundleId, rows);
  }

  let bundleComponentUsageCount = 0;
  let partialBundleUsageWarnings = 0;
  let bundleSpaceAffinityMatches = 0;
  let bundleSpaceAffinityMismatches = 0;
  let affinityReward = 0;
  let affinityPenalty = 0;
  const warnings: ResourceDiagnosticWarning[] = [];
  const usageBySpace = new Map<number, Array<{ start: number; bundleIds: string[] }>>();

  for (const scheduledTask of scheduled) {
    const assignedCounts = new Map<number, number>();
    for (const resource of scheduledTask.assignedResources) {
      assignedCounts.set(resource.resourceItemId, (assignedCounts.get(resource.resourceItemId) ?? 0) + 1);
    }
    const usedBundleIds: string[] = [];
    for (const bundle of bundles) {
      const components = componentsByBundle.get(bundle.id) ?? [];
      if (components.length === 0) continue;
      const usedComponents = components.filter((component) => (assignedCounts.get(Number(component.resourceItemId)) ?? 0) > 0);
      if (usedComponents.length === 0) continue;
      usedBundleIds.push(bundle.id);
      bundleComponentUsageCount += usedComponents.reduce((total, component) => total + Math.min(
        assignedCounts.get(Number(component.resourceItemId)) ?? 0,
        Math.max(1, Number(component.quantity) || 1),
      ), 0);
      const required = components.filter((component) => component.isRequired !== false);
      const complete = required.every((component) => (assignedCounts.get(Number(component.resourceItemId)) ?? 0) >= Math.max(1, Number(component.quantity) || 1));
      if (!complete && required.length > 1) {
        partialBundleUsageWarnings += 1;
        warnings.push({
          code: "PARTIAL_DECLARED_BUNDLE",
          message: `La tarea ${scheduledTask.task.id} usa parcialmente el bundle declarado ${bundle.name}.`,
          taskIds: [Number(scheduledTask.task.id)],
        });
      }

      const affinities = affinitiesByBundle.get(bundle.id) ?? [];
      if (affinities.length > 0) {
        const current = affinities.find((affinity) => Number(affinity.spaceId) === Number(scheduledTask.task.spaceId));
        if (current && current.affinityScore > 0) {
          bundleSpaceAffinityMatches += 1;
          affinityReward += current.affinityScore;
        } else {
          bundleSpaceAffinityMismatches += 1;
          const best = Math.max(0, ...affinities.map((affinity) => Number(affinity.affinityScore) || 0));
          affinityPenalty += Math.max(1, best);
          warnings.push({
            code: "BUNDLE_SPACE_AFFINITY_MISMATCH",
            message: `El bundle declarado ${bundle.name} se usa en un espacio sin afinidad positiva declarada.`,
            taskIds: [Number(scheduledTask.task.id)],
          });
        }
      }
    }
    const spaceId = Number(scheduledTask.task.spaceId ?? NaN);
    if (usedBundleIds.length > 0 && Number.isFinite(spaceId) && spaceId > 0) {
      const rows = usageBySpace.get(spaceId) ?? [];
      rows.push({ start: scheduledTask.start, bundleIds: usedBundleIds.sort() });
      usageBySpace.set(spaceId, rows);
    }
  }

  let bundleSwitchPenalty = 0;
  for (const rows of usageBySpace.values()) {
    rows.sort((left, right) => left.start - right.start || left.bundleIds.join(",").localeCompare(right.bundleIds.join(",")));
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index - 1].bundleIds.join(",") !== rows[index].bundleIds.join(",")) bundleSwitchPenalty += 1;
    }
  }

  return {
    declaredResourceBundleCount: bundles.length,
    bundleComponentUsageCount,
    partialBundleUsageWarnings,
    bundleSpaceAffinityMatches,
    bundleSpaceAffinityMismatches,
    bundleSwitchPenalty,
    bundleCoherencePenalty: (partialBundleUsageWarnings * 10) + (bundleSwitchPenalty * 5) + affinityPenalty - affinityReward,
    warnings: warnings.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
  };
};

export const calculateDeclaredBundleMetrics = (input: EngineV3Input, output: EngineOutput): DeclaredBundleMetrics => (
  calculateDeclaredBundleMetricsFromScheduled(input, getScheduledTasks(input, output))
);

const calculatePeakConcurrency = (tasks: ScheduledTask[]): number => {
  const events = tasks.flatMap((task) => [
    { time: task.start, delta: 1 },
    { time: task.end, delta: -1 },
  ]).sort((left, right) => left.time - right.time || left.delta - right.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
  }
  return peak;
};

const calculatePoolPressure = (input: EngineV3Input, scheduled: ScheduledTask[]): ResourcePoolPressure[] => {
  const planResourcesByItemId = new Map<number, PlanResourceItemInput[]>();
  for (const resource of input.planResourceItems) {
    if (!resource.isAvailable) continue;
    const current = planResourcesByItemId.get(Number(resource.resourceItemId)) ?? [];
    current.push(resource);
    planResourcesByItemId.set(Number(resource.resourceItemId), current);
  }

  const pools = new Map<string, { quantity: number; resourceItemIds: number[]; tasks: ScheduledTask[] }>();
  for (const scheduledTask of scheduled) {
    for (const requirement of scheduledTask.task.resourceRequirements?.anyOf ?? []) {
      const resourceItemIds = [...new Set(requirement.resourceItemIds.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
      if (resourceItemIds.length === 0) continue;
      const quantity = Math.max(1, Number(requirement.quantity) || 1);
      const key = `${quantity}:${resourceItemIds.join(",")}`;
      const pool = pools.get(key) ?? { quantity, resourceItemIds, tasks: [] };
      pool.tasks.push(scheduledTask);
      pools.set(key, pool);
    }
  }

  return [...pools.entries()].map(([poolKey, pool]) => {
    const resources = pool.resourceItemIds.flatMap((itemId) => planResourcesByItemId.get(itemId) ?? []);
    const capacity = resources.length;
    const peakConcurrency = calculatePeakConcurrency(pool.tasks);
    const peakDemand = peakConcurrency * pool.quantity;
    const fragileTasks = new Set<number>();
    if (capacity > 0 && peakDemand > capacity - 1) {
      for (const task of pool.tasks) {
        const concurrentDemand = pool.tasks.filter((candidate) => overlaps(task, candidate)).length * pool.quantity;
        if (concurrentDemand > capacity - 1) fragileTasks.add(Number(task.task.id));
      }
    }
    return {
      poolKey,
      resourceNames: resources.map((resource) => resource.name).sort(),
      quantity: pool.quantity,
      capacity,
      competingTaskCount: pool.tasks.length,
      peakConcurrency,
      peakDemand,
      maxUtilizationPercent: capacity > 0 ? Math.round((peakDemand / capacity) * 100) : null,
      fragileTaskCount: fragileTasks.size,
    };
  }).sort((left, right) => right.peakDemand - left.peakDemand || left.poolKey.localeCompare(right.poolKey));
};

const collectPairObservations = (scheduled: ScheduledTask[]): PairObservation[] => {
  const observations = new Map<string, PairObservation>();
  for (const scheduledTask of scheduled) {
    const resources = [...scheduledTask.assignedResources].sort((left, right) => left.id - right.id);
    for (let leftIndex = 0; leftIndex < resources.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < resources.length; rightIndex++) {
        const first = resources[leftIndex];
        const second = resources[rightIndex];
        const firstCategory = resourceCategory(first);
        const secondCategory = resourceCategory(second);
        if (firstCategory === secondCategory) continue;
        const [left, right, leftCategory, rightCategory] = firstCategory.localeCompare(secondCategory) <= 0
          ? [first, second, firstCategory, secondCategory]
          : [second, first, secondCategory, firstCategory];
        const key = `${left.id}:${right.id}`;
        const observation = observations.get(key) ?? {
          key,
          categoryKey: `${leftCategory}+${rightCategory}`,
          left,
          right,
          taskIds: [],
        };
        observation.taskIds.push(Number(scheduledTask.task.id));
        observations.set(key, observation);
      }
    }
  }
  return [...observations.values()];
};

const calculateCompositeCandidates = (input: EngineV3Input, scheduled: ScheduledTask[], observations: PairObservation[]): CompositeResourceCandidate[] => {
  const maxObservationByCategory = new Map<string, number>();
  for (const observation of observations) {
    maxObservationByCategory.set(
      observation.categoryKey,
      Math.max(maxObservationByCategory.get(observation.categoryKey) ?? 0, observation.taskIds.length),
    );
  }

  const resourceCandidates = observations
    .filter((observation) => observation.taskIds.length >= 2)
    .map((observation): CompositeResourceCandidate => {
      const observedCount = observation.taskIds.length;
      const categoryMaximum = maxObservationByCategory.get(observation.categoryKey) ?? observedCount;
      return {
        kind: "resource_pair",
        left: resourceLabel(observation.left),
        right: resourceLabel(observation.right),
        occurrenceCount: observedCount,
        suggestedBundleName: `${observation.left.name} + ${observation.right.name}`,
        componentResourceIds: [observation.left.resourceItemId, observation.right.resourceItemId]
          .map(Number)
          .filter((id) => Number.isFinite(id) && id > 0),
        componentRoles: [resourceCategory(observation.left), resourceCategory(observation.right)],
        observedCount,
        confidence: Number((observedCount / Math.max(1, categoryMaximum)).toFixed(2)),
      };
    });

  const assignmentCountByResource = new Map<number, number>();
  for (const scheduledTask of scheduled) {
    for (const resource of scheduledTask.assignedResources) {
      assignmentCountByResource.set(resource.id, (assignmentCountByResource.get(resource.id) ?? 0) + 1);
    }
  }

  const resourceSpaceCounts = new Map<string, CompositeResourceCandidate>();
  for (const scheduledTask of scheduled) {
    const spaceId = Number(scheduledTask.task.spaceId);
    if (!Number.isFinite(spaceId) || spaceId <= 0) continue;
    const spaceName = input.spaceNameById?.[spaceId] ?? `Space ${spaceId}`;
    for (const resource of scheduledTask.assignedResources) {
      const key = `${resource.id}:${spaceId}`;
      const candidate = resourceSpaceCounts.get(key) ?? {
        kind: "resource_space",
        left: resourceLabel(resource),
        right: `${spaceName} (#${spaceId})`,
        occurrenceCount: 0,
        suggestedBundleName: `${resource.name} @ ${spaceName}`,
        componentResourceIds: Number.isFinite(Number(resource.resourceItemId)) && Number(resource.resourceItemId) > 0
          ? [Number(resource.resourceItemId)]
          : [],
        componentRoles: [resourceCategory(resource)],
        observedCount: 0,
        confidence: 0,
      };
      candidate.occurrenceCount += 1;
      candidate.observedCount += 1;
      candidate.confidence = Number((candidate.observedCount / Math.max(1, assignmentCountByResource.get(resource.id) ?? 0)).toFixed(2));
      resourceSpaceCounts.set(key, candidate);
    }
  }

  return [...resourceCandidates, ...[...resourceSpaceCounts.values()].filter((candidate) => candidate.observedCount >= 2)]
    .sort((left, right) => right.observedCount - left.observedCount || left.left.localeCompare(right.left) || left.right.localeCompare(right.right));
};

const calculateSwitches = (input: EngineV3Input, scheduled: ScheduledTask[]): ResourceSwitchDetail[] => {
  const groups = new Map<string, { spaceId: number; category: string; tasks: Array<{ task: ScheduledTask; ids: string }> }>();
  for (const task of scheduled) {
    const spaceId = Number(task.task.spaceId);
    if (!Number.isFinite(spaceId) || spaceId <= 0) continue;
    const byCategory = new Map<string, number[]>();
    for (const resource of task.assignedResources) {
      const category = resourceCategory(resource);
      const ids = byCategory.get(category) ?? [];
      ids.push(resource.id);
      byCategory.set(category, ids);
    }
    for (const [category, ids] of byCategory) {
      const key = `${spaceId}:${category}`;
      const group = groups.get(key) ?? { spaceId, category, tasks: [] };
      group.tasks.push({ task, ids: ids.sort((a, b) => a - b).join(",") });
      groups.set(key, group);
    }
  }

  return [...groups.values()].flatMap((group): ResourceSwitchDetail[] => {
    const rows = group.tasks.sort((left, right) => left.task.start - right.task.start || left.task.end - right.task.end || left.task.task.id - right.task.task.id);
    let switchCount = 0;
    for (let index = 1; index < rows.length; index++) {
      if (rows[index - 1].ids !== rows[index].ids) switchCount += 1;
    }
    if (switchCount === 0) return [];
    return [{
      spaceId: group.spaceId,
      spaceName: input.spaceNameById?.[group.spaceId] ?? `Space ${group.spaceId}`,
      resourceCategory: group.category,
      switchCount,
    }];
  }).sort((left, right) => right.switchCount - left.switchCount || left.spaceId - right.spaceId || left.resourceCategory.localeCompare(right.resourceCategory));
};

const calculateWarnings = (
  scheduled: ScheduledTask[],
  pools: ResourcePoolPressure[],
  observations: PairObservation[],
): { warnings: ResourceDiagnosticWarning[]; conflictCount: number } => {
  const warnings: ResourceDiagnosticWarning[] = [];
  const scheduledByTaskId = new Map(scheduled.map((task) => [Number(task.task.id), task]));
  let conflictCount = 0;

  for (const pool of pools.filter((candidate) => candidate.fragileTaskCount > 0)) {
    warnings.push({
      code: "ANYOF_POOL_FRAGILITY",
      message: `Pool ${pool.resourceNames.join(" / ") || pool.poolKey}: demanda pico ${pool.peakDemand}/${pool.capacity}; ${pool.fragileTaskCount} tareas perderían margen si falta un recurso.`,
      taskIds: [],
    });
  }

  const byCategory = new Map<string, PairObservation[]>();
  for (const observation of observations) {
    const current = byCategory.get(observation.categoryKey) ?? [];
    current.push(observation);
    byCategory.set(observation.categoryKey, current);
  }

  for (const categoryObservations of byCategory.values()) {
    const dominantByResource = new Map<number, PairObservation>();
    for (const observation of categoryObservations) {
      for (const resourceId of [observation.left.id, observation.right.id]) {
        const current = dominantByResource.get(resourceId);
        if (!current || observation.taskIds.length > current.taskIds.length || (observation.taskIds.length === current.taskIds.length && observation.key < current.key)) {
          dominantByResource.set(resourceId, observation);
        }
      }
    }

    for (const observation of categoryObservations) {
      const dominant = dominantByResource.get(observation.left.id);
      if (!dominant || dominant.key === observation.key || dominant.taskIds.length < 2 || observation.taskIds.length >= dominant.taskIds.length) continue;
      const suspiciousTasks = observation.taskIds.map((taskId) => scheduledByTaskId.get(taskId)).filter((task): task is ScheduledTask => task !== undefined);
      const simultaneous = suspiciousTasks.some((task) => scheduled.some((candidate) => candidate.task.id !== task.task.id && overlaps(task, candidate)
        && candidate.assignedResources.some((resource) => resource.id === dominant.right.id)));
      if (simultaneous) conflictCount += observation.taskIds.length;
      warnings.push({
        code: simultaneous ? "RESOURCE_BUNDLE_CONFLICT" : "COMPOSITE_RESOURCE_INCONSISTENCY",
        message: `${resourceLabel(observation.left)} aparece con ${resourceLabel(observation.right)} ${observation.taskIds.length} vez/veces, frente al patrón recurrente ${resourceLabel(dominant.left)} + ${resourceLabel(dominant.right)} (${dominant.taskIds.length}); revisar como posible bundle operativo${simultaneous ? " durante concurrencia" : ""}.`,
        taskIds: [...observation.taskIds].sort((a, b) => a - b),
      });
    }
  }

  return {
    warnings: warnings.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
    conflictCount,
  };
};

export const diagnoseCompositeResources = (input: EngineV3Input, output: EngineOutput): ResourceDiagnostics => {
  const scheduled = getScheduledTasks(input, output);
  const resourcePoolPressure = calculatePoolPressure(input, scheduled);
  const pairObservations = collectPairObservations(scheduled);
  const compositeResourceCandidates = calculateCompositeCandidates(input, scheduled, pairObservations);
  const resourceSwitchDetails = calculateSwitches(input, scheduled);
  const { warnings: inferredWarnings, conflictCount: resourceBundleConflictCount } = calculateWarnings(scheduled, resourcePoolPressure, pairObservations);
  const declaredBundleMetrics = calculateDeclaredBundleMetricsFromScheduled(input, scheduled);
  const resourceDiagnosticWarnings = [...inferredWarnings, ...declaredBundleMetrics.warnings]
    .sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  const declaredComponentSets = new Set((input.resourceBundles ?? []).map((bundle) => (input.resourceBundleComponents ?? [])
    .filter((component) => component.bundleId === bundle.id && component.resourceItemId != null)
    .map((component) => Number(component.resourceItemId))
    .sort((left, right) => left - right)
    .join(","))
    .filter(Boolean));
  const declaredBundleCandidateMatches = compositeResourceCandidates.filter((candidate) => (
    candidate.kind === "resource_pair" && declaredComponentSets.has([...candidate.componentResourceIds].sort((left, right) => left - right).join(","))
  )).length;
  const resourceSwitchCount = resourceSwitchDetails.length > 0
    ? resourceSwitchDetails.reduce((total, detail) => total + detail.switchCount, 0)
    : scheduled.some((task) => task.assignedResources.length > 0) ? 0 : null;

  return {
    resourcePoolPressure,
    resourcePoolPressureSummary: resourcePoolPressure.length === 0 ? null : resourcePoolPressure
      .map((pool) => `${pool.resourceNames.join("/") || pool.poolKey}: tasks=${pool.competingTaskCount}, peak=${pool.peakConcurrency}, demand=${pool.peakDemand}/${pool.capacity}, fragile=${pool.fragileTaskCount}`)
      .join("; "),
    maxAnyOfPoolConcurrency: resourcePoolPressure.length === 0 ? null : Math.max(...resourcePoolPressure.map((pool) => pool.peakConcurrency)),
    resourceSwitchCount,
    resourceSwitchDetails,
    compositeResourceCandidates,
    compositeResourceCandidateCount: compositeResourceCandidates.length,
    resourceBundleConflictCount,
    declaredResourceBundleCount: declaredBundleMetrics.declaredResourceBundleCount,
    bundleComponentUsageCount: declaredBundleMetrics.bundleComponentUsageCount,
    partialBundleUsageWarnings: declaredBundleMetrics.partialBundleUsageWarnings,
    bundleSpaceAffinityMatches: declaredBundleMetrics.bundleSpaceAffinityMatches,
    bundleSpaceAffinityMismatches: declaredBundleMetrics.bundleSpaceAffinityMismatches,
    bundleSwitchPenalty: declaredBundleMetrics.bundleSwitchPenalty,
    declaredBundleCandidateMatches,
    resourceDiagnosticWarnings,
  };
};
