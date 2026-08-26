import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";

export type TechnicalChainMode = "SEARCH" | "PROBE";
export type TechnicalChainCandidate = { tasks: ScheduledTask[]; cost: number; rootTaskId: string; start: number; end: number };
export type TechnicalChainStartDomainMode = "ANALYTIC_DOMAIN" | "FULL_GRID";
export type TechnicalChainCandidateResult = { candidates: TechnicalChainCandidate[]; consumed: number; exhausted: boolean; diagnostics: TechnicalChainDiagnostics };
export const getTechnicalTasks = (tasks: Task[]) => tasks.filter((t): t is Extract<Task,{kind:"technical"}> => t.kind === "technical");
export function buildTechnicalPrerequisiteMap(tasks: Task[]): Map<string,string[]> { return new Map(getTechnicalTasks(tasks).map(t=>[t.id,Array.isArray(t.dependencies)?[...t.dependencies]:[]])); }
export function buildTechnicalDependentMap(tasks: Task[]): Map<string,string[]> { const map=new Map(getTechnicalTasks(tasks).map(t=>[t.id,[] as string[]])); for(const t of getTechnicalTasks(tasks)) for(const d of Array.isArray(t.dependencies)?t.dependencies:[]) if(map.has(d)) map.get(d)!.push(t.id); for(const v of map.values())v.sort(); return map; }
export function technicalChainHasBranching(tasks:Task[]):boolean { const p=buildTechnicalPrerequisiteMap(tasks),d=buildTechnicalDependentMap(tasks); return [...p.values()].some(x=>new Set(x).size>1)||[...d.values()].some(x=>new Set(x).size>1); }
export function technicalChainHasCycle(tasks:Task[]):boolean { const p=buildTechnicalPrerequisiteMap(tasks); const visiting=new Set<string>(),done=new Set<string>(); const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);for(const x of p.get(id)??[])if(p.has(x)&&visit(x))return true;visiting.delete(id);done.add(id);return false};return [...p.keys()].sort().some(visit); }
export function orderedTechnicalChainMembers(tasks:Task[]):Task[] { const p=buildTechnicalPrerequisiteMap(tasks),d=buildTechnicalDependentMap(tasks); const root=getTechnicalTasks(tasks).find(t=>(p.get(t.id)?.length??0)===0); if(!root)return [];const out:Task[]=[];let current:Task|undefined=root;while(current){out.push(current);const next=d.get(current.id)?.[0];current=next?getTechnicalTasks(tasks).find(t=>t.id===next):undefined;}return out; }
export const technicalChainRoot=(tasks:Task[])=>orderedTechnicalChainMembers(tasks)[0];
export const technicalChainRootTaskId=(tasks:Task[])=>technicalChainRoot(tasks)?.id;
export const technicalChainWorkItemKey=(rootTaskId:string)=>`technical-chain:${rootTaskId}`;
export function getTechnicalChains(tasks:Task[]):Task[][] { const tech=getTechnicalTasks(tasks),dep=buildTechnicalDependentMap(tech),byId=new Map(tech.map(t=>[t.id,t]));const roots=tech.filter(t=>t.dependencies.length===0&&(dep.get(t.id)?.length??0)>0).sort((a,b)=>a.id.localeCompare(b.id));return roots.map(r=>{const out:Task[]=[];let x:Task|undefined=r;while(x){out.push(x);const n=dep.get(x.id)?.[0];x=n?byId.get(n):undefined;}return out;}); }
export function technicalChainForTask(tasks:Task[],id:string):Task[]|undefined{return getTechnicalChains(tasks).find(c=>c.some(t=>t.id===id));}
export const isTechnicalChainMember=(tasks:Task[],id:string)=>technicalChainForTask(tasks,id)!==undefined;
export const technicalChainResourceIds=(tasks:Task[])=>[...new Set(tasks.flatMap(t=>t.requiredResourceIds??[]))].sort();
export const technicalChainProductiveDuration=(tasks:Task[])=>tasks.reduce((n,t)=>n+t.duration,0);
export const technicalChainSignature=(tasks:ScheduledTask[])=>tasks.map(t=>`${t.id}@${t.start}-${t.end}:${t.spaceId}:${[...(t.requiredResourceIds??[])].sort().join(",")}:${[...t.dependencies].sort().join(",")}`).join("|");
export interface TechnicalChainDiagnostics {
  startsExplored: number;
  expansions: number;
  completeCandidatesGenerated: number;
  completeCandidatesYielded: number;
  maximumPartialStatesPerDepth: number;
  activeFrontierPeak: number;
  fullGridStarts: number;
  analyticEligibleStarts: number;
  analyticallyEliminatedStarts: number;
  startsEvaluated: number;
  alternativesDeferred: number;
  alternativesRevisited: number;
}

