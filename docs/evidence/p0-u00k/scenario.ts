import {readFileSync} from 'node:fs';
import type {EngineInput, TaskInput} from '../../../engine/types';

/** U00a's two real Main/Vocal pairs, enriched with explicit IN/preparation.
 * No times, assignments, locks or solution seeds are supplied to the search. */
export function scenario(root: string): EngineInput {
  const input: EngineInput = JSON.parse(readFileSync(`${root}/docs/evidence/p0-u00a/native/first-input.json`, 'utf8'));
  // This is a derived offline EngineInput, not a claim of new persisted snapshots.
  delete input.taskTemplateSnapshotFingerprint;delete input.taskTemplateSnapshotCount;delete input.taskTemplateSnapshotSources;
  delete input.optimizerSnapshotFingerprint;
  input.plannerNext!.mainFlow!.preferredEnd = '10:00';
  input.contestantAvailabilityById = {2:{start:'09:00',end:'10:30'},3:{start:'09:00',end:'10:30'},4:{start:'09:35',end:'10:05'}};
  input.planSpaceSettings![0] = {...input.planSpaceSettings![0], availabilityStart:'09:40',availabilityEnd:'10:00'};
  for (const [spaceId,name,start,end] of [
    [3,'Entrada','09:00','10:30'],[4,'Preparación independiente','09:00','10:30'],
    [5,'Operación crítica independiente','09:35','10:05'],
  ] as const) {
    input.planSpaceSettings!.push({spaceId,zoneId:1,name,availabilityStart:start,availabilityEnd:end,source:'diagnostic-hard-contract'});
    input.spaceIsExclusiveById![spaceId]=true;
    input.spaceParentById![spaceId]=null;
    input.spaceNameById![spaceId]=name;
    input.zoneIdBySpaceId![spaceId]=1;
    input.spaceIdsByZoneId![1].push(spaceId);
  }
  input.planResourceItems.push(...[101,102].map(id=>({id,resourceItemId:id+100,typeId:2,typeCode:'camera',
    name:id===101?'A':'B',isAvailable:true,availabilityStart:'09:00',availabilityEnd:'10:30'})));
  const task=(id:number,values:Partial<TaskInput>):TaskInput=>({id,planId:input.planId,templateId:id,status:'pending',
    zoneId:1,plannerNextKind:'auxiliary',operationalRole:'productive_task',durationOverrideMin:10,
    participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,dependsOnTaskIds:[],...values});
  for(const [participant,feeder,main,arrival,preparation] of [[2,3,4,10,11],[3,5,6,12,13]]) {
    input.tasks.push(task(arrival,{contestantId:participant,spaceId:3,operationalRole:'transport_arrival'}),
      task(preparation,{contestantId:participant,spaceId:4,dependsOnTaskIds:[arrival]}),
      task(arrival+20,{contestantId:participant,spaceId:3,operationalRole:'transport_departure',dependsOnTaskIds:[main]}));
    input.tasks.find(t=>t.id===feeder)!.dependsOnTaskIds=[arrival];
    input.tasks.find(t=>t.id===main)!.dependsOnTaskIds=[feeder,preparation];
  }
  input.tasks.push(task(20,{contestantId:4,spaceId:5,durationOverrideMin:30,resourceRequirements:{byItem:{201:1}}}));
  input.arrivalMinGapMinutes=0;input.departureMinGapMinutes=0;
  input.transportSettings={source:'engine-buildInput-optimizer-transport',arrivalMinimumGroupSize:1,arrivalMaximumGroupSize:2,arrivalMinGapMinutes:0,
    departureMinimumGroupSize:1,departureMaximumGroupSize:2,departureMinGapMinutes:0,groupingWeight:0};
  input.transportSpaceId=3;
  input.tasks.find(t=>t.id===4)!.resourceRequirements={byItem:{202:1}};
  return input;
}

export function counterfactual(input:EngineInput, mode:'B'|'A'|'anyOf'|'byType'):EngineInput {
  const result=structuredClone(input);
  result.tasks.find(t=>t.id===4)!.resourceRequirements=mode==='anyOf'?{anyOf:[{resourceItemIds:[201,202],quantity:1}]}:
    mode==='byType'?{byType:{2:1}}:{byItem:{[mode==='B'?202:201]:1}};
  return result;
}
