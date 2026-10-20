import assert from 'node:assert/strict';
import test from 'node:test';
import type {PlannerNextProblem,ScheduledTask,Task} from './contracts';
import {mainFlowVocalScenario} from './scenarios/mainFlowVocalScenario';
import {materializeTerminalTransportDetailed,validateTransportGrouping,transportContiguousGroupSizes,validateCertifiedArrivalSchedule} from './transportGrouping';
import {preflight} from './validate';
import {buildCanonicalFullA2EngineInput} from './benchmarks/canonicalFullA2EngineInput';
import {adaptEngineInputToPlannerNextProblem} from './integration/engineInputAdapter';

function fixture(count=19,minimum=1,maximum=3,direction:'arrival'|'departure'='arrival'):PlannerNextProblem {
  const day={start:0,end:240},window=[day];
  const tasks:Task[]=Array.from({length:count},(_,i)=>({id:`ride-${String(i).padStart(2,'0')}`,kind:'auxiliary',participantId:`member-${i}`,duration:5,spaceId:'transit',blocksSpace:false,dependencies:[]}));
  const policy={taskIds:tasks.map(t=>t.id),minimumGroupSize:minimum,targetGroupSize:3,maximumGroupSize:maximum,minGapMinutes:0,groupingWeight:1};
  return {...mainFlowVocalScenario(),day,tasks,participants:tasks.map(t=>({id:t.participantId!,availability:window})),spaces:[{id:'transit',availability:window}],resources:[],coaches:[],participantTransitionMinutes:0,resourceTransitionMinutes:0,transportPolicy:{arrival:{...policy,taskIds:direction==='arrival'?policy.taskIds:[]},departure:{...policy,taskIds:direction==='departure'?policy.taskIds:[]}}};
}
const place=(task:Task,start=0):ScheduledTask=>({...task,start,end:start+task.duration});

