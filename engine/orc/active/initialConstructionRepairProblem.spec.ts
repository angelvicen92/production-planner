import test from "node:test";
import assert from "node:assert/strict";
import { buildInitialConstructionRepairProblem, profileFromAnchorPlacementEvidence } from "./initialConstructionRepairProblem";

const state:any={planning:[{taskId:99,startPlanned:"08:00",endPlanned:"08:30"}],constraints:{},availability:{},spaces:{}};

test("repair problem builds deterministic minimal causal ejection sets and dependency closure",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]},{id:3,status:"done"},{id:4,status:"pending"}],locks:[{taskId:4}]};
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:state,residualFingerprint:"r",blockedAnchorTaskId:10,terminalEvidence:{contestantConflictTaskIds:[1,3]},provisionalAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]},{taskId:2,startPlanned:"08:10",endPlanned:"08:20",resourceIds:[]},{taskId:4,startPlanned:"08:20",endPlanned:"08:30",resourceIds:[]}],maxEjectedAssignments:2});
  assert.deepEqual(p.directConflictTaskIds,[1]);
  assert.deepEqual(p.candidateEjectionSets[0].repairDependencyClosureTaskIds,[1,2]);
  assert.ok(p.immutableTaskIds.includes(3));
  assert.ok(p.immutableTaskIds.includes(4));
  assert.equal(p.readOnly,true);
});

test("normalizeOptionalTaskIds excludes null zero blanks and non-positive IDs",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending"}]};
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:10,repairCandidateProfiles:[],terminalEvidence:{frontierSources:[{kind:"assigned-prerequisite-end",taskId:null},{kind:"assigned-prerequisite-end",taskId:""},{kind:"assigned-prerequisite-end",taskId:0}],dependencyBoundSourceTaskIds:[null,"",0,"x"]},provisionalAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]}]});
  const all=JSON.stringify(p);
  assert.equal(all.includes('[0]'),false);
  assert.equal(all.includes('taskId":0'),false);
});

test("dependency-bound provisional source is repairable and creates executable ejection set",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending"}]};
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:2,repairCandidateProfiles:[],terminalEvidence:{reasonCodes:["WORKDAY_BOUND_BY_ASSIGNED_PREREQUISITE"],dependencyBoundSourceTaskIds:[1],frontierSources:[{kind:"assigned-prerequisite-end",taskId:1}],causalConflictEvidence:{dependencyLowerBoundTaskIds:[1],evidenceComplete:true}},provisionalAssignments:[{taskId:1,startPlanned:"18:00",endPlanned:"19:00",resourceIds:[]}]});
  assert.deepEqual(p.repairCandidateProfiles[0].dependencyBoundSourceTaskIds,[1]);
  assert.deepEqual(p.repairCandidateProfiles[0].repairableConflictTaskIds,[1]);
  assert.equal(p.candidateEjectionSets[0].executable,true);
});

test("static cause without causal task id is not repairable and creates no ejection set",()=>{
  const p=buildInitialConstructionRepairProblem({input:{tasks:[{id:1,status:"pending"}]} as any,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:1,terminalEvidence:{reasonCodes:["AVAILABILITY_STATIC_CONFLICT"]},provisionalAssignments:[]});
  assert.equal(p.repairCandidateProfiles[0].repairable,false);
  assert.equal(p.candidateEjectionSets.length,0);
});

test("ejection set covers simultaneous space and dependency blockers completely",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending"},{id:3,status:"pending"}]};
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:3,terminalEvidence:{spaceConflictTaskIds:[1],dependencyBoundSourceTaskIds:[2],causalConflictEvidence:{spaceConflictTaskIds:[1],dependencyLowerBoundTaskIds:[2],evidenceComplete:true}},provisionalAssignments:[1,2].map(id=>({taskId:id,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]}))});
  assert.deepEqual(p.candidateEjectionSets.map(s=>s.ejectedTaskIds),[[1,2]]);
  assert.deepEqual(p.candidateEjectionSets[0].coveredBlockerTaskIds,[1,2]);
});

test("static availability window blocker remains non-executable despite reversible space blocker",()=>{
  const p=buildInitialConstructionRepairProblem({input:{tasks:[{id:1,status:"pending"},{id:2,status:"pending"}]} as any,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:2,terminalEvidence:{spaceConflictTaskIds:[1],taskWindowConflictDetails:[{kind:"OUTSIDE_AVAILABILITY",violatedBoundary:"availability"}],causalConflictEvidence:{spaceConflictTaskIds:[1],taskWindowConflictDetails:[{kind:"OUTSIDE_AVAILABILITY",violatedBoundary:"availability"}],evidenceComplete:true}},provisionalAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]}]});
  assert.equal(p.repairCandidateProfiles[0].repairable,false);
  assert.ok(p.repairCandidateProfiles[0].uncoveredHardBlockerDimensions.includes("availability"));
  assert.equal(p.candidateEjectionSets.length,0);
});

test("workday violation sourced by assigned prerequisite is shiftable and executable",()=>{
  const p=buildInitialConstructionRepairProblem({input:{tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]}]} as any,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:2,terminalEvidence:{frontierSources:[{kind:"assigned-prerequisite-end",taskId:1}],taskWindowConflictDetails:[{kind:"OUTSIDE_WORKDAY",violatedBoundary:"assigned-prerequisite-end",dependencyBoundSourceTaskIds:[1]}],causalConflictEvidence:{dependencyLowerBoundTaskIds:[1],taskWindowConflictDetails:[{kind:"OUTSIDE_WORKDAY",violatedBoundary:"assigned-prerequisite-end",dependencyBoundSourceTaskIds:[1]}],evidenceComplete:true}},provisionalAssignments:[{taskId:1,startPlanned:"18:00",endPlanned:"19:00",resourceIds:[]}]});
  assert.equal(p.repairCandidateProfiles[0].windowConflictClassifications[0].dependencyBoundShiftable,true);
  assert.equal(p.repairCandidateProfiles[0].repairable,true);
  assert.deepEqual(p.candidateEjectionSets[0].ejectedTaskIds,[1]);
});

test("effective repair root dedupes temporal candidates with same executable state",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending"},{id:3,status:"pending"}]};
  const prof=(fp:string,rank:number)=>({temporalCandidateFingerprint:fp,candidateRank:rank,causalConflictEvidence:{spaceConflictTaskIds:[1],evidenceComplete:true},reasonCodes:["SPACE_OVERLAP"]});
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},residualFingerprint:"r",blockedAnchorTaskId:3,repairCandidateProfiles:[prof("a",2),prof("b",1)].map(e=>profileFromAnchorPlacementEvidence({blockedAnchorTaskId:3,evidence:e,provisionalTaskIds:[1],immutableTaskIds:[]})),terminalEvidence:{requireCandidateScopedProfiles:true},provisionalAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]}]});
  assert.equal(p.effectiveRepairRootCount,1);
  assert.equal(p.effectiveRepairRoots[0].supportingCandidateProfileFingerprints.length,2);
  assert.equal(p.effectiveRepairRoots[0].representativeCandidateRank,1);
});
