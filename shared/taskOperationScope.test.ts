import assert from "node:assert/strict";
import test from "node:test";
import {projectTaskOperationScopes, usesItinerantAgenda} from "./taskOperationScope";

test("agenda and occupancy remain independent; explicit fixed, selected, and unselected eligible teams remain distinct",()=>{
  const tasks=[{id:1,spaceId:10,itinerantTeamId:30},{id:2,spaceId:10,itinerantTeamId:31},{id:3,spaceId:11},{id:4,spaceId:12},{id:5,spaceId:13,itinerantTeamId:32}];
  const operations:any=[{taskId:1,agendaScope:"PHYSICAL_SPACE"},{taskId:2,agendaScope:"ITINERANT_UNIT",resourceInheritance:"OPERATION_ONLY"},
    {taskId:3,agendaScope:"ITINERANT_UNIT",blocksSpace:false,itinerantTeamId:33},
    {taskId:4,agendaScope:"ITINERANT_UNIT",allowedItinerantTeamIds:[34,35],itinerantTeamRequirement:"any"}];
  const before=structuredClone({tasks,operations});const result=projectTaskOperationScopes(tasks,operations);
  assert.deepEqual(result.map(usesItinerantAgenda),[false,true,true,true,false]);
  assert.deepEqual(result.map(task=>task.spaceId),[10,10,11,12,13]);
  assert.deepEqual(result.map(task=>task.itinerantTeamId),[30,31,33,null,32]);
  assert.equal(result[2].blocksSpace,false);assert.equal(result[1].blocksSpace,undefined);
  assert.deepEqual({tasks,operations},before);
});
