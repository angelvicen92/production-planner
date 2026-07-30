import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { feederDeadlineBase } from "./anchoredClosure";

export interface FeederClosureCandidate { feeders: ScheduledTask[]; cost: number; signature: string; selectedFeederOrder:string[] }
export interface FeederClosureDiagnostics { consumed:number; exhausted:boolean; completeClosuresGenerated:number; maximumPartialStates:number; rejectedStateBlockerIds:string[]; greedyFallbackUsed:boolean }
export interface FeederClosureResult { candidates:FeederClosureCandidate[]; diagnostics:FeederClosureDiagnostics }

type State={feeders:ScheduledTask[];pending:Task[];cost:number;signature:string;selectedFeederOrder:string[]};
const ordered=<T extends {id:string}>(xs:T[])=>[...xs].sort((a,b)=>a.id.localeCompare(b.id));

/** Bounded, deterministic dependency closure for one fixed main-flow assignment. */
export function closeFeeders(problem:PlannerNextProblem,mains:ScheduledTask[],meals:ScheduledSpaceMeal[],allowance:number,bestK=problem.budget.bestK):FeederClosureResult{
  let consumed=0,exhausted=false,maximumPartialStates=0;
  const rejectedBlockers=new Set<string>();
  const vocals=problem.tasks.filter(t=>t.kind==="vocal");
  const pending:Task[]=[];
  for(const main of ordered(mains.filter(t=>t.kind==="main"))){
    const matches=vocals.filter(v=>v.participantId===main.participantId);
    if(matches.length!==1){rejectedBlockers.add(matches[0]?.id??`feeder:${main.participantId}`);continue}
    pending.push(matches[0]!);
  }
  const diagnostics=(complete:number):FeederClosureDiagnostics=>({consumed,exhausted,completeClosuresGenerated:complete,maximumPartialStates,rejectedStateBlockerIds:[...rejectedBlockers].sort(),greedyFallbackUsed:true});
  const anchors=mains.filter(t=>t.kind==="main");
  if(pending.length!==anchors.length)return {candidates:[],diagnostics:diagnostics(0)};
  const mainByParticipant=new Map(anchors.map(m=>[m.participantId,m]));
  const starts=(feeder:Task,state:State):number[]=>{
    const main=mainByParticipant.get(feeder.participantId);if(!main)return [];
    const deadline=feederDeadlineBase(problem,main)-Math.max(problem.participantTransitionMinutes,problem.resourceTransitionMinutes);
    const result:number[]=[];
    for(let start=deadline-feeder.duration;start>=problem.day.start;start-=5){
      if(consumed>=allowance){exhausted=true;break} consumed+=1;
      if(canPlaceTask(problem,feeder,start,[...mains,...state.feeders],meals))result.push(start);
    }
    return result;
  };
  let states:State[]=[{feeders:[],pending:ordered(pending),cost:0,signature:"",selectedFeederOrder:[]}];
  maximumPartialStates=1;
  for(let depth=0;depth<pending.length&&states.length&&!exhausted;depth+=1){
    const next:State[]=[];
    for(const state of states){
      const choices=state.pending.map(feeder=>({feeder,starts:starts(feeder,state),main:mainByParticipant.get(feeder.participantId)!}));
      if(exhausted)break;
      choices.sort((a,b)=>a.starts.length-b.starts.length||a.main.start-b.main.start||a.feeder.id.localeCompare(b.feeder.id));
      const selected=choices[0];if(!selected)continue;
      if(!selected.starts.length){rejectedBlockers.add(selected.feeder.id);continue}
      for(const start of selected.starts){
        const scheduled={...selected.feeder,start,end:start+selected.feeder.duration};
        const feeders=[...state.feeders,scheduled];
        next.push({feeders,pending:state.pending.filter(x=>x.id!==selected.feeder.id),cost:state.cost+selected.main.end-start,signature:ordered(feeders).map(x=>`${x.id}@${x.start}`).join("|"),selectedFeederOrder:[...state.selectedFeederOrder,selected.feeder.id]});
      }
    }
    states=next.sort((a,b)=>a.cost-b.cost||a.signature.localeCompare(b.signature)).slice(0,bestK);
    maximumPartialStates=Math.max(maximumPartialStates,states.length);
  }
  if(exhausted)return {candidates:[],diagnostics:diagnostics(0)};
  const candidates=states.filter(s=>s.pending.length===0).map(({feeders,cost,signature,selectedFeederOrder})=>({feeders:ordered(feeders),cost,signature,selectedFeederOrder})).sort((a,b)=>a.cost-b.cost||a.signature.localeCompare(b.signature)).slice(0,bestK);
  return {candidates,diagnostics:diagnostics(candidates.length)};
}
