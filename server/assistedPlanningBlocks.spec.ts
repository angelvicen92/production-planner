import assert from "node:assert/strict";
import test from "node:test";
import { applyPlanningBlockOperation } from "./assistedPlanningBlocks";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

const snapshot = buildAssistedPlanningSnapshotV1([1,2,3,4].map((id) => ({ id, startPlanned:`09:${String((id-1)*10).padStart(2,"0")}`, endPlanned:`09:${String(id*10).padStart(2,"0")}`, spaceId:7 })));
const rows = [1,2,3,4].map((id) => ({ id, status:"pending", templateId:9, spaceId:7 }));
const scope = { selector:{ kind:"TASK_IDS", taskIds:[4,3,2,1] }, includePrerequisites:false };

test("block operations are deterministic and reorder updates temporal placements", () => {
  const created = applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2,3,4]},rows,scope).snapshot;
  assert.deepEqual(created.tasks,snapshot.tasks);
  const replay = applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2,3,4]},rows,scope).snapshot;
  assert.equal(fingerprintAssistedPlanningSnapshotV1(created),fingerprintAssistedPlanningSnapshotV1(replay));
  const moved=applyPlanningBlockOperation(created,{kind:"MOVE_BLOCK",blockId:created.planningBlocks![0].blockId,deltaMinutes:15},rows,scope).snapshot;
  assert.deepEqual(moved.tasks.map(task=>task.startPlanned),["09:15","09:25","09:35","09:45"]);
  assert.deepEqual(moved.tasks.map((task,index)=>Number(task.startPlanned!.slice(3))-Number(created.tasks[index].startPlanned!.slice(3))),[15,15,15,15]);
  const split = applyPlanningBlockOperation(created,{kind:"SPLIT_BLOCK",blockId:created.planningBlocks![0].blockId,splitAfter:2},rows,scope).snapshot;
  assert.deepEqual(split.tasks,snapshot.tasks); assert.deepEqual(split.planningBlocks!.map(block=>block.memberTaskIds),[[1,2],[3,4]]);
  const merged = applyPlanningBlockOperation(split,{kind:"MERGE_BLOCKS",blockIds:[split.planningBlocks![1].blockId,split.planningBlocks![0].blockId]},rows,scope).snapshot;
  assert.deepEqual(merged.planningBlocks![0].memberTaskIds,[1,2,3,4]);
  const reordered = applyPlanningBlockOperation(merged,{kind:"REORDER_BLOCK_MEMBERS",blockId:merged.planningBlocks![0].blockId,memberTaskIds:[2,1,4,3]},rows,scope).snapshot;
  assert.deepEqual(reordered.planningBlocks![0].memberTaskIds,[2,1,4,3]);
  assert.deepEqual([...reordered.tasks].sort((a,b)=>a.startPlanned!.localeCompare(b.startPlanned!)).map(task=>task.taskId),[2,1,4,3]);
  assert.deepEqual(reordered.tasks.map(task=>Number(task.endPlanned!.slice(3))-Number(task.startPlanned!.slice(3))),[10,10,10,10]);
  const removed = applyPlanningBlockOperation(reordered,{kind:"REMOVE_BLOCK_GROUPING",blockId:reordered.planningBlocks![0].blockId},rows,scope).snapshot;
  assert.equal(Object.prototype.hasOwnProperty.call(removed,"planningBlocks"),false); assert.deepEqual(removed.tasks,reordered.tasks);
});

test("create uses chronology, partial split omits singleton blocks, and removal restores F0",()=>{
  const f0=fingerprintAssistedPlanningSnapshotV1(snapshot);
  const created=applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[3,1,2]},rows,scope).snapshot;
  assert.deepEqual(created.planningBlocks![0].memberTaskIds,[1,2,3]);
  const split=applyPlanningBlockOperation(created,{kind:"SPLIT_BLOCK",blockId:created.planningBlocks![0].blockId,splitAfter:1},rows,scope).snapshot;
  assert.deepEqual(split.planningBlocks?.map(block=>block.memberTaskIds),[[2,3]]); assert.deepEqual(split.tasks,created.tasks);
  const removed=applyPlanningBlockOperation(created,{kind:"REMOVE_BLOCK_GROUPING",blockId:created.planningBlocks![0].blockId},rows,scope).snapshot;
  assert.deepEqual(removed,snapshot); assert.equal(fingerprintAssistedPlanningSnapshotV1(removed),f0);
});

test("merge preserves distinct provenance canonically independent of selection order",()=>{
  const first=applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2]},rows,{scope:"A"}).snapshot;
  const second=applyPlanningBlockOperation(first,{kind:"CREATE_BLOCK",memberTaskIds:[3,4]},rows,{scope:"B"}).snapshot;
  const ids=second.planningBlocks!.map(block=>block.blockId) as [string,string];
  const forward=applyPlanningBlockOperation(second,{kind:"MERGE_BLOCKS",blockIds:ids},rows,scope).snapshot;
  const reverse=applyPlanningBlockOperation(second,{kind:"MERGE_BLOCKS",blockIds:[ids[1],ids[0]]},rows,scope).snapshot;
  assert.deepEqual(forward,reverse); assert.deepEqual(forward.planningBlocks![0].scopeProvenance,{sources:[{scope:"A"},{scope:"B"}]});
});

test("membership conflicts, immutable tasks and unproven compatibility fail closed", () => {
  const created=applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2]},rows,scope).snapshot;
  assert.throws(()=>applyPlanningBlockOperation(created,{kind:"CREATE_BLOCK",memberTaskIds:[2,3]},rows,scope));
  assert.throws(()=>applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2]},rows.map(row=>row.id===2?{...row,status:"done"}:row),scope));
  assert.throws(()=>applyPlanningBlockOperation(snapshot,{kind:"CREATE_BLOCK",memberTaskIds:[1,2]},rows.map(row=>row.id===2?{...row,templateId:10}:row),scope));
});
