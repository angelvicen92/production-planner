import test from "node:test";
import assert from "node:assert/strict";
import { classifyORCPlanningEntryOperationalRole } from "./nonWorkTaskClassifier";

const entry = { taskId: -1, startPlanned: "13:00", endPlanned: "14:00", assignedResourceIds: [], spaceId: 7 };

test("classifies meal, global, space and ambiguous negative tasks deterministically", () => {
  assert.equal(classifyORCPlanningEntryOperationalRole({ entry, task: { id: -1, templateId: -1, planId: 1, status: "pending", templateName: "Comida", isPlaceholder: true, isMeal: true } as any, mealWindow: { start: "13:00", end: "14:00" } }), "meal_break_placeholder");
  assert.equal(classifyORCPlanningEntryOperationalRole({ entry, task: { id: -2, templateId: -2, planId: 1, status: "pending", templateName: "Break", isPlaceholder: true, isBreak: true } as any }), "global_break_placeholder");
  assert.equal(classifyORCPlanningEntryOperationalRole({ entry, task: { id: -3, templateId: -3, planId: 1, status: "pending", templateName: "Break", isBreak: true, blockingOnly: true, spaceId: 7 } as any }), "space_break_placeholder");
  assert.equal(classifyORCPlanningEntryOperationalRole({ entry, task: { id: -4, templateId: -4, planId: 1, status: "pending" } as any }), "productive_task");
});

test("classifies configured transport templates without name matching", () => {
  const meta = classifyORCPlanningEntryOperationalRole({ entry: { taskId: 1, startPlanned: "09:00", endPlanned: "09:05", assignedResourceIds: [], spaceId: 49 }, task: { id: 1, planId: 1, templateId: 77, status: "pending", templateName: "Anything" } as any, transportContract: { configured: true, arrivalTemplateId: 77, departureTemplateId: 88, vehicleCapacity: 6, arrivalTargetGroupSize: 3, groupingWeight: 3, source: "test" } });
  assert.equal(meta, "transport_arrival");
});
