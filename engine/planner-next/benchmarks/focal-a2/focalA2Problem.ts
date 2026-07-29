import type { PlannerNextProblem } from "../../contracts";
import { focalA2Participants,focalA2Tasks } from "./focalA2Reference";
export function focalA2Problem():PlannerNextProblem{return {
 day:{start:540,end:1035},protectedMeal:{start:840,end:915},
 spaces:[{id:"main-stage",availability:[{start:675,end:1035}],mealPolicy:{window:{start:840,end:915},duration:75}},{id:"vocal-room-lucia",availability:[{start:585,end:645},{start:825,end:885}]},{id:"vocal-room-jose-maria",availability:[{start:595,end:700},{start:885,end:945}]}],
 resources:[],participants:focalA2Participants.map(p=>({id:p.participantId,availability:[{start:p.presenceStart,end:p.presenceEnd}]})),
 coaches:[{id:"coach-lucia",availability:[{start:585,end:735},{start:825,end:975}]},{id:"coach-jose-maria",availability:[{start:595,end:840},{start:885,end:1035}]}],
 tasks:focalA2Tasks.map(({start:_s,end:_e,...t})=>t),mainFlow:{spaceId:"main-stage",preferredEnd:840,continuity:"REQUIRED",maxBlocksByKey:2,minTasksPerBlock:4},participantTransitionMinutes:5,resourceTransitionMinutes:15,budget:{bestK:5,maxBacktracks:20,maxPatterns:100,maxBranchExpansions:300000}
};}
