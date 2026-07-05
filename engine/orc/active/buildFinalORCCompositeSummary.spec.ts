import test from "node:test";
import assert from "node:assert/strict";
import type { OperationalState, SimulatedState } from "../contracts";
import { buildFinalORCCompositeSummary } from "./buildFinalORCCompositeSummary";

const st = (planning: any[]): OperationalState => ({ id:"s", tasks: planning.map((p:any)=>({ id:p.taskId, status:"pending", spaceId:p.spaceId, zoneId:p.zoneId })), resources:[], spaces:[], teams:[], contestants:[], constraints:{ optimizer:{ mainZoneId:1, mainZoneKind:"zone" } } as any, locks:[], planning, metadata:{}, cognitive:{ opportunities:[], searchSpaces:[], candidates:[], candidateStates:[], simulatedStates:[], validationResults:[], operationalValues:[], commitDecisions:[], evidence:[], metadata:{} } });
const sim = (id:string, state:OperationalState): SimulatedState => ({ id, candidateStateId:"cs", baseStateId:"base", operationalStateSnapshot:state, appliedTransformations:[], simulationMode:"ASSIGNMENT_APPLICATION_SHADOW", readOnly:true, createdAt:null, planningMaterialization:{ source:"candidate_transformations", plannedTaskCount:state.planning.length, changedTaskCount:6, warnings:[] } });

test("summary final usa selected composite simulation", () => {
  const original = st([{taskId:504,startPlanned:"10:35",endPlanned:"11:20",spaceId:48,zoneId:1,assignedResourceIds:[1]},{taskId:285,startPlanned:"12:05",endPlanned:"12:20",spaceId:48,zoneId:1,assignedResourceIds:[336]}]);
  const final = st([{taskId:504,startPlanned:"10:35",endPlanned:"11:20",spaceId:48,zoneId:1,assignedResourceIds:[1]},{taskId:285,startPlanned:"11:20",endPlanned:"11:35",spaceId:48,zoneId:1,assignedResourceIds:[336]}]);
  const r = buildFinalORCCompositeSummary({ originalState: original, selectedSimulation: sim("sim:post", final), initialMainZoneContinuity:{ configured:false, mainZoneConfigured:false, targetKind:"unknown", mainSpaceIds:[], resolutionWarnings:["main_zone_not_configured"] }, mainZoneGapResourceBlockSwap:{ selectedAsCommit:true }, postRepairMainZoneContinuityPass:{ selectedAsCommit:true, selectedSimulatedStateId:"sim:post", selectedCandidateId:"cand", movedMainZoneTaskIds:[285], movedBlockingTaskIds:[], targetedGapReductionMinutes:45 }, simulationSelection:{ selectedSimulatedStateId:"sim:post" }, planningMaterialization:{ source:"candidate_transformations", plannedTaskCount:2, changedTaskCount:1, warnings:[] } });
  assert.equal(r.mainZoneContinuity.summaryScope, "final-selected-planning");
  assert.equal(r.mainZoneContinuity.configured, true);
  assert.equal(r.mainZoneContinuity.mainZoneConfigured, true);
  assert.equal(r.mainZoneContinuity.targetKind, "zone");
  assert.deepEqual(r.mainZoneContinuity.mainSpaceIds, [48]);
  assert.ok(!(r.mainZoneContinuity.resolutionWarnings as string[]).includes("main_zone_not_configured"));
});

test("gap objetivo y gaps finales no se mezclan", () => {
  const final = st([{taskId:1,startPlanned:"10:00",endPlanned:"10:30",spaceId:48,zoneId:1,assignedResourceIds:[1]},{taskId:2,startPlanned:"10:30",endPlanned:"10:45",spaceId:48,zoneId:1,assignedResourceIds:[1]},{taskId:3,startPlanned:"12:00",endPlanned:"12:15",spaceId:48,zoneId:1,assignedResourceIds:[1]}]);
  const r = buildFinalORCCompositeSummary({ selectedSimulation: sim("sim", final), postRepairMainZoneContinuityPass:{ selectedAsCommit:true, selectedSimulatedStateId:"sim", targetedGapReductionMinutes:45, movedMainZoneTaskIds:[2], movedBlockingTaskIds:[9] }, mainZoneGapResourceBlockSwap:{ selectedAsCommit:true }, simulationSelection:{selectedSimulatedStateId:"sim"}, planningMaterialization:{changedTaskCount:2} });
  assert.equal(r.postRepairMainZoneContinuityPass.targetedGapReductionMinutes, 45);
  assert.equal(r.mainZoneContinuity.finalLargestMainZoneGapMinutes, 75);
});

