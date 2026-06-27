import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalAnalysis } from "./operationalStateAnalyzer";
import { analyzeCriticalBottlenecks } from "./criticalBottleneckAnalyzer";
import { detectOpportunities } from "./opportunityDetectionEngine";

const emptyAnalysis = (): OperationalAnalysis => ({
  resourcePressure: { totalResourceCount: 0, assignedResourceIds: [], overloadedResourceIds: [], plannedTaskIdsByResourceId: {} },
  continuity: { taskCount: 0, plannedTaskCount: 0, pendingTaskCount: 0, protectedTaskCount: 0, mainFlow: { configured: false, spaceOrZoneId: null, plannedTaskIds: [], firstStart: null, lastEnd: null, internalGapMinutes: 0, gapCount: 0 } },
  fragmentation: { spaceSwitchesByContestantId: {}, totalSpaceSwitches: 0 },
  dependencySummary: { dependencyCount: 0, lockCount: 0, lockedTaskIds: [], taskIdsWithDependencies: [] },
  operationalMargin: { contestantIds: [], stayByContestantId: {}, maxStayContestantId: null, maxStayMinutes: 0 },
  criticalBottleneckAnalysis: { bottlenecks: [] },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("Opportunity Detection Engine supports an empty OperationalAnalysis", () => {
  assert.deepEqual(detectOpportunities(emptyAnalysis()), { opportunities: [] });
});

test("Opportunity Detection Engine detects one opportunity", () => {
  const analysis = emptyAnalysis();
  const enriched = { ...analysis, resourcePressure: { totalResourceCount: 2, assignedResourceIds: [10], overloadedResourceIds: [10], plannedTaskIdsByResourceId: { 10: [2, 1] } } };
  const bottleneckAnalysis = analyzeCriticalBottlenecks(enriched);
  const result = detectOpportunities(enriched, bottleneckAnalysis);
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].kind, "RESOURCE_PRESSURE");
  assert.deepEqual(result.opportunities[0].taskIds, [1, 2]);
  assert.deepEqual(result.opportunities[0].metadata.bottleneckIds, ["resource:10:overlap"]);
  assert.equal(result.opportunities[0].metadata.derivedFromCriticalBottleneck, true);
});

test("Opportunity Detection Engine detects multiple opportunity classes deterministically ordered", () => {
  const analysis = {
    ...emptyAnalysis(),
    resourcePressure: { totalResourceCount: 2, assignedResourceIds: [20, 10], overloadedResourceIds: [20], plannedTaskIdsByResourceId: { 10: [3], 20: [2, 1] } },
    continuity: { taskCount: 4, plannedTaskCount: 3, pendingTaskCount: 1, protectedTaskCount: 0, mainFlow: { configured: true, spaceOrZoneId: 5, plannedTaskIds: [3, 1], firstStart: "08:00", lastEnd: "09:30", internalGapMinutes: 15, gapCount: 1 } },
    fragmentation: { spaceSwitchesByContestantId: { 7: 3 }, totalSpaceSwitches: 3 },
    dependencySummary: { dependencyCount: 2, lockCount: 2, lockedTaskIds: [4, 2], taskIdsWithDependencies: [3] },
    operationalMargin: { contestantIds: [7], stayByContestantId: { 7: 300 }, maxStayContestantId: 7, maxStayMinutes: 300 },
  };
  const result = detectOpportunities(analysis, analyzeCriticalBottlenecks(analysis));
  assert.deepEqual(result.opportunities.map((opportunity) => opportunity.kind), ["MAIN_FLOW_GAP", "UNPLANNED_PENDING_TASKS", "RESOURCE_PRESSURE", "EXCESSIVE_TALENT_STAY", "LOCK_PRESSURE", "FRAGMENTATION"]);
  assert.equal(result.opportunities.every((opportunity) => (opportunity.metadata.bottleneckIds as string[]).length > 0), true);
});

test("Opportunity Detection Engine avoids duplicates from multiple bottlenecks in the same category", () => {
  const analysis = { ...emptyAnalysis(), resourcePressure: { totalResourceCount: 2, assignedResourceIds: [20, 10], overloadedResourceIds: [20, 10], plannedTaskIdsByResourceId: { 10: [3], 20: [2, 1] } } };
  const result = detectOpportunities(analysis, analyzeCriticalBottlenecks(analysis));
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].kind, "RESOURCE_PRESSURE");
  assert.deepEqual(result.opportunities[0].metadata.bottleneckIds, ["resource:20:overlap", "resource:10:overlap"]);
});

test("Opportunity Detection Engine preserves structural equality with explicit bottlenecks", () => {
  const analysis = { ...emptyAnalysis(), continuity: { ...emptyAnalysis().continuity, pendingTaskCount: 2, taskCount: 2 } };
  const bottleneckAnalysis = analyzeCriticalBottlenecks(analysis);
  assert.deepEqual(detectOpportunities(analysis, bottleneckAnalysis), detectOpportunities(analysis, clone(bottleneckAnalysis)));
});

test("Opportunity Detection Engine is deterministic, structurally equal and serializable", () => {
  const analysis = emptyAnalysis();
  const enriched = { ...analysis, continuity: { ...analysis.continuity, pendingTaskCount: 2, taskCount: 2 } };
  const bottleneckAnalysis = analyzeCriticalBottlenecks(enriched);
  const first = detectOpportunities(enriched, bottleneckAnalysis);
  const second = detectOpportunities(enriched, bottleneckAnalysis);
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("Opportunity Detection Engine does not mutate its input", () => {
  const analysis = { ...emptyAnalysis(), resourcePressure: { totalResourceCount: 1, assignedResourceIds: [1], overloadedResourceIds: [1], plannedTaskIdsByResourceId: { 1: [2, 1] } } };
  const before = clone(analysis);
  detectOpportunities(analysis, analyzeCriticalBottlenecks(analysis));
  assert.deepEqual(analysis, before);
});
