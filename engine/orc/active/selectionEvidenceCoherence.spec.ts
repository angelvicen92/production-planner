import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSelectionEvidenceCoherence } from "./selectionEvidenceCoherence";

const selection = {
  simulation: { id: "sim:1" },
  validation: { simulatedStateId: "sim:1" },
  candidateState: { id: "cs:1", candidateId: "cand:1" },
  candidate: { id: "cand:1" },
  diagnostics: { selectedSimulatedStateId: "sim:1", selectedFinalSimulatedStateId: "sim:1", selectedFinalCandidateId: "cand:1", selectedFinalCandidateFamily: "baseline-overlap-repair" },
};

test("reports coherent evidence when selection identities and fingerprints match", () => {
  const planning = [{ taskId: 1, startPlanned: "a", endPlanned: "b" }];
  const result = evaluateSelectionEvidenceCoherence({ selectionSource: "active_repair_preflight", selection, planning, materializedPlanning: planning });
  assert.equal(result.version, "ORC-SELECTION-EVIDENCE-COHERENCE-V1");
  assert.equal(result.coherent, true);
  assert.deepEqual(result.warnings, []);
});

test("reports incoherent evidence when IDs diverge", () => {
  const result = evaluateSelectionEvidenceCoherence({ selectionSource: "active_repair_preflight", selection: { ...selection, diagnostics: { ...selection.diagnostics, selectedFinalCandidateId: "other" } }, planning: [], materializedPlanning: [] });
  assert.equal(result.coherent, false);
  assert.ok(result.warnings.includes("selection_candidate_diagnostics_mismatch"));
});

test("accepts CandidateState through resolved single-candidate PartialPlan lineage", () => {
  const planning = [{ taskId: 1, startPlanned: "a", endPlanned: "b" }];
  const result = evaluateSelectionEvidenceCoherence({ selectionSource: "active_repair_preflight", selection: { ...selection, candidateState: { id: "cs:synthetic", candidateId: "candidate:partial-plan:cand:1" }, candidateLineage: { rawCandidateId: "cand:1", partialPlanId: "partial-plan:cand:1", partialPlanCandidateIds: ["cand:1"], candidateStateCandidateId: "candidate:partial-plan:cand:1", candidateStateMatchesPartialPlan: true, rawCandidateContainedInPartialPlan: true, resolutionKind: "single_candidate_partial_plan", lineageConsistent: true, ambiguityReason: null, readOnly: true } }, planning, materializedPlanning: planning });
  assert.equal(result.candidateStateDirectlyMatchesCandidate, false);
  assert.equal(result.candidateStateMatchesCandidateThroughPartialPlan, true);
  assert.equal(result.candidateStateMatchesCandidate, true);
  assert.equal(result.coherent, true);
  assert.deepEqual(result.warnings, []);
});
