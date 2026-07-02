import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candidate, CandidateState, CommitDecision, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { selectBestORCSimulation } from "./selectBestORCSimulation";

const candidate = (id: string, metadata: Record<string, unknown> = {}): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata });
const candidateState = (id: string, candidateId: string): CandidateState => ({ id, candidateId, strategy: "test", originOpportunity: null, plannedTransformations: [], estimatedImpact: {}, estimatedCost: {}, confidence: 1, sourceAssignments: [] });
const simulatedState = (id: string, candidateStateId: string, source: "baseline_seed_preserved" | "candidate_transformations" = "candidate_transformations", changedTaskCount = 1): SimulatedState => ({ id, candidateStateId, baseStateId: "base", operationalStateSnapshot: { id: "state", tasks: [], resources: [], spaces: [], teams: [], contestants: [], constraints: [], metadata: {} }, appliedTransformations: [], simulationMode: "ASSIGNMENT_APPLICATION_SHADOW", readOnly: true, createdAt: null, planningMaterialization: { source, plannedTaskCount: 1, changedTaskCount, warnings: [] } });
const validation = (simulatedStateId: string, result: "VALID" | "INVALID", violatedConstraints: string[] = []): ValidationResult => ({ id: `validation:${simulatedStateId}`, simulatedStateId, result, violatedConstraints, violationDetails: [], explanation: result, validatedAt: null, evidenceIds: [] });
const value = (simulatedStateId: string, overallScore: number): OperationalValue => ({ simulatedStateId, continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} });
const commit = (operationalValueId: string): CommitDecision => ({ decision: "COMMIT", operationalValueId, reason: "test", differences: [], evidenceId: "evidence", createdAt: null });

function shadow(partial: Partial<ORCShadowModeResult>): ORCShadowModeResult {
  return { operationalState: {} as any, operationalMap: {} as any, operationalAnalysis: {} as any, operationalCriticality: [], dynamicBottleneckAnalysis: {} as any, opportunities: [], diagnoses: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], advisoryDecision: null, cognitiveState: {} as any, cognitiveStateInitial: {} as any, cognitiveStateDiff: {} as any, candidateSummary: {} as any, summary: {}, ...partial } as ORCShadowModeResult;
}

describe("selectBestORCSimulation", () => {
  it("selects VALID over INVALID even when INVALID has a higher score", () => {
    const result = selectBestORCSimulation(shadow({ candidates: [candidate("c:invalid"), candidate("c:valid")], candidateStates: [candidateState("cs:invalid", "c:invalid"), candidateState("cs:valid", "c:valid")], simulatedStates: [simulatedState("sim:invalid", "cs:invalid"), simulatedState("sim:valid", "cs:valid")], validationResults: [validation("sim:invalid", "INVALID", ["SPACE_OVERLAP"]), validation("sim:valid", "VALID")], operationalValues: [value("sim:invalid", 99), value("sim:valid", 1)] }));
    assert.equal(result.simulation?.id, "sim:valid");
  });

  it("selects committed baseline repair over valid non-repair", () => {
    const result = selectBestORCSimulation(shadow({ candidates: [candidate("repair"), candidate("other")], candidateStates: [candidateState("cs:repair", "repair"), candidateState("cs:other", "other")], simulatedStates: [simulatedState("sim:other", "cs:other"), simulatedState("sim:repair", "cs:repair")], validationResults: [validation("sim:other", "VALID"), validation("sim:repair", "VALID")], operationalValues: [value("sim:other", 50), value("sim:repair", 1)], commitDecisions: [commit("sim:repair")], summary: { baselineOverlapRepair: { lineage: { simulatedStateIds: ["sim:repair"], committedSimulatedStateIds: ["sim:repair"] } } } }));
    assert.equal(result.simulation?.id, "sim:repair");
    assert.equal(result.diagnostics.selectedBucket, "valid-committed-baseline-repair-transformations-changed");
  });

  it("selects candidate transformations over baseline preservation when both are VALID", () => {
    const result = selectBestORCSimulation(shadow({ candidates: [candidate("baseline"), candidate("changed")], candidateStates: [candidateState("cs:baseline", "baseline"), candidateState("cs:changed", "changed")], simulatedStates: [simulatedState("sim:baseline", "cs:baseline", "baseline_seed_preserved", 0), simulatedState("sim:changed", "cs:changed", "candidate_transformations", 2)], validationResults: [validation("sim:baseline", "VALID"), validation("sim:changed", "VALID")], operationalValues: [value("sim:baseline", 99), value("sim:changed", 1)] }));
    assert.equal(result.simulation?.id, "sim:changed");
  });

  it("selects INVALID only for diagnostics when no VALID exists", () => {
    const result = selectBestORCSimulation(shadow({ candidates: [candidate("c")], candidateStates: [candidateState("cs", "c")], simulatedStates: [simulatedState("sim", "cs")], validationResults: [validation("sim", "INVALID", ["SPACE_OVERLAP"])], operationalValues: [value("sim", 1)] }));
    assert.equal(result.simulation?.id, "sim");
    assert.equal(result.diagnostics.selectedBucket, "invalid-diagnostics-only");
  });

  it("is deterministic for identical inputs", () => {
    const input = shadow({ candidates: [candidate("b"), candidate("a")], candidateStates: [candidateState("cs:b", "b"), candidateState("cs:a", "a")], simulatedStates: [simulatedState("sim:b", "cs:b"), simulatedState("sim:a", "cs:a")], validationResults: [validation("sim:b", "VALID"), validation("sim:a", "VALID")], operationalValues: [value("sim:b", 10), value("sim:a", 10)] });
    assert.deepEqual(selectBestORCSimulation(input), selectBestORCSimulation(input));
    assert.equal(selectBestORCSimulation(input).simulation?.id, "sim:a");
  });
});
