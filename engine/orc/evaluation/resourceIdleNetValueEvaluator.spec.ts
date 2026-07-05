import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateResourceIdleNetValue } from "./resourceIdleNetValueEvaluator";

const state = (planning:any[]) => ({ tasks: planning.map((p:any)=>({ id:p.taskId, assignedResourceIds:p.assignedResourceIds, contestantId:p.contestantId ?? p.taskId })), planning, locks: [] } as any);
const valid = (id:string) => ({ simulatedStateId:id, result:"VALID", violatedConstraints:[], evidenceIds:[], checkedAt:null } as any);
const sim = (id:string, st:any) => ({ id, candidateStateId:`cs:${id}`, operationalStateSnapshot:st, planningMaterialization:{ source:"candidate_transformations", assignedSpaceContractValid:true, summaryContractValid:true } } as any);
const evalNet = (base:any, cand:any, md:any = {}) => evaluateResourceIdleNetValue({ baseState:base, candidateState:cand, baseSimulation:sim("base",base), candidateSimulation:sim("cand",cand), baseValidation:valid("base"), candidateValidation:valid("cand"), selectedCandidateMetadata:{ targetResourceId:1, idleGapMinutesBefore:40, expectedIdleGapMinutesAfter:20, ...md } }).netValue;

test("accepts real net improvement when resource idle decreases", () => {
  const base=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"10:00",endPlanned:"11:00",assignedResourceIds:[1]}]);
  const cand=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"09:30",endPlanned:"10:30",assignedResourceIds:[1]}]);
  const net=evalNet(base,cand,{expectedIdleGapMinutesAfter:30});
  assert.equal(net.resourceIdleDeltaMinutes, -30);
  assert.equal(net.acceptedByNetValueGate, true);
});

test("rejects local gap reduction without OPQM improvement", () => {
  const base=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"10:00",endPlanned:"11:00",assignedResourceIds:[1]},{taskId:3,startPlanned:"11:30",endPlanned:"12:00",assignedResourceIds:[1]}]);
  const cand=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"09:40",endPlanned:"10:40",assignedResourceIds:[1]},{taskId:3,startPlanned:"11:30",endPlanned:"12:00",assignedResourceIds:[1]}]);
  const net=evalNet(base,cand,{idleGapMinutesBefore:60,expectedIdleGapMinutesAfter:40});
  assert.equal(net.resourceIdleDeltaMinutes, 0);
  assert.equal(net.acceptedByNetValueGate, false);
  assert.equal(net.rejectionReason, "resource_idle_net_value_not_positive");
});

test("rejects baseline repair bypass misuse for optional compression", () => {
  const base=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"10:00",endPlanned:"11:00",assignedResourceIds:[1]}]);
  const cand=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"09:30",endPlanned:"10:30",assignedResourceIds:[1]}]);
  const net=evaluateResourceIdleNetValue({ baseState:base, candidateState:cand, baseValidation:valid("base"), candidateValidation:valid("cand"), selectedCandidateMetadata:{targetResourceId:1,idleGapMinutesBefore:60,expectedIdleGapMinutesAfter:30}, opqmGateBypassedForBaselineRepair:true, rawOpqmNotWorseThanV4:false }).netValue;
  assert.equal(net.acceptedByNetValueGate, false);
});

test("accepts fragmentation reduction when compactness does not worsen", () => {
  const base=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"09:30",endPlanned:"10:00",assignedResourceIds:[1]},{taskId:3,startPlanned:"10:30",endPlanned:"11:00",assignedResourceIds:[1]}]);
  const cand=state([{taskId:1,startPlanned:"08:00",endPlanned:"09:00",assignedResourceIds:[1]},{taskId:2,startPlanned:"09:00",endPlanned:"09:30",assignedResourceIds:[1]},{taskId:3,startPlanned:"10:30",endPlanned:"11:00",assignedResourceIds:[1]}]);
  const net=evalNet(base,cand,{idleGapMinutesBefore:30,expectedIdleGapMinutesAfter:0});
  assert.equal(net.resourceFragmentationDelta < 0, true);
  assert.equal(net.acceptedByNetValueGate, true);
});
