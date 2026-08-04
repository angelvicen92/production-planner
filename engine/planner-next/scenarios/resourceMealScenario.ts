import type {PlannerNextProblem,Task} from "../contracts";
import {participantMealBacktrackingScenario} from "./participantMealBacktrackingScenario";

/** Small productive fixture for the fixed resource-meal contract. */
export function resourceMealScenario(policy:"COMPATIBILITY_PRESERVING"|"EXACT_CONSTRUCTIVE"):PlannerNextProblem{
  const problem=participantMealBacktrackingScenario(policy);delete problem.participantMeals;delete problem.participantMealCapacity;
  problem.resources=[{id:"shared-r",availability:[{start:540,end:720},{start:780,end:1020}],presencePreference:"OFF",presenceConcentrationPolicy:"REQUIRED",transitionMinutes:0},{id:"other-r",availability:[{start:540,end:1020}],presencePreference:"OFF",transitionMinutes:0}];
  const flexible=problem.tasks.find(task=>task.id==="flexible-productive")!;flexible.requiredResourceIds=["shared-r"];flexible.availability=[{start:705,end:735},{start:780,end:810}];
  problem.participants.push({id:"before-participant",availability:[{start:690,end:720}]},{id:"other-participant",availability:[{start:735,end:765}]});
  problem.spaces.push({id:"before-space",availability:[{...problem.day}]},{id:"other-space",availability:[{...problem.day}]});
  const productive:Task[]=[{id:"resource-before",kind:"auxiliary",participantId:"before-participant",spaceId:"before-space",duration:30,dependencies:[],requiredResourceIds:["shared-r"],availability:[{start:690,end:720}]},{id:"other-during-meal",kind:"auxiliary",participantId:"other-participant",spaceId:"other-space",duration:30,dependencies:[],requiredResourceIds:["other-r"],availability:[{start:735,end:765}]}];problem.tasks.push(...productive);
  problem.resourceMeals=[{id:"resource-meal",sourceTaskId:"source-resource-meal",resourceIds:["shared-r"],interval:{start:720,end:780},status:"pending"}];return problem;
}
