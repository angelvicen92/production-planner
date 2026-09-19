import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParticipantTask, PlannerNextProblem } from "./contracts";
import { buildAnonymousPipelineWitness } from "./anonymousPipelineWitness";

const windows=[{start:0,end:300}];
function problem(keys:string[]=["A"], coachIds:string[]=["coach-a"]):PlannerNextProblem{
  const tasks:ParticipantTask[]=[];
  keys.forEach((blockKey,i)=>{const participantId=`p${i}`,coachId=coachIds[i]??coachIds[0]!;
    tasks.push(
      {id:`in${i}`,kind:"auxiliary",participantId,duration:10,spaceId:"in",dependencies:[]},
      {id:`style${i}`,kind:"auxiliary",participantId,duration:10,spaceId:"style",dependencies:[`in${i}`]},
      {id:`feed${i}`,kind:"vocal",participantId,coachId,duration:15,spaceId:`car-${coachId}`,dependencies:[`in${i}`]},
      {id:`main${i}`,kind:"main",participantId,coachId,blockKey,duration:15,spaceId:"main",dependencies:[`feed${i}`,`style${i}`]},
    );
  });
  return {day:{start:0,end:300},spaces:["in","style","main",...new Set(coachIds.map(x=>`car-${x}`))].map(id=>({id,availability:windows})),
    resources:[],participants:keys.map((_,i)=>({id:`p${i}`,availability:windows})),coaches:[...new Set(coachIds)].map(id=>({id,availability:windows})),tasks,
    mainFlow:{spaceId:"main",preferredEnd:240,continuity:"REQUIRED",maxBlocksByKey:4,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
    budget:{bestK:1,maxBacktracks:100,maxPatterns:100,maxBranchExpansions:100},transportPolicy:{arrival:{taskIds:keys.map((_,i)=>`in${i}`),minimumGroupSize:1,maximumGroupSize:3,minGapMinutes:0,groupingWeight:1},departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:3,minGapMinutes:0,groupingWeight:1}}};
}
function anchor(p:PlannerNextProblem,index:number,unit="unit"){
  const main=p.tasks.find(t=>t.id===`main${index}`)!;main.itinerantUnitId=unit;
  const before={...main,id:`before${index}`,kind:"auxiliary" as const,coachId:undefined,blockKey:undefined,duration:15,spaceId:"reality",dependencies:[]};
  const after={...before,id:`after${index}`};p.tasks.push(before,after);if(!p.spaces.some(s=>s.id==="reality"))p.spaces.push({id:"reality",availability:windows});
  p.itinerantUnits??=[];if(!p.itinerantUnits.some(x=>x.id===unit))p.itinerantUnits.push({id:unit,availability:windows});
  p.anchoredAccompaniments??=[];p.anchoredAccompaniments.push({id:`op${index}`,anchorTaskId:main.id,beforeTaskIds:[before.id],afterTaskIds:[after.id],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED",itinerantUnitId:unit});
}

describe("anonymous structural pipeline witness",()=>{
  it("rejects a bare valid Main when its 15+15+15 anchor does not fit, then accepts a shifted operation",()=>{
    const p=problem();anchor(p,0);p.itinerantUnits![0]!.availability=[{start:185,end:240}];
    assert.notEqual(buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[185]}).status,"FEASIBLE");
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});assert.equal(witness.status,"FEASIBLE");
    assert.deepEqual(witness.anchoredOperationSpots.map(x=>[x.start,x.end]),[[185,230]]);
  });

  it("keeps separate feeder cohorts for separate runs of the same coach",()=>{
    const p=problem(["A","B","A"],["coach-a","coach-b","coach-a"]);p.day.start=40;p.spaces.filter(s=>s.id.startsWith("car-")).forEach(s=>s.availability=[{start:70,end:260}]);p.coaches.forEach(x=>x.availability=[{start:70,end:260}]);
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","B","A"],slots:[100,150,200]});assert.equal(witness.status,"FEASIBLE");
    assert.equal(new Set(witness.feederSpots.map(x=>x.feederRunId)).size,3);assert.ok(witness.feederSpots.some(x=>x.coachKey==="coach-a"&&x.start>=115));
  });

  it("proves infeasible when a feeder cohort cannot clear its route transition",()=>{
    const p=problem();p.day.start=80;p.spaces.forEach(s=>s.availability=[{start:80,end:300}]);p.participants[0]!.availability=[{start:80,end:300}];p.coaches[0]!.availability=[{start:80,end:300}];
    p.coachRouteTransitions=[{coachId:"coach-a",fromSpaceId:"car-coach-a",toSpaceId:"main",minutes:20}];
    assert.equal(buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[100]}).status,"INFEASIBLE");
  });

  it("enforces itinerant-unit and participant exclusivity across anchored operations",()=>{
    const p=problem(["A","B"],["coach-a","coach-b"]);anchor(p,0);anchor(p,1);
    assert.equal(buildAnonymousPipelineWitness(p,{pattern:["A","B"],slots:[100,115]}).status,"INFEASIBLE");
    const single=problem();anchor(single,0);single.tasks.find(t=>t.id==="style0")!.availability=[{start:90,end:100}];
    assert.notEqual(buildAnonymousPipelineWitness(single,{pattern:["A"],slots:[100]}).status,"FEASIBLE");
  });

  it("is deterministic, nominal-order invariant, and input immutable",()=>{
    const p=problem();anchor(p,0);const before=JSON.stringify(p),a=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});
    const b=buildAnonymousPipelineWitness({...p,tasks:[...p.tasks].reverse(),participants:p.participants.map(x=>({...x,id:`renamed-${x.id}`})),
      tasks:[...p.tasks].reverse().map(t=>({...t,participantId:`renamed-${t.participantId}`}))} as PlannerNextProblem,{pattern:["A"],slots:[200]});
    assert.equal(a.status,"FEASIBLE");assert.equal(a.fingerprint,b.fingerprint);assert.equal(JSON.stringify(p),before);
  });

  it("reports read-only phase and boundary diagnostics without changing the witness",()=>{
    const p=problem();anchor(p,0);let diagnostic:Parameters<NonNullable<Parameters<typeof buildAnonymousPipelineWitness>[2]>>[0]|undefined;
    const without=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});
    const withDiagnostic=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]},value=>{diagnostic=value;});
    assert.deepEqual(withDiagnostic,without);assert.ok(diagnostic);
    assert.equal(diagnostic.mainMatchingCompleted,true);assert.equal(diagnostic.anchorsCompleted,true);
    assert.equal(diagnostic.feederGeometryCompleted,true);assert.equal(diagnostic.stylingGeometryCompleted,true);
    assert.equal(diagnostic.arrivalSolverExecuted,true);assert.equal(diagnostic.mainRuns.length,1);
    assert.ok((diagnostic.feederRuns[0]?.candidateStartBoundaryCount??0)>0);
    assert.deepEqual(diagnostic.anchoredOperationIntervals.map(x=>[x.start,x.end]),[[185,230]]);
  });
});
