import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { anchoredAccompanimentIndex, firstParticipantObligation } from "./anchoredAccompaniment";

export interface FeederClosureCandidate { feeders: ScheduledTask[]; cost: number; signature: string; selectedFeederOrder:string[] }
export type FeederClosureStatus = "FEASIBLE" | "PROVEN_INFEASIBLE" | "BUDGET_EXHAUSTED";
export interface FeederClosureDiagnostics {
  status:FeederClosureStatus; consumed:number; exhausted:boolean; searchComplete:boolean; solutionLimitReached:boolean;
  completeClosuresGenerated:number; maximumSearchDepth:number; maximumPendingStateCount:number;
  maximumPartialStates:number; rejectedStateBlockerIds:string[]; attemptedStartCountByFeederId:Record<string,number>; greedyFallbackUsed:boolean;
}
export interface FeederClosureResult { candidates:FeederClosureCandidate[]; diagnostics:FeederClosureDiagnostics }

export interface GreedyFeederClosureResult { complete:boolean; scheduledTasks:ScheduledTask[]; scheduledFeeders:ScheduledTask[]; attemptedFeederIds:string[]; placedFeederIds:string[]; blockingFeederId:string|null; blockingMainTaskId:string|null; attemptedStartCountByFeederId:Record<string,number> }
export function diagnoseGreedyFeederClosure(problem: PlannerNextProblem, mains: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): GreedyFeederClosureResult {
  const placed = [...mains];
  const attemptedFeederIds:string[]=[],placedFeederIds:string[]=[];const attemptedStartCountByFeederId:Record<string,number>={};
  const feederByParticipant = new Map(problem.tasks.filter(({ kind }) => kind === "vocal").map((task) => [task.participantId, task]));
  const latestFirst = mains.filter(task=>task.kind==="main").sort((a, b) => b.start - a.start || a.id.localeCompare(b.id));
  for (const main of latestFirst) {
    const feeder = feederByParticipant.get(main.participantId);
    if (!feeder) return {complete:false,scheduledTasks:[],scheduledFeeders:[],attemptedFeederIds,placedFeederIds,blockingFeederId:null,blockingMainTaskId:main.id,attemptedStartCountByFeederId};
    attemptedFeederIds.push(feeder.id);attemptedStartCountByFeederId[feeder.id]=0;
    const deadline = firstParticipantObligation(main,placed,anchoredAccompanimentIndex(problem)) - Math.max(problem.participantTransitionMinutes,problem.resourceTransitionMinutes);
    let selectedStart: number | undefined;
    for (let start = deadline - feeder.duration; start >= problem.day.start; start -= 5) {
      attemptedStartCountByFeederId[feeder.id] += 1;
      if (canPlaceTask(problem, feeder, start, placed, scheduledSpaceMeals)) { selectedStart = start; break; }
    }
    if (selectedStart === undefined) return {complete:false,scheduledTasks:[],scheduledFeeders:[],attemptedFeederIds,placedFeederIds,blockingFeederId:feeder.id,blockingMainTaskId:main.id,attemptedStartCountByFeederId};
    placed.push({ ...feeder, start: selectedStart, end: selectedStart + feeder.duration });placedFeederIds.push(feeder.id);
  }
  return {complete:true,scheduledTasks:placed,scheduledFeeders:placed.filter(task=>task.kind==="vocal"),attemptedFeederIds,placedFeederIds,blockingFeederId:null,blockingMainTaskId:null,attemptedStartCountByFeederId};
}

type State={feeders:ScheduledTask[];pending:Task[];cost:number;selectedFeederOrder:string[]};
const ordered=<T extends {id:string}>(xs:T[])=>[...xs].sort((a,b)=>a.id.localeCompare(b.id));

