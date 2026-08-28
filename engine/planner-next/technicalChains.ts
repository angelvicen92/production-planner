import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task, TechnicalChainPolicy } from "./contracts";
import { performance } from "node:perf_hooks";
import { canPlaceTask, exactTaskStartDomain, prepareTaskPlacementAuthority } from "./placement";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";

export type TechnicalChainMode = "SEARCH" | "PROBE";
export type TechnicalChainCandidate = { tasks: ScheduledTask[]; cost: number; rootTaskId: string; start: number; end: number };
export type TechnicalChainStartDomainMode = "ANALYTIC_DOMAIN" | "FULL_GRID";
export type TechnicalChainDeferredQueueMode = "INCREMENTAL_HEAP" | "GLOBAL_SORT_ORACLE";
export type TechnicalChainPlacementAuthorityMode = "PREPARED_AUTHORITY" | "CAN_PLACE_ORACLE";
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
export function getTechnicalChains(tasks:Task[],policies:readonly TechnicalChainPolicy[]=[]):Task[][] { const tech=getTechnicalTasks(tasks),byId=new Map(tech.map(t=>[t.id,t]));
  const explicit=[...policies].sort((a,b)=>a.id.localeCompare(b.id)).map(policy=>policy.orderedTaskIds.map(id=>byId.get(id)).filter((task):task is Task=>Boolean(task))).filter(chain=>chain.length>=2);
  const owned=new Set(explicit.flatMap(chain=>chain.map(task=>task.id))),dep=buildTechnicalDependentMap(tech),roots=tech.filter(t=>!owned.has(t.id)&&t.dependencies.length===0&&(dep.get(t.id)?.length??0)>0).sort((a,b)=>a.id.localeCompare(b.id));
  return [...explicit,...roots.map(r=>{const out:Task[]=[];let x:Task|undefined=r;while(x&&!owned.has(x.id)){out.push(x);const n=dep.get(x.id)?.[0];x=n?byId.get(n):undefined;}return out;}).filter(chain=>chain.length>=2)]; }
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
  deferredQueuePeak: number;
  deferredPushes: number;
  deferredPops: number;
  deferredGlobalSorts: number;
  deferredMaintenanceMs: number;
  startEvaluationMs: number;
  preparedAuthorityBuilds:number;
  preparedAuthorityHits:number;
  fixedPlacedScansAvoided:number;
  domainBuildMs:number;
  finalPlacementCheckMs:number;
}

export interface TechnicalChainExplorer {
  readonly consumed: number;
  readonly exhausted: boolean;
  readonly diagnostics: TechnicalChainDiagnostics;
  nextCandidate(): TechnicalChainCandidate | null;
}

const explicitPolicyFor=(problem:PlannerNextProblem,tasks:Task[]):TechnicalChainPolicy|undefined=>{
  const ids=tasks.map(task=>task.id);
  return problem.technicalChains?.find(policy=>policy.orderedTaskIds.length===ids.length&&policy.orderedTaskIds.every((id,index)=>id===ids[index]));
};

