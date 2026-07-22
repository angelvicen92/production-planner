import test from "node:test";
import assert from "node:assert/strict";
import { evaluateInitialConstructionStage2PreliminaryFutureFeasibility } from "./initialConstructionStage2PreliminaryFutureFeasibility";

const state:any = { id:"s", planning:[], locks:[] };
const baseInput:any = { planId:1, workDay:{start:"09:00",end:"15:30"}, contestantAvailabilityById:{1:{start:"09:00",end:"15:30"}}, planResourceItems:[], tasks:[] };
const evalF = (input:any, branch:any[]=[], target:number[]=input.tasks.map((t:any)=>t.id), st:any=state) => evaluateInitialConstructionStage2PreliminaryFutureFeasibility({ originInput: input, originOperationalState: st, baseProvisionalAssignments: [], branchAssignments: branch, constructiveTargetTaskIds: target });

test("ID 323 A recognizes capacity before the anchor and returns UNKNOWN", () => {
  const input={...baseInput,tasks:[{id:1,status:"pending",contestantId:1,durationOverrideMin:120},{id:2,status:"pending",contestantId:1,durationOverrideMin:30}]};
  const r:any=evalF(input,[{taskId:2,startPlanned:"15:00",endPlanned:"15:30"}]);
  assert.equal(r.status,"UNKNOWN");
  assert.equal(r.hardProofCount,0);
  assert.equal(r.contestantCapacityEvidence[0].optimisticFreeMinutes,360);
});

test("ID 323 B preserves demonstrated overload hard proof", () => {
  const input={...baseInput,workDay:{start:"09:00",end:"12:00"},contestantAvailabilityById:{1:{start:"09:00",end:"12:00"}},tasks:[{id:1,status:"pending",contestantId:1,durationOverrideMin:150},{id:2,status:"pending",contestantId:1,durationOverrideMin:60}]};
  const r:any=evalF(input,[{taskId:2,startPlanned:"09:00",endPlanned:"10:00"}]);
  assert.equal(r.contestantCapacityEvidence[0].optimisticFreeMinutes,120);
  assert.equal(r.contestantCapacityEvidence[0].excessMinutes,30);
  assert.equal(r.status,"INFEASIBLE");
  assert.deepEqual(r.hardProofReasonCodes,["CONTESTANT_REMAINING_LOAD_EXCEEDS_AVAILABILITY"]);
  assert.equal(r.contestantCapacityEvidence[0].proofComplete,true);
});

test("ID 323 C merges overlapping, contiguous, clipped and reversed intervals deterministically", () => {
  const input={...baseInput,tasks:[{id:1,status:"pending",contestantId:1,durationOverrideMin:10},{id:2,status:"pending",contestantId:1,durationOverrideMin:10},{id:3,status:"pending",contestantId:1,durationOverrideMin:10},{id:4,status:"pending",contestantId:1,durationOverrideMin:10},{id:5,status:"pending",contestantId:1,durationOverrideMin:60}]};
  const intervals=[{taskId:2,startPlanned:"08:00",endPlanned:"09:30"},{taskId:3,startPlanned:"09:20",endPlanned:"10:00"},{taskId:4,startPlanned:"10:00",endPlanned:"10:30"},{taskId:1,startPlanned:"16:00",endPlanned:"17:00"}];
  const a:any=evalF(input,intervals,[5,2,3,4,1]); const b:any=evalF(input,[...intervals].reverse(),[1,4,3,2,5]);
  assert.equal(a.contestantCapacityEvidence[0].knownOccupiedMinutes,90);
  assert.equal(a.fingerprint,b.fingerprint);
});

test("ID 323 D uses only canonical pending target tasks", () => {
  const input={...baseInput,tasks:[{id:1,status:"pending",contestantId:1,durationOverrideMin:50},{id:2,status:"pending",contestantId:1,durationOverrideMin:40},{id:3,status:"pending",contestantId:1,durationOverrideMin:999},{id:4,status:"pending",contestantId:1,durationOverrideMin:999},{id:5,status:"pending",contestantId:1,durationOverrideMin:999},{id:6,status:"pending",contestantId:1,durationOverrideMin:30}]};
  const r:any=evalF(input,[{taskId:6,startPlanned:"09:00",endPlanned:"09:30"}],[1,2,6]);
  assert.deepEqual(r.contestantCapacityEvidence[0].pendingTargetTaskIds,[1,2]);
  assert.equal(r.contestantCapacityEvidence[0].pendingMandatoryTargetLoadMinutes,90);
});

test("ID 323 E incomplete data remains UNKNOWN with explicit evidence", () => {
  const input={...baseInput,contestantAvailabilityById:{},tasks:[{id:1,status:"pending",contestantId:1}]};
  const r:any=evalF(input);
  assert.equal(r.status,"UNKNOWN");
  assert.equal(r.hardProofCount,0);
  assert.ok(r.riskReasonCodes.includes("CONTESTANT_CAPACITY_EVIDENCE_INCOMPLETE"));
});

test("ID 323 F/G resource impossible byItem is hard, anyOf stays risk", () => {
  const input={...baseInput,planResourceItems:[{resourceItemId:7,isAvailable:true}],tasks:[{id:1,status:"pending",contestantId:1,durationOverrideMin:1,resourceRequirements:{byItem:{8:1}}},{id:2,status:"pending",contestantId:1,durationOverrideMin:1,resourceRequirements:{anyOf:[{resourceItemIds:[7,8]}]}}]};
  const r:any=evalF(input);
  assert.equal(r.status,"INFEASIBLE");
  assert.ok(r.hardProofReasonCodes.includes("RESOURCE_WITHOUT_INVENTORY"));
  assert.equal(r.resourceInventoryEvidence.find((e:any)=>e.taskId===2).officialInventoryUnitAvailable,true);
});
