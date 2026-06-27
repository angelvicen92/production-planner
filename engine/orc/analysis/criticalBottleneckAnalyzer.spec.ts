import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeCriticalBottlenecks } from "./criticalBottleneckAnalyzer";
import type { OperationalAnalysis } from "./operationalStateAnalyzer";

const emptyAnalysis = (): OperationalAnalysis => ({
  resourcePressure: { totalResourceCount: 0, assignedResourceIds: [], overloadedResourceIds: [], plannedTaskIdsByResourceId: {} },
  continuity: { taskCount: 0, plannedTaskCount: 0, pendingTaskCount: 0, protectedTaskCount: 0, mainFlow: { configured: false, spaceOrZoneId: null, plannedTaskIds: [], firstStart: null, lastEnd: null, internalGapMinutes: 0, gapCount: 0 } },
  fragmentation: { spaceSwitchesByContestantId: {}, totalSpaceSwitches: 0 },
  dependencySummary: { dependencyCount: 0, lockCount: 0, lockedTaskIds: [], taskIdsWithDependencies: [] },
  operationalMargin: { contestantIds: [], stayByContestantId: {}, maxStayContestantId: null, maxStayMinutes: 0 },
  criticalBottleneckAnalysis: { bottlenecks: [] },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("Critical Bottleneck Analyzer supports an empty analysis", () => {
  assert.deepEqual(analyzeCriticalBottlenecks(emptyAnalysis()), { bottlenecks: [] });
});

test("Critical Bottleneck Analyzer detects one resource bottleneck", () => {
  const result = analyzeCriticalBottlenecks({
    ...emptyAnalysis(),
    resourcePressure: { totalResourceCount: 1, assignedResourceIds: [3], overloadedResourceIds: [3], plannedTaskIdsByResourceId: { 3: [2, 1] } },
  });
  assert.deepEqual(result.bottlenecks, [{
    id: "resource:3:overlap",
    category: "RESOURCE_PRESSURE",
    severity: 4,
    explanation: "Resource 3 is overloaded across 2 planned task(s): 1, 2. Elements analyzed: overloadedResourceIds, plannedTaskIdsByResourceId.",
  }]);
});

test("Critical Bottleneck Analyzer detects multiple bottlenecks deterministically ordered", () => {
  const result = analyzeCriticalBottlenecks({
    resourcePressure: { totalResourceCount: 2, assignedResourceIds: [20, 10], overloadedResourceIds: [20, 10], plannedTaskIdsByResourceId: { 10: [3], 20: [2, 1] } },
    continuity: { taskCount: 4, plannedTaskCount: 3, pendingTaskCount: 1, protectedTaskCount: 0, mainFlow: { configured: true, spaceOrZoneId: 5, plannedTaskIds: [3, 1], firstStart: "08:00", lastEnd: "09:30", internalGapMinutes: 45, gapCount: 2 } },
    fragmentation: { spaceSwitchesByContestantId: { 7: 3 }, totalSpaceSwitches: 3 },
    dependencySummary: { dependencyCount: 2, lockCount: 2, lockedTaskIds: [4, 2], taskIdsWithDependencies: [3] },
    operationalMargin: { contestantIds: [7], stayByContestantId: { 7: 300 }, maxStayContestantId: 7, maxStayMinutes: 300 },
    criticalBottleneckAnalysis: { bottlenecks: [] },
  });
  assert.deepEqual(result.bottlenecks.map((item) => item.id), ["main-flow:5:gaps", "resource:20:overlap", "flow:space-switches", "resource:10:overlap", "constraints:locks", "continuity:pending-tasks"]);
});

test("Critical Bottleneck Analyzer is deterministic, structurally equal and serializable", () => {
  const analysis = { ...emptyAnalysis(), continuity: { ...emptyAnalysis().continuity, pendingTaskCount: 2, taskCount: 2 } };
  const first = analyzeCriticalBottlenecks(analysis);
  const second = analyzeCriticalBottlenecks(analysis);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(JSON.parse(JSON.stringify(first))));
});

test("Critical Bottleneck Analyzer does not mutate its input", () => {
  const analysis = { ...emptyAnalysis(), resourcePressure: { totalResourceCount: 1, assignedResourceIds: [1], overloadedResourceIds: [1], plannedTaskIdsByResourceId: { 1: [2, 1] } } };
  const before = clone(analysis);
  analyzeCriticalBottlenecks(analysis);
  assert.deepEqual(analysis, before);
});
