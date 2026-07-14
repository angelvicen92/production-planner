import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveInitialConstructionProtectedIntervalsForAnchor } from "./initialConstructionSearchSpace";
import { resolveORCPlanningEntryOperationalRoleMetadata, occupiesContestantTime } from "../state/nonWorkTaskClassifier";
import { evaluateORCSpaceCapacitySemantics } from "../state/spaceCapacitySemantics";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import type { InitialConstructionDependencyTemporalBounds } from "./initialConstructionDependencyTemporalBounds";
import { DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET } from "../active/initialConstructionAnchorExplorationBudget";

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
export type InitialConstructionAnchorTemporalCandidateSourceKind = "historical-end-aligned" | "window-start" | "window-end-minus-duration" | "availability-start" | "availability-end-minus-duration" | "fixed-window" | "protected-interval-start" | "protected-interval-end" | "provisional-assignment-start" | "provisional-assignment-end" | "workday-start" | "workday-end-minus-duration" | "assigned-prerequisite-end" | "assigned-dependent-start";
export interface InitialConstructionAnchorTemporalCandidate { windowIndex: number; candidateRankWithinWindow: number; sourceKinds: InitialConstructionAnchorTemporalCandidateSourceKind[]; startPlanned: string; endPlanned: string; fingerprint: string; readOnly: true }
const min=(s?:string|null)=>/^\d{2}:\d{2}$/.test(String(s??""))?Number(String(s).slice(0,2))*60+Number(String(s).slice(3)):null;
const hh=(m:number)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const dur=(t:TaskLike)=>Number(t?.durationOverrideMin??t?.durationMin??t?.durationMinutes??t?.duration??0)||0;
const hash=(v:unknown)=>createHash("sha256").update(stableStringify(v)).digest("hex");
function possiblePlanResourceItemIds(input:EngineInput, task:TaskLike): Set<number>{
  const ids=new Set<number>();
  for(const id of ((task as any).assignedResourceIds??[])) if(Number.isFinite(Number(id))) ids.add(Number(id));
  const req=(task.resourceRequirements??{}) as any;
  for(const rid of Object.keys(req.byItem??{})) for(const item of (input.planResourceItems??[])) if(item.isAvailable!==false&&Number(item.resourceItemId)===Number(rid)) ids.add(Number(item.id));
  for(const group of req.anyOf??[]) for(const rid of group.resourceItemIds??[]) for(const item of (input.planResourceItems??[])) if(item.isAvailable!==false&&Number(item.resourceItemId)===Number(rid)) ids.add(Number(item.id));
  return ids;
}
function affects(a:CandidateAssignment, task:TaskLike, args:{input:EngineInput; originOperationalState?:OperationalState}): boolean {
  const sameTask=Number(a.taskId)===Number(task.id); if(sameTask) return true;
  const tasks=new Map((args.input.tasks??[]).map((t:any)=>[Number(t.id),t])); const other=tasks.get(Number(a.taskId)) as TaskLike|undefined;
  const transportContract=(args.originOperationalState?.constraints as any)?.transportContract??resolveORCTransportContract(args.input as any);
  const mealWindow=args.originOperationalState?.availability?.actualMeal??args.originOperationalState?.availability?.meal??args.originOperationalState?.availability?.mealWindow??(args.input as any).actualMeal??(args.input as any).mealWindow??(args.input as any).meal??null;
  const entry=(x:CandidateAssignment)=>({taskId:x.taskId,startPlanned:x.startPlanned??"",endPlanned:x.endPlanned??"",assignedResourceIds:x.resourceIds??[],spaceId:x.spaceId??null});
  const anchorEntry=entry({taskId:Number(task.id),startPlanned:a.startPlanned,endPlanned:a.endPlanned,spaceId:(task as any).spaceId??null,resourceIds:[]});
  const otherEntry=entry(a);
  const role=resolveORCPlanningEntryOperationalRoleMetadata({entry:anchorEntry as any,task,mealWindow,transportContract});
  const otherRole=resolveORCPlanningEntryOperationalRoleMetadata({entry:otherEntry as any,task:other,mealWindow,transportContract});
  const sameContestant=task.contestantId!=null&&Number(task.contestantId)>0&&Number(task.contestantId)===Number((other as any)?.contestantId)&&occupiesContestantTime({task,entry:anchorEntry as any,roleMetadata:role,mealWindow,transportContract})&&occupiesContestantTime({task:other,entry:otherEntry as any,roleMetadata:otherRole,mealWindow,transportContract});
  const sameResource=(a.resourceIds??[]).some(id=>possiblePlanResourceItemIds(args.input,task).has(Number(id)));
  const sameSpace=a.spaceId!=null&&task.spaceId!=null&&Number(a.spaceId)===Number(task.spaceId)&&evaluateORCSpaceCapacitySemantics({entries:[anchorEntry as any,otherEntry as any],tasks:new Map([[Number(task.id),task],[Number(a.taskId),other]]) as any,spaces:args.originOperationalState?.spaces,mealWindow,transportContract}).length>0;
  return sameContestant||sameSpace||sameResource;
}
function add(map:Map<number,Set<InitialConstructionAnchorTemporalCandidateSourceKind>>, start:number|null, source:InitialConstructionAnchorTemporalCandidateSourceKind){ if(start==null||!Number.isFinite(start)) return; const set=map.get(start)??new Set(); set.add(source); map.set(start,set); }
export function generateInitialConstructionAnchorTemporalCandidates(args:{input:EngineInput; anchorTask:TaskLike; provisionalWindow:{start:string;end:string}; provisionalAssignments?:readonly CandidateAssignment[]; originOperationalState?:OperationalState; maxCandidates?:number; windowIndex?:number; dependencyTemporalBounds?: InitialConstructionDependencyTemporalBounds | null}): InitialConstructionAnchorTemporalCandidate[]{
  const d=dur(args.anchorTask); const ws=min(args.provisionalWindow.start), we=min(args.provisionalWindow.end); if(!d||ws==null||we==null||we-ws<d) return deepFreeze([]) as any;
  const fixedStart=min(String(args.anchorTask.fixedWindowStart??"")), fixedEnd=min(String(args.anchorTask.fixedWindowEnd??""));
  const depEarliest=min(args.dependencyTemporalBounds?.earliestStart??null), depLatest=min(args.dependencyTemporalBounds?.latestEnd??null);
  if(fixedStart!=null||fixedEnd!=null){ const start=fixedStart??(fixedEnd==null?null:fixedEnd-d), end=fixedEnd??(fixedStart==null?null:fixedStart+d); if(start==null||end==null||end-start!==d||start<ws||end>we||(depEarliest!=null&&start<depEarliest)||(depLatest!=null&&end>depLatest)){ return deepFreeze([]) as any; } const only={windowIndex:args.windowIndex??0,candidateRankWithinWindow:0,sourceKinds:["fixed-window" as const],startPlanned:hh(start),endPlanned:hh(end),fingerprint:"",readOnly:true as const}; only.fingerprint=hash({...only,fingerprint:undefined}); return deepFreeze([only]) as any; }
  const starts=new Map<number,Set<InitialConstructionAnchorTemporalCandidateSourceKind>>();
  add(starts,we-d,"historical-end-aligned"); add(starts,ws,"window-start"); add(starts,we-d,"window-end-minus-duration");
  const av=args.anchorTask.contestantId!=null?(args.input.contestantAvailabilityById??{})[Number(args.anchorTask.contestantId)]:null; add(starts,min(av?.start??args.input.workDay?.start),"availability-start"); const ae=min(av?.end??args.input.workDay?.end); add(starts,ae==null?null:ae-d,"availability-end-minus-duration");
  add(starts,min(args.input.workDay?.start),"workday-start"); const wde=min(args.input.workDay?.end); add(starts,wde==null?null:wde-d,"workday-end-minus-duration");
  for(const it of resolveInitialConstructionProtectedIntervalsForAnchor({input:args.input,anchor:{anchorTaskId:args.anchorTask.id,contestantId:args.anchorTask.contestantId??null,spaceId:args.anchorTask.spaceId??null,zoneId:args.anchorTask.zoneId??null}})){ const s=min(it.start), e=min(it.end); add(starts,s==null?null:s-d,"protected-interval-start"); add(starts,e,"protected-interval-end"); }
  for(const b of args.dependencyTemporalBounds?.prerequisiteFinishBounds??[]) add(starts,b.minutes,"assigned-prerequisite-end");
  for(const b of args.dependencyTemporalBounds?.dependentStartBounds??[]) add(starts,b.minutes-d,"assigned-dependent-start");
  for(const a of [...(args.provisionalAssignments??[]), ...((args.originOperationalState?.planning??[]).map((p:any)=>({taskId:p.taskId,startPlanned:p.startPlanned,endPlanned:p.endPlanned,spaceId:p.spaceId??null,resourceIds:p.assignedResourceIds??[]})) as CandidateAssignment[])].filter(a=>affects(a,args.anchorTask,args)).sort((a,b)=>Number(a.taskId)-Number(b.taskId)||String(a.startPlanned).localeCompare(String(b.startPlanned)))){ const s=min(a.startPlanned), e=min(a.endPlanned); add(starts,s==null?null:s-d,"provisional-assignment-start"); add(starts,e,"provisional-assignment-end"); }
  const candidates=[...starts.entries()].filter(([s])=>s>=ws&&s+d<=we&&(depEarliest==null||s>=depEarliest)&&(depLatest==null||s+d<=depLatest)).sort((a,b)=>{ const ha=a[1].has("historical-end-aligned")?0:1, hb=b[1].has("historical-end-aligned")?0:1; return ha-hb||a[0]-b[0]; }).slice(0,args.maxCandidates??DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET.maxTemporalCandidatesPerAnchor).map(([s,sources],i)=>{ const c={windowIndex:args.windowIndex??0,candidateRankWithinWindow:i,sourceKinds:[...sources].sort(),startPlanned:hh(s),endPlanned:hh(s+d),fingerprint:"",readOnly:true as const}; c.fingerprint=hash({...c,fingerprint:undefined}); return c; });
  return deepFreeze(candidates) as any;
}
