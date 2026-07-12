import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CandidateState, PartialPlan, SimulatedState } from "../contracts";
import { resolveBaselineRepairCandidateForSimulation } from "./resolveBaselineRepairCandidateForSimulation";
import { composePartialPlans } from "../see/partialPlanComposer";
import { buildDecisionInput } from "../decision/decisionInput";
import { preparePartialPlanDecisionUnits } from "../decision/decisionEngine";

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

test("rejects textual synthetic prefix without matching PartialPlan identity", () => {
  const raw = candidate("raw:repair");
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:synthetic"), candidateState: cs("candidate:partial-plan:missing"), rawCandidates: [raw], partialPlans: [plan("partial-plan:raw:repair", [raw.id])], decisionCandidates: [] });
  assert.equal(result.lineageConsistent, false);
  assert.equal(result.ambiguityReason, "partial_plan_not_found");
});

test("resolves real topology where DecisionInput keeps raw candidate and CandidateState points to internal synthetic PartialPlan candidate", () => {
  const raw = candidate("raw:repair");
  (raw.metadata as any).baselineSafetyCandidate = true;
  const composed = composePartialPlans([raw], { createdAt: null });
  const candidateResult = { candidates: [raw], evidence: [], partialPlans: composed.partialPlans, summary: { searchSpaceCount: 0, candidateCount: 1 } } as any;
  const decisionInput = buildDecisionInput(candidateResult);
  assert.equal(decisionInput.candidates.some((item) => item.id === raw.id), true);
  const prepared = preparePartialPlanDecisionUnits(decisionInput.candidates, decisionInput.partialPlans, { createdAt: null });
  const synthetic = prepared.candidates[0];
  assert.ok(synthetic);
  assert.equal(decisionInput.candidates.some((item) => item.id === synthetic.id), false);

  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim(`cs:${synthetic.id}`), candidateState: cs(synthetic.id), rawCandidates: [raw], partialPlans: decisionInput.partialPlans, decisionCandidates: decisionInput.candidates });
  assert.equal(result.rawCandidateId, raw.id);
  assert.equal(result.partialPlanId, composed.partialPlans[0].partialPlanId);
  assert.equal(result.resolutionKind, "single_candidate_partial_plan");
  assert.equal(result.lineageConsistent, true);
  assert.equal(result.candidateStateMatchesPartialPlan, true);
  assert.equal(result.rawCandidateContainedInPartialPlan, true);
  assert.equal(result.ambiguityReason, null);
});

test("resolves PartialPlan identity without explicit synthetic decision candidate", () => {
  const raw = candidate("raw:repair");
  const partialPlan = plan("partial-plan:raw:repair", [raw.id]);
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:synthetic"), candidateState: cs(`candidate:${partialPlan.partialPlanId}`), rawCandidates: [raw], partialPlans: [partialPlan], decisionCandidates: [raw] });
  assert.equal(result.rawCandidateId, raw.id);
  assert.equal(result.lineageConsistent, true);
  assert.equal(result.candidateStateMatchesPartialPlan, true);
});

test("rejects explicit contradictory synthetic decision candidate metadata", () => {
  const raw = candidate("raw:repair");
  const synthetic = candidate("candidate:partial-plan:actual");
  (synthetic.metadata as any).partialPlanId = "partial-plan:other";
  const result = resolveBaselineRepairCandidateForSimulation({ simulatedState: sim("cs:synthetic"), candidateState: cs(synthetic.id), rawCandidates: [raw], partialPlans: [plan("partial-plan:actual", [raw.id]), plan("partial-plan:other", [raw.id])], decisionCandidates: [synthetic] });
  assert.equal(result.lineageConsistent, false);
  assert.equal(result.ambiguityReason, "candidate_state_partial_plan_mismatch");
});
