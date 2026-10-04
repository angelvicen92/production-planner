import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist1Benchmark } from "./runPlannerNextA2Assist1Benchmark";

test("A2-ASSIST-1 small budget terminates deterministically within its ledger", () => {
  const first=runA2Assist1Benchmark(6_000);
  assert.ok((first.work.branchesExplored??0)<=6_000);
  assert.ok(first.proposalCount===1||first.reasonCodes.some(code=>code.includes("BUDGET_EXHAUSTED")));
});

test("A2-ASSIST-1 canonically proposes all 19 visible Stage-1 obligations", () => {
  const first=runA2Assist1Benchmark(6_000);
  assert.equal(first.scopeTaskCount,19);assert.equal(first.sourceHumanTimesUsed,false);
  assert.equal(first.participantTransitionMinutes,5);assert.equal(first.proposalCount,1);
  assert.equal(first.proposalTaskIds.length,19);assert.deepEqual([...first.proposalTaskIds].sort(),[...first.scopeTaskIds].sort());
  assert.equal(first.completeForScope,true);assert.equal(first.hardValid,true);assert.equal(first.requiredValid,true);
  assert.equal(first.protectedPlacementsPreserved,true);
  assert.equal(first.violations?.filter(violation=>violation.severity==="HARD").length??0,0);
  assert.equal(first.violations?.filter(violation=>violation.severity==="REQUIRED").length??0,0);
  const futureIds=new Set(first.technicalChainFutureReservation.preparedAuthority?.preparedFutureStructures.map(row=>row.structureId)??[]);
  assert.equal(first.work.bundleMatchingAttempts,1);assert.equal(first.work.bundleHardValidationRejects,0);
  assert.equal(first.technicalChainFutureReservation.passes,1);
  assert.ok(!first.reasonCodes.includes("CORE_BRANCH_BUDGET_EXHAUSTED"));
  assert.ok(futureIds.size>0);assert.ok(first.proposalTaskIds.every(id=>first.scopeTaskIds.includes(id)));
  assert.ok(first.fingerprint.length>0);
});
