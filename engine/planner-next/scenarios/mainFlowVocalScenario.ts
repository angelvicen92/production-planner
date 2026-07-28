import type { PlannerNextProblem, Task } from "../contracts";
import { hm } from "../time";

export function mainFlowVocalScenario(): PlannerNextProblem {
  const day={start:hm("09:00"),end:hm("17:00")}, all=[{...day}], participantIds=["participant-z","participant-c","participant-d","participant-e","participant-a","participant-f","participant-g","participant-h"];
  const coachFor=(id:string)=>["participant-z","participant-c","participant-d","participant-e"].includes(id)?"coach-a":"coach-b";
  const roomFor=(id:string)=>coachFor(id)==="coach-a"?"vocal-room-a":"vocal-room-b";
  const tasks:Task[]=participantIds.flatMap(id=>{const coachId=coachFor(id);return [
    {id:`vocal-${id}`,kind:"vocal",participantId:id,coachId,duration:15,spaceId:roomFor(id),dependencies:[]},
    {id:`main-${id}`,kind:"main",participantId:id,coachId,duration:15,spaceId:"main-stage",dependencies:[`vocal-${id}`],blockKey:coachId},
  ];});
  return {day,protectedMeal:{start:hm("15:00"),end:hm("16:00")},resources:[],spaces:[{id:"main-stage",availability:all},{id:"vocal-room-a",availability:all},{id:"vocal-room-b",availability:all}],participants:participantIds.map(id=>({id,availability:id==="participant-z"?[{start:day.start,end:hm("13:30")}]:id==="participant-a"?[{start:hm("13:00"),end:day.end}]:all})),coaches:[{id:"coach-a",availability:all},{id:"coach-b",availability:all}],tasks,mainFlow:{spaceId:"main-stage",preferredEnd:hm("15:00"),continuity:"REQUIRED",maxBlocksByKey:2,minTasksPerBlock:2},participantTransitionMinutes:5,resourceTransitionMinutes:15,budget:{bestK:5,maxBacktracks:10,maxPatterns:100,maxBranchExpansions:10000}};
}