export interface TechnicalChainExplorer {
  readonly consumed: number;
  readonly exhausted: boolean;
  readonly diagnostics: TechnicalChainDiagnostics;
  nextCandidate(): TechnicalChainCandidate | null;
}

type Partial = { tasks: ScheduledTask[]; cost: number };
const comparePartial=(left:Partial,right:Partial)=>left.cost-right.cost
  ||right.tasks.length-left.tasks.length
  ||technicalChainSignature(left.tasks).localeCompare(technicalChainSignature(right.tasks));

/** Local resumable exact explorer. Deferred partials retain their descendants unexpanded until reopened. */
export function createTechnicalChainExplorer(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],
  allowance:number,startDomainMode:TechnicalChainStartDomainMode="ANALYTIC_DOMAIN",
  scheduledSpaceMeals:ScheduledSpaceMeal[]=[]):TechnicalChainExplorer {
  const ordered=orderedTechnicalChainMembers(chainTasks),root=ordered[0];
  const diagnostics:TechnicalChainDiagnostics={startsExplored:0,expansions:0,completeCandidatesGenerated:0,
    completeCandidatesYielded:0,maximumPartialStatesPerDepth:0,activeFrontierPeak:root&&ordered.length>=2?1:0,
    fullGridStarts:0,analyticEligibleStarts:0,analyticallyEliminatedStarts:0,startsEvaluated:0,
    alternativesDeferred:0,alternativesRevisited:0};
  let consumed=0,budgetExhausted=false;
  let active:Partial[]=root&&ordered.length>=2?[{tasks:[],cost:0}]:[];
  let deferred:Partial[]=[];
  const refreshEliminated=()=>{diagnostics.analyticallyEliminatedStarts=diagnostics.fullGridStarts-diagnostics.analyticEligibleStarts};
  const refill=()=>{
    if(active.length||!deferred.length)return;
    active=deferred.splice(0,Math.min(problem.budget.bestK,deferred.length));
    diagnostics.alternativesRevisited+=active.length;
    diagnostics.activeFrontierPeak=Math.max(diagnostics.activeFrontierPeak,active.length);
  };
  const enqueue=(children:Partial[])=>{
    const ranked=[...children].sort(comparePartial);
    const displaced=active;
    active=ranked.slice(0,problem.budget.bestK);
    const newlyDeferred=[...displaced,...ranked.slice(problem.budget.bestK)];
    diagnostics.alternativesDeferred+=newlyDeferred.length;
    deferred=[...deferred,...newlyDeferred].sort(comparePartial);
    diagnostics.activeFrontierPeak=Math.max(diagnostics.activeFrontierPeak,active.length);
    diagnostics.maximumPartialStatesPerDepth=Math.max(diagnostics.maximumPartialStatesPerDepth,active.length);
  };
  const explorer:TechnicalChainExplorer={
    get consumed(){return consumed},get exhausted(){return budgetExhausted},diagnostics,
    nextCandidate(){
      while(true){
        refill();
        const state=active.shift();
        if(!state)return null;
        if(state.tasks.length===ordered.length){
          const last=state.tasks.at(-1)!;
          diagnostics.completeCandidatesGenerated+=1;
          diagnostics.completeCandidatesYielded+=1;
          return {tasks:state.tasks,cost:state.cost,rootTaskId:root!.id,start:state.tasks[0]!.start,end:last.end};
        }
        const task=ordered[state.tasks.length]!,depth=state.tasks.length;
        const earliest=state.tasks.at(-1)?.end??problem.day.start;
        const prior=[...placed,...state.tasks];
        const logical=Math.max(0,Math.floor((problem.day.end-task.duration-earliest)/5)+1);
        const domain=exactTaskStartDomain(problem,task,prior,scheduledSpaceMeals);
        diagnostics.fullGridStarts+=logical;
        diagnostics.analyticEligibleStarts+=domain.eligibleStartCount;
        refreshEliminated();
        const starts=startDomainMode==="FULL_GRID"?(function*(){for(let start=earliest;start+task.duration<=problem.day.end;start+=5)yield start;})():domain.starts();
        const children:Partial[]=[];
        for(const start of starts){
          if(start<earliest)continue;
          if(depth===0)diagnostics.startsExplored+=1;
          if(consumed>=allowance){budgetExhausted=true;return null;}
          consumed+=1;diagnostics.expansions=consumed;diagnostics.startsEvaluated=consumed;
          if(!canPlaceTask(problem,task,start,prior,scheduledSpaceMeals))continue;
          const scheduled={...task,start,end:start+task.duration};
          const incremental=[...new Set(task.requiredResourceIds??[])].reduce((sum,id)=>{
            const resource=problem.resources.find(item=>item.id===id);
            return sum+resourcePresenceIncrement(id,prior,scheduled)*presencePreferenceWeight(resource?.presencePreference??"OFF");
          },0);
          children.push({tasks:[...state.tasks,scheduled],cost:state.cost+incremental});
        }
        enqueue(children);
      }
    },
  };
  return explorer;
}

