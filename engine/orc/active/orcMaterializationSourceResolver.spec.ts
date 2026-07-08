import assert from "node:assert/strict";
import test from "node:test";
import { buildORCMaterializationSourceSummary } from "./orcMaterializationSourceResolver";
import { resolveORCCandidateLineage } from "./orcCandidateLineageResolver";

const state = (ids: number[]) => ({ id:"s", tasks:[], resources:[], spaces:[], teams:[], contestants:[], constraints:[], metadata:{}, planning: ids.map(id=>({ taskId:id, startPlanned:`0${id}:00`, endPlanned:`0${id}:30`, spaceId:1, assignedResourceIds:[1] })) } as any);
const sim = (s:any) => ({ id:"sim", candidateStateId:"cs", baseStateId:"base", operationalStateSnapshot:s, appliedTransformations:[], simulationMode:"ASSIGNMENT_APPLICATION_SHADOW", readOnly:true, createdAt:null } as any);

test("Materialization explains declared moved tasks and lanePlan tasks", () => {
  const base = state([1,2,3]);
  const final = state([1,2,3]); final.planning[0].startPlanned="02:00"; final.planning[1].startPlanned="03:00"; final.planning[2].startPlanned="04:00";
  const r = buildORCMaterializationSourceSummary({ originalBaseline: base, postRepairContinuityBaseline: base, selectedSimulatedState: sim(final), selectedLineage: resolveORCCandidateLineage({ candidateId:"candidate:macro-production-wave-day-shape:x" }), selectedCandidateMetadata: { movedTaskIds:[1,2], lanePlan:[{ taskId:3 }] } });
  assert.deepEqual(r.unexplainedChangedTaskIds, []);
  assert.equal(r.materializationDiffContractValid, true);
});

test("Materialization fails when a changed task is truly unexplained", () => {
  const base = state([99]);
  const final = state([99]); final.planning[0].startPlanned="08:00";
  const r = buildORCMaterializationSourceSummary({ originalBaseline: base, postRepairContinuityBaseline: base, selectedSimulatedState: sim(final), selectedLineage: resolveORCCandidateLineage({ candidateId:"candidate:macro-production-wave-day-shape:x" }), selectedCandidateMetadata: { movedTaskIds:[] } });
  assert.deepEqual(r.unexplainedChangedTaskIds, [99]);
  assert.equal(r.materializationDiffContractValid, false);
});
