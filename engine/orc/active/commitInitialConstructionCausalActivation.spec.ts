import test from "node:test";
import assert from "node:assert/strict";
import { commitInitialConstructionCausalActivation } from "./commitInitialConstructionCausalActivation";
import type { InitialConstructionCausalActivationTransactionResult } from "./initialConstructionCausalActivationTransaction";
import type { InitialConstructionCausalAlternativeActivationSource } from "./initialConstructionCausalAlternativeActivation";

const candidate = (source: InitialConstructionCausalAlternativeActivationSource, id = "C") => ({
  source,
  partialPlan: { partialPlanId: id, assignmentsFingerprint: `${id}-fp`, status: "SUSPENDED", readOnly: true },
  sourceEntryFingerprint: `${id}-fp`,
  sourceEntryId: id,
  sourceOrdinal: 0,
  sourceRank: 0,
  checkpointBranchPartialPlanId: id,
  checkpointBranchFingerprint: `${id}-branch`,
  checkpointBranchAssignmentsFingerprint: `${id}-fp`,
  causalEvaluationFingerprint: `${id}-eval`,
  operationalComparatorFingerprint: `${id}-op`,
  causallyUseful: true,
  inCheckpointSubtree: true,
  readOnly: true,
} as const);

const transaction = (source: InitialConstructionCausalAlternativeActivationSource, id = "C") => ({
  status: "ACTIVATION_PREPARED",
  preparedActivation: {
    status: "ACTIVATION_PREPARED",
    selectedCandidate: candidate(source, id),
    openedAttempt: { attemptId: `${id}-attempt`, status: "ACTIVE" },
    openedAttemptId: `${id}-attempt`,
    sourceMutation: { source, selectedEntryFingerprint: `${id}-fp`, commitRequired: true },
    backtrackConsumed: false,
    transitionConsumed: false,
    inspectedCandidateCount: 1,
    eligibleCandidateCount: 1,
    skippedCandidateCount: 0,
    skipReasonCounts: {},
    skippedCandidateSamples: [],
    fingerprint: `${id}-prepared`,
    readOnly: true,
  },
  selectedCandidate: candidate(source, id),
  candidateCollection: { candidates: [], collectedBySource: {}, deduplicationCount: 0, crossSourceDuplicateCount: 0, sourceClassificationMismatchCount: 0, samples: [], deduplicationSamples: [], fingerprint: "collection", readOnly: true },
  updatedCursor: { fingerprint: "cursor" },
  sourceCommit: { source, sourceEntryFingerprint: `${id}-fp`, sourceEntryId: id },
  transactionEvidence: { transactionId: "tx-1" },
  fingerprint: "tx-fp",
  readOnly: true,
} as unknown as InitialConstructionCausalActivationTransactionResult);

test("ID 321 commit removes only the exact suspended frontier entry", () => {
  const result = commitInitialConstructionCausalActivation({
    transaction: transaction("SUSPENDED_FRONTIER", "C"),
    currentActive: { partialPlanId: "A" },
    suspendedFrontier: { entries: [{ partialPlanId: "B", assignmentsFingerprint: "B-fp" }, { partialPlanId: "C", assignmentsFingerprint: "C-fp" }] },
    causalArchive: [],
    readOnly: true,
  });
  assert.equal(result.committed, true);
  assert.deepEqual(result.suspendedFrontier.entries.map((entry) => entry.partialPlanId), ["B"]);
  assert.equal(result.activeCausalBranchAttemptId, "C-attempt");
});

test("ID 321 commit of generated graph candidate does not mutate frontier or archive", () => {
  const result = commitInitialConstructionCausalActivation({
    transaction: transaction("GENERATED_GRAPH", "C"),
    currentActive: { partialPlanId: "A" },
    suspendedFrontier: { entries: [{ partialPlanId: "B", assignmentsFingerprint: "B-fp" }] },
    causalArchive: [{ partialPlanId: "X", assignmentsFingerprint: "X-fp" }],
    readOnly: true,
  });
  assert.equal(result.committed, true);
  assert.equal(result.source, "GENERATED_GRAPH");
  assert.equal(result.suspendedFrontier.entries.length, 1);
  assert.equal(result.causalArchive.length, 1);
});

test("ID 321 commit of archive candidate consumes only the selected archive entry", () => {
  const result = commitInitialConstructionCausalActivation({
    transaction: transaction("CAUSAL_ARCHIVE", "C"),
    currentActive: { partialPlanId: "A" },
    suspendedFrontier: { entries: [] },
    causalArchive: [{ partialPlanId: "C", assignmentsFingerprint: "C-fp" }, { partialPlanId: "D", assignmentsFingerprint: "D-fp" }],
    readOnly: true,
  });
  assert.equal(result.committed, true);
  assert.deepEqual(result.causalArchive.map((entry) => entry.partialPlanId), ["D"]);
});

test("ID 321 commit of reopened child preserves CHECKPOINT_REOPEN source", () => {
  const result = commitInitialConstructionCausalActivation({
    transaction: transaction("CHECKPOINT_REOPEN", "D"),
    currentActive: { partialPlanId: "A" },
    suspendedFrontier: { entries: [] },
    causalArchive: [],
    readOnly: true,
  });
  assert.equal(result.committed, true);
  assert.equal(result.source, "CHECKPOINT_REOPEN");
  assert.equal(result.backtrackConsumed, true);
});

test("ID 321 commit rejects malformed prepared transaction without consuming backtrack", () => {
  const broken = { ...transaction("SUSPENDED_FRONTIER", "C"), sourceCommit: { source: "SUSPENDED_FRONTIER", sourceEntryFingerprint: "missing", sourceEntryId: "missing" } } as InitialConstructionCausalActivationTransactionResult;
  const result = commitInitialConstructionCausalActivation({
    transaction: broken,
    currentActive: { partialPlanId: "A" },
    suspendedFrontier: { entries: [{ partialPlanId: "C", assignmentsFingerprint: "C-fp" }] },
    causalArchive: [],
    readOnly: true,
  });
  assert.equal(result.committed, false);
  assert.equal(result.backtrackConsumed, false);
  assert.equal(result.evidence.reason, "SUSPENDED_FRONTIER_ENTRY_NOT_FOUND");
});