function createContiguousTechnicalChainExplorer(problem:PlannerNextProblem,ordered:Task[],policy:TechnicalChainPolicy,
  placed:ScheduledTask[],allowance:number,meals:ScheduledSpaceMeal[]):TechnicalChainExplorer{
  const diagnostics:TechnicalChainDiagnostics={startsExplored:0,expansions:0,completeCandidatesGenerated:0,completeCandidatesYielded:0,
    maximumPartialStatesPerDepth:0,activeFrontierPeak:1,fullGridStarts:0,analyticEligibleStarts:0,analyticallyEliminatedStarts:0,
    startsEvaluated:0,alternativesDeferred:0,alternativesRevisited:0,deferredQueuePeak:0,deferredPushes:0,deferredPops:0,
    deferredGlobalSorts:0,deferredMaintenanceMs:0,startEvaluationMs:0,preparedAuthorityBuilds:0,preparedAuthorityHits:0,
    fixedPlacedScansAvoided:0,domainBuildMs:0,finalPlacementCheckMs:0};
  const duration=technicalChainProductiveDuration(ordered);let nextStart=problem.day.start,consumed=0,exhausted=false;
  return {get consumed(){return consumed},get exhausted(){return exhausted},diagnostics,nextCandidate(){
    while(nextStart+duration<=problem.day.end){const rootStart=nextStart;nextStart+=5;diagnostics.startsExplored+=1;diagnostics.fullGridStarts+=1;
      if(consumed>=allowance){exhausted=true;return null;}consumed+=1;diagnostics.expansions=consumed;diagnostics.startsEvaluated=consumed;
      let cursor=rootStart,cost=0;const scheduled:ScheduledTask[]=[];
      for(const task of ordered){
        if(policy.resourceContinuity==="REQUIRED"&&policy.requiredResourceIds.some(id=>!(task.requiredResourceIds??[]).includes(id))){scheduled.length=0;break;}
        if(!canPlaceTask(problem,task,cursor,[...placed,...scheduled],meals)){scheduled.length=0;break;}
        const item={...task,start:cursor,end:cursor+task.duration};scheduled.push(item);cursor=item.end;
        cost+=[...new Set(task.requiredResourceIds??[])].reduce((sum,id)=>sum+resourcePresenceIncrement(id,[...placed,...scheduled.slice(0,-1)],item)*presencePreferenceWeight(problem.resources.find(resource=>resource.id===id)?.presencePreference??"OFF"),0);
      }
      if(scheduled.length!==ordered.length)continue;
      diagnostics.analyticEligibleStarts+=1;diagnostics.completeCandidatesGenerated+=1;diagnostics.completeCandidatesYielded+=1;
      diagnostics.analyticallyEliminatedStarts=diagnostics.fullGridStarts-diagnostics.analyticEligibleStarts;
      return {tasks:scheduled,cost,rootTaskId:ordered[0]!.id,start:rootStart,end:cursor};
    }
    diagnostics.analyticallyEliminatedStarts=diagnostics.fullGridStarts-diagnostics.analyticEligibleStarts;return null;
  }};
}

type Partial = { tasks: ScheduledTask[]; cost: number; rankKey: string };
const comparePartial=(left:Partial,right:Partial)=>left.cost-right.cost
  ||right.tasks.length-left.tasks.length
  ||left.rankKey.localeCompare(right.rankKey);
const partialRankKey=(tasks:ScheduledTask[])=>tasks.map(task=>
  `${task.start}-${task.end}:${task.spaceId}:${[...(task.requiredResourceIds??[])].sort().join(",")}`).join("|");
const partial=(tasks:ScheduledTask[],cost:number):Partial=>({tasks,cost,rankKey:partialRankKey(tasks)});

class PartialPriorityQueue {
  private readonly values:Partial[]=[];
  get size(){return this.values.length}
  push(value:Partial){
    this.values.push(value);
    let child=this.values.length-1;
    while(child>0){
      const parent=Math.floor((child-1)/2);
      if(comparePartial(this.values[parent]!,value)<=0)break;
      this.values[child]=this.values[parent]!;child=parent;
    }
    this.values[child]=value;
  }
  pushBatch(values:Partial[]){for(const value of values)this.push(value)}
  pop():Partial|undefined{
    const first=this.values[0],last=this.values.pop();
    if(!first||!last||this.values.length===0)return first;
    let parent=0;
    while(true){
      const left=parent*2+1;if(left>=this.values.length)break;
      const right=left+1;
      const child=right<this.values.length&&comparePartial(this.values[right]!,this.values[left]!)<0?right:left;
      if(comparePartial(last,this.values[child]!)<=0)break;
      this.values[parent]=this.values[child]!;parent=child;
    }
    this.values[parent]=last;
    return first;
  }
}

class SortedPartialQueue {
  private values:Partial[]=[];
  constructor(private readonly onSort:()=>void){}
  get size(){return this.values.length}
  pushBatch(values:Partial[]){if(!values.length)return;this.values=[...this.values,...values].sort(comparePartial);this.onSort()}
  pop(){return this.values.shift()}
}

