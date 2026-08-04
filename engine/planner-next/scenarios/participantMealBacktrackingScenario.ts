import type { PlannerNextProblem } from "../contracts";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

export function participantMealBacktrackingScenario(policy: PlannerNextProblem["searchPolicy"]): PlannerNextProblem {
  const problem=mainFlowVocalScenario();problem.searchPolicy=policy;problem.budget={bestK:20,maxBacktracks:10_000,maxPatterns:10_000,maxBranchExpansions:300_000};
  problem.spaces.push({id:"flex-space",availability:[{start:540,end:1020}]});
  problem.participants.push({id:"meal-participant",availability:[{start:780,end:1020}]});
  problem.tasks.push({id:"flexible-productive",kind:"auxiliary",participantId:"meal-participant",spaceId:"flex-space",duration:30,dependencies:[],availability:[{start:780,end:810},{start:960,end:990}]});
  problem.auxiliaryPolicy={participantPresencePreference:"OFF"};
  problem.participantMeals=[{id:"participant-meal:flex",sourceTaskId:"task:meal-flex",participantId:"meal-participant",duration:30,window:{start:780,end:810},status:"pending"}];
  problem.participantMealCapacity={maxSimultaneous:1};return problem;
}
