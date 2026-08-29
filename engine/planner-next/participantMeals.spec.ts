import assert from "node:assert/strict";
import test from "node:test";
import type { ParticipantMealObligation, PlannerNextProblem, ScheduledTask } from "./contracts";
import { assessParticipantMealFutureFeasibility, participantMealCandidates, probeParticipantMealFutureFeasibility, scheduleParticipantMeals } from "./participantMeals";
import { executePlannerNext } from "./executePlannerNext";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { preflight, validatePlan } from "./validate";
import { participantMealBacktrackingScenario } from "./scenarios/participantMealBacktrackingScenario";

const problem = (meals: ParticipantMealObligation[], capacity: number): PlannerNextProblem => ({
  day:{start:480,end:1080},protectedMeal:{start:720,end:750},spaces:[{id:"s",availability:[{start:480,end:1080}]}],resources:[],coaches:[],
  participants:[...new Set(meals.map(m=>m.participantId))].map(id=>({id,availability:[{start:480,end:1080}]})),tasks:[],
  mainFlow:{spaceId:"s",preferredEnd:720,continuity:"REQUIRED",maxBlocksByKey:2,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
  budget:{bestK:3,maxBacktracks:50,maxPatterns:50,maxBranchExpansions:500},participantMeals:meals,participantMealCapacity:{maxSimultaneous:capacity},
});

test("constructive policies reject the first productive slot and retain the meal-feasible alternative",()=>{
 for(const policy of ["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"] as const){const source=participantMealBacktrackingScenario(policy),result=executePlannerNext(source).result!;assert.equal(result.complete,true);assert.equal(result.scheduledTasks.find(x=>x.id==="flexible-productive")?.start,960);assert.equal(result.scheduledParticipantMeals?.[0]?.start,780);if("metrics" in result){assert.ok(result.metrics.futureInfeasibleCandidatesPruned>0);assert.ok(result.metrics.participantMealBranchesExplored!>0);}else{assert.ok(result.evidence.standaloneBacktracks>0||result.evidence.standaloneForwardPrunes>0);assert.ok(result.evidence.branchesExplored>0);}assert.equal(validatePlan(source,result.scheduledTasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals).hardValid,true);}
});

test("shared meal budget never exceeds remaining allowance and reports atomic exhaustion",()=>{const source=problem([meal("1","p1"),meal("2","p2"),meal("3","p3")],1),budget={remaining:2};const result=assessParticipantMealFutureFeasibility(source,[],budget,"MATERIALIZE");assert.equal(result.complete,false);assert.equal(result.branchesExplored,2);assert.equal(budget.remaining,0);assert.ok(result.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED"));assert.deepEqual(result.scheduled,[]);});

test("validation never searches and rejects omitted published meals",()=>{const source=problem([meal("1","p1")],1);assert.equal(validatePlan(source,[],[],[],[]).hardValid,false);assert.ok(validatePlan(source,[],[],[],[]).reasonCodes.includes("PARTICIPANT_MEAL_VIOLATION"));});

test("a flexible-window problem without a global break still requires its individual meal",()=>{const source=problem([meal("1","p1")],1);delete source.protectedMeal;assert.deepEqual(preflight(source),[]);const validation=validatePlan(source,[],[],[],[]);assert.equal(validation.hardValid,false);assert.ok(validation.reasonCodes.includes("PARTICIPANT_MEAL_VIOLATION"));});

test("joint infeasibility publishes no structural or meal partials under either policy",()=>{for(const policy of ["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"] as const){const source=mainFlowVocalScenario();source.searchPolicy=policy;source.budget={bestK:20,maxBacktracks:10000,maxPatterns:10000,maxBranchExpansions:300000};source.participantMeals=[meal("1","participant-c",{start:780,end:825}),meal("2","participant-d",{start:780,end:825}),meal("3","participant-e",{start:780,end:825})];source.participantMealCapacity={maxSimultaneous:2};const result=executePlannerNext(source).result!;assert.equal(result.complete,false);assert.deepEqual(result.scheduledTasks,[]);assert.deepEqual(result.scheduledSpaceMeals,[]);assert.deepEqual(result.scheduledParticipantMeals,[]);if("scheduledSetupPreparations" in result)assert.deepEqual(result.scheduledSetupPreparations,[]);}});

test("direct preflight enforces protected state and canonical grid",()=>{const protectedMissing=problem([{...meal("1","p1"),status:"done"}],1);assert.ok(validatePlan(protectedMissing,[]).reasonCodes.includes("PARTICIPANT_MEAL_VIOLATION"));assert.ok(preflight(protectedMissing).includes("PROTECTED_PARTICIPANT_MEAL_WITHOUT_FIXED_INTERVAL"));const offGrid=problem([{...meal("1","p1"),duration:31,window:{start:781,end:900}}],1);assert.ok(preflight(offGrid).includes("INVALID_PARTICIPANT_MEAL_OBLIGATION"));});
const meal=(id:string,participantId:string,window={start:780,end:960},duration=45):ParticipantMealObligation=>({id:`meal:${id}`,sourceTaskId:`task:${id}`,participantId,duration,window,status:"pending"});

test("joint witness schedules every meal once, respects capacity, and is deterministic",()=>{
  const source=problem([meal("1","p1"),meal("2","p2"),meal("3","p3")],2);const before=structuredClone(source);
  const first=scheduleParticipantMeals(source,[],500),second=scheduleParticipantMeals(source,[],500);
  assert.equal(first.complete,true);assert.equal(first.scheduled.length,3);assert.ok(first.maximumSimultaneous<=2);assert.deepEqual(first,second);assert.deepEqual(source,before);
  assert.ok(first.scheduled.every(x=>x.end-x.start===45));
});

test("joint witness rejects capacity collision although every meal has an individual candidate",()=>{
  const obligations=[meal("1","p1",{start:780,end:825}),meal("2","p2",{start:780,end:825}),meal("3","p3",{start:780,end:825})];
  const source=problem(obligations,2);
  assert.ok(obligations.every(item=>participantMealCandidates(source,item,[],[]).length===1));
  const result=scheduleParticipantMeals(source,[],500);assert.equal(result.complete,false);assert.deepEqual(result.scheduled,[]);assert.ok(result.reasonCodes.includes("PARTICIPANT_MEALS_JOINTLY_INFEASIBLE"));
});

test("cheap probe soundly prunes a zero individual domain",()=>{
  const source=problem([meal("1","p1",{start:780,end:820},40)],2);
  const tasks=[{id:"busy",kind:"auxiliary",participantId:"p1",spaceId:"s",duration:40,dependencies:[],start:780,end:820}] as ScheduledTask[];
  const probe=probeParticipantMealFutureFeasibility(source,tasks,tasks);
  assert.equal(probe.feasible,false);assert.equal(probe.affectedObligationsChecked,1);assert.equal(probe.zeroDomainPrunes,1);
});

test("cheap probe analytically prunes collective capacity overload",()=>{
  const source=problem([meal("1","p1",{start:780,end:820},40),meal("2","p2",{start:780,end:820},40),meal("3","p3",{start:780,end:820},40)],2);
  const probe=probeParticipantMealFutureFeasibility(source,[]);
  assert.equal(probe.feasible,false);assert.equal(probe.zeroDomainPrunes,0);assert.equal(probe.analyticCollectivePrunes,1);
});

test("inconclusive cheap probe never substitutes for exact joint search",()=>{
  const source=problem([meal("1","p1",{start:780,end:860},40),meal("2","p2",{start:780,end:860},40),meal("3","p3",{start:780,end:860},40)],2);
  const probe=probeParticipantMealFutureFeasibility(source,[]), exact=scheduleParticipantMeals(source,[],500);
  assert.equal(probe.feasible,true);assert.equal(probe.analyticCollectivePrunes,0);assert.equal(exact.complete,true);assert.ok(exact.branchesExplored>0);
});

test("cheap and exact meal authorities honor variable duration and capacity",()=>{
  const source=problem([meal("1","p1",{start:780,end:840},30),meal("2","p2",{start:780,end:840},30)],1);
  const probe=probeParticipantMealFutureFeasibility(source,[]), exact=scheduleParticipantMeals(source,[],500);
  assert.equal(probe.feasible,true);assert.equal(exact.complete,true);assert.ok(exact.scheduled.every(x=>x.duration===30));assert.equal(exact.maximumSimultaneous,1);
});

test("meals occupy only their participant and exact boundaries remain valid",()=>{
  const obligation=meal("1","p1",{start:780,end:900},45);const source=problem([obligation],1);
  const tasks=[{id:"before",kind:"auxiliary",participantId:"p1",spaceId:"s",duration:30,dependencies:[],start:750,end:780},{id:"other",kind:"auxiliary",participantId:"p2",spaceId:"s",duration:45,dependencies:[],start:780,end:825}] as ScheduledTask[];
  source.participants.push({id:"p2",availability:[{start:480,end:1080}]});
  const candidates=participantMealCandidates(source,obligation,tasks,[]);assert.equal(candidates[0]?.start,780);assert.ok(candidates.length>0);
});

test("both search policies publish a complete hard-valid participant meal result",()=>{
  for(const policy of ["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"] as const){const source=mainFlowVocalScenario();source.searchPolicy=policy;source.budget={bestK:20,maxBacktracks:10000,maxPatterns:10000,maxBranchExpansions:300000};source.participantMeals=[meal("source","participant-c",{start:780,end:900},45)];source.participantMealCapacity={maxSimultaneous:1};const execution=executePlannerNext(source);assert.ok(execution.result?.complete);const result=execution.result!;assert.equal(result.scheduledParticipantMeals?.length,1);const validation=validatePlan(source,result.scheduledTasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals);assert.equal(validation.hardValid,true,validation.reasonCodes.join(","));}
});