function generateLegacyTechnicalChainCandidates(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],allowance:number,
  mode:TechnicalChainMode,probeLimit:number,scheduledSpaceMeals:ScheduledSpaceMeal[]):TechnicalChainCandidateResult {
  const ordered=orderedTechnicalChainMembers(chainTasks),root=ordered[0];let consumed=0,startsExplored=0,max=0;
  const complete:TechnicalChainCandidate[]=[];
  const diagnostics=():TechnicalChainDiagnostics=>({startsExplored,expansions:consumed,
    completeCandidatesGenerated:complete.length,completeCandidatesYielded:complete.length,
    maximumPartialStatesPerDepth:max,activeFrontierPeak:max,fullGridStarts:consumed,analyticEligibleStarts:consumed,
    analyticallyEliminatedStarts:0,startsEvaluated:consumed,alternativesDeferred:0,alternativesRevisited:0});
  const finish=(exhausted:boolean):TechnicalChainCandidateResult=>({candidates:complete
    .sort((a,b)=>a.cost-b.cost||technicalChainSignature(a.tasks).localeCompare(technicalChainSignature(b.tasks)))
    .slice(0,mode==="SEARCH"?problem.budget.bestK:complete.length),consumed,exhausted,diagnostics:diagnostics()});
  if(!root||ordered.length<2)return finish(false);
  let states:Partial[]=[{tasks:[],cost:0}];
  for(let depth=0;depth<ordered.length;depth++){
    const task=ordered[depth]!,last=depth===ordered.length-1,next:Partial[]=[];
    for(const state of states){
      const earliest=state.tasks.at(-1)?.end??problem.day.start,prior=[...placed,...state.tasks];
      for(let start=earliest;start+task.duration<=problem.day.end;start+=5){
        if(depth===0)startsExplored+=1;
        if(consumed>=allowance)return finish(true);
        consumed+=1;
        if(!canPlaceTask(problem,task,start,prior,scheduledSpaceMeals))continue;
        const scheduled={...task,start,end:start+task.duration};
        const incremental=[...new Set(task.requiredResourceIds??[])].reduce((sum,id)=>{const resource=problem.resources.find(item=>item.id===id);return sum+resourcePresenceIncrement(id,prior,scheduled)*presencePreferenceWeight(resource?.presencePreference??"OFF")},0);
        const candidate={tasks:[...state.tasks,scheduled],cost:state.cost+incremental};
        if(last){complete.push({tasks:candidate.tasks,cost:candidate.cost,rootTaskId:root.id,start:candidate.tasks[0]!.start,end:scheduled.end});if(mode==="PROBE"&&complete.length>=probeLimit)return finish(false);}
        else next.push(candidate);
      }
    }
    if(last)break;
    states=next.sort(comparePartial).slice(0,problem.budget.bestK);max=Math.max(max,states.length);if(!states.length)break;
  }
  return finish(false);
}

export function generateTechnicalChainCandidates(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],allowance:number,
  mode:TechnicalChainMode="SEARCH",probeLimit=1,
  startDomainMode:TechnicalChainStartDomainMode=problem.searchPolicy==="EXACT_CONSTRUCTIVE"?"ANALYTIC_DOMAIN":"FULL_GRID",
  scheduledSpaceMeals:ScheduledSpaceMeal[]=[]):TechnicalChainCandidateResult {
  if(problem.searchPolicy!=="EXACT_CONSTRUCTIVE")return generateLegacyTechnicalChainCandidates(problem,chainTasks,placed,allowance,mode,probeLimit,scheduledSpaceMeals);
  const explorer=createTechnicalChainExplorer(problem,chainTasks,placed,allowance,startDomainMode,scheduledSpaceMeals);
  const candidates:TechnicalChainCandidate[]=[];
  const limit=mode==="PROBE"?probeLimit:problem.searchPolicy==="EXACT_CONSTRUCTIVE"?Number.POSITIVE_INFINITY:problem.budget.bestK;
  while(candidates.length<limit){const candidate=explorer.nextCandidate();if(!candidate)break;candidates.push(candidate);}
  return {candidates,consumed:explorer.consumed,exhausted:explorer.exhausted,diagnostics:explorer.diagnostics};
}