/** Exact, allowance-bounded feeder proof search. bestK limits complete closures only. */
export function closeFeeders(problem:PlannerNextProblem,mains:ScheduledTask[],meals:ScheduledSpaceMeal[],allowance:number,bestK=problem.budget.bestK):FeederClosureResult{
  let consumed=0,exhausted=false,maximumSearchDepth=0,maximumPendingStateCount=0;
  const rejectedBlockers=new Set<string>(),attemptedStartCountByFeederId:Record<string,number>={};
  const vocals=problem.tasks.filter(task=>task.kind==="vocal"),anchors=mains.filter(task=>task.kind==="main");
  const pending:Task[]=[];
  for(const main of ordered(anchors)){
    const matches=vocals.filter(vocal=>vocal.participantId===main.participantId);
    if(matches.length!==1){rejectedBlockers.add(matches[0]?.id??`feeder:${main.participantId}`);continue;}
    pending.push(matches[0]!);
  }
  const mainByParticipant=new Map(anchors.map(main=>[main.participantId,main]));
  const complete:FeederClosureCandidate[]=[];
  const starts=(feeder:Task,state:State):number[]=>{
    const main=mainByParticipant.get(feeder.participantId);if(!main)return [];
    const deadline=firstParticipantObligation(main,mains,anchoredAccompanimentIndex(problem))-Math.max(problem.participantTransitionMinutes,problem.resourceTransitionMinutes);
    const result:number[]=[];attemptedStartCountByFeederId[feeder.id]??=0;
    for(let start=deadline-feeder.duration;start>=problem.day.start;start-=5){
      if(consumed>=allowance){exhausted=true;break;}
      consumed+=1;attemptedStartCountByFeederId[feeder.id]+=1;
      if(canPlaceTask(problem,feeder,start,[...mains,...state.feeders],meals))result.push(start);
    }
    return result;
  };
  const visit=(state:State,depth:number):void=>{
    if(exhausted||complete.length>=Math.max(1,bestK))return;
    maximumSearchDepth=Math.max(maximumSearchDepth,depth);maximumPendingStateCount=Math.max(maximumPendingStateCount,state.pending.length);
    if(state.pending.length===0){
      const feeders=ordered(state.feeders),signature=feeders.map(feeder=>`${feeder.id}@${feeder.start}`).join("|");
      complete.push({feeders,cost:state.cost,signature,selectedFeederOrder:state.selectedFeederOrder});return;
    }
    const choices=state.pending.map(feeder=>({feeder,starts:starts(feeder,state),main:mainByParticipant.get(feeder.participantId)!}));
    if(exhausted)return;
    choices.sort((a,b)=>a.starts.length-b.starts.length||a.main.start-b.main.start||a.feeder.id.localeCompare(b.feeder.id));
    const selected=choices[0];if(!selected)return;
    if(selected.starts.length===0){rejectedBlockers.add(selected.feeder.id);return;}
    for(const start of selected.starts){
      if(exhausted||complete.length>=Math.max(1,bestK))break;
      const scheduled={...selected.feeder,start,end:start+selected.feeder.duration};
      visit({feeders:[...state.feeders,scheduled],pending:state.pending.filter(item=>item.id!==selected.feeder.id),cost:state.cost+selected.main.end-start,selectedFeederOrder:[...state.selectedFeederOrder,selected.feeder.id]},depth+1);
    }
  };
  if(pending.length===anchors.length)visit({feeders:[],pending:ordered(pending),cost:0,selectedFeederOrder:[]},0);
  const candidates=complete.sort((a,b)=>a.cost-b.cost||a.signature.localeCompare(b.signature)).slice(0,Math.max(1,bestK));
  const solutionLimitReached=candidates.length>=Math.max(1,bestK);
  const status:FeederClosureStatus=candidates.length>0?"FEASIBLE":exhausted?"BUDGET_EXHAUSTED":"PROVEN_INFEASIBLE";
  const searchComplete=!exhausted&&!solutionLimitReached;
  return {candidates,diagnostics:{status,consumed,exhausted,searchComplete,solutionLimitReached,completeClosuresGenerated:candidates.length,maximumSearchDepth,maximumPendingStateCount,maximumPartialStates:candidates.length,rejectedStateBlockerIds:[...rejectedBlockers].sort(),attemptedStartCountByFeederId,greedyFallbackUsed:false}};
}
