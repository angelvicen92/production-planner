import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { detectCoachAssignments, isCoachResource } from "./coachDetection";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";
import { compareCandidateSolutions } from "./solutionScoring";

const input = (resource: any, coachResourceIds: number[] = []): EngineV3Input => ({
  planId: 32,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 32, templateId: 1, templateName: "Sesión", contestantId: 1, status: "pending", durationOverrideMin: 120 },
    { id: 2, planId: 32, templateId: 1, templateName: "Sesión", contestantId: 2, status: "pending", durationOverrideMin: 120 },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [resource],
  coachResourceIds,
  resourceItemComponents: {},
});

const splitOutput: EngineOutput = {
  feasible: true, complete: true, hardFeasible: true, unplanned: [], warnings: [],
  plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "11:00", assignedResources: [77] },
    { taskId: 2, startPlanned: "15:20", endPlanned: "17:20", assignedResources: [77] },
  ],
};

// Structured resource type/category takes precedence over personal names.
assert.equal(isCoachResource({ id: 77, typeId: 44, typeCode: "vocal_coach", name: "Persona A" }), true);
assert.equal(detectCoachAssignments(input({ id: 77, resourceItemId: 7, typeId: 44, category: "coach", name: "Persona A", isAvailable: true }), splitOutput).length, 1);

// Conservative fallback accepts vocal/coach in resource metadata/name.
assert.equal(isCoachResource({ id: 77, typeId: 44, name: "Vocal Coach turno 1" }), true);

// A real-like two-block day exposes idle/span/max-gap/split penalties.
{
  const metrics = calculateEngineOperationalCompactionMetrics(
    input({ id: 77, resourceItemId: 7, typeId: 44, name: "Persona A", isAvailable: true }, [77]),
    splitOutput,
  );
  assert.equal(metrics.coachIdlePenalty, 260);
  assert.equal(metrics.coachSpanPenalty, 500);
  assert.equal(metrics.maxCoachGapMinutes, 260);
  assert.equal(metrics.coachSplitDayPenalty, 1);
}

// When superior criteria tie, candidate selection prefers lower coach idle/span.
{
  const engineInput = input({ id: 77, resourceItemId: 7, typeId: 44, typeName: "Coach vocal", name: "Persona A", isAvailable: true });
  const compact: EngineOutput = {
    ...splitOutput,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "11:00", assignedResources: [77] },
      { taskId: 2, startPlanned: "11:00", endPlanned: "13:00", assignedResources: [77] },
    ],
  };
  assert.equal(compareCandidateSolutions(engineInput, compact, splitOutput), 1);
}
