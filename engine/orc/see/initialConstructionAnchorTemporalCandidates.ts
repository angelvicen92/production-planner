import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveInitialConstructionProtectedIntervalsForAnchor } from "./initialConstructionSearchSpace";

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
export type InitialConstructionAnchorTemporalCandidateSourceKind = "historical-end-aligned" | "window-start" | "window-end-minus-duration" | "availability-start" | "availability-end-minus-duration" | "fixed-window" | "protected-interval-start" | "protected-interval-end" | "provisional-assignment-start" | "provisional-assignment-end" | "workday-start" | "workday-end-minus-duration";
export interface InitialConstructionAnchorTemporalCandidate { windowIndex: number; candidateRankWithinWindow: number; sourceKinds: InitialConstructionAnchorTemporalCandidateSourceKind[]; startPlanned: string; endPlanned: string; fingerprint: string; readOnly: true }
const min=(s?:string|null)=>/^\d{2}:\d{2}$/.test(String(s??""))?Number(String(s).slice(0,2))*60+Number(String(s).slice(3)):null;
const hh=(m:number)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const dur=(t:TaskLike)=>Number(t?.durationOverrideMin??t?.durationMin??t?.durationMinutes??t?.duration??0)||0;
const hash=(v:unknown)=>createHash("sha256").update(stableStringify(v)).digest("hex");
function affects(a:CandidateAssignment, task:TaskLike): boolean { const sameTask=Number(a.taskId)===Number(task.id); const sameSpace=a.spaceId!=null&&task.spaceId!=null&&Number(a.spaceId)===Number(task.spaceId); const ids=new Set((a.resourceIds??[]).map(Number)); const assigned=(task as any).assignedResourceIds??[]; const sameResource=assigned.some((id:any)=>ids.has(Number(id))); return sameTask||sameSpace||sameResource; }
function add(map:Map<number,Set<InitialConstructionAnchorTemporalCandidateSourceKind>>, start:number|null, source:InitialConstructionAnchorTemporalCandidateSourceKind){ if(start==null||!Number.isFinite(start)) return; const set=map.get(start)??new Set(); set.add(source); map.set(start,set); }
export function generateInitialConstructionAnchorTemporalCandidates(args:{input:EngineInput; anchorTask:TaskLike; provisionalWindow:{start:string;end:string}; provisionalAssignments?:readonly CandidateAssignment[]; originOperationalState?:OperationalState; maxCandidates?:number; windowIndex?:number}): InitialConstructionAnchorTemporalCandidate[]{
  const d=dur(args.anchorTask); const ws=min(args.provisionalWindow.start), we=min(args.provisionalWindow.end); if(!d||ws==null||we==null||we-ws<d) return deepFreeze([]) as any;
  const fixedStart=min(String(args.anchorTask.fixedWindowStart??"")), fixedEnd=min(String(args.anchorTask.fixedWindowEnd??""));
  if(fixedStart!=null&&fixedEnd!=null){ const only={windowIndex:args.windowIndex??0,candidateRankWithinWindow:0,sourceKinds:["fixed-window" as const],startPlanned:hh(fixedStart),endPlanned:hh(fixedEnd),fingerprint:"",readOnly:true as const}; only.fingerprint=hash({...only,fingerprint:undefined}); return deepFreeze([only]) as any; }
  const starts=new Map<number,Set<InitialConstructionAnchorTemporalCandidateSourceKind>>();
  add(starts,we-d,"historical-end-aligned"); add(starts,ws,"window-start"); add(starts,we-d,"window-end-minus-duration");
  const av=args.anchorTask.contestantId!=null?(args.input.contestantAvailabilityById??{})[Number(args.anchorTask.contestantId)]:null; add(starts,min(av?.start??args.input.workDay?.start),"availability-start"); const ae=min(av?.end??args.input.workDay?.end); add(starts,ae==null?null:ae-d,"availability-end-minus-duration");
  add(starts,min(args.input.workDay?.start),"workday-start"); const wde=min(args.input.workDay?.end); add(starts,wde==null?null:wde-d,"workday-end-minus-duration");
  for(const it of resolveInitialConstructionProtectedIntervalsForAnchor({input:args.input,anchor:{anchorTaskId:args.anchorTask.id,contestantId:args.anchorTask.contestantId??null,spaceId:args.anchorTask.spaceId??null,zoneId:args.anchorTask.zoneId??null}})){ const s=min(it.start), e=min(it.end); add(starts,s==null?null:s-d,"protected-interval-start"); add(starts,e,"protected-interval-end"); }
  for(const a of [...(args.provisionalAssignments??[]), ...((args.originOperationalState?.planning??[]).map((p:any)=>({taskId:p.taskId,startPlanned:p.startPlanned,endPlanned:p.endPlanned,spaceId:p.spaceId??null,resourceIds:p.assignedResourceIds??[]})) as CandidateAssignment[])].filter(a=>affects(a,args.anchorTask)).sort((a,b)=>Number(a.taskId)-Number(b.taskId)||String(a.startPlanned).localeCompare(String(b.startPlanned)))){ const s=min(a.startPlanned), e=min(a.endPlanned); add(starts,s==null?null:s-d,"provisional-assignment-start"); add(starts,e,"provisional-assignment-end"); }
  const candidates=[...starts.entries()].filter(([s])=>s>=ws&&s+d<=we).sort((a,b)=>{ const ha=a[1].has("historical-end-aligned")?0:1, hb=b[1].has("historical-end-aligned")?0:1; return ha-hb||a[0]-b[0]; }).slice(0,args.maxCandidates??8).map(([s,sources],i)=>{ const c={windowIndex:args.windowIndex??0,candidateRankWithinWindow:i,sourceKinds:[...sources].sort(),startPlanned:hh(s),endPlanned:hh(s+d),fingerprint:"",readOnly:true as const}; c.fingerprint=hash({...c,fingerprint:undefined}); return c; });
  return deepFreeze(candidates) as any;
}
