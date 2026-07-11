import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import type { SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";
import { validateFinalMaterializedORCPlanning, fingerprintORCPlanning } from "./finalMaterializedPlanningValidation";

const input = (): EngineInput => ({
  planId: 264,
  workDay: { start: "09:00", end: "18:00" },
  meal: null,
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 264, status: "pending", contestantId: 1, startPlanned: "09:00", endPlanned: "09:30", spaceId: 1, assignedResourceIds: [10], templateId: 1 },
    { id: 2, planId: 264, status: "pending", contestantId: 1, startPlanned: "09:30", endPlanned: "10:00", spaceId: 2, assignedResourceIds: [20], templateId: 2 },
  ] as any,
  locks: [], zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, planResourceItems: [], resourceItemComponents: {}, groupingZoneIds: [],
} as any);

const sim = (id = "sim-a"): SimulatedState => {
  const state = buildOperationalStateFromEngineInput(input());
  return deepFreeze({ id, candidateStateId: "candidate-a", baseStateId: state.id, operationalStateSnapshot: deepFreeze(state), appliedTransformations: [], simulationMode: "ASSIGNMENT_APPLICATION_SHADOW", readOnly: true, createdAt: null }) as SimulatedState;
};
const validation = (simulatedStateId = "sim-a"): ValidationResult => deepFreeze({ id: `validation:${simulatedStateId}`, simulatedStateId, result: "VALID", violatedConstraints: [], violationDetails: [], explanation: "ok", validatedAt: null, evidenceIds: [] }) as ValidationResult;

test("validateFinalMaterializedORCPlanning rejects validation associated to another simulation", () => {
  const result = validateFinalMaterializedORCPlanning({ input: input(), simulation: sim("sim-a"), validation: validation("sim-b"), planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [10], assignedSpace: 1 }, { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [20], assignedSpace: 2 }] });
  assert.equal(result.validationBelongsToSimulation, false);
  assert.equal(result.finalGatePassed, false);
});

test("validateFinalMaterializedORCPlanning fingerprints exact returned planning", () => {
  const a = [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [10], assignedSpace: 1 }];
  const b = [{ taskId: 1, startPlanned: "09:05", endPlanned: "09:35", assignedResources: [10], assignedSpace: 1 }];
  assert.notEqual(fingerprintORCPlanning(a), fingerprintORCPlanning(b));
});

test("validateFinalMaterializedORCPlanning invalidates materialized contestant overlap", () => {
  const result = validateFinalMaterializedORCPlanning({ input: input(), simulation: sim(), validation: validation(), planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [10], assignedSpace: 1 }, { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResources: [20], assignedSpace: 2 }] });
  assert.equal(result.result, "INVALID");
  assert.ok(result.violatedConstraints.includes("CONTESTANT_OVERLAP"));
  assert.equal(result.contestantOverlapCount, 1);
  assert.equal(result.finalGatePassed, false);
});
