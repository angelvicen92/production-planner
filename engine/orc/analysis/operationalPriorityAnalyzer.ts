import type { CriticalBottleneck, CriticalBottleneckAnalysis } from "./criticalBottleneckAnalyzer";
import type { ConstraintPressure, ConstraintPressureAnalysis } from "./constraintPressureAnalyzer";
import type { ResourceCriticality, ResourceCriticalityAnalysis } from "./resourceCriticalityAnalyzer";

export interface OperationalPriority {
  readonly id: string;
  readonly priorityScore: number;
  readonly bottlenecks: readonly string[];
  readonly criticalResources: readonly string[];
  readonly activeConstraints: readonly string[];
  readonly explanation: string;
}

export interface OperationalPriorityMap {
  readonly priorities: readonly OperationalPriority[];
}

interface PriorityAccumulator {
  readonly id: string;
  priorityScore: number;
  bottlenecks: string[];
  criticalResources: string[];
  activeConstraints: string[];
  evidence: string[];
}

const resourceKey = (resourceId: string): string => `resource:${resourceId}`;

const keyForBottleneck = (bottleneck: CriticalBottleneck): string => {
  const resourceMatch = /^resource:([^:]+):/.exec(bottleneck.id);
  if (resourceMatch) return resourceKey(resourceMatch[1]);

  const mainFlowMatch = /^main-flow:([^:]+):/.exec(bottleneck.id);
  if (mainFlowMatch) return `constraints:main-flow:${mainFlowMatch[1]}`;

  return bottleneck.id;
};

const keyForResource = (resource: ResourceCriticality): string => resourceKey(resource.resourceId);
const keyForConstraint = (constraint: ConstraintPressure): string => constraint.constraintId;

const getAccumulator = (groups: Map<string, PriorityAccumulator>, id: string): PriorityAccumulator => {
  const existing = groups.get(id);
  if (existing) return existing;
  const created: PriorityAccumulator = { id, priorityScore: 0, bottlenecks: [], criticalResources: [], activeConstraints: [], evidence: [] };
  groups.set(id, created);
  return created;
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const byPriorityScoreThenId = (a: OperationalPriority, b: OperationalPriority): number =>
  b.priorityScore - a.priorityScore || a.id.localeCompare(b.id);

const explanationFor = (accumulator: PriorityAccumulator): string => {
  const bottlenecks = uniqueSorted(accumulator.bottlenecks);
  const criticalResources = uniqueSorted(accumulator.criticalResources);
  const activeConstraints = uniqueSorted(accumulator.activeConstraints);
  const evidence = [...accumulator.evidence].sort((a, b) => a.localeCompare(b));
  return `Priority ${accumulator.id} scored ${accumulator.priorityScore}. Evidence: bottlenecks=[${bottlenecks.join(", ")}], criticalResources=[${criticalResources.join(", ")}], activeConstraints=[${activeConstraints.join(", ")}]. Contributions: ${evidence.join("; ") || "none"}.`;
};

export function analyzeOperationalPriorities(
  bottlenecks: CriticalBottleneckAnalysis,
  resources: ResourceCriticalityAnalysis,
  constraints: ConstraintPressureAnalysis,
): OperationalPriorityMap {
  const groups = new Map<string, PriorityAccumulator>();

  for (const bottleneck of [...(bottlenecks.bottlenecks ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = getAccumulator(groups, keyForBottleneck(bottleneck));
    group.priorityScore += bottleneck.severity;
    group.bottlenecks.push(bottleneck.id);
    group.evidence.push(`bottleneck:${bottleneck.id}:severity:${bottleneck.severity}`);
  }

  for (const resource of [...(resources.resources ?? [])].sort((a, b) => a.resourceId.localeCompare(b.resourceId))) {
    const group = getAccumulator(groups, keyForResource(resource));
    group.priorityScore += resource.criticalityScore;
    group.criticalResources.push(resource.resourceId);
    group.evidence.push(`resource:${resource.resourceId}:criticality:${resource.criticalityScore}`);
  }

  for (const constraint of [...(constraints.constraints ?? [])].sort((a, b) => a.constraintId.localeCompare(b.constraintId))) {
    const group = getAccumulator(groups, keyForConstraint(constraint));
    group.priorityScore += constraint.pressureScore;
    group.activeConstraints.push(constraint.constraintId);
    group.evidence.push(`constraint:${constraint.constraintId}:pressure:${constraint.pressureScore}`);
  }

  return {
    priorities: [...groups.values()].map((group) => ({
      id: group.id,
      priorityScore: group.priorityScore,
      bottlenecks: uniqueSorted(group.bottlenecks),
      criticalResources: uniqueSorted(group.criticalResources),
      activeConstraints: uniqueSorted(group.activeConstraints),
      explanation: explanationFor(group),
    })).sort(byPriorityScoreThenId),
  };
}
