import type { OperationalState } from "../contracts";
import { configuredHardBreaks } from "../validation/protectedBreakScope";

export interface CriticalResourceIdleGap {
  readonly resourceId: number; readonly idleGapStart: string; readonly idleGapEnd: string; readonly idleGapMinutes: number; readonly previousTaskId: number; readonly nextTaskId: number; readonly previousBlockTaskIds: number[]; readonly nextBlockTaskIds: number[]; readonly resourceWorkMinutes: number; readonly resourceActiveSpanMinutes: number; readonly resourceIdleMinutes: number; readonly coveredByHardBreak: boolean; readonly coveredByMealPlaceholder: boolean; readonly candidateEligible: boolean; readonly eligibilityReason: string; readonly readOnly: true;
}
export interface DetectCriticalResourceIdleGapsOptions { readonly rootCauseAnalysis?: unknown; readonly opqm?: unknown; readonly maxResources?: number; readonly minGapMinutes?: number; }
type Entry = OperationalState["planning"][number] & { start: number; end: number; resources: number[] };
const tm=(v:unknown)=> typeof v==="string"&&/^\d{2}:\d{2}$/.test(v)?(()=>{const [h,m]=v.split(":").map(Number); return h>=0&&h<24&&m>=0&&m<60?h*60+m:null;})():null;
const tt=(m:number)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const ov=(a:number,b:number,c:number,d:number)=>a<d&&c<b;
const full=(a:number,b:number,c:number,d:number)=>c<=a&&d>=b;
const nums=(v:unknown): number[] => Array.isArray(v)?v.flatMap((x)=> typeof x==="number"&&Number.isFinite(x)?[x]: typeof x==="string"&&/^\d+$/.test(x)?[Number(x)]:[]):[];
function rankedResources(state:OperationalState, opqm:unknown): number[] { const real=[...new Set((state.planning??[]).flatMap((p:any)=>nums(p.assignedResourceIds??p.assignedResources)))].sort((a,b)=>a-b); const found: number[]=[]; const scan=(x:unknown)=>{ if(!x||typeof x!=="object") return; const r=(x as any).resourceId??(x as any).id; const idle=(x as any).idleMinutes??(x as any).resourceIdleMinutes??(x as any).idleTotalMinutes; if((typeof r==="number"||typeof r==="string")&&Number.isFinite(Number(r)) && (idle==null||Number(idle)>0)) found.push(Number(r)); for(const v of Object.values(x as any)) if(typeof v==="object") Array.isArray(v)?v.forEach(scan):scan(v); }; scan(opqm); const pref=[...new Set(found.filter((r)=>real.includes(r)))]; return [...pref, ...real.filter((r)=>!pref.includes(r))]; }
function mealPlaceholders(state:OperationalState){ return (state.planning??[]).flatMap((p:any)=>{ const s=tm(p.startPlanned), e=tm(p.endPlanned); const task=(state.tasks??[]).find(t=>t.id===p.taskId) as any; const kind=String(task?.kind??task?.type??task?.role??p.kind??"").toLowerCase(); return s!=null&&e!=null&&/(meal|comida|lunch)/.test(kind)?[{s,e}]:[]; }); }
export function detectCriticalResourceIdleGaps(state: OperationalState | null | undefined, options: DetectCriticalResourceIdleGapsOptions = {}): CriticalResourceIdleGap[] {
  if(!state) return [];
  const minGap=options.minGapMinutes??1; const tasks=new Map((state.tasks??[]).map((t)=>[t.id,t]));
  const entries: Entry[]=(state.planning??[]).flatMap((p:any)=>{ const s=tm(p.startPlanned), e=tm(p.endPlanned); const task:any=tasks.get(p.taskId); const resources=nums(p.assignedResourceIds??task?.assignedResourceIds??p.assignedResources); return s!=null&&e!=null&&e>s&&resources.length?[{...p,start:s,end:e,resources}]:[]; });
  const hard=configuredHardBreaks(state).filter((b:any)=>String(b.kind??"")!=="meal").flatMap((b)=>{ const s=tm(b.start), e=tm(b.end); return s!=null&&e!=null?[{s,e}]:[]; }); const meals=mealPlaceholders(state);
  const order=rankedResources(state, options.opqm??options.rootCauseAnalysis); const out: CriticalResourceIdleGap[]=[];
  for(const resourceId of order){ const rs=entries.filter(e=>e.resources.includes(resourceId)).sort((a,b)=>a.start-b.start||a.end-b.end||a.taskId-b.taskId); if(rs.length<2) continue; const work=rs.reduce((sum,e)=>sum+e.end-e.start,0), span=rs[rs.length-1].end-rs[0].start, idle=Math.max(0,span-work);
    for(let i=0;i<rs.length-1;i++){ const prev=rs[i], next=rs[i+1], gap=next.start-prev.end; if(gap<minGap) continue; const hb=hard.some(b=>full(prev.end,next.start,b.s,b.e)); const mp=meals.some(m=>full(prev.end,next.start,m.s,m.e)); out.push({resourceId,idleGapStart:tt(prev.end),idleGapEnd:tt(next.start),idleGapMinutes:gap,previousTaskId:prev.taskId,nextTaskId:next.taskId,previousBlockTaskIds:[prev.taskId],nextBlockTaskIds:[next.taskId],resourceWorkMinutes:work,resourceActiveSpanMinutes:span,resourceIdleMinutes:idle,coveredByHardBreak:hb,coveredByMealPlaceholder:mp,candidateEligible:!hb&&!mp,eligibilityReason:hb?"critical_resource_idle_gap_covered_by_hard_break":mp?"critical_resource_idle_gap_covered_by_meal_placeholder":"eligible",readOnly:true}); }
  }
  const rank=new Map(order.map((r,i)=>[r,i])); return out.sort((a,b)=>Number(a.coveredByHardBreak)-Number(b.coveredByHardBreak)||b.idleGapMinutes-a.idleGapMinutes||(rank.get(a.resourceId)??9999)-(rank.get(b.resourceId)??9999)||a.resourceId-b.resourceId||tm(a.idleGapStart)!-tm(b.idleGapStart)!);
}
