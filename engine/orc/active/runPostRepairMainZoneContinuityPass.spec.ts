import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { runPostRepairMainZoneContinuityPass } from "./runPostRepairMainZoneContinuityPass";

const state = (mainZoneId: number | null = 10): OperationalState => ({
  id: "state", schemaVersion: "ORC-SPEC-01", tasks: [
    { id: 1, durationMinutes: 30, status: "pending", spaceId: 10, assignedResourceIds: [1] } as any,
    { id: 2, durationMinutes: 30, status: "pending", spaceId: 10, assignedResourceIds: [2] } as any,
    { id: 3, durationMinutes: 30, status: "pending", spaceId: 20, assignedResourceIds: [2] } as any,
  ], resources: [], spaces: [{ id: 10 } as any, { id: 20 } as any], teams: [], contestants: [], dependencies: [], constraints: mainZoneId == null ? { dependencies: [] } as any : { optimizer: { mainZoneId }, dependencies: [] } as any,
  planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", spaceId: 10, assignedResourceIds: [1], countsAsWork: true },
    { taskId: 3, startPlanned: "09:30", endPlanned: "10:00", spaceId: 20, assignedResourceIds: [2], countsAsWork: true },
    { taskId: 2, startPlanned: "10:00", endPlanned: "10:30", spaceId: 10, assignedResourceIds: [2], countsAsWork: true },
  ] as any, locks: [], metadata: { schemaVersion: "orc-operational-state-v1" }, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, availability: { workDay: { start: "08:00", end: "18:00" }, globalHardBreaks: [], protectedBreaks: [] } as any, workDay: { start: "08:00", end: "18:00" } as any,
});
const repairSim = (s = state()): SimulatedState => ({ id: "sim:repair", candidateStateId: "cs:repair", baseStateId: "original", operationalStateSnapshot: s, appliedTransformations: [], simulationMode: "ASSIGNMENT_APPLICATION_SHADOW", readOnly: true, createdAt: null, planningMaterialization: { source: "candidate_transformations", plannedTaskCount: 3, changedTaskCount: 1, warnings: [], assignedSpaceContractValid: true, missingAssignedSpaceFieldCount: 0 } });
const valid: ValidationResult = { simulatedStateId: "sim:repair", result: "VALID", violatedConstraints: [], warnings: [], evidenceIds: [], readOnly: true } as any;
const repairSummary = { selectedAsCommit: true, selectedCandidateId: "repair", lineage: { committedSimulatedStateIds: ["sim:repair"] } };

test("executes after valid repair and accepts a reducing swap", () => {
  const result = runPostRepairMainZoneContinuityPass({ originalState: state(), selectedRepairSimulation: repairSim(), selectedRepairValidation: valid, baselineOverlapRepair: repairSummary });
  assert.equal(result.summary.executed, true);
  assert.ok(result.summary.generatedCandidateCount > 0);
  assert.ok(result.summary.simulatedStateCount > 0);
  assert.ok(result.summary.validSimulationCount > 0);
  assert.equal(result.summary.selectedAsCommit, true);
  assert.ok(result.summary.mainZoneGapReductionMinutes > 0);
});

test("does not execute when repair is invalid", () => {
  const result = runPostRepairMainZoneContinuityPass({ originalState: state(), selectedRepairSimulation: repairSim(), selectedRepairValidation: { ...valid, result: "INVALID", violatedConstraints: ["SPACE_OVERLAP"] }, baselineOverlapRepair: repairSummary });
  assert.equal(result.summary.executed, false);
  assert.equal(result.summary.reason, "baseline_repair_not_valid");
});

test("does not execute without mainZoneId", () => {
  const result = runPostRepairMainZoneContinuityPass({ originalState: state(null), selectedRepairSimulation: repairSim(state(null)), selectedRepairValidation: valid, baselineOverlapRepair: repairSummary });
  assert.equal(result.summary.executed, false);
  assert.equal(result.summary.reason, "main_zone_not_configured");
});