for(const minimum of [1,2])test(`19 obligations retain only legal packets for HARD minimum ${minimum}`,()=>{
 const problem=fixture(19,minimum),policy=problem.transportPolicy!.arrival;
 const sizes=transportContiguousGroupSizes(19,policy,'arrival')!;
 assert.equal(sizes.reduce((a,b)=>a+b,0),19);assert.ok(sizes.every(size=>size>=minimum&&size<=3));
 if(minimum===1)assert.ok(sizes.includes(1));else assert.ok(!sizes.includes(1));
 const result=materializeTerminalTransportDetailed(problem,[]);assert.equal(result.status,'FEASIBLE');
 assert.equal(validateTransportGrouping(problem,result.scheduled!).violationCount,0);
 assert.ok(validateTransportGrouping(problem,result.scheduled!).groupsByDirection.arrival.every(group=>group.length>=minimum&&group.length<=3));
 const reversed=structuredClone(problem);reversed.tasks.reverse();reversed.participants.reverse();reversed.transportPolicy!.arrival.taskIds.reverse();
 assert.deepEqual(materializeTerminalTransportDetailed(reversed,[]),result);
});
test('19 with min=max=3 has a precise arithmetic failure without spending a search branch',()=>{
 const problem=fixture(19,3);let branches=0;
 const result=materializeTerminalTransportDetailed(problem,[],[],{consumeFallbackBranch:()=>{branches++;return true;}});
 assert.equal(result.status,'INFEASIBLE');assert.equal(branches,0);
 assert.deepEqual(result.evidence.directions[0].hardPartitionFailure,{reasonCode:'GROUP_CARDINALITY_PARTITION_IMPOSSIBLE',count:19,minimumGroupSize:3,maximumGroupSize:3});
});
test('invalid min>max is configuration; target outside bounds remains soft',()=>{
 const problem=fixture(3,3,2);assert.ok(preflight(problem).includes('INVALID_TRANSPORT_POLICY'));
 problem.transportPolicy!.departure.minimumGroupSize=1;problem.transportPolicy!.arrival.minimumGroupSize=1;problem.transportPolicy!.arrival.targetGroupSize=7;
 assert.ok(!preflight(problem).includes('INVALID_TRANSPORT_POLICY'));
 assert.equal(materializeTerminalTransportDetailed(problem,[]).status,'FEASIBLE');
});
for(const count of [1,4,6])test(`OUT min1 target1 max6 permits a synchronized group of ${count}`,()=>{
 const problem=fixture(count,1,6,'departure');problem.transportPolicy!.departure.targetGroupSize=1;
 assert.equal(validateTransportGrouping(problem,problem.tasks.map(t=>place(t))).violationCount,0);
 const result=materializeTerminalTransportDetailed(problem,[]);assert.equal(result.status,'FEASIBLE');
 assert.equal(validateTransportGrouping(problem,result.scheduled!).violationCount,0);
 assert.ok(result.scheduled!.every(t=>t.start===0),'target does not artificially serialize simultaneous compatible OUT');
});
test('OUT min2 target1 never creates or accepts a single',()=>{
 const problem=fixture(5,2,6,'departure');problem.transportPolicy!.departure.targetGroupSize=1;
 const result=materializeTerminalTransportDetailed(problem,[]);assert.equal(result.status,'FEASIBLE');
 assert.equal(validateTransportGrouping(problem,result.scheduled!).violationCount,0);
 assert.ok(validateTransportGrouping(problem,result.scheduled!).groupsByDirection.departure.every(group=>group.length>=2));
 assert.ok(validateTransportGrouping(problem,problem.tasks.map((t,i)=>place(t,i===0?0:30))).violationCount>0);
});
test('same start/different ends cannot split cardinality or synchronization, including zero gap',()=>{
 const problem=fixture(4);problem.tasks[3].duration=10;
 const scheduled=problem.tasks.map(t=>place(t));
 const report=validateTransportGrouping(problem,scheduled);
 assert.equal(report.groupsByDirection.arrival.length,1);
 assert.deepEqual(report.violations.map(v=>v.dimensions.kind),['GROUP_SIZE','GROUP_SYNCHRONIZATION']);
 for(const violation of report.violations)assert.deepEqual(violation.affectedTaskIds,problem.tasks.map(t=>t.id));
 assert.deepEqual(validateTransportGrouping(problem,[...scheduled].reverse()),report);
 const certified=validateCertifiedArrivalSchedule(problem,[],scheduled);
 assert.equal(certified.rejectCause,'ARRIVAL_GROUP_SIZE_INVALID');
});
test('30 minute separation applies to starts; 45 is legal and 20 is not',()=>{
 const problem=fixture(2);problem.transportPolicy!.arrival.minGapMinutes=30;
 assert.equal(validateTransportGrouping(problem,problem.tasks.map((t,i)=>place(t,i*45))).violationCount,0);
 const bad=validateTransportGrouping(problem,problem.tasks.map((t,i)=>place(t,i*20)));
 assert.deepEqual(bad.violations.map(v=>v.dimensions.kind),['GROUP_GAP']);
});
test('pending residual can complete an existing protected packet without moving it',()=>{
 const problem=fixture(3,2);problem.transportPolicy!.arrival.minGapMinutes=30;
 const fixed=problem.tasks.slice(0,2).map(t=>place(t,10));
 const before=structuredClone({problem,fixed});
 const result=materializeTerminalTransportDetailed(problem,fixed);
 assert.equal(result.status,'FEASIBLE');assert.equal(result.scheduled!.length,1);assert.equal(result.scheduled![0].start,10);
 assert.equal(validateTransportGrouping(problem,[...fixed,...result.scheduled!]).violationCount,0);
 assert.deepEqual({problem,fixed},before);
});
test('heterogeneous durations and disjoint windows use exact alternatives or a supported impossibility',()=>{
 const problem=fixture(4,2);problem.tasks[0].duration=10;problem.tasks[2].duration=10;
 problem.tasks.forEach(t=>t.availability=[{start:t.duration===10?0:20,end:t.duration===10?10:25}]);
 const result=materializeTerminalTransportDetailed(problem,[]);assert.equal(result.status,'FEASIBLE');
 assert.equal(validateTransportGrouping(problem,result.scheduled!).violationCount,0);
 const impossible=structuredClone(problem);impossible.tasks[2].availability=[{start:30,end:40}];
 assert.equal(materializeTerminalTransportDetailed(impossible,[]).status,'INFEASIBLE');
});
test('product adapter carries independent minima, targets, maxima, gaps, and historical compatibility',()=>{
 const input=buildCanonicalFullA2EngineInput().input;
 input.arrivalMinimumGroupSize=2;input.departureMinimumGroupSize=2;
 input.departureGroupingTarget=1;input.transportSettings!.departureTargetGroupSize=1;
 const result=adaptEngineInputToPlannerNextProblem(input);assert.equal(result.status,'SUPPORTED');
 if(result.status!=='SUPPORTED')return;
 assert.equal(result.problem.transportPolicy!.arrival.minimumGroupSize,2);
 assert.equal(result.problem.transportPolicy!.arrival.targetGroupSize,3);
 assert.equal(result.problem.transportPolicy!.departure.minimumGroupSize,2);
 assert.equal(result.problem.transportPolicy!.departure.targetGroupSize,1);
 delete input.arrivalMinimumGroupSize;delete input.departureMinimumGroupSize;
 const historical=adaptEngineInputToPlannerNextProblem(input);assert.equal(historical.status,'SUPPORTED');
 if(historical.status==='SUPPORTED')assert.equal(historical.problem.transportPolicy!.arrival.minimumGroupSize,1);
 input.arrivalMinimumGroupSize=4;
 assert.equal(adaptEngineInputToPlannerNextProblem(input).status,'UNSUPPORTED');
});

