import assert from "node:assert/strict";
import test from "node:test";
import { estimatedPlanningProgress, planningPhaseSteps, PLANNING_PHASES } from "./planning-progress";

test("planning phases are exposed in operational order", () => {
  assert.deepEqual(PLANNING_PHASES.map((phase) => phase.id), [
    "loading_input", "phase_a_base_solution", "hard_validation", "operational_neighborhoods", "segment_solver", "coach_compaction",
    "coach_wave_ordering", "pipeline_builder", "pipeline_repair", "lane_only_repair", "meal_scheduling",
    "scoring_candidates", "persisting_result",
  ]);
});

test("a long phase advances with heartbeat but never reaches 100 before success", () => {
  const started = "2026-06-09T12:00:00.000Z";
  const progress = estimatedPlanningProgress({ phase: "pipeline_builder", persistedPercent: 70, status: "running", phaseStartedAt: started, nowMs: Date.parse("2026-06-09T12:00:30.000Z") });
  assert.ok(progress > 70 && progress < 78);
  assert.equal(estimatedPlanningProgress({ phase: "persisting_result", persistedPercent: 99, status: "running", phaseStartedAt: started, nowMs: Date.parse("2026-06-09T12:10:00.000Z") }), 99);
  assert.equal(estimatedPlanningProgress({ phase: "persisting_result", persistedPercent: 99, status: "success", phaseStartedAt: started }), 100);
});

test("step statuses preserve the active phase after reconnect", () => {
  const steps = planningPhaseSteps("meal_scheduling", "running");
  assert.equal(steps.find((step) => step.id === "meal_scheduling")?.status, "active");
  assert.equal(steps.find((step) => step.id === "pipeline_builder")?.status, "completed");
  assert.equal(steps.find((step) => step.id === "persisting_result")?.status, "pending");
});
