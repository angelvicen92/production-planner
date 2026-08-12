import type { PlannerNextProblem } from "../contracts";
import { resourceMealScenario } from "./resourceMealScenario";

export function itinerantUnitMealScenario(policy:"COMPATIBILITY_PRESERVING"|"EXACT_CONSTRUCTIVE"):PlannerNextProblem{
  const problem=resourceMealScenario(policy);delete problem.resourceMeals;
  problem.resources=[{id:"camera-7",availability:[{...problem.day}],presencePreference:"OFF",transitionMinutes:0},{id:"sound-7",availability:[{...problem.day}],presencePreference:"OFF",transitionMinutes:0},{id:"camera-8",availability:[{...problem.day}],presencePreference:"OFF",transitionMinutes:0},{id:"sound-8",availability:[{...problem.day}],presencePreference:"OFF",transitionMinutes:0}];
  problem.itinerantUnits=[{id:"itinerant-team:7",availability:[{...problem.day}]},{id:"itinerant-team:8",availability:[{...problem.day}]}];
  for(const task of problem.tasks){if(task.id==="resource-before"||task.id==="flexible-productive"){task.itinerantUnitId="itinerant-team:7";task.requiredResourceIds=["camera-7","sound-7"];}if(task.id==="other-during-meal"){task.itinerantUnitId="itinerant-team:8";task.requiredResourceIds=["camera-8","sound-8"];}}
  problem.itinerantUnitMeals=[{id:"unit-7-meal",itinerantUnitId:"itinerant-team:7",interval:{start:720,end:780}}];return problem;
}

/** Focused atomic-operation variant used without changing the production search. */
export function itinerantUnitMealAnchoredScenario():PlannerNextProblem{
  const problem=itinerantUnitMealScenario("COMPATIBILITY_PRESERVING"),anchor=problem.tasks.find(task=>task.kind==="main")!;anchor.itinerantUnitId="itinerant-team:7";anchor.requiredResourceIds=["camera-7","sound-7"];
  const before={...anchor,id:"unit-7-before",kind:"auxiliary" as const,duration:15,dependencies:[],blockKey:undefined,coachId:undefined},after={...before,id:"unit-7-after"};problem.tasks.push(before,after);problem.anchoredAccompaniments=[{id:"unit-7-operation",anchorTaskId:anchor.id,beforeTaskIds:[before.id],afterTaskIds:[after.id],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED",itinerantUnitId:"itinerant-team:7"}];return problem;
}
