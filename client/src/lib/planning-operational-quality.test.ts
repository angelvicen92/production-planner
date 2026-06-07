import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePlanningOperationalQuality,
  OPERATIONAL_QUALITY_LIMITS,
} from "./planning-operational-quality";

function task(overrides: Record<string, unknown>) {
  return {
    startPlanned: "09:00",
    endPlanned: "10:00",
    contestantId: 1,
    template: { name: "Ensayo" },
    ...overrides,
  };
}

test("calculates talent span, active time and idle time", () => {
  const quality = calculatePlanningOperationalQuality({
    contestants: [{ id: 1, name: "Talent A" }],
    tasks: [
      task({ startPlanned: "09:00", endPlanned: "10:00" }),
      task({ startPlanned: "11:00", endPlanned: "11:30" }),
    ],
  });

  assert.deepEqual(quality.topTalentIdle[0], {
    name: "Talent A",
    taskCount: 2,
    firstTaskStart: "09:00",
    lastTaskEnd: "11:30",
    spanMinutes: 150,
    activeMinutes: 90,
    idleMinutes: 60,
    idleRatio: 0.4,
    maxGapMinutes: 60,
    largeGapCount: 1,
    mainStageTaskCount: 0,
    transportInTime: null,
    transportOutTime: null,
    warnings: ["Talent A: hueco máximo 60 min"],
  });
});

test("detects a large talent gap", () => {
  const quality = calculatePlanningOperationalQuality({
    tasks: [
      task({ endPlanned: "09:30" }),
      task({ startPlanned: "10:15", endPlanned: "10:45" }),
    ],
  });

  assert.equal(quality.topTalentIdle[0]?.maxGapMinutes, 45);
  assert.equal(quality.topTalentIdle[0]?.largeGapCount, 1);
  assert.match(quality.topTalentIdle[0]?.warnings.join(" ") ?? "", /45 min/);
});

test("detects a coach split shift from assigned resource names", () => {
  const quality = calculatePlanningOperationalQuality({
    resourceNamesById: { 8: "Coach Lucía" },
    tasks: [
      task({ assignedResources: [8], startPlanned: "08:00", endPlanned: "09:00" }),
      task({ assignedResources: [8], startPlanned: "13:00", endPlanned: "14:00" }),
    ],
  });

  assert.equal(quality.analysisAvailability.coachAnalysisAvailable, true);
  assert.equal(quality.topCoachIdle[0]?.sessionBlocks, 2);
  assert.equal(quality.topCoachIdle[0]?.idleMinutes, 240);
  assert.match(quality.topCoachIdle[0]?.warnings.join(" ") ?? "", /jornada partida/);
});

test("limits exported talent and coach top lists", () => {
  const tasks = Array.from({ length: 30 }, (_, index) => [
    task({ contestantId: index + 1, assignedResources: [index + 1], startPlanned: "08:00", endPlanned: "08:30" }),
    task({ contestantId: index + 1, assignedResources: [index + 1], startPlanned: "10:00", endPlanned: "10:30" }),
  ]).flat();
  const resourceNamesById = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [index + 1, `Coach ${index + 1}`]));
  const quality = calculatePlanningOperationalQuality({ tasks, resourceNamesById });

  assert.equal(quality.topTalentIdle.length, OPERATIONAL_QUALITY_LIMITS.talent);
  assert.equal(quality.topCoachIdle.length, OPERATIONAL_QUALITY_LIMITS.coach);
});

test("returns explicit availability flags when tasks are absent", () => {
  const quality = calculatePlanningOperationalQuality({});

  assert.equal(quality.summary.status, "unknown");
  assert.equal(quality.topTalentIdle.length, 0);
  assert.equal(quality.analysisAvailability.coachAnalysisAvailable, false);
  assert.equal(quality.analysisAvailability.feederAnalysisAvailable, false);
  assert.equal(quality.transportSummary.analysisAvailable, false);
});
