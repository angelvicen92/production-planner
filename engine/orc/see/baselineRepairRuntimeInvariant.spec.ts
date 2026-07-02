import test from "node:test";
import assert from "node:assert/strict";
import { assertBaselineRepairRuntimeInvariant } from "./baselineRepairRuntimeInvariant";

const audit = {
  available: true,
  hardFeasible: false,
  spaceOverlapGroups: [{ taskIds: [315, 504], taskCount: 2, spaceId: 48, roleLabels: ["productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive"] }],
};

const fullSummary = (overrides: Record<string, unknown> = {}) => ({
  generatedCandidateCount: 1,
  skippedReason: null,
  auditAvailable: true,
  auditPassedToCandidateBuilder: true,
  auditPassedToRepairBuilder: true,
  sourceOfTruth: "baseline-hard-feasibility-audit",
  auditSpaceOverlapGroupCount: 1,
  auditRepairableGroupCount: 1,
  repairableGroupSelection: { selectedTaskIds: [315, 504], selectedSpaceId: 48, readOnly: true },
  runtimeWiringWarnings: [],
  ...overrides,
});

test("detects repairable audit group that was not processed", () => {
  const result = assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility: audit, baselineOverlapRepairSummary: fullSummary({ generatedCandidateCount: 0, skippedReason: "unsupported_overlap_cardinality" }) });
  assert.equal(result.ok, false);
  assert.equal(result.invariantViolationCode, "repairable_audit_group_not_processed");
  assert.deepEqual(result.selectedRepairableTaskIds, [315, 504]);
});

test("detects missing baseline overlap repair summary contract", () => {
  const result = assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility: audit, baselineOverlapRepairSummary: { generatedCandidateCount: 0 } });
  assert.equal(result.ok, false);
  assert.equal(result.invariantViolationCode, "baseline_overlap_repair_summary_contract_missing");
});

test("passes when repairable audit group generated candidates with full contract", () => {
  const result = assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility: audit, baselineOverlapRepairSummary: fullSummary() });
  assert.equal(result.ok, true);
  assert.equal(result.invariantViolationCode, "none");
});
