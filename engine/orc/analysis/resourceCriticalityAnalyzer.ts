import type { OperationalAnalysis } from "./operationalStateAnalyzer";

type ResourceCriticalityInput = Omit<OperationalAnalysis, "resourceCriticalityAnalysis" | "constraintPressureAnalysis"> | OperationalAnalysis;

export interface ResourceCriticality {
  readonly resourceId: string;
  readonly criticalityScore: number;
  readonly contributingFactors: readonly string[];
  readonly explanation: string;
}

export interface ResourceCriticalityAnalysis {
  readonly resources: readonly ResourceCriticality[];
}

const uniqueSortedNumbers = (values: readonly number[] = []): number[] =>
  [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);

const hasResourceBottleneck = (analysis: ResourceCriticalityInput, resourceId: number): boolean =>
  analysis.criticalBottleneckAnalysis.bottlenecks.some((bottleneck) => bottleneck.id.startsWith(`resource:${resourceId}:`));

const resourceCriticality = (analysis: ResourceCriticalityInput, resourceId: number): ResourceCriticality => {
  const plannedTaskIds = uniqueSortedNumbers(analysis.resourcePressure.plannedTaskIdsByResourceId[resourceId] ?? []);
  const isAssigned = plannedTaskIds.length > 0;
  const isOverloaded = analysis.resourcePressure.overloadedResourceIds.includes(resourceId);
  const factors: string[] = [];
  let score = 0;

  if (isAssigned) {
    score += plannedTaskIds.length;
    factors.push(`planned-task-count:${plannedTaskIds.length}`);
  } else {
    factors.push("planned-task-count:0");
  }

  if (isOverloaded) {
    score += 3;
    factors.push("resource-overlap");
  }

  if (hasResourceBottleneck(analysis, resourceId)) {
    score += 2;
    factors.push("critical-bottleneck");
  }

  if (analysis.resourcePressure.totalResourceCount <= 1) {
    score += 1;
    factors.push("relative-scarcity:single-resource-pool");
  } else if (isAssigned && analysis.resourcePressure.assignedResourceIds.length === analysis.resourcePressure.totalResourceCount) {
    score += 1;
    factors.push("relative-scarcity:all-resources-assigned");
  }

  const blockedTaskCount = plannedTaskIds.filter((taskId) => analysis.dependencySummary.taskIdsWithDependencies.includes(taskId)).length;
  if (blockedTaskCount > 0) {
    score += blockedTaskCount;
    factors.push(`dependency-impact:${blockedTaskCount}`);
  }

  return {
    resourceId: String(resourceId),
    criticalityScore: score,
    contributingFactors: factors,
    explanation: `Resource ${resourceId} criticality is ${score}. Evidence: plannedTaskIds=[${plannedTaskIds.join(", ")}], overloaded=${isOverloaded}, totalResourceCount=${analysis.resourcePressure.totalResourceCount}, assignedResourceCount=${analysis.resourcePressure.assignedResourceIds.length}, dependencyLinkedTaskCount=${blockedTaskCount}.`,
  };
};

const byScoreThenResourceId = (a: ResourceCriticality, b: ResourceCriticality): number =>
  b.criticalityScore - a.criticalityScore || Number(a.resourceId) - Number(b.resourceId) || a.resourceId.localeCompare(b.resourceId);

export function analyzeResourceCriticality(analysis: ResourceCriticalityInput): ResourceCriticalityAnalysis {
  const resourceIds = uniqueSortedNumbers(analysis.resourcePressure.resourceIds ?? analysis.resourcePressure.assignedResourceIds);
  return { resources: resourceIds.map((resourceId) => resourceCriticality(analysis, resourceId)).sort(byScoreThenResourceId) };
}