/** Local resumable exact explorer. Deferred partials retain their descendants unexpanded until reopened. */
export function createTechnicalChainExplorer(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],
  allowance:number,startDomainMode:TechnicalChainStartDomainMode="ANALYTIC_DOMAIN",
  scheduledSpaceMeals:ScheduledSpaceMeal[]=[],deferredQueueMode:TechnicalChainDeferredQueueMode="INCREMENTAL_HEAP",
  measureTimings=false,placementAuthorityMode:TechnicalChainPlacementAuthorityMode="PREPARED_AUTHORITY"):TechnicalChainExplorer {
  const policy=explicitPolicyFor(problem,chainTasks),ordered=policy?policy.orderedTaskIds.map(id=>chainTasks.find(task=>task.id===id)!).filter(Boolean):orderedTechnicalChainMembers(chainTasks),root=ordered[0];
  if(policy?.adjacency==="REQUIRED")return createContiguousTechnicalChainExplorer(problem,ordered,policy,placed,allowance,scheduledSpaceMeals);
  const preparedAuthorities=placementAuthorityMode==="PREPARED_AUTHORITY"
    ?ordered.map(task=>prepareTaskPlacementAuthority(problem,task,placed,scheduledSpaceMeals)):[];
  const diagnostics:TechnicalChainDiagnostics={startsExplored:0,expansions:0,completeCandidatesGenerated:0,
    completeCandidatesYielded:0,maximumPartialStatesPerDepth:0,activeFrontierPeak:root&&ordered.length>=2?1:0,
    fullGridStarts:0,analyticEligibleStarts:0,analyticallyEliminatedStarts:0,startsEvaluated:0,
    alternativesDeferred:0,alternativesRevisited:0,deferredQueuePeak:0,deferredPushes:0,deferredPops:0,
    deferredGlobalSorts:0,deferredMaintenanceMs:0,startEvaluationMs:0,
    preparedAuthorityBuilds:preparedAuthorities.length,preparedAuthorityHits:0,fixedPlacedScansAvoided:0,
    domainBuildMs:0,finalPlacementCheckMs:0};
  let consumed=0,budgetExhausted=false;
  let active:Partial[]=root&&ordered.length>=2?[partial([],0)]:[];
  const deferred=deferredQueueMode==="GLOBAL_SORT_ORACLE"
    ?new SortedPartialQueue(()=>{diagnostics.deferredGlobalSorts+=1})
    :new PartialPriorityQueue();
  const refreshEliminated=()=>{diagnostics.analyticallyEliminatedStarts=diagnostics.fullGridStarts-diagnostics.analyticEligibleStarts};
  const refill=()=>{
    if(active.length||!deferred.size)return;
    const started=measureTimings?performance.now():0;
    active=[];
    while(active.length<problem.budget.bestK&&deferred.size){active.push(deferred.pop()!);diagnostics.deferredPops+=1;}
    diagnostics.alternativesRevisited+=active.length;
    diagnostics.activeFrontierPeak=Math.max(diagnostics.activeFrontierPeak,active.length);
    if(measureTimings)diagnostics.deferredMaintenanceMs+=performance.now()-started;
  };
  const enqueue=(children:Partial[])=>{
    const started=measureTimings?performance.now():0;
    const ranked=[...children].sort(comparePartial);
    const displaced=active;
    active=ranked.slice(0,problem.budget.bestK);
    const newlyDeferred=[...displaced,...ranked.slice(problem.budget.bestK)];
    diagnostics.alternativesDeferred+=newlyDeferred.length;
    deferred.pushBatch(newlyDeferred);diagnostics.deferredPushes+=newlyDeferred.length;
    diagnostics.deferredQueuePeak=Math.max(diagnostics.deferredQueuePeak,deferred.size);
    diagnostics.activeFrontierPeak=Math.max(diagnostics.activeFrontierPeak,active.length);
    diagnostics.maximumPartialStatesPerDepth=Math.max(diagnostics.maximumPartialStatesPerDepth,active.length);
    if(measureTimings)diagnostics.deferredMaintenanceMs+=performance.now()-started;
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
        const evaluationStarted=measureTimings?performance.now():0;
        const earliest=state.tasks.at(-1)?.end??problem.day.start;
        const prior=[...placed,...state.tasks];
        const logical=Math.max(0,Math.floor((problem.day.end-task.duration-earliest)/5)+1);
        const domainStarted=measureTimings?performance.now():0;
        const authority=preparedAuthorities[depth];
        const domain=authority?authority.domain(state.tasks):exactTaskStartDomain(problem,task,prior,scheduledSpaceMeals);
        if(authority){diagnostics.preparedAuthorityHits+=1;diagnostics.fixedPlacedScansAvoided+=placed.length;}
        if(measureTimings)diagnostics.domainBuildMs+=performance.now()-domainStarted;
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
          const checkStarted=measureTimings?performance.now():0;
          const accepted=authority?authority.accepts(start,domain):canPlaceTask(problem,task,start,prior,scheduledSpaceMeals);
          if(authority)diagnostics.fixedPlacedScansAvoided+=placed.length;
          if(measureTimings)diagnostics.finalPlacementCheckMs+=performance.now()-checkStarted;
          if(!accepted)continue;
          const scheduled={...task,start,end:start+task.duration};
          const incremental=[...new Set(task.requiredResourceIds??[])].reduce((sum,id)=>{
            const resource=problem.resources.find(item=>item.id===id);
            return sum+resourcePresenceIncrement(id,prior,scheduled)*presencePreferenceWeight(resource?.presencePreference??"OFF");
          },0);
          children.push(partial([...state.tasks,scheduled],state.cost+incremental));
        }
        if(measureTimings)diagnostics.startEvaluationMs+=performance.now()-evaluationStarted;
        enqueue(children);
      }
    },
  };
  return explorer;
}

