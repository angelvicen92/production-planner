import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";

export type TechnicalChainMode = "SEARCH" | "PROBE";
export type TechnicalChainCandidate = { tasks: ScheduledTask[]; cost: number; rootTaskId: string; start: number; end: number };
export type TechnicalChainDiagnostics = { startsExplored: number; expansions: number; completeCandidatesGenerated: number; maximumPartialStatesPerDepth: number };
export type TechnicalChainCandidateResult = { candidates: TechnicalChainCandidate[]; consumed: number; exhausted: boolean; diagnostics: TechnicalChainDiagnostics };
export const getTechnicalTasks = (tasks: Task[]) => tasks.filter((t): t is Extract<Task,{kind:"technical"}> => t.kind === "technical");
export function buildTechnicalPrerequisiteMap(tasks: Task[]): Map<string,string[]> { return new Map(getTechnicalTasks(tasks).map(t=>[t.id,Array.isArray(t.dependencies)?[...t.dependencies]:[]])); }
export function buildTechnicalDependentMap(tasks: Task[]): Map<string,string[]> { const map=new Map(getTechnicalTasks(tasks).map(t=>[t.id,[] as string[]])); for(const t of getTechnicalTasks(tasks)) for(const d of Array.isArray(t.dependencies)?t.dependencies:[]) if(map.has(d)) map.get(d)!.push(t.id); for(const v of map.values())v.sort(); return map; }
export function technicalChainHasBranching(tasks:Task[]):boolean { const p=buildTechnicalPrerequisiteMap(tasks),d=buildTechnicalDependentMap(tasks); return [...p.values()].some(x=>x.length>1)||[...d.values()].some(x=>x.length>1); }
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
export function generateTechnicalChainCandidates(problem:PlannerNextProblem,chainTasks:Task[],placed:ScheduledTask[],allowance:number,mode:TechnicalChainMode="SEARCH",probeLimit=1):TechnicalChainCandidateResult {
 const ordered=orderedTechnicalChainMembers(chainTasks),root=ordered[0];let consumed=0,startsExplored=0,max=0;const complete:TechnicalChainCandidate[]=[];
 const finish=(exhausted:boolean)=>({candidates:complete.sort((a,b)=>a.cost-b.cost||technicalChainSignature(a.tasks).localeCompare(technicalChainSignature(b.tasks))).slice(0,mode==="SEARCH"?problem.budget.bestK:complete.length),consumed,exhausted,diagnostics:{startsExplored,expansions:consumed,completeCandidatesGenerated:complete.length,maximumPartialStatesPerDepth:max}});
 if(!root||ordered.length<2)return finish(false);
 type Partial={tasks:ScheduledTask[];cost:number};let states:Partial[]=[{tasks:[],cost:0}];
 for(let depth=0;depth<ordered.length;depth++){const task=ordered[depth]!;const next:Partial[]=[];for(const state of states){const earliest=state.tasks.at(-1)?.end??problem.day.start;for(let start=earliest;start+task.duration<=problem.day.end;start+=5){if(depth===0)startsExplored++;if(consumed>=allowance)return finish(true);consumed++;const prior=[...placed,...state.tasks];if(!canPlaceTask(problem,task,start,prior))continue;const scheduled={...task,start,end:start+task.duration};const cost=[...new Set(task.requiredResourceIds??[])].reduce((sum,id)=>{const r=problem.resources.find(x=>x.id===id);return sum+resourcePresenceIncrement(id,prior,scheduled)*presencePreferenceWeight(r?.presencePreference??"OFF")},0);next.push({tasks:[...state.tasks,scheduled],cost:state.cost+cost});}}
 states=next.sort((a,b)=>a.cost-b.cost||technicalChainSignature(a.tasks).localeCompare(technicalChainSignature(b.tasks))).slice(0,problem.budget.bestK);max=Math.max(max,states.length);if(!states.length)break;}
 for(const s of states)if(s.tasks.length===ordered.length){complete.push({tasks:s.tasks,cost:s.cost,rootTaskId:root.id,start:s.tasks[0]!.start,end:s.tasks.at(-1)!.end});if(mode==="PROBE"&&complete.length>=probeLimit)return finish(false);}return finish(false);
}
