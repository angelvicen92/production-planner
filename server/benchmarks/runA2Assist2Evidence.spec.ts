import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist2Evidence } from "./runA2Assist2Evidence";
test("A2-ASSIST-2 preserves all obligations and performs no solver or product write while editing",()=>{
  const evidence=runA2Assist2Evidence();
  assert.equal(evidence.sourceObligations,266);
  assert.equal(evidence.planningRunsCreatedDuringEditing,0);
  assert.equal(evidence.productWritesBeforeAccept,0);
  assert.equal(evidence.unplannedObligationsPreserved,true);
  assert.equal(evidence.deterministicFingerprints,true);
});
