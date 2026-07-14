import test from "node:test";
import assert from "node:assert/strict";
import { auditInitialConstructionRepairNeighborhoodPreservation } from "./runInitialConstructionRepairNeighborhoodSession";

test("repair neighborhood preservation audit computes exterior modifications and duplicates",()=>{
  const a:any={taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]};
  const r=auditInitialConstructionRepairNeighborhoodPreservation({before:[a,{taskId:2,startPlanned:"08:10",endPlanned:"08:20",resourceIds:[]}],after:[a,{taskId:2,startPlanned:"09:10",endPlanned:"09:20",resourceIds:[]},{taskId:2,startPlanned:"09:10",endPlanned:"09:20",resourceIds:[]}],repairNeighborhoodTaskIds:[1],protectedTaskIds:[1],productiveTaskIds:[1,2]});
  assert.equal(r.protectedAssignmentsModified,false);
  assert.equal(r.outsideNeighborhoodAssignmentsModified,1);
  assert.deepEqual(r.duplicateTaskIds,[2]);
});
