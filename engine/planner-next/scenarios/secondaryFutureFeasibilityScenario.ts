import type { PlannerNextProblem, Task } from "../contracts";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";
import { hm } from "../time";

/** NEXT-007 changes search pruning only; every item remains an ordinary auxiliary task. */
export function secondaryFutureFeasibilityScenario(): PlannerNextProblem {
  const problem = mainFlowVocalScenario();
  const all = [{...problem.day}];
  problem.spaces.push(
    {id:"constrained-block-room",availability:all,secondaryContinuity:"REQUIRED"},
    {id:"scarce-task-room",availability:[{start:hm("12:20"),end:hm("13:00")}]}, {id:"flexible-room",availability:all},
  );
  problem.resources.push({id:"future-critical-resource",availability:all,presencePreference:"HIGH"});
  const blockParticipants=["participant-c","participant-d","participant-e","participant-f"];
  const auxiliary: Task[] = blockParticipants.map((participantId,index)=>({id:`long-block-${index+1}`,kind:"auxiliary",participantId,duration:30,spaceId:"constrained-block-room",dependencies:[],requiredResourceIds:["future-critical-resource"]}));
  auxiliary.push(
    {id:"scarce-window-task",kind:"auxiliary",participantId:"participant-g",duration:15,spaceId:"scarce-task-room",dependencies:[],requiredResourceIds:["future-critical-resource"]},
    {id:"flexible-short-task",kind:"auxiliary",participantId:"participant-h",duration:5,spaceId:"flexible-room",dependencies:[]},
  );
  problem.tasks.push(...auxiliary); problem.auxiliaryPolicy={participantPresencePreference:"HIGH"};
  problem.budget={...problem.budget,bestK:1,maxBranchExpansions:800_000};
  return problem;
}
