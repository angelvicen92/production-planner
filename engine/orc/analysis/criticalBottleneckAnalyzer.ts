import type { OperationalAnalysis } from "./operationalStateAnalyzer";

export interface CriticalBottleneck {
  readonly id: string;
  readonly category: string;
  readonly severity: number;
  readonly explanation: string;
}

export interface CriticalBottleneckAnalysis {
  readonly bottlenecks: readonly CriticalBottleneck[];
}

const bySeverityCategoryAndId = (a: CriticalBottleneck, b: CriticalBottleneck): number =>
  b.severity - a.severity || a.category.localeCompare(b.category) || a.id.localeCompare(b.id);

const uniqueSortedNumbers = (values: readonly number[] = []): number[] =>
  [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);

const bottleneck = (id: string, category: string, severity: number, explanation: string): CriticalBottleneck => ({
  id,
  category,
  severity,
  explanation,
});

export function analyzeCriticalBottlenecks(analysis: Omit<OperationalAnalysis, "criticalBottleneckAnalysis" | "resourceCriticalityAnalysis"> | OperationalAnalysis): CriticalBottleneckAnalysis {
  const bottlenecks: CriticalBottleneck[] = [];

  for (const resourceId of uniqueSortedNumbers(analysis.resourcePressure.overloadedResourceIds)) {
    const taskIds = uniqueSortedNumbers(analysis.resourcePressure.plannedTaskIdsByResourceId[resourceId] ?? []);
    bottlenecks.push(bottleneck(
      `resource:${resourceId}:overlap`,
      "RESOURCE_PRESSURE",
      taskIds.length + 2,
      `Resource ${resourceId} is overloaded across ${taskIds.length} planned task(s): ${taskIds.join(", ") || "none"}. Elements analyzed: overloadedResourceIds, plannedTaskIdsByResourceId.`,
    ));
  }

  if (analysis.continuity.pendingTaskCount > 0) {
    bottlenecks.push(bottleneck(
      "continuity:pending-tasks",
      "UNPLANNED_PENDING_TASKS",
      analysis.continuity.pendingTaskCount,
      `There are ${analysis.continuity.pendingTaskCount} pending task(s) outside the planning out of ${analysis.continuity.taskCount} task(s). Elements analyzed: pendingTaskCount, taskCount.`,
    ));
  }

  if (analysis.continuity.mainFlow.configured && analysis.continuity.mainFlow.gapCount > 0) {
    bottlenecks.push(bottleneck(
      `main-flow:${analysis.continuity.mainFlow.spaceOrZoneId ?? "unknown"}:gaps`,
      "MAIN_FLOW_GAP",
      analysis.continuity.mainFlow.gapCount + Math.ceil(analysis.continuity.mainFlow.internalGapMinutes / 30),
      `Main flow ${analysis.continuity.mainFlow.spaceOrZoneId ?? "unknown"} has ${analysis.continuity.mainFlow.gapCount} gap(s) totaling ${analysis.continuity.mainFlow.internalGapMinutes} minute(s). Elements analyzed: mainFlow.gapCount, mainFlow.internalGapMinutes, mainFlow.plannedTaskIds.`,
    ));
  }

  if (analysis.operationalMargin.maxStayContestantId != null && analysis.operationalMargin.maxStayMinutes > 240) {
    bottlenecks.push(bottleneck(
      `talent:${analysis.operationalMargin.maxStayContestantId}:extended-stay`,
      "EXCESSIVE_TALENT_STAY",
      Math.ceil(analysis.operationalMargin.maxStayMinutes / 60),
      `Contestant ${analysis.operationalMargin.maxStayContestantId} has an extended planned stay of ${analysis.operationalMargin.maxStayMinutes} minute(s). Elements analyzed: maxStayContestantId, maxStayMinutes.`,
    ));
  }

  if (analysis.dependencySummary.lockCount > 0) {
    const lockedTaskIds = uniqueSortedNumbers(analysis.dependencySummary.lockedTaskIds);
    bottlenecks.push(bottleneck(
      "constraints:locks",
      "LOCK_PRESSURE",
      analysis.dependencySummary.lockCount,
      `There are ${analysis.dependencySummary.lockCount} lock(s) affecting task(s): ${lockedTaskIds.join(", ") || "none"}. Elements analyzed: lockCount, lockedTaskIds.`,
    ));
  }

  if (analysis.fragmentation.totalSpaceSwitches > 0) {
    bottlenecks.push(bottleneck(
      "flow:space-switches",
      "FRAGMENTATION",
      analysis.fragmentation.totalSpaceSwitches,
      `There are ${analysis.fragmentation.totalSpaceSwitches} contestant space switch(es). Elements analyzed: totalSpaceSwitches, spaceSwitchesByContestantId.`,
    ));
  }

  return { bottlenecks: bottlenecks.sort(bySeverityCategoryAndId) };
}
