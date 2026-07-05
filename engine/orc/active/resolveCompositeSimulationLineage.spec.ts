import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompositeSimulationLineage } from "./resolveCompositeSimulationLineage";

const sim = (id: string) => ({ id, candidateStateId:"cs", baseStateId:"base", operationalStateSnapshot:{} as any, appliedTransformations:[], simulationMode:"ASSIGNMENT_APPLICATION_SHADOW", readOnly:true, createdAt:null } as any);

test("detecta baseline repair directo", () => {
  const r = resolveCompositeSimulationLineage({ selectedSimulation: sim("repair"), baselineOverlapRepair: { selectedSimulatedStateId:"repair" }, changeSources: {} });
  assert.equal(r.includesBaselineOverlapRepair, true);
});

test("detecta post-repair continuity directo", () => {
  const r = resolveCompositeSimulationLineage({ selectedSimulation: sim("post"), postRepairMainZoneContinuityPass: { selectedAsCommit:true, selectedSimulatedStateId:"post" }, changeSources: {} });
  assert.equal(r.includesPostRepairMainZoneContinuity, true);
  assert.deepEqual(r.lineageWarnings, []);
});

test("detecta idle compression como child final de post-repair", () => {
  const r = resolveCompositeSimulationLineage({ selectedSimulation: sim("idle"), simulationSelection: { baseCompositeSimulationId:"post" }, postRepairMainZoneContinuityPass: { selectedAsCommit:true, selectedSimulatedStateId:"post" }, criticalResourceIdleCompression: { selectedSimulatedStateId:"idle", sourceSimulationId:"post" }, changeSources: { postRepairMainZoneContinuity:{ changedTaskCount:6 }, criticalResourceIdleCompression:{ changedTaskCount:1 } } });
  assert.equal(r.finalSelectedCandidateFamily, "critical-resource-idle-compression");
  assert.equal(r.includesPostRepairMainZoneContinuity, true);
  assert.equal(r.includesCriticalResourceIdleCompression, true);
});

test("detecta tres fuentes en chain compuesta", () => {
  const r = resolveCompositeSimulationLineage({ selectedSimulation: sim("idle"), simulationSelection: { baseCompositeSimulationId:"post" }, postRepairMainZoneContinuityPass: { selectedAsCommit:true, selectedSimulatedStateId:"post" }, criticalResourceIdleCompression: { selectedSimulatedStateId:"idle", sourceSimulationId:"post" }, changeSources: { baselineOverlapRepair:{ changedTaskCount:1 }, postRepairMainZoneContinuity:{ changedTaskCount:6 }, criticalResourceIdleCompression:{ changedTaskCount:1 } } });
  assert.equal(r.includesBaselineOverlapRepair, true);
  assert.equal(r.includesPostRepairMainZoneContinuity, true);
  assert.equal(r.includesCriticalResourceIdleCompression, true);
});

test("rechaza lineage roto", () => {
  const r = resolveCompositeSimulationLineage({ selectedSimulation: sim("idle"), postRepairMainZoneContinuityPass: { selectedAsCommit:true, selectedSimulatedStateId:"post" }, criticalResourceIdleCompression: { selectedSimulatedStateId:"idle" }, changeSources: { criticalResourceIdleCompression:{ changedTaskCount:1 } } });
  assert.equal(r.includesPostRepairMainZoneContinuity, false);
  assert.ok(r.lineageWarnings.includes("post_repair_commit_not_reflected_in_simulation_selection"));
});