/** Exact count of the complete candidates exposed by the canonical incremental explorer. */
export function probeExactTechnicalChainMacroDomain(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],
  startDomainMode:TechnicalChainStartDomainMode="ANALYTIC_DOMAIN",scheduledSpaceMeals:ScheduledSpaceMeal[]=[]):number{
  const explorer=createTechnicalChainExplorer(problem,chainTasks,placed,Number.POSITIVE_INFINITY,startDomainMode,scheduledSpaceMeals);
  let count=0;
  while(explorer.nextCandidate())count+=1;
  return count;
}

function generateLegacyTechnicalChainCandidates(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],allowance:number,
  mode:TechnicalChainMode,probeLimit:number,scheduledSpaceMeals:ScheduledSpaceMeal[]):TechnicalChainCandidateResult {
  const ordered=orderedTechnicalChainMembers(chainTasks),root=ordered[0];let consumed=0,startsExplored=0,max=0;
  const complete:TechnicalChainCandidate[]=[];
  const diagnostics=():TechnicalChainDiagnostics=>({startsExplored,expansions:consumed,
    completeCandidatesGenerated:complete.length,completeCandidatesYielded:complete.length,
    maximumPartialStatesPerDepth:max,activeFrontierPeak:max,fullGridStarts:consumed,analyticEligibleStarts:consumed,
    analyticallyEliminatedStarts:0,startsEvaluated:consumed,alternativesDeferred:0,alternativesRevisited:0,
    deferredQueuePeak:0,deferredPushes:0,deferredPops:0,deferredGlobalSorts:0,deferredMaintenanceMs:0,startEvaluationMs:0,
    preparedAuthorityBuilds:0,preparedAuthorityHits:0,fixedPlacedScansAvoided:0,domainBuildMs:0,finalPlacementCheckMs:0});
  const finish=(exhausted:boolean):TechnicalChainCandidateResult=>({candidates:complete
    .sort((a,b)=>a.cost-b.cost||technicalChainSignature(a.tasks).localeCompare(technicalChainSignature(b.tasks)))
    .slice(0,mode==="SEARCH"?problem.budget.bestK:complete.length),consumed,exhausted,diagnostics:diagnostics()});
  if(!root||ordered.length<2)return finish(false);
  let states:Partial[]=[partial([],0)];
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
        const candidate=partial([...state.tasks,scheduled],state.cost+incremental);
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