test('cold exact construction reports cardinality impossibility before core search; manual adaptation remains available',async()=>{
 const {executePlannerNext}=await import('./executePlannerNext');
 const {buildCanonicalA2AssistedStage1Fixture}=await import('./benchmarks/canonicalA2AssistedStage1Fixture');
 const fixture=buildCanonicalA2AssistedStage1Fixture();fixture.input.arrivalMinimumGroupSize=3;
 assert.equal(adaptEngineInputToPlannerNextProblem(fixture.input).status,'SUPPORTED','manual checker must still be able to report/accept material HARD violations');
 fixture.assisted.problem.transportPolicy!.arrival.minimumGroupSize=3;
 const result=executePlannerNext(fixture.assisted.problem);
 assert.equal(result.kind,'EXACT_CONSTRUCTIVE');if(result.kind!=='EXACT_CONSTRUCTIVE')return;
 assert.equal(result.result.status,'INFEASIBLE');assert.equal(result.result.evidence.branchesExplored,0);
 assert.deepEqual(result.result.evidence.reasonCodes,['TRANSPORT_GROUP_CARDINALITY_PARTITION_IMPOSSIBLE']);
 assert.equal(result.result.evidence.transportPartitionFailures![0].count,19);
});

test('terminal completion can preserve an existing protected size violation without introducing another one',()=>{
 const problem=fixture(5,1,3);problem.transportPolicy!.arrival.minGapMinutes=30;
 const fixed=problem.tasks.slice(0,4).map(t=>place(t,0));
 const original=validateTransportGrouping(problem,fixed).violations.filter(v=>v.dimensions.kind==='GROUP_SIZE');
 const result=materializeTerminalTransportDetailed(problem,fixed);
 assert.equal(result.status,'FEASIBLE');assert.equal(result.scheduled!.length,1);assert.equal(result.scheduled![0].start,30);
 const violations=validateTransportGrouping(problem,[...fixed,...result.scheduled!]).violations;
 assert.deepEqual(violations,original,'final validation still reports exactly the protected HARD; only the existing AcceptedException gate can authorize it');
});
