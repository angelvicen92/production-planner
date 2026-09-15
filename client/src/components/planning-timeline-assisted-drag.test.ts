import assert from "node:assert/strict";
import test from "node:test";
import {assistedSimpleDragEdit} from "../lib/assisted-timeline-drag";
import {buildAssistedPlanningSnapshotV1} from "../../../server/assistedPlanningSnapshot";
import {cascadeTasks} from "../lib/assisted-draft-editing";
test("assisted simple drag moves only A while explicit cascade moves A and B",()=>{
  const simple=assistedSimpleDragEdit({id:1,startPlanned:"09:00",endPlanned:"09:30"},600,480,1080);
  assert.deepEqual(Object.keys(simple.nextEdits),["1"]);assert.deepEqual(simple.shiftedIds,[]);
  const snapshot=buildAssistedPlanningSnapshotV1([{id:1,startPlanned:"09:00",endPlanned:"09:30"},{id:2,startPlanned:"10:00",endPlanned:"10:30"}]);
  assert.deepEqual(cascadeTasks(snapshot,[1,2],15).touchedTaskIds,[1,2]);
});
