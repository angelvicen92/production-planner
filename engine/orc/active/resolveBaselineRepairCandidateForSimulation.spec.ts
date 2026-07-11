import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CandidateState, PartialPlan, SimulatedState } from "../contracts";
import { resolveBaselineRepairCandidateForSimulation } from "./resolveBaselineRepairCandidateForSimulation";

const candidate = (id: string): Candidate => ({ id, assignments: [], evidenceIds: [], operationalValues: [], metadata: {}, state: { status: "draft", evidenceIds: [], metadata: {} } } as any);
const cs = (candidateId: string): CandidateState => ({ id: `cs:${candidateId}`, candidateId, baseStateId: "base", appliedTransformations: [], operationalStateSnapshot: {} as any, readOnly: true } as any);
const sim = (candidateStateId: string): SimulatedState => ({ id: `sim:${candidateStateId}`, candidateStateId, baseStateId: "base", operationalStateSnapshot: {} as any, appliedTransformations: [], simulationMode: "WHAT_IF", readOnly: true, createdAt: null } as any);
const plan = (id: string, candidateIds: string[]): PartialPlan => ({ partialPlanId: id, candidateIds, compatibilityScore: 1, expectedOperationalImpact: 0 } as any);

test("resolves direct baseline repair candidate states", () => {
  const raw = candidate("raw:repair");
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:raw"), candidateState: cs(raw.id), rawCandidates: [raw], partialPlans: [] });
  assert.equal(result.rawCandidateId, raw.id);
  assert.equal(result.lineageConsistent, true);
});

test("resolves synthetic PartialPlan candidate with exactly one raw repair candidate", () => {
  const raw = candidate("raw:repair");
  const synthetic = candidate("candidate:partial-plan:raw:repair");
  (synthetic.metadata as any).partialPlanId = "partial-plan:raw:repair";
  (synthetic.metadata as any).partialPlanCandidateIds = [raw.id];
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:synthetic"), candidateState: cs(synthetic.id), rawCandidates: [raw], partialPlans: [plan("partial-plan:raw:repair", [raw.id])], decisionCandidates: [synthetic] });
  assert.equal(result.rawCandidateId, raw.id);
  assert.equal(result.partialPlanId, "partial-plan:raw:repair");
  assert.equal(result.lineageConsistent, true);
});

test("rejects ambiguous PartialPlan baseline repair lineage", () => {
  const a = candidate("raw:a");
  const b = candidate("raw:b");
  const synthetic = candidate("candidate:partial-plan:raw:a+raw:b");
  (synthetic.metadata as any).partialPlanId = "partial-plan:raw:a+raw:b";
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:synthetic"), candidateState: cs(synthetic.id), rawCandidates: [a, b], partialPlans: [plan("partial-plan:raw:a+raw:b", [a.id, b.id])], decisionCandidates: [synthetic] });
  assert.equal(result.rawCandidate, null);
  assert.equal(result.lineageConsistent, false);
  assert.equal(result.ambiguityReason, "ambiguous_baseline_repair_partial_plan");
});
