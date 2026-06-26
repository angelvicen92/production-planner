import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import type { Opportunity } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { createInitialCognitiveState, recordExploredOpportunity } from "../cognitive/cognitiveState";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { diagnoseOpportunities } from "./opportunityDiagnosis";

const input = (): EngineInput => ({
  planId: 112,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 112, templateId: 1, status: "pending", contestantId: 1, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 112, templateId: 2, status: "pending", contestantId: 1, spaceId: 11, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
  ],
  locks: [{ id: 1, planId: 112, taskId: 2, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const opportunity = (id: string, kind: string, taskIds = [1], metadata = {}): Opportunity => ({
  id,
  kind,
  description: kind,
  taskIds,
  searchSpaceIds: [],
  evidenceIds: [`evidence:${id}`],
  metadata: { cause: kind, affectedRegion: "test-region", confidence: 0.75, ...metadata },
});

const state = () => buildOperationalStateFromEngineInput(input());

test("diagnoseOpportunities handles empty opportunity input", () => {
  const result = diagnoseOpportunities([], state(), createInitialCognitiveState(null));
  assert.deepEqual(result.diagnoses, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { diagnosed: 0, averageConfidence: 0 });
});

test("diagnoseOpportunities creates one traceable diagnosis without proposing a solution", () => {
  const result = diagnoseOpportunities([opportunity("op:1", "MAIN_FLOW_GAP", [1], { gapCount: 1 })], state(), createInitialCognitiveState(null));
  assert.equal(result.diagnoses.length, 1);
  assert.equal(result.diagnoses[0]?.opportunityId, "op:1");
  assert.equal(result.diagnoses[0]?.primaryCause, "MAIN_FLOW_GAP");
  assert.ok(result.diagnoses[0]?.contributingFactors.includes("metadata:gapCount"));
  assert.equal(result.evidence[0]?.kind, "opportunity-diagnosis-generated");
  assert.equal(result.evidence[0]?.data.proposesSolution, false);
});

test("diagnoseOpportunities covers multiple opportunities and distinct causes deterministically", () => {
  const opportunities = [opportunity("op:a", "MAIN_FLOW_GAP", [1]), opportunity("op:b", "RESOURCE_PRESSURE", [2], { overloadedResourceIds: [7] })];
  const cognitive = recordExploredOpportunity(createInitialCognitiveState(null), "op:a");
  const first = diagnoseOpportunities(opportunities, state(), cognitive);
  const second = diagnoseOpportunities(opportunities, state(), cognitive);
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.diagnoses.map((diagnosis) => diagnosis.primaryCause), ["MAIN_FLOW_GAP", "RESOURCE_PRESSURE"]);
  assert.ok(first.diagnoses[0]?.contributingFactors.includes("cognitive-state:opportunity-already-explored"));
  assert.ok(first.diagnoses[1]?.contributingFactors.includes("operational-state:affected-task-has-lock"));
});

test("diagnoseOpportunities preserves structural equality and does not mutate inputs", () => {
  const opportunities = [opportunity("op:1", "FRAGMENTATION", [2, 1], { totalSpaceSwitches: 3 })];
  const operationalState = state();
  const cognitiveState = createInitialCognitiveState(null);
  const before = stableStringify({ opportunities, operationalState, cognitiveState });
  const first = diagnoseOpportunities(opportunities, operationalState, cognitiveState);
  const second = diagnoseOpportunities(opportunities, operationalState, cognitiveState);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify({ opportunities, operationalState, cognitiveState }), before);
});
