import type { OperationalState } from "../contracts";
import type { ProductionWavePolicyDiagnostics } from "./productionWavePolicy";

type Entry = any & { a: number; b: number; task: any };
const toMin = (t?: string | null): number | null => { const p=String(t??"").split(":").map(Number); return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:null; };
const uniq = (xs:number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a,b)=>a-b);
const productive = (e:any) => e.countsAsWork !== false && !["transport_arrival","transport_departure","meal_break_placeholder","global_break_placeholder","non_operational_placeholder"].includes(e.operationalRole);
const deps = (task:any) => uniq([...(task?.dependsOnTaskIds??[]), ...(task?.dependsOnTaskId!=null?[task.dependsOnTaskId]:[])]);
const subjectId = (task:any) => task?.contestantId ?? task?.itinerantTeamId ?? null;

export interface ProductionWaveBlockAnalysis {
  mainFlowTasks: Entry[];
  mainFlowByResource: Array<{ resourceId: number; taskIds: number[]; totalMinutes: number; mainFlowMinutes: number; prerequisiteMinutes: number }>;
  prerequisiteTasksByMainTask: Record<number, number[]>;
  resourceCriticality: Array<{ resourceId: number; score: number; reasons: string[]; taskIds: number[] }>;
  coachLikeResourceBlocks: Array<{ resourceId: number; taskIds: number[]; subjectIds: number[]; start: string | null; end: string | null; minutes: number; criticalityScore: number }>;
  talentAvailabilityPressure: Array<{ subjectId: number; windowStart: string | null; windowEnd: string | null; availableMinutes: number | null; taskIds: number[]; score: number }>;
  candidateMainFlowBlocks: Array<{ resourceId: number; mainTaskIds: number[]; prerequisiteTaskIds: number[]; totalMinutes: number; score: number }>;
  mealWindow: any | null;
  hardBreaks: any[];
  warnings: string[];
}

export function analyzeProductionWaveBlocks(args:{ operationalState: OperationalState; productionWavePolicy: ProductionWavePolicyDiagnostics; mainZoneTarget: any; currentPlanning?: any[] }): ProductionWaveBlockAnalysis {
  const state=args.operationalState; const tasks=new Map((state.tasks??[]).map((t:any)=>[t.id,t]));
  const planning=(args.currentPlanning??state.planning??[]).map((e:any)=>({...e,a:toMin(e.startPlanned),b:toMin(e.endPlanned),task:tasks.get(e.taskId)})).filter((e:any)=>e.a!=null&&e.b!=null).sort((x:any,y:any)=>x.a-y.a||x.b-y.b) as Entry[];
  const mainFlowTasks=planning.filter((e:any)=>productive(e) && (e.countsForMainFlow===true || (e.spaceId!=null&&args.mainZoneTarget?.mainSpaceIds?.includes(e.spaceId)) || (e.zoneId!=null&&args.mainZoneTarget?.mainZoneIds?.includes(e.zoneId))));
  const byTask=new Map(planning.map(e=>[e.taskId,e])); const prereq:Record<number,number[]>={};
  for(const e of mainFlowTasks) prereq[e.taskId]=deps(e.task).filter(id=>byTask.has(id));
  const mainIds=new Set(mainFlowTasks.map(e=>e.taskId)); const prereqIds=new Set(Object.values(prereq).flat());
  const load=new Map<number,{taskIds:Set<number>; total:number; main:number; pre:number; reasons:Set<string>}>();
  for(const e of planning.filter(productive)) for(const r of e.assignedResourceIds??[]) { const x=load.get(r)??{taskIds:new Set(),total:0,main:0,pre:0,reasons:new Set<string>()}; x.taskIds.add(e.taskId); x.total+=e.b-e.a; if(mainIds.has(e.taskId)){x.main+=e.b-e.a; x.reasons.add("appears_in_main_flow");} if(prereqIds.has(e.taskId)){x.pre+=e.b-e.a; x.reasons.add("appears_in_main_flow_prerequisites");} load.set(r,x); }
  const resourceCriticality=[...load.entries()].map(([resourceId,x])=>({resourceId, score:x.main*3+x.pre*2+x.total/10+x.taskIds.size, reasons:[...x.reasons, ...(x.total>=120?["high_load"]:[])], taskIds:uniq([...x.taskIds])})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.resourceId-b.resourceId);
  const mainFlowByResource=resourceCriticality.map(r=>({resourceId:r.resourceId, taskIds:r.taskIds.filter(id=>mainIds.has(id)||prereqIds.has(id)), totalMinutes:load.get(r.resourceId)!.total, mainFlowMinutes:load.get(r.resourceId)!.main, prerequisiteMinutes:load.get(r.resourceId)!.pre}));
  const coachLikeResourceBlocks=resourceCriticality.slice(0, args.productionWavePolicy.values.coachBlocks.preferredMainFlowCoachBlocks+2).map(r=>{ const es=planning.filter(e=>(e.assignedResourceIds??[]).includes(r.resourceId)&&(mainIds.has(e.taskId)||prereqIds.has(e.taskId))); return { resourceId:r.resourceId, taskIds:es.map(e=>e.taskId), subjectIds:uniq(es.map(e=>subjectId(e.task)).filter((x:any)=>x!=null)), start:es[0]?.startPlanned??null, end:es[es.length-1]?.endPlanned??null, minutes:es.reduce((s,e)=>s+e.b-e.a,0), criticalityScore:r.score }; });
  const bySubject=new Map<number,Entry[]>(); for(const e of planning.filter(productive)){ const sid=subjectId(e.task); if(sid!=null) bySubject.set(sid,[...(bySubject.get(sid)??[]),e]); }
  const talentAvailabilityPressure=[...bySubject.entries()].map(([sid,es])=>{ const w=(state.availability?.contestantAvailabilityById??{})[sid]; const a=toMin(w?.start), b=toMin(w?.end); const available=a!=null&&b!=null?b-a:null; return { subjectId:sid, windowStart:w?.start??null, windowEnd:w?.end??null, availableMinutes:available, taskIds:es.map(e=>e.taskId), score:(available==null?0:Math.max(0,720-available))+es.length*10+es.filter(e=>mainIds.has(e.taskId)).length*30 }; }).sort((a,b)=>b.score-a.score||a.subjectId-b.subjectId);
  const candidateMainFlowBlocks=resourceCriticality.map(r=>({ resourceId:r.resourceId, mainTaskIds:mainFlowTasks.filter(e=>(e.assignedResourceIds??[]).includes(r.resourceId)).map(e=>e.taskId), prerequisiteTaskIds:uniq(mainFlowTasks.filter(e=>(e.assignedResourceIds??[]).includes(r.resourceId)).flatMap(e=>prereq[e.taskId]??[])), totalMinutes:load.get(r.resourceId)?.total??0, score:r.score })).filter(b=>b.mainTaskIds.length).sort((a,b)=>b.score-a.score||a.resourceId-b.resourceId);
  return { mainFlowTasks, mainFlowByResource, prerequisiteTasksByMainTask:prereq, resourceCriticality, coachLikeResourceBlocks, talentAvailabilityPressure, candidateMainFlowBlocks, mealWindow:state.availability?.mealWindow??state.availability?.meal??null, hardBreaks:state.availability?.globalHardBreaks??[], warnings: mainFlowTasks.length?[]:["main_flow_tasks_not_detected"] };
}
