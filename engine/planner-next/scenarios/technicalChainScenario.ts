import type { Task } from "../contracts";
import { technicalOperationScenario } from "./technicalOperationScenario";
import { hm } from "../time";

export function technicalChainScenario() {
  const problem=technicalOperationScenario();
  problem.resources.push({id:"technical-chain-unit",availability:[{start:hm("09:00"),end:hm("09:45")}],presencePreference:"HIGH",transitionMinutes:5});
  problem.spaces.push({id:"technical-chain-room-a",availability:[{start:hm("09:00"),end:hm("09:30")}]},{id:"technical-chain-room-b",availability:[{start:hm("09:30"),end:hm("09:45")}]});
  const tasks:Task[]=[
    {id:"technical-chain-positioning",kind:"technical",duration:20,spaceId:"technical-chain-room-a",dependencies:[],requiredResourceIds:["technical-chain-unit"]},
    {id:"technical-chain-camera-test",kind:"technical",duration:15,spaceId:"technical-chain-room-b",dependencies:["technical-chain-positioning"],requiredResourceIds:["technical-chain-unit"]},
  ];
  problem.tasks.push(...tasks);return problem;
}
