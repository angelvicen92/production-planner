import assert from "node:assert/strict";import test from "node:test";
import { affectedTasksUnchanged, resolveActiveStageLineage } from "./assistedAcceptedBaseline";
const task=(start:string)=>({contractVersion:1,tasks:[{taskId:1,startPlanned:start,endPlanned:"10:30",spaceId:2}]});
test("active lineage excludes archived future and sibling branches",()=>{const stages:any[]=[{id:1,parentStageId:null,snapshotJson:task("10:00")},{id:2,parentStageId:1,snapshotJson:task("10:00")},{id:3,parentStageId:2,snapshotJson:task("10:00")},{id:4,parentStageId:2,archivedAt:"now",snapshotJson:task("10:00")}];assert.deepEqual(resolveActiveStageLineage(stages,3).map(x=>x.id),[3,2,1]);assert.ok(!resolveActiveStageLineage(stages,3).some(x=>x.id===4));});
test("accepted exception applicability ends when an affected task changes",()=>{const stage:any={id:2,parentStageId:1,snapshotJson:task("10:00")};assert.equal(affectedTasksUnchanged(stage.snapshotJson,task("10:00"),[1]),true);assert.equal(affectedTasksUnchanged(stage.snapshotJson,task("10:05"),[1]),false);});

test("rollback, redo, and divergence expose exceptions only from the active lineage without deleting history",()=>{
  const stages:any[]=[
    {id:1,parentStageId:null,snapshotJson:task("09:00"),snapshotFingerprint:"s1"},
    {id:2,parentStageId:1,snapshotJson:task("10:00"),snapshotFingerprint:"s2"},
  ];
  const exceptions=[{id:101,stageId:2,status:"ACTIVE",affectedTaskIdsJson:[1]}];
  const visible=(activeId:number,current:unknown)=>resolveActiveStageLineage(stages,activeId).flatMap(stage=>
    exceptions.filter(item=>item.stageId===stage.id&&item.status==="ACTIVE"&&affectedTasksUnchanged(stage.snapshotJson,current,item.affectedTaskIdsJson)));

  assert.deepEqual(visible(1,task("09:00")),[]); // rollback restores S1 exactly
  assert.deepEqual(visible(2,task("10:00")).map(item=>item.id),[101]); // redo restores S2 and its decision
  assert.deepEqual(visible(1,task("09:00")),[]); // second rollback again restores S1

  stages[1].archivedAt="now";
  stages.push({id:3,parentStageId:1,snapshotJson:task("11:00"),snapshotFingerprint:"s2-prime"});
  exceptions.push({id:102,stageId:3,status:"ACTIVE",affectedTaskIdsJson:[1]});
  assert.deepEqual(visible(3,task("11:00")).map(item=>item.id),[102]);
  assert.equal(exceptions.length,2); // archived-branch evidence remains historical
  assert.equal(exceptions.some(item=>item.id===101),true);
});

test("missing lineage parent fails closed",()=>assert.throws(()=>resolveActiveStageLineage([{id:3,parentStageId:2,snapshotJson:task("10:00")}],3),/CORRUPT_STAGE_LINEAGE/));
