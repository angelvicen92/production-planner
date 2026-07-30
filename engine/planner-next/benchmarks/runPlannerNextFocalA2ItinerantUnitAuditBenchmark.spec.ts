import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildItinerantUnitArtifact } from "./runPlannerNextFocalA2ItinerantUnitAuditBenchmark";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("fresh v3 has one active truth, 29 scenarios, exact agendas, and derived acceptance", () => {
  const output = buildItinerantUnitArtifact(read("planner-next-focal-a2-itinerant-unit-audit-v3.json"), read("engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV3HistoricalManifest.json"));
  assert.equal(output.status, "FOCAL_A2_ITINERANT_UNIT_AUDIT_REPAIRED"); assert.equal(Object.keys(output.scenarios).length, 29);
  const agendas = output.standaloneRealityRun.evaluation.agendas;
  assert.deepEqual(agendas["reality-unit-morning-a"].scheduledOperationIds, ["reality-operation-02", "reality-operation-04"]);
  assert.deepEqual(agendas["reality-unit-morning-b"].scheduledOperationIds, ["reality-operation-05", "reality-operation-07"]);
  assert.deepEqual(new Set(agendas["reality-unit-afternoon-combined"].scheduledOperationIds), new Set(["reality-operation-08", "reality-operation-09", "reality-operation-10", "reality-operation-11", "reality-operation-12"]));
  assert.equal(output.acceptance.accepted, true); assert.equal(output.acceptance.combinedInputRepresentable, false); assert.equal(output.acceptance.fullRealityBenchmarkPassed, false);
});
