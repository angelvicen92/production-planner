import type { ParticipantTask, PlannerNextProblem } from "../contracts";

/** Two reusable secondary template families, independently released participants,
 * and an unrelated operation sharing one exclusive room. No canonical-day data. */
export function operationContinuityScenario(): PlannerNextProblem {
  const window = [{start:0,end:240}];
  const tasks: ParticipantTask[] = [];
  for(let i=0;i<3;i++) {
    tasks.push({id:`arrival-${i}`,kind:"auxiliary",participantId:`person-${i}`,duration:5,spaceId:"gate",dependencies:[]},
      {id:`preparation-${i}`,kind:"auxiliary",participantId:`person-${i}`,duration:10,spaceId:"shared-room",dependencies:[`arrival-${i}`], availability:[{start:10+i*30,end:20+i*30}]},
      {id:`feeder-${i}`,kind:"vocal",participantId:`person-${i}`,coachId:"coach",duration:10,spaceId:"feeder-room",dependencies:[`arrival-${i}`],availability:[{start:90,end:120}]},
      {id:`main-${i}`,kind:"main",participantId:`person-${i}`,coachId:"coach",blockKey:"coach",duration:10,spaceId:"main-room",dependencies:[`preparation-${i}`,`feeder-${i}`]});
  }
  return {day:{start:0,end:240},spaces:["gate","shared-room","feeder-room","main-room"].map(id=>({id,availability:window})),resources:[],
    participants:[0,1,2].map(i=>({id:`person-${i}`,availability:[{start:0,end:240-i*5}]})),coaches:[{id:"coach",availability:window}],tasks,
    mainFlow:{spaceId:"main-room",preferredEnd:200,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
    auxiliaryPolicy:{participantPresencePreference:"OFF"},
    budget:{bestK:4,maxPatterns:100,maxBacktracks:100,maxBranchExpansions:100000},searchPolicy:"EXACT_CONSTRUCTIVE",
    transportPolicy:{arrival:{taskIds:[0,1,2].map(i=>`arrival-${i}`),minimumGroupSize:1,maximumGroupSize:1,minGapMinutes:5,groupingWeight:1},departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:3,minGapMinutes:0,groupingWeight:1}},
    operationContinuityGroups:[{id:"e213c4b7-a076-4d71-95c9-37de17b97f10",taskIds:[0,1,2].map(i=>`preparation-${i}`),policy:"OFF",gapWeight:2}]};
}
