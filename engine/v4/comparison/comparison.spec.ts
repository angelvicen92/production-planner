import assert from "node:assert/strict";
import test from "node:test";
import { compareV3AndV4Quality } from "./index";
import type { V4PlanQualityEvaluation } from "../quality";

function quality(overrides: Partial<V4PlanQualityEvaluation> = {}): V4PlanQualityEvaluation {
  return {
    qualityScore: 80,
    grade: "GOOD",
    summary: "fixture",
    strengths: [],
    weaknesses: [],
    warnings: [],
    mainFlowQuality: { firstTaskStart: "09:00", lastTaskEnd: "11:00", occupiedDurationMinutes: 120, internalGapMinutes: 20, internalGapCount: 1, maxInternalGapMinutes: 20, continuityPercent: 85, plannedMainFlowTasks: 4, unplannedMainFlowTasks: 0 },
    makespan: { lastTaskEnd: "12:00", plannedDayDurationMinutes: 180, fromWorkDayStartMinutes: 180 },
    talentStayTime: { averageStayMinutes: 60, maxStayMinutes: 90, totalStayMinutes: 300, talentCount: 5, topWaitingTalents: [] },
    criticalResourceUsage: [],
    risk: { unplannedTasks: 0, unplannedCriticalTalentTasks: 0, unplannedMainFlowTasks: 0, affectedCriticalResources: [] },
    ...overrides,
  };
}

test("compareV3AndV4Quality marks V4 better when continuity is not worse and score improves", () => {
  const result = compareV3AndV4Quality(quality(), quality({ qualityScore: 85, makespan: { lastTaskEnd: "11:45", plannedDayDurationMinutes: 165, fromWorkDayStartMinutes: 165 } }));
  assert.equal(result.verdict, "V4_BETTER");
  assert.equal(result.deltas.qualityScore, 5);
  assert.equal(result.deltas.makespanMinutes, -15);
});

test("compareV3AndV4Quality marks V4 worse when it increases unplanned tasks", () => {
  const result = compareV3AndV4Quality(quality(), quality({ risk: { unplannedTasks: 1, unplannedCriticalTalentTasks: 0, unplannedMainFlowTasks: 0, affectedCriticalResources: [] } }));
  assert.equal(result.verdict, "V4_WORSE");
  assert.equal(result.deltas.unplannedTasks, 1);
});
