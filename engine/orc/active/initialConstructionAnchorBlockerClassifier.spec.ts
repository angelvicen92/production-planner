import test from "node:test";
import assert from "node:assert/strict";
import { classifyInitialConstructionAnchorBlockers, type InitialConstructionAnchorAttemptDiagnostics } from "./initialConstructionAnchorBlockerClassifier";

const base = (overrides: Partial<InitialConstructionAnchorAttemptDiagnostics> = {}): InitialConstructionAnchorAttemptDiagnostics => ({
  anchorTaskId: 1,
  searchSpaceFound: true,
  provisionalWindowCount: 2,
  provisionalWindowsSample: [{ start: "09:00", end: "10:00" }, { start: "10:00", end: "11:00" }],
  branchCount: 1,
  candidateBranchCount: 1,
  closureIncompleteBranchCount: 0,
  unsupportedBranchCount: 0,
  hardValidBranchCount: 1,
  branchStatusCounts: { candidate: 1 },
  branchRejectionReasonCounts: {},
  deadEndReasonCounts: {},
  placementReasonCounts: {},
  taskWindowConflictCount: 0,
  protectedIntervalConflictCount: 0,
  contestantOverlapConflictCount: 0,
  spaceOverlapConflictCount: 0,
  resourceOverlapConflictCount: 0,
  assignmentSearchBudgetExhaustedCount: 0,
  unsupportedRequirementCodes: [],
  diagnosticsComplete: true,
  missingDiagnosticFields: [],
  fingerprint: "diagnostics-fp",
  readOnly: true,
  ...overrides,
});

test("search space with two windows never becomes NO_SEARCH_SPACE", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ hardValidBranchCount: 0 }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.blockerCodes.includes("NO_SEARCH_SPACE"), false);
});

test("missing search space is NO_SEARCH_SPACE", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ searchSpaceFound: false, provisionalWindowCount: 0, provisionalWindowsSample: [], branchCount: 0, candidateBranchCount: 0, hardValidBranchCount: 0 }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.primaryBlockerCode, "NO_SEARCH_SPACE");
});

test("present search space with zero windows is NO_SEARCH_SPACE", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ provisionalWindowCount: 0, provisionalWindowsSample: [], branchCount: 0, candidateBranchCount: 0, hardValidBranchCount: 0 }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.blockerCodes.includes("NO_SEARCH_SPACE"), true);
});

test("generated branches without a hard-valid branch produce NO_HARD_VALID_BRANCH with real branch counts", () => {
  const diagnostics = base({ branchCount: 3, candidateBranchCount: 3, hardValidBranchCount: 0 });
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics, terminalReason: "no_hard_valid_branch" });
  assert.equal(diagnostics.branchCount, 3);
  assert.equal(result.blockerCodes.includes("NO_HARD_VALID_BRANCH"), true);
});

test("TASK_WINDOW_CONFLICT dead-end is concrete primary blocker", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ hardValidBranchCount: 0, deadEndReasonCounts: { TASK_WINDOW_CONFLICT: 2 }, taskWindowConflictCount: 2 }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.primaryBlockerCode, "TASK_WINDOW_CONFLICT");
});

test("space and resource conflicts are not transformed into NO_SEARCH_SPACE", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ hardValidBranchCount: 0, spaceOverlapConflictCount: 1, resourceOverlapConflictCount: 2, deadEndReasonCounts: { SPACE_OVERLAP: 1, RESOURCE_OVERLAP: 2 } }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.blockerCodes.includes("NO_SEARCH_SPACE"), false);
  assert.equal(result.primaryBlockerCode, "RESOURCE_OVERLAP");
});

test("assignment search budget exhausted is BUDGET_EXHAUSTED", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base({ assignmentSearchBudgetExhaustedCount: 1 }), terminalReason: "no_hard_valid_branch" });
  assert.equal(result.primaryBlockerCode, "BUDGET_EXHAUSTED");
});

test("combined validation invalid by dependency produces COMBINED_INVALID and DEPENDENCY_CONFLICT", () => {
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics: base(), combinedValidation: { result: "INVALID", violatedConstraints: ["DEPENDENCY_ORDER"] }, terminalReason: "combined_INVALID" });
  assert.equal(result.blockerCodes.includes("COMBINED_INVALID"), true);
  assert.equal(result.blockerCodes.includes("DEPENDENCY_CONFLICT"), true);
});

test("missing required field marks incomplete evidence without inventing zeros", () => {
  const diagnostics: any = { ...base() };
  delete diagnostics.branchCount;
  const result = classifyInitialConstructionAnchorBlockers({ diagnostics, terminalReason: "no_hard_valid_branch" });
  assert.equal(result.primaryBlockerCode, "BLOCKER_EVIDENCE_INCOMPLETE");
  assert.equal(result.evidenceComplete, false);
});

test("identical executions have identical blockers and fingerprint", () => {
  const diagnostics = base({ hardValidBranchCount: 0, deadEndReasonCounts: { TASK_WINDOW_CONFLICT: 1 }, taskWindowConflictCount: 1 });
  const a = classifyInitialConstructionAnchorBlockers({ diagnostics, terminalReason: "no_hard_valid_branch" });
  const b = classifyInitialConstructionAnchorBlockers({ diagnostics, terminalReason: "no_hard_valid_branch" });
  assert.deepEqual(a, b);
});
