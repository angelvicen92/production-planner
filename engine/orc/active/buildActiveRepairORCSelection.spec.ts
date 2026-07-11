import test from "node:test";
import assert from "node:assert/strict";
import { buildActiveRepairORCSelection } from "./buildActiveRepairORCSelection";

const selected = {
  simulation: { id: "sim:repair", candidateStateId: "cs:repair", operationalStateSnapshot: { planning: [] } },
  validation: { simulatedStateId: "sim:repair", result: "VALID", violatedConstraints: [] },
  value: { overallScore: 42 },
  candidateState: { id: "cs:repair", candidateId: "cand:repair" },
  candidate: { id: "cand:repair", assignments: [{ taskId: 1 }, { taskId: 2 }], metadata: { family: "baseline-overlap-repair" } },
  commitDecision: { committed: true },
};

test("builds active repair selection diagnostics from scratch without stale macro metadata", () => {
  const selection = buildActiveRepairORCSelection({ selected, preflightSummary: { validSimulationCount: 2, invalidSimulationCount: 7 }, globalDiagnostics: { macroMainZoneRelayoutSimulationIds: ["stale"] } });
  assert.equal(selection.simulation.id, "sim:repair");
  assert.equal(selection.validation.simulatedStateId, "sim:repair");
  assert.equal(selection.candidate.id, "cand:repair");
  assert.equal(selection.diagnostics.selectedBucket, "valid-committed-baseline-repair-transformations-changed");
  assert.equal(selection.diagnostics.selectedBecause, "canonical_hard_valid_active_baseline_repair");
  assert.equal(selection.diagnostics.selectedFinalCandidateFamily, "baseline-overlap-repair");
  assert.deepEqual(selection.diagnostics.macroMainZoneRelayoutSimulationIds, []);
  assert.deepEqual(selection.diagnostics.compositeMacroSimulationIds, []);
  assert.deepEqual(selection.diagnostics.baselineRepairSimulationIds, ["sim:repair"]);
  assert.equal(selection.diagnostics.lineageConsistency.ok, true);
  assert.throws(() => ((selection as any).diagnostics.selectedSimulatedStateId = "mutated"));
});

test("marks lineage inconsistent when validation does not belong to repair simulation", () => {
  const selection = buildActiveRepairORCSelection({ selected: { ...selected, validation: { simulatedStateId: "other", result: "VALID", violatedConstraints: [] } } });
  assert.equal(selection.diagnostics.lineageConsistency.ok, false);
  assert.ok(selection.diagnostics.lineageConsistency.warnings.includes("active_repair_selection_validation_lineage_mismatch"));
});
