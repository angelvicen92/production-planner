import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candidate, CandidateState, CommitDecision, OperationalValue, PartialPlan, SimulatedState } from "../contracts";
import { resolveCandidateLineage } from "./candidateLineage";

const candidate = (id: string, metadata: Record<string, unknown> = {}): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata });
const candidateState = (id: string, candidateId: string): CandidateState => ({ id, candidateId, strategy: "test", originOpportunity: null, plannedTransformations: [], estimatedImpact: {}, estimatedCost: {}, confidence: 1, sourceAssignments: [] });
const simulatedState = (id: string, candidateStateId: string): SimulatedState => ({ id, candidateStateId, baseStateId: "base", operationalStateSnapshot: { id: "state", tasks: [], resources: [], spaces: [], teams: [], contestants: [], constraints: [], metadata: {} }, appliedTransformations: [], simulationMode: "ASSIGNMENT_APPLICATION_SHADOW", readOnly: true, createdAt: null });
const value = (simulatedStateId: string): OperationalValue => ({ simulatedStateId, continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore: 1, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} });
const commit = (operationalValueId: string): CommitDecision => ({ decision: "COMMIT", operationalValueId, reason: "test", differences: [], evidenceId: "evidence", createdAt: null });
const partialPlan = (partialPlanId: string, candidateIds: string[]): PartialPlan => ({ partialPlanId, candidateIds, compatibilityScore: 1, expectedOperationalImpact: 1 });

describe("resolveCandidateLineage", () => {
  it("detects direct raw candidate states and simulations", () => {
    const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(["raw:repair"]), decisionInputCandidates: [candidate("raw:repair")], candidateStates: [candidateState("cs:1", "raw:repair")], simulatedStates: [simulatedState("sim:1", "cs:1")], operationalValues: [value("sim:1")], commitDecisions: [], rankedBestSimulatedStateId: "sim:1" });
    assert.deepEqual(lineage.candidateStateIds, ["cs:1"]);
    assert.deepEqual(lineage.simulatedStateIds, ["sim:1"]);
    assert.equal(lineage.rankedBestSimulatedStateId, "sim:1");
  });

  it("detects synthetic partial-plan candidates via metadata", () => {
    const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(["raw:repair"]), decisionInputCandidates: [candidate("candidate:partial-plan:raw:repair", { partialPlanId: "partial-plan:raw:repair", partialPlanCandidateIds: ["raw:repair"] })], candidateStates: [candidateState("cs:synthetic", "candidate:partial-plan:raw:repair")], simulatedStates: [simulatedState("sim:synthetic", "cs:synthetic")], operationalValues: [value("sim:synthetic")], commitDecisions: [], partialPlans: [partialPlan("partial-plan:raw:repair", ["raw:repair"])], rankedBestSimulatedStateId: null });
    assert.deepEqual(lineage.syntheticCandidateIds, ["candidate:partial-plan:raw:repair"]);
    assert.deepEqual(lineage.partialPlanIds, ["partial-plan:raw:repair"]);
    assert.deepEqual(lineage.candidateStateIds, ["cs:synthetic"]);
    assert.deepEqual(lineage.simulatedStateIds, ["sim:synthetic"]);
  });

  it("detects commit lineage through operational values", () => {
    const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(["raw:repair"]), decisionInputCandidates: [candidate("candidate:partial-plan:raw:repair", { partialPlanCandidateIds: ["raw:repair"] })], candidateStates: [candidateState("cs:synthetic", "candidate:partial-plan:raw:repair")], simulatedStates: [simulatedState("sim:synthetic", "cs:synthetic")], operationalValues: [value("sim:synthetic")], commitDecisions: [commit("sim:synthetic")], rankedBestSimulatedStateId: null });
    assert.deepEqual(lineage.committedSimulatedStateIds, ["sim:synthetic"]);
    assert.deepEqual(lineage.selectedRawCandidateIds, ["raw:repair"]);
  });

  it("does not use substring matching for decisions", () => {
    const lineage = resolveCandidateLineage({ rawCandidateIds: new Set(["raw:repair"]), decisionInputCandidates: [candidate("candidate:partial-plan:raw:repair-lookalike")], candidateStates: [candidateState("cs:lookalike", "candidate:partial-plan:raw:repair-lookalike")], simulatedStates: [simulatedState("sim:lookalike", "cs:lookalike")], operationalValues: [value("sim:lookalike")], commitDecisions: [commit("sim:lookalike")], rankedBestSimulatedStateId: "sim:lookalike" });
    assert.deepEqual(lineage.candidateStateIds, []);
    assert.deepEqual(lineage.simulatedStateIds, []);
    assert.deepEqual(lineage.committedSimulatedStateIds, []);
  });
});
