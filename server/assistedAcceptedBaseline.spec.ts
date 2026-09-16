import assert from "node:assert/strict";import test from "node:test";
import { affectedTasksUnchanged, resolveActiveStageLineage } from "./assistedAcceptedBaseline";
const task=(start:string)=>({contractVersion:1,tasks:[{taskId:1,startPlanned:start,endPlanned:"10:30",spaceId:2}]});
test("active lineage excludes archived future and sibling branches",()=>{const stages:any[]=[{id:1,parentStageId:null,snapshotJson:task("10:00")},{id:2,parentStageId:1,snapshotJson:task("10:00")},{id:3,parentStageId:2,snapshotJson:task("10:00")},{id:4,parentStageId:2,archivedAt:"now",snapshotJson:task("10:00")}];assert.deepEqual(resolveActiveStageLineage(stages,3).map(x=>x.id),[3,2,1]);assert.ok(!resolveActiveStageLineage(stages,3).some(x=>x.id===4));});
test("accepted exception applicability ends when an affected task changes",()=>{const stage:any={id:2,parentStageId:1,snapshotJson:task("10:00")};assert.equal(affectedTasksUnchanged(stage.snapshotJson,task("10:00"),[1]),true);assert.equal(affectedTasksUnchanged(stage.snapshotJson,task("10:05"),[1]),false);});

test("missing lineage parent fails closed",()=>assert.throws(()=>resolveActiveStageLineage([{id:3,parentStageId:2,snapshotJson:task("10:00")}],3),/CORRUPT_STAGE_LINEAGE/));
