import assert from "node:assert/strict";
import { validateOptimizedCandidate } from "./validateCandidate";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";

const input: EngineV3Input = {
  planId: 1,
  workDay: { start: "09:00", end: "11:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 1,
  contestantMealDurationMinutes: 30,
  contestantMealMaxSimultaneous: 1,
  tasks: [
    { id: 1, planId: 1, templateId: 1, templateName: "T1", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30 },
  ] as any,
  locks: [
    { taskId: 1, lockType: "time", lockedStart: "09:00", lockedEnd: "09:30" } as any,
  ],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  optimizerMainZoneId: 1,
  optimizerWeights: {},
};

const warm: EngineOutput = {
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] }] as any,
  unplanned: [],
  warnings: [],
  reasons: [],
};

{
  const candidate: EngineOutput = {
    ...warm,
    plannedTasks: [{ taskId: 1, startPlanned: "09:05", endPlanned: "09:35", assignedResources: [] }] as any,
  };
  const errors = validateOptimizedCandidate(input, warm, candidate);
  assert.ok(errors.includes("MOVED_LOCKED_TIME_1"));
}

{
  const candidate: EngineOutput = {
    ...warm,
    plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] }] as any,
  };
  const errors = validateOptimizedCandidate(input, warm, candidate);
  assert.equal(errors.includes("MOVED_LOCKED_TIME_1"), false);
}

{
  const concurrentInput: EngineV3Input = { ...input, spaceCapacityById: { 11: 2 }, tasks: [
    { id: 1, planId: 1, templateId: 1, templateName: "T1", zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 1, templateId: 2, templateName: "T2", zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 30 },
  ] as any, locks: [] };
  const concurrentWarm: EngineOutput = { ...warm, plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [] },
  ] as any };
  const candidate: EngineOutput = { ...concurrentWarm, plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
  ] as any };
  assert.equal(validateOptimizedCandidate(concurrentInput, concurrentWarm, candidate).some((error) => error.startsWith("SPACE_CAPACITY_EXCEEDED_")), false);
}

{
  const exclusiveInput: EngineV3Input = { ...input, tasks: [
    { id: 1, planId: 1, templateId: 1, zoneId: 1, spaceId: 11, contestantId: 1, status: "pending", durationOverrideMin: 30 },
    { id: 2, planId: 1, templateId: 2, zoneId: 1, spaceId: 11, contestantId: 2, status: "pending", durationOverrideMin: 30 },
  ] as any, locks: [] };
  const candidate: EngineOutput = { ...warm, plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
  ] as any };
  assert.ok(validateOptimizedCandidate(exclusiveInput, candidate, candidate).some((error) => error.startsWith("SPACE_CAPACITY_EXCEEDED_11_")));
}


{
  const transportSpaceId = 754;
  const transportInput: EngineV3Input = {
    ...input,
    arrivalTaskTemplateName: "IN",
    departureTaskTemplateName: "OUT",
    transportSpaceId,
    transportVanCapacity: 6,
    tasks: Array.from({ length: 6 }, (_, index) => ({
      id: 100 + index, planId: 1, templateId: 100 + index, templateName: "IN", zoneId: 1,
      spaceId: transportSpaceId, contestantId: 100 + index, status: "pending", durationOverrideMin: 30,
    })) as any,
    locks: [],
  };
  const candidate: EngineOutput = {
    ...warm,
    plannedTasks: Array.from({ length: 6 }, (_, index) => ({
      taskId: 100 + index, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [],
    })) as any,
  };
  assert.equal(validateOptimizedCandidate(transportInput, candidate, candidate).some((error) => error.startsWith("SPACE_CAPACITY_EXCEEDED_")), false);
}

console.log("engine/v3/validateCandidate.spec.ts: OK");