test("materialización compuesta cuenta cambios desde baseline original", () => {
  const orig = st([1,2,3,4,5,6,7].map((id)=>({taskId:id,startPlanned:"10:00",endPlanned:"10:15",spaceId:1,zoneId:1,assignedResourceIds:[1]})));
  const rep = st(orig.planning.map((p:any)=>p.taskId===7?{...p,startPlanned:"10:15",endPlanned:"10:30"}:p));
  const fin = st(rep.planning.map((p:any)=>p.taskId<=6?{...p,startPlanned:"11:00",endPlanned:"11:15"}:p));
  const r = buildFinalORCCompositeSummary({ originalState:orig, repairedState:rep, selectedSimulation:sim("sim",fin), postRepairMainZoneContinuityPass:{ selectedAsCommit:true, movedMainZoneTaskIds:[1,2,3], movedBlockingTaskIds:[4,5,6] }, planningMaterialization:{} });
  assert.equal(r.planningMaterialization.changedTaskCountFromOriginalBaseline, 7);
  assert.deepEqual(r.planningMaterialization.changeSources, { baselineOverlapRepair:{ changedTaskCount:1, changedTaskIds:[7], readOnly:true }, postRepairMainZoneContinuity:{ changedTaskCount:6, changedTaskIds:[1,2,3,4,5,6], readOnly:true } });
});

test("summary contract detecta incoherencia", () => {
  const r = buildFinalORCCompositeSummary({ selectedSimulation:null, initialMainZoneContinuity:{configured:false}, postRepairMainZoneContinuityPass:{ selectedAsCommit:true }, mainZoneGapResourceBlockSwap:{ selectedAsCommit:true } });
  assert.equal(r.summaryContractValid, false);
  assert.ok(r.summaryContractWarnings.includes("main_zone_final_summary_inconsistent_with_selected_commit"));
});

test("ID233 v4-39-like acepta postRepair como ancestro de idle compression", () => {
  const original = st([1,2,3,4,5,6,7,8].map((taskId)=>({taskId,startPlanned:"10:00",endPlanned:"10:15",spaceId:1,zoneId:1,assignedResourceIds:[1]})));
  const repaired = st(original.planning.map((p:any)=>p.taskId===8?{...p,startPlanned:"10:15",endPlanned:"10:30"}:p));
  const final = st(repaired.planning.map((p:any)=>p.taskId<=6?{...p,startPlanned:"11:00",endPlanned:"11:15"}:p.taskId===7?{...p,startPlanned:"09:45",endPlanned:"10:00"}:p));
  const r = buildFinalORCCompositeSummary({ originalState: original, repairedState: repaired, selectedSimulation: sim("sim:idle", final), mainZoneGapResourceBlockSwap:{ selectedAsCommit:true, selectedCandidateId:"cand:swap", baselineRepairChangedTaskIds:[8] }, postRepairMainZoneContinuityPass:{ selectedAsCommit:true, selectedSimulatedStateId:"sim:post", selectedCandidateId:"cand:post", movedMainZoneTaskIds:[1,2,3], movedBlockingTaskIds:[4,5,6] }, criticalResourceIdleCompression:{ selectedAsCommit:true, selectedSimulatedStateId:"sim:idle", selectedCandidateId:"cand:idle", sourceSimulationId:"sim:post", movedTaskIds:[7], mainZoneContinuityPreserved:true }, simulationSelection:{ selectedSimulatedStateId:"sim:idle", selectedBucket:"valid-committed-critical-resource-idle-compression", baseCompositeSimulationId:"sim:post" }, planningMaterialization:{ changeSources:{ baselineOverlapRepair:{ changedTaskCount:1, changedTaskIds:[8] }, postRepairMainZoneContinuity:{ changedTaskCount:6, changedTaskIds:[1,2,3,4,5,6] }, criticalResourceIdleCompression:{ changedTaskCount:1, changedTaskIds:[7] } } } });
  assert.equal(r.summaryContractValid, true);
  assert.ok(!r.summaryContractWarnings.includes("post_repair_commit_not_reflected_in_simulation_selection"));
  assert.equal(r.compositeSimulationLineage.includesBaselineOverlapRepair, true);
  assert.equal(r.compositeSimulationLineage.includesPostRepairMainZoneContinuity, true);
  assert.equal(r.compositeSimulationLineage.includesCriticalResourceIdleCompression, true);
  assert.equal(r.finalSelectedCandidateFamily, "critical-resource-idle-compression");
  assert.equal(r.mainZoneContinuity.finalSelectedCandidateFamily, "critical-resource-idle-compression");
  assert.equal(r.criticalResourceIdleCompression.selectedAsFinalCommit, true);
});

test("ID233 mantiene warning cuando postRepair commit no está probado como ancestro", () => {
  const r = buildFinalORCCompositeSummary({ selectedSimulation: sim("sim:other", st([])), postRepairMainZoneContinuityPass:{ selectedAsCommit:true, selectedSimulatedStateId:"sim:post" }, simulationSelection:{ selectedSimulatedStateId:"sim:other" }, planningMaterialization:{ changeSources:{} } });
  assert.equal(r.summaryContractValid, false);
  assert.ok(r.summaryContractWarnings.includes("post_repair_commit_not_reflected_in_simulation_selection"));
});
