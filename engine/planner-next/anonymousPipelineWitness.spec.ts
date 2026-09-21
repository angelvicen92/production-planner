import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParticipantTask, PlannerNextProblem } from "./contracts";
import { buildAnonymousPipelineWitness, materializeNominalPipelineWitness, materializePipelineBundleMatching } from "./anonymousPipelineWitness";
import { validatePlan } from "./validate";

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
    let diagnostic:Parameters<NonNullable<Parameters<typeof buildAnonymousPipelineWitness>[2]>>[0]|undefined;
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","B","A"],slots:[100,150,200]},value=>{diagnostic=value;});assert.equal(witness.status,"FEASIBLE");
    assert.equal(new Set(witness.feederSpots.map(x=>x.feederRunId)).size,3);assert.ok(witness.feederSpots.some(x=>x.coachKey==="coach-a"&&x.start>=115));
    assert.ok((diagnostic?.feederRuns[2]?.exactDomainIntervalCount??0)>(diagnostic?.feederRuns[0]?.exactDomainIntervalCount??0));
  });

  it("finds a feasible start exposed only by an exact participant-domain boundary",()=>{
    const p=problem();p.tasks.find(t=>t.id==="feed0")!.availability=[{start:83,end:98}];
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[120]});
    assert.equal(witness.status,"FEASIBLE");assert.equal(witness.feederSpots[0]?.start,83);
  });

  it("allows another-space feeder work during the Main-space meal but keeps an independent coach meal hard",()=>{
    const p=problem();
    p.operationalMealPolicies=[{id:"main-meal",window:{start:120,end:180},duration:60,resourceIds:[],spaceIds:["main"]},
      {id:"coach-meal",window:{start:120,end:180},duration:45,resourceIds:["coach-a"],spaceIds:[]}];
    p.tasks.find(t=>t.id==="feed0")!.availability=[{start:130,end:145}];
    const duringMainMeal=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});
    assert.equal(duringMainMeal.status,"INFEASIBLE");
    assert.equal(duringMainMeal.reason,"OPERATIONAL_MEAL_FUTURE_INFEASIBLE");
    p.tasks.find(t=>t.id==="feed0")!.availability=[{start:60,end:75}];
    const shifted=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});
    assert.equal(shifted.status,"FEASIBLE",shifted.reason);
  });

  it("rejects a pipeline that removes the only participant-meal domain",()=>{
    const p=problem();p.participantMealCapacity={maxSimultaneous:1};
    p.participantMeals=[{id:"meal",sourceTaskId:"sodexo",participantId:"p0",duration:15,
      window:{start:180,end:195},status:"pending"}];
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[180]});
    assert.equal(witness.status,"INFEASIBLE");assert.equal(witness.reason,"PARTICIPANT_MEAL_FUTURE_INFEASIBLE");
  });

  it("uses perfect matching to exchange equivalent feeders between ordinals",()=>{
    const p=problem(["A","A"]);p.tasks.find(t=>t.id==="feed0")!.availability=[{start:40,end:55}];
    p.tasks.find(t=>t.id==="feed1")!.availability=[{start:40,end:70}];
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","A"],slots:[120,135]});
    assert.equal(witness.status,"FEASIBLE",witness.reason);
    assert.equal(witness.feederSpots.find(spot=>spot.start===55)?.tokenId,
      witness.assignments.find(item=>item.mainSpotId==="main:0")?.tokenId);
  });

  it("returns an exact infeasible result when no block start has a perfect matching",()=>{
    const p=problem(["A","A"]);p.tasks.filter(t=>t.kind==="vocal").forEach(t=>t.availability=[{start:0,end:15}]);
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","A"],slots:[45,60]});
    assert.equal(witness.status,"INFEASIBLE");assert.equal(witness.reason,"FEEDER_RUN_GEOMETRY");
  });

  it("splits exact coach domains at an intermediate fixed Main",()=>{
    const p=problem(["A","B","A"],["coach-a","coach-b","coach-a"]);
    let diagnostic:Parameters<NonNullable<Parameters<typeof buildAnonymousPipelineWitness>[2]>>[0]|undefined;
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","B","A"],slots:[60,120,180]},value=>{diagnostic=value;});
    assert.equal(witness.status,"FEASIBLE");assert.ok((diagnostic?.feederRuns[2]?.exactDomainIntervalCount??0)>1);
  });

  it("reports unsupported feeder-to-feeder dependencies as inconclusive",()=>{
    const p=problem(["A","A"]);p.tasks.find(t=>t.id==="feed1")!.dependencies.push("feed0");
    const witness=buildAnonymousPipelineWitness(p,{pattern:["A","A"],slots:[100,115]});
    assert.equal(witness.status,"INCONCLUSIVE");assert.equal(witness.reason,"UNSUPPORTED_FEEDER_RUN_DEPENDENCY");
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

  it("uses canonical participant transitions at the Styling/anchored-operation boundary",()=>{
    const p=problem();anchor(p,0);p.participantTransitionMinutes=5;
    const styling=p.tasks.find(t=>t.id==="style0")!;
    p.tasks.find(t=>t.id==="feed0")!.availability=[{start:100,end:115}];
    styling.availability=[{start:175,end:185}];
    const adjacent=materializeNominalPipelineWitness(p,{pattern:["A"],slots:[200]});
    assert.notEqual(adjacent.witness.status,"FEASIBLE");

    styling.availability=[{start:170,end:180}];
    const separated=materializeNominalPipelineWitness(p,{pattern:["A"],slots:[200]});
    assert.equal(separated.witness.status,"FEASIBLE",separated.witness.reason);
    const operation=separated.scheduledTasks.filter(t=>["before0","main0","after0"].includes(t.id)).sort((a,b)=>a.start-b.start);
    assert.deepEqual(operation.map((task,index)=>index===0?null:task.start-operation[index-1]!.end),[null,0,0]);
    const validation=validatePlan(p,[...separated.scheduledTasks]);
    assert.equal(validation.reasonCodes.includes("TRANSITION_VIOLATION"),false,
      JSON.stringify(validation.violations.filter(v=>v.ruleCode==="TRANSITION_VIOLATION")));
  });

  it("is deterministic, nominal-order invariant, and input immutable",()=>{
    const p=problem();anchor(p,0);const before=JSON.stringify(p),a=buildAnonymousPipelineWitness(p,{pattern:["A"],slots:[200]});
    const b=buildAnonymousPipelineWitness({...p,tasks:[...p.tasks].reverse(),participants:p.participants.map(x=>({...x,id:`renamed-${x.id}`})),
      tasks:[...p.tasks].reverse().map(t=>({...t,participantId:`renamed-${t.participantId}`}))} as PlannerNextProblem,{pattern:["A"],slots:[200]});
    assert.equal(a.status,"FEASIBLE");assert.equal(a.fingerprint,b.fingerprint);assert.equal(JSON.stringify(p),before);
  });

  it("keeps nominal materialization internal to the anonymous deterministic certificate",()=>{
    const p=problem();anchor(p,0);const architecture={pattern:["A"],slots:[200]};
    const publicWitness=buildAnonymousPipelineWitness(p,architecture);
    const nominal=materializeNominalPipelineWitness(p,architecture);
    assert.deepEqual(nominal.witness,publicWitness);
    assert.equal(new Set(nominal.scheduledTasks.map(task=>task.id)).size,nominal.scheduledTasks.length);
    assert.ok(nominal.scheduledTasks.some(task=>task.id==="main0"));
    assert.equal(JSON.stringify(publicWitness).includes("main0"),false);
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

  it("repairs a nominal identity edge by rematerializing the complete participant bundle",()=>{
    const p=problem(["A","A"]);const architecture={pattern:["A","A"],slots:[180,195]};
    const first=materializePipelineBundleMatching(p,architecture);assert.ok(first);
    const [participantMain,position]=[...first.matching][0]!;
    const repaired=materializePipelineBundleMatching(p,architecture,[],new Set([`${participantMain}@${position}`]));
    assert.ok(repaired);assert.notEqual(repaired.matching.get(participantMain),position);
    const participant=p.tasks.find(task=>task.id===participantMain)!.participantId;
    const ids=p.tasks.filter(task=>task.participantId===participant).map(task=>task.id);
    const before=first.scheduledTasks.filter(task=>ids.includes(task.id)).map(task=>[task.kind,task.start]);
    const after=repaired.scheduledTasks.filter(task=>ids.includes(task.id)).map(task=>[task.kind,task.start]);
    assert.notDeepEqual(after,before);
    assert.equal(validatePlan(p,[...repaired.scheduledTasks]).hardValid,true);
    assert.equal(repaired.evidence.repairs,1);assert.equal(repaired.evidence.materializations,1);
  });

  it("keeps protected bundle placement and future-distinct identities separate",()=>{
    const p=problem(["A","A"]);p.analyticalFutureTechnicalChains=[
      {policy:{id:"future",orderedTaskIds:["future-0"],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[]},
        tasks:[{...p.tasks[0]!,id:"future-0",participantId:"p0",duration:25}]},
    ];
    const architecture={pattern:["A","A"],slots:[180,195]};
    const witness=buildAnonymousPipelineWitness(p,architecture);assert.equal(witness.profileCount,2);
    const initial=materializePipelineBundleMatching(p,architecture);assert.ok(initial);
    const fixed=initial.scheduledTasks.find(task=>task.id==="main0")!;
    const rematched=materializePipelineBundleMatching(p,architecture,[fixed]);assert.ok(rematched);
    assert.deepEqual(rematched.scheduledTasks.find(task=>task.id===fixed.id),fixed);
  });
});
