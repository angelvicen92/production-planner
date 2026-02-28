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

console.log("engine/v3/validateCandidate.spec.ts: OK");
