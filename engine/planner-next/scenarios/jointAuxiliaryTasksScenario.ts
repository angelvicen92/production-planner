import type { PlannerNextProblem, Task } from "../contracts";
import { hm } from "../time";
import { setupPreparationScenario } from "./setupPreparationScenario";

export function jointAuxiliaryTasksScenario():PlannerNextProblem {
  const problem=setupPreparationScenario();
  const window=[{start:hm("09:30"),end:hm("10:30")}];
  problem.spaces.push({id:"joint-room",availability:window});
  problem.resources.push({id:"joint-resource",availability:window,presencePreference:"HIGH"});
  const tasks:Task[]=[
    {id:"z-joint-member-1",kind:"auxiliary",participantId:"participant-z",duration:20,spaceId:"joint-room",requiredResourceIds:["joint-resource"],dependencies:[],jointGroupId:"shared-operation-1"},
    {id:"a-joint-member-2",kind:"auxiliary",participantId:"participant-c",duration:20,spaceId:"joint-room",requiredResourceIds:["joint-resource"],dependencies:[],jointGroupId:"shared-operation-1"},
  ];
  problem.tasks.push(...tasks);
  return problem;
}
