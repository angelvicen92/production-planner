import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist2Evidence } from "./runA2Assist2Evidence";
test("A2-ASSIST-2 executes editing, validation and Accept S2 through workflow seams",async()=>{
  const evidence=await runA2Assist2Evidence();
  assert.equal(evidence.sourceObligationCount,266);
  assert.equal(evidence.planningRunsCreatedDuringEditing,0);
  assert.equal(evidence.productWritesBeforeAccept,0);
  assert.equal(evidence.unplannedObligationsPreserved,true);
  assert.equal(evidence.deterministicFingerprints,true);
  assert.equal(evidence.stageS1Incomplete,true);assert.equal(evidence.productWritesAtAccept,1);
  assert.ok(evidence.manualEditCount>0&&evidence.touchedTaskCount>0);
  assert.ok(evidence.blockShiftCount>=1&&evidence.swapCount>=1&&evidence.splitCount>=1&&evidence.mergeCount>=1);
  assert.equal(evidence.blocksSurviveAccept,true);
  assert.equal(evidence.rollbackExact,true);assert.equal(evidence.rollbackRedoExact,true);assert.equal(evidence.blocksSurviveRollbackRedo,true);
  assert.equal(evidence.undoCount,1);assert.equal(evidence.redoCount,1);assert.equal(evidence.validationMode,"MANUAL_DELTA_CLEAN_V1");assert.equal(evidence.acceptedStageOrdinal,2);
  assert.equal(evidence.futureFullDayFeasibility,"NOT_CERTIFIED");
  const replay=await runA2Assist2Evidence();assert.equal(replay.validatedFingerprint,evidence.validatedFingerprint);
});
