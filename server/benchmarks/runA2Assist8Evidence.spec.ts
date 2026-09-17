import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

test("ASST-011 walks accepted stages safely and reports the first exact completion blocker", async () => {
  const first = await runA2Assist8Evidence({ branchBudget: 1_000 });
  const second = await runA2Assist8Evidence({ branchBudget: 1_000 });
  assert.equal(first.sourceObligationCount, 266);
  assert.ok(first.completedObligationCount < 266);
  assert.equal(first.remainingObligationCount, 266 - first.completedObligationCount);
  assert.equal(first.manualChanges, 0); assert.equal(first.rollbackCount, 0);
  assert.equal(first.finalHardViolationCount, 0); assert.equal(first.finalRequiredViolationCount, 0);
  assert.deepEqual(first.finalUnstructuredReasonCodes, []);
  assert.ok(first.iterations.every(row => row.newHardViolationCount === 0 && row.newRequiredViolationCount === 0 && row.unstructuredReasonCodes.length === 0));
  assert.ok(first.firstBlocker); assert.equal(first.dailyTasksMatchesLastAcceptedStage, true);
  assert.deepEqual({ stages: first.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: first.deterministicFingerprint },
    { stages: second.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: second.deterministicFingerprint });
});
