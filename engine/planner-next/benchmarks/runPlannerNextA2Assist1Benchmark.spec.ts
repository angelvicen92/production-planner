import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist1Benchmark } from "./runPlannerNextA2Assist1Benchmark";

test("A2-ASSIST-1 deterministically proposes all 19 visible Stage-1 obligations", () => {
  const first=runA2Assist1Benchmark(5_000),second=runA2Assist1Benchmark(5_000);
  assert.equal(first.scopeTaskCount,19);assert.equal(first.sourceHumanTimesUsed,false);
  assert.equal(first.participantTransitionMinutes,5);assert.equal(first.proposalCount,1);
  assert.equal(first.proposalTaskIds.length,19);assert.deepEqual([...first.proposalTaskIds].sort(),[...first.scopeTaskIds].sort());
  assert.equal(first.completeForScope,true);assert.equal(first.hardValid,true);assert.equal(first.requiredValid,true);
  assert.equal(first.protectedPlacementsPreserved,true);
  assert.equal(first.violations?.filter(violation=>violation.severity==="HARD").length??0,0);
  assert.equal(first.violations?.filter(violation=>violation.severity==="REQUIRED").length??0,0);
  const futureIds=new Set(first.technicalChainFutureReservation.preparedAuthority?.preparedFutureStructures.map(row=>row.structureId)??[]);
  assert.ok(futureIds.size>0);assert.ok(first.proposalTaskIds.every(id=>first.scopeTaskIds.includes(id)));
  assert.equal(first.fingerprint,second.fingerprint);assert.deepEqual(first,second);
});
