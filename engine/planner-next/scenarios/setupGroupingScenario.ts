import type { PlannerNextProblem, Task } from "../contracts";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

export function setupGroupingScenario(): PlannerNextProblem {
  const problem=mainFlowVocalScenario(), all=[{...problem.day}];
  problem.spaces.push(
    {id:"setup-room",availability:all,secondaryContinuity:"REQUIRED",setupPolicy:{familyOrder:["family-a","family-b","family-c"],reentry:"FORBIDDEN"}},
    {id:"flexible-room",availability:all},
  );
  const flexible:Task[]=[
    {id:"flexible-task-2",kind:"auxiliary",participantId:"participant-z",duration:5,spaceId:"flexible-room",dependencies:[]},
    {id:"flexible-task-1",kind:"auxiliary",participantId:"participant-a",duration:5,spaceId:"flexible-room",dependencies:[]},
  ];
  const setup:Task[]=[
    {id:"a-family-c-task-1",kind:"auxiliary",participantId:"participant-g",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-c"},
    {id:"b-family-a-task-1",kind:"auxiliary",participantId:"participant-e",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-a"},
    {id:"c-family-b-task-1",kind:"auxiliary",participantId:"participant-c",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-b"},
    {id:"y-family-c-task-2",kind:"auxiliary",participantId:"participant-h",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-c"},
    {id:"x-family-a-task-2",kind:"auxiliary",participantId:"participant-f",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-a"},
    {id:"z-family-b-task-2",kind:"auxiliary",participantId:"participant-d",duration:15,spaceId:"setup-room",dependencies:[],setupFamilyId:"family-b"},
  ];
  problem.tasks.push(...flexible,...setup);
  problem.auxiliaryPolicy={participantPresencePreference:"HIGH"};
  problem.budget.maxBranchExpansions=300000;
  return problem;
}
