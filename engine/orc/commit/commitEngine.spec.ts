import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalValue } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildCommitDecisions } from "./commitEngine";

const value = (simulatedStateId = "simulated-state:test"): OperationalValue => ({
  simulatedStateId,
  continuity: 0,
  makespan: 0,
  permanence: 0,
  compaction: 0,
  resourcePressure: 0,
  robustness: 0,
  stability: 0,
  futureFreedom: 0,
  overallScore: 0,
  evaluatedAt: "2026-06-25T00:00:00.000Z",
  evidenceIds: [`evidence:evaluator:${simulatedStateId}`],
  metadata: { evaluationMode: "STRUCTURAL_BASELINE" },
});

test("buildCommitDecisions handles zero OperationalValue input", () => {
  const result = buildCommitDecisions([], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.deepEqual(result.commitDecisions, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { evaluatedCount: 0, commitCount: 0, rejectCount: 0 });
});

test("buildCommitDecisions creates a logical COMMIT for a valid OperationalValue", () => {
  const operationalValue = value();
  const result = buildCommitDecisions([operationalValue], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.commitDecisions.length, 1);
  assert.equal(result.commitDecisions[0].decision, "COMMIT");
  assert.equal(result.commitDecisions[0].operationalValueId, operationalValue.simulatedStateId);
  assert.equal(result.commitDecisions[0].evidenceId, result.evidence[0].id);
  assert.equal(result.commitDecisions[0].createdAt, "2026-06-25T00:00:00.000Z");
  assert.deepEqual(result.commitDecisions[0].differences, []);
  assert.deepEqual(result.summary, { evaluatedCount: 1, commitCount: 1, rejectCount: 0 });
});

test("buildCommitDecisions creates one decision per OperationalValue", () => {
  const result = buildCommitDecisions([value("simulated-state:1"), value("simulated-state:2")], { createdAt: null });
  assert.equal(result.commitDecisions.length, 2);
  assert.equal(result.evidence.length, 2);
  assert.deepEqual(result.commitDecisions.map((decision) => decision.operationalValueId), ["simulated-state:1", "simulated-state:2"]);
  assert.deepEqual(result.summary, { evaluatedCount: 2, commitCount: 2, rejectCount: 0 });
});

test("buildCommitDecisions is deterministic and structurally equal", () => {
  const values = [value("simulated-state:1"), value("simulated-state:2")];
  const first = buildCommitDecisions(values, { createdAt: "2026-06-25T00:00:00.000Z" });
  const second = buildCommitDecisions(values, { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
});

test("buildCommitDecisions does not mutate OperationalValue input", () => {
  const values = [value("simulated-state:immutable")];
  const before = stableStringify(values);
  buildCommitDecisions(values, { createdAt: null });
  assert.equal(stableStringify(values), before);
});

test("buildCommitDecisions emits explanatory immutable evidence", () => {
  const operationalValue = value();
  const result = buildCommitDecisions([operationalValue], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].subjectId, operationalValue.simulatedStateId);
  assert.equal(result.evidence[0].data.operationalValue, operationalValue);
  assert.equal(result.evidence[0].data.commitDecision, result.commitDecisions[0]);
  assert.equal(result.evidence[0].data.mutatesOperationalState, false);
  assert.equal(result.evidence[0].data.commitsPlanning, false);
  assert.equal(Object.isFrozen(result.evidence[0]), true);
});
