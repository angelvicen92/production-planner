import assert from "node:assert/strict";
import test from "node:test";
import {collectAssistedDraftWarnings} from "./assisted-draft-warnings";
test("local assisted warnings cover bounded conflicts without solver or repair",()=>{
  const tasks=[{id:1,startPlanned:"08:45",endPlanned:"09:30",spaceId:1,contestantId:1,resourceIds:[7]},
    {id:2,startPlanned:"09:00",endPlanned:"09:45",spaceId:1,contestantId:1,resourceIds:[7],dependsOnTaskIds:[1]}];
  const result=collectAssistedDraftWarnings(tasks,{start:"09:00",end:"18:00"});
  assert.deepEqual(new Set(result.map(row=>row.kind)),new Set(["AVAILABILITY","DIRECT_DEPENDENCY","PARTICIPANT_OVERLAP","SPACE_OVERLAP","RESOURCE_OVERLAP"]));
  assert.deepEqual(tasks[0].startPlanned,"08:45");
});
