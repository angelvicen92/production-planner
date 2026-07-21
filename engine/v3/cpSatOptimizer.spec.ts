import assert from "node:assert/strict";
import test from "node:test";
import { optimizeWithCpSat } from "./cpSatOptimizer";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";

const input: EngineV3Input = {
  planId: 322,
  workDay: { start: "09:00", end: "10:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 1,
  tasks: [{ id: 1, planId: 322, templateId: 1, zoneId: 1, spaceId: 1, contestantId: 1, status: "pending", durationOverrideMin: 30 }] as any,
  locks: [],
  groupingZoneIds: [1],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  contestantAvailabilityById: { 1: { start: "09:00", end: "10:00" } },
  optimizerMainZoneId: 1,
};

const warmStart: EngineOutput = {
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30" }],
  unplanned: [],
};

test("optimizeWithCpSat classifies missing python3 ENOENT without claiming OR-Tools failure", () => {
  const enoent = Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" });
  const result = optimizeWithCpSat(input, warmStart, 0.5, {
    spawnPython: () => ({
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
      status: null,
      signal: null,
      error: enoent,
    }),
  });

  assert.equal(result.output, warmStart);
  assert.equal(result.noOptimized, true);
  assert.ok(result.technicalDetails.includes("python3_unavailable"));
  assert.ok(result.technicalDetails.includes("python_spawn_error_code=ENOENT"));
  assert.ok(!result.technicalDetails.includes("ortools_import_failed"));
});
