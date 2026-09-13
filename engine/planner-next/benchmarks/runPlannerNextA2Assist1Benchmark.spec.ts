import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist1Benchmark } from "./runPlannerNextA2Assist1Benchmark";

test("A2-ASSIST-1 deterministically reaches the next structural core run within the fixed budget", () => {
  const first = runA2Assist1Benchmark();
  const second = runA2Assist1Benchmark();
  assert.equal(first.scopeTaskCount, 19);
  assert.equal(first.sourceHumanTimesUsed, false);
  assert.equal(first.participantTransitionMinutes, 5);
  assert.equal(first.completeForScope, false);
  assert.equal(first.hardValid, false);
  assert.equal(first.requiredValid, false);
  assert.equal(first.proposalCount, 0);
  assert.equal(first.protectedPlacementsPreserved, true);
  assert.equal(first.work.branchesExplored, 100_000);
  assert.equal(first.supportingTaskIds.length, 63);
  assert.ok(first.work.coreMaximumDepth >= 12);
  assert.equal(typeof first.work.mainCandidatesEvaluated, "number");
  assert.ok(first.work.mainRunWitnessAttempts > 0);
  assert.ok(first.work.feederCandidatesEvaluated > 0);
  assert.ok(first.work.residualMatchingAugmentTraversals < 10_000);
  assert.equal(Object.values(first.causalDiagnostic!.waterfallByDepth)
    .reduce((sum, row) => sum + row.total, 0), first.work.branchesExplored);
  assert.ok(first.causalDiagnostic!.futureFeasibility.repeatedEvaluations > 0);
  assert.ok(first.reasonCodes.includes("CORE_BRANCH_BUDGET_EXHAUSTED"));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first, second);
});
