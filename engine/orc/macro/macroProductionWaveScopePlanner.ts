import type { OperationalState } from "../contracts";
import { isMacroPlaceholderTask } from "./macroProductionWaveTaskClassifier";

const toMin=(t?:string|null)=>{const p=String(t??"").split(":").map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:null};
const uniq=(xs:number[])=>[...new Set(xs.filter(Number.isFinite))].sort((a,b)=>a-b);
const deps=(t:any)=>uniq([...(t?.dependsOnTaskIds??[]),...(t?.dependsOnTaskId!=null?[t.dependsOnTaskId]:[])]);
const sameRes=(a:any,b:any)=>((a?.assignedResourceIds??[]) as number[]).some(r=>(b?.assignedResourceIds??[]).includes(r));

export type MacroProductionWaveScopeOption={scopeId:string;strategy:string;mainTaskIds:number[];prerequisiteTaskIds:number[];includedPrerequisiteTaskIds:number[];leftInPlaceCompatiblePrerequisiteTaskIds:number[];excludedNonBlockingPrerequisiteTaskIds:number[];resourceIds:number[];expectedMovedTaskUpperBound:number;reason:string;priorityScore:number;fitsPolicyLimits:boolean;rejectionReason?:string;readOnly:true};

export function buildMacroProductionWaveScopeOptions(args:{operationalState:OperationalState;taskClassification:any;productionWavePolicy:any;mainZoneTarget:any;currentPlanning?:any[];gap?:any;coachBlockAnalysis?:any;subjectPriorityDiagnostics?:any;}):MacroProductionWaveScopeOption[]{
 const state=args.operationalState; const policy=args.productionWavePolicy.values??args.productionWavePolicy; const limit=policy.runtime.macroDayShapeMaxMovedTasks; const resLimit=policy.runtime.macroDayShapeMaxResources;
 const tasks=new Map((state.tasks??[]).map((t:any)=>[t.id,t])); const entries=(args.currentPlanning??state.planning??[]).map((e:any)=>({...e,a:toMin(e.startPlanned),b:toMin(e.endPlanned),task:tasks.get(e.taskId)})).filter((e:any)=>e.a!=null&&e.b!=null).sort((a:any,b:any)=>a.a-b.a||a.b-b.b);
 const byId=new Map(entries.map((e:any)=>[e.taskId,e])); const main=entries.filter((e:any)=>args.taskClassification.mainFlowTaskIds.includes(e.taskId)); const gap=args.gap; const idx=gap?Math.max(0,main.findIndex((e:any)=>e.a>=gap.end)):0; const next=main[idx]??main[0]; const critical=args.coachBlockAnalysis?.resourceCriticality?.[0]?.resourceId; const nextSame=main.find((e:any)=>e.taskId!==next?.taskId && (sameRes(e,next)|| (critical!=null&&(e.assignedResourceIds??[]).includes(critical))));
 const around=main.slice(Math.max(0,idx-1),idx+4).map((e:any)=>e.taskId); const resSeed=critical??next?.assignedResourceIds?.[0]; const resBlock=main.filter((e:any)=>(e.assignedResourceIds??[]).includes(resSeed)).slice(0,4).map((e:any)=>e.taskId); const coachBlock=(args.coachBlockAnalysis?.coachLikeResourceBlocks?.[0]?.taskIds??resBlock).filter((id:number)=>args.taskClassification.mainFlowTaskIds.includes(id)).slice(0,4);
 const fullMain=main.slice(Math.max(0,idx-1),Math.max(0,idx-1)+(policy.runtime.macroDayShapeMaxMainTasks??12)).map((e:any)=>e.taskId);
 const specs=[
  ["gap-next-main-only", next?[next.taskId]:[]],
  ["gap-next-main-pair", uniq([next?.taskId,nextSame?.taskId].filter(Boolean) as number[])],
  ["single-resource-main-mini-block", resBlock.length?resBlock:around.slice(0,3)],
  ["main-flow-gap-window-small", around.slice(0,5)],
  ["coach-aligned-mini-wave", coachBlock.length?coachBlock:resBlock],
  ["full-requested-scope", fullMain],
 ] as [string,number[]][];
 return specs.filter(([,ids])=>ids.length).map(([strategy,mainTaskIds],n)=>{
  const proposedStart=gap?.start??(byId.get(mainTaskIds[0]) as any)?.a??toMin(state.workDay?.start)??0; const included:number[]=[]; const left:number[]=[]; const excluded:number[]=[];
  for(const mid of mainTaskIds){ for(const pid of deps(tasks.get(mid))){ const pe:any=byId.get(pid); if(!pe||isMacroPlaceholderTask(pe)){ excluded.push(pid); continue; } if((pe.b??Infinity)<=proposedStart) left.push(pid); else included.push(pid); }}
  const prerequisiteTaskIds=uniq(included); const resourceIds=uniq([...mainTaskIds,...prerequisiteTaskIds].flatMap(id=>(byId.get(id) as any)?.assignedResourceIds??[])).slice(0,resLimit); const upper=mainTaskIds.length+prerequisiteTaskIds.length; const fits=upper<=limit;
  return {scopeId:strategy,strategy,mainTaskIds:uniq(mainTaskIds),prerequisiteTaskIds,includedPrerequisiteTaskIds:prerequisiteTaskIds,leftInPlaceCompatiblePrerequisiteTaskIds:uniq(left),excludedNonBlockingPrerequisiteTaskIds:uniq(excluded),resourceIds,expectedMovedTaskUpperBound:upper,reason:`${strategy} selecciona ${mainTaskIds.length} main y ${prerequisiteTaskIds.length} prerequisitos indispensables`,priorityScore:100-n*10-upper,fitsPolicyLimits:fits,...(!fits?{rejectionReason:"macro-day-shape-scope-too-large"}:{}),readOnly:true as const};
 });
}
