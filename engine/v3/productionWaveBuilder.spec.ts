import assert from "node:assert/strict";
import test from "node:test";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { generateProductionWaveCandidates, selectProductionWaveCandidate } from "./productionWaveBuilder";
import { validateHardConstraints } from "./hardValidation";

const makeInput = (): EngineV3Input => ({
  planId: 59, workDay: { start: "08:00", end: "18:00" }, meal: { start: "12:00", end: "15:00" },
  mealMode: "flexible_meal_window", mealTaskTemplateName: "Comida", optimizerMainZoneId: 1, camerasAvailable: 1,
  spaceNameById: { 10: "Principal", 20: "Vocal", 30: "Comedor", 40: "Transporte" },
  tasks: [
    { id: 1, planId: 59, templateId: 1, templateName: "Preparación", contestantId: 1, contestantName: "Talent A", zoneId: 2, spaceId: 21, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 59, templateId: 2, templateName: "Vocal", contestantId: 1, contestantName: "Talent A", zoneId: 2, spaceId: 20, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
    { id: 3, planId: 59, templateId: 3, templateName: "Main", contestantId: 1, contestantName: "Talent A", zoneId: 1, spaceId: 10, status: "pending", durationOverrideMin: 30 },
    { id: 4, planId: 59, templateId: 4, templateName: "Comida", contestantId: 1, contestantName: "Talent A", zoneId: 3, spaceId: 30, status: "pending", durationOverrideMin: 30 },
    { id: 5, planId: 59, templateId: 5, templateName: "Salida", contestantId: 1, contestantName: "Talent A", zoneId: 4, spaceId: 40, status: "pending", durationOverrideMin: 30 },
  ],
  departureTaskTemplateName: "Salida", locks: [], zoneResourceAssignments: {}, spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, resourceItemComponents: {},
  contestantAvailabilityById: {}, coachResourceIds: [9001],
  planResourceItems: [{ id: 9001, resourceItemId: 9001, typeId: 1, typeCode: "coach", name: "Coach", isAvailable: true }],
});
const makeOutput = (): EngineOutput => ({ feasible: true, complete: true, hardFeasible: true, unplanned: [], warnings: [], plannedTasks: [
  { taskId: 1, startPlanned: "08:30", endPlanned: "09:00", assignedResources: [] },
  { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [9001] },
  { taskId: 3, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [] },
  { taskId: 4, startPlanned: "14:00", endPlanned: "14:30", assignedResources: [] },
  { taskId: 5, startPlanned: "16:00", endPlanned: "16:30", assignedResources: [] },
] });

test("production wave compacts around Main Stage and schedules OUT after real work", () => {
  const generated = generateProductionWaveCandidates(makeInput(), makeOutput());
  assert.equal(generated.meta.productionWaveAnchorsFound, 1);
  assert.ok(generated.candidates.length > 0);
  const byId = (id: number) => generated.candidates[0].plannedTasks!.find((p) => p.taskId === id)!;
  assert.equal(byId(3).startPlanned, "12:00");
  assert.equal(byId(2).endPlanned, "12:00");
  assert.ok(byId(5).startPlanned >= byId(4).endPlanned);
  assert.equal(validateHardConstraints(makeInput(), generated.candidates[0]).hardValidationPassed, true);
});

test("production wave reports concrete blockers when no anchor exists", () => {
  const input = makeInput(); input.optimizerMainZoneId = 99;
  const generated = generateProductionWaveCandidates(input, makeOutput());
  assert.equal(generated.meta.productionWaveCandidatesGenerated, 0);
  assert.ok(generated.meta.productionWaveRejectedReasons.includes("no_primary_stage_anchor_for_any_talent"));
});

test("production wave does not move done tasks or Main Stage anchors", () => {
  const input = makeInput(); input.tasks[0].status = "done";
  const selected = selectProductionWaveCandidate(input, makeOutput());
  assert.equal(selected.output.plannedTasks!.find((p) => p.taskId === 1)!.startPlanned, "08:30");
  assert.equal(selected.output.plannedTasks!.find((p) => p.taskId === 3)!.startPlanned, "12:00");
});
