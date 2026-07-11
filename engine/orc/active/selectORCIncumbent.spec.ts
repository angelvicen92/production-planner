import test from "node:test";
import assert from "node:assert/strict";
import { selectORCIncumbent } from "./selectORCIncumbent";

const candidate = (id: string, idle: number, score: number, extra: any = {}) => ({
  source: id === "post" ? "post_macro_selection" : "pre_macro_selection",
  selection: { id },
  simulation: { id: `sim-${id}`, operationalStateSnapshot: { planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 1 }] } },
  validation: { simulatedStateId: `sim-${id}`, result: "VALID", violatedConstraints: [] },
  value: score,
  candidateState: { candidateId: id },
  candidate: { id },
  extractedPlanning: { plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [1], assignedSpace: 1 }], pendingTaskIds: [] },
  pendingTaskIds: [],
  planningMaterialization: { assignedSpaceContractValid: true },
  compositeSummary: {},
  productionConceptAlignment: { totalVisibleMainZoneIdleMinutes: idle, largestVisibleMainZoneGapMinutes: idle, visibleMainZoneGaps: idle ? [{ gapMinutes: idle }] : [], score: 100 - idle, verdict: "aligned" },
  operationalQualityMetrics: {},
  zoneTaskChangeAudit: { changeCountByZoneId: { "7": 2 }, limitByZoneId: { "7": 4 } },
  safety: { complete: true, respectsLocks: true, preservesDone: true, preservesInProgress: true, assignedSpaceContractValid: true, lineageConsistent: true },
  ...extra,
} as any);

test("preserves incumbent when post-macro worsens production concept", () => {
  const r = selectORCIncumbent({ incumbent: candidate("pre", 45, 10), candidate: candidate("post", 135, 99) });
  assert.equal(r.incumbent?.candidate.id, "pre");
  assert.equal(r.decision, "retain_incumbent");
  assert.equal(r.rejectedCandidateReason, "post_macro_production_concept_regression");
});

test("replaces incumbent when post-macro improves and is non-regressive", () => {
  const r = selectORCIncumbent({ incumbent: candidate("pre", 45, 10), candidate: candidate("post", 30, 20) });
  assert.equal(r.incumbent?.candidate.id, "post");
  assert.equal(r.decision, "replace_incumbent");
});

test("retains incumbent when post-macro is hard invalid", () => {
  const r = selectORCIncumbent({ incumbent: candidate("pre", 45, 10), candidate: candidate("post", 30, 20, { validation: { result: "INVALID", violatedConstraints: ["overlap"] } }) });
  assert.equal(r.incumbent?.candidate.id, "pre");
  assert.equal(r.rejectedCandidateReason, "candidate_validation_lineage_mismatch");
});


test("rejects validation associated to another simulation", () => {
  const r = selectORCIncumbent({ incumbent: null, candidate: candidate("pre", 45, 10, { validation: { simulatedStateId: "sim-other", result: "VALID", violatedConstraints: [] } }) });
  assert.equal(r.incumbent, null);
  assert.equal(r.rejectedCandidateReason, "candidate_validation_lineage_mismatch");
});

test("rejects extracted planning whose fingerprint differs from simulated planning", () => {
  const r = selectORCIncumbent({ incumbent: null, candidate: candidate("pre", 45, 10, { extractedPlanning: { plannedTasks: [{ taskId: 1, startPlanned: "09:10", endPlanned: "09:40", assignedResources: [1], assignedSpace: 1 }], pendingTaskIds: [] } }) });
  assert.equal(r.incumbent, null);
  assert.equal(r.rejectedCandidateReason, "candidate_validation_planning_fingerprint_mismatch");
});
