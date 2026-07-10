import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "../types";
import { buildEngineScenarioSnapshot } from "../scenarioSnapshot";
import { replayEngineScenario } from "./replayEngineScenario";

const minimalInput = (): EngineInput => ({ planId: 259, workDay: { start: "09:00", end: "10:00" }, meal: { start: "13:00", end: "14:00" }, camerasAvailable: 1, tasks: [{ id: 1, planId: 259, templateId: 10, templateName: "A", status: "pending", durationOverrideMin: 10 }], locks: [], zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, planResourceItems: [], resourceItemComponents: {}, groupingZoneIds: [] });

test("replay runs without DB, repeats deterministically, and emits compact report", () => { const snapshot = buildEngineScenarioSnapshot(259, minimalInput(), "2026-07-10T00:00:00.000Z"); const report = replayEngineScenario(snapshot, { engine: "v3", repeat: 2 }); assert.equal(report.deterministic, true); assert.equal(report.executions.length, 2); assert.equal(report.executions[0].outputHash, report.executions[1].outputHash); const json = JSON.stringify(report); assert.equal(json.includes("operationalStateSnapshot"), false); assert.equal(json.includes("engineInput"), false); });
