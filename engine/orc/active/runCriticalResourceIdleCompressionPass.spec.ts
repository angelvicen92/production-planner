import test from "node:test";
import assert from "node:assert/strict";
import { runCriticalResourceIdleCompressionPass } from "./runCriticalResourceIdleCompressionPass";

const state = (over: any = {}) => ({
  id: "state:post-continuity", schemaVersion: "ORC-SPEC-01", planId: 1, resources: [{ id: 10 }, { id: 99 }], cognitive: {}, workDay: { start: "08:00", end: "18:00" },
  availability: { workDay: { start: "08:00", end: "18:00" }, globalHardBreaks: [], resourceAvailability: [], spaceAvailability: [], protectedBreaks: [] }, spaces: { exclusiveById: { 1: true, 2: true } }, constraints: { optimizer: {} }, locks: [], dependencies: [],
  tasks: [{ id: 1, status: "pending", spaceId: 1 }, { id: 2, status: "pending", spaceId: 1 }, { id: 3, status: "pending", spaceId: 2 }],
  planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:15", spaceId: 1, assignedResourceIds: [10] }, { taskId: 3, startPlanned: "09:15", endPlanned: "09:30", spaceId: 2, assignedResourceIds: [99] }, { taskId: 2, startPlanned: "10:00", endPlanned: "10:15", spaceId: 1, assignedResourceIds: [10] }],
  ...over,
} as any);
const sim = (s: any, id = "sim:post") => ({ id, candidateStateId: "candidate-state:post", baseStateId: s.id, operationalStateSnapshot: s, appliedTransformations: [{ kind: "MOVE_CHAIN", reason: "post-repair continuity" }], simulationMode: "ASSIGNMENT_APPLICATION_SHADOW", readOnly: true, createdAt: null, planningMaterialization: { source: "candidate_transformations", plannedTaskCount: s.planning.length, changedTaskCount: 1, assignedSpaceContractValid: true, missingAssignedSpaceFieldCount: 0, warnings: [], summaryContractValid: true, changedTaskIdsFromRepairedBaseline: [1], compositeTransformationsApplied: ["baseline-overlap-repair", "post-repair-main-zone-continuity"] } } as any);
const valid = (id = "sim:post") => ({ id: `validation:${id}`, simulatedStateId: id, result: "VALID", violatedConstraints: [], violationDetails: [], explanation: "valid", validatedAt: null, evidenceIds: [] } as any);

test("no ejecuta sobre baseline hard-infeasible", () => {
  const s = state();
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: { ...valid(), result: "INVALID", violatedConstraints: ["SPACE_OVERLAP"] }, mainZoneContinuity: { configured: true } });
  assert.equal(r.summary.executed, false);
  assert.equal(r.summary.reason, "base_plan_hard_infeasible");
});

test("ejecuta sobre post-repair continuity selected simulation", () => {
  const s = state();
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: valid(), mainZoneContinuity: { configured: true }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true, selectedSimulatedStateId: "sim:post" } });
  assert.equal(r.summary.executed, true);
  assert.equal(r.summary.executionPhase, "post-continuity-pass");
  assert.ok(r.summary.generatedCandidateCount > 0);
});

test("acepta direct pull-forward válido y conserva main-zone", () => {
  const s = state();
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: valid(), mainZoneContinuity: { configured: true }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true } });
  assert.equal(r.summary.selectedAsCommit, true);
  assert.ok(r.summary.targetResourceIdleReductionMinutes > 0);
  assert.equal(r.summary.mainZoneContinuityPreserved, true);
  assert.equal(r.selectedSimulation?.planningMaterialization?.assignedSpaceContractValid, true);
});

test("conserva plan base si compression inválida o sin ventana", () => {
  const s = state({ planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:15", spaceId: 1, assignedResourceIds: [10] }, { taskId: 3, startPlanned: "09:15", endPlanned: "09:30", spaceId: 1, assignedResourceIds: [99] }, { taskId: 2, startPlanned: "10:00", endPlanned: "10:15", spaceId: 1, assignedResourceIds: [10] }] });
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: valid(), mainZoneContinuity: { configured: true }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true } });
  assert.equal(r.summary.selectedAsCommit, false);
  assert.ok(r.summary.candidateGenerationBlockers.length > 0 || r.summary.validationRejectReasons.length > 0);
});


test("ID232 acepta mainZoneConfigured true aunque configured esté ausente", () => {
  const s = state();
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: valid(), mainZoneContinuity: { mainZoneConfigured: true }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true } });
  assert.notEqual(r.summary.reason, "main_zone_not_configured");
  assert.notEqual(r.summary.reason, "main_zone_not_configured_in_selected_base");
  assert.equal(r.summary.executed, true);
});

test("ID232 rechaza solo cuando el selected base no tiene main-zone final configurada", () => {
  const s = state();
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: sim(s), baseValidation: valid(), mainZoneContinuity: { configured: false, mainZoneConfigured: false }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true } });
  assert.equal(r.summary.executed, false);
  assert.equal(r.summary.reason, "main_zone_not_configured_in_selected_base");
});

test("ID232 usa la materialización compuesta ID229 como base y conserva fuentes previas", () => {
  const s = state();
  const base = sim(s);
  base.planningMaterialization = {
    ...base.planningMaterialization,
    compositeMaterializationContractVersion: "ORC-COMPOSITE-MATERIALIZATION-ID229",
    changeSources: {
      baselineOverlapRepair: { changedTaskCount: 1, changedTaskIds: [1], readOnly: true },
      postRepairMainZoneContinuity: { changedTaskCount: 1, changedTaskIds: [2], readOnly: true },
    },
  };
  const r = runCriticalResourceIdleCompressionPass({ originalState: s, baseSimulation: base, baseValidation: valid(), basePlanningMaterialization: base.planningMaterialization, mainZoneContinuity: { configured: true }, postRepairMainZoneContinuityPass: { executed: true, selectedAsCommit: true } });
  assert.equal(r.summary.selectedAsCommit, true);
  assert.ok(r.selectedSimulation?.planningMaterialization?.changeSources?.baselineOverlapRepair);
  assert.ok(r.selectedSimulation?.planningMaterialization?.changeSources?.postRepairMainZoneContinuity);
  assert.ok(r.selectedSimulation?.planningMaterialization?.changeSources?.criticalResourceIdleCompression);
});
