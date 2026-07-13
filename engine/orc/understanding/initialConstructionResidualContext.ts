import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionMap } from "./initialConstructionMap";

const uniq=(a:number[])=>[...new Set(a.filter(Number.isFinite))].sort((x,y)=>x-y);
const dur=(t:any)=>Number(t?.durationOverrideMin??t?.durationMin??t?.durationMinutes??t?.duration??0)||0;

export interface InitialConstructionResidualContext { readonly basePartialPlanId:string|null; readonly baseBranchId:string|null; readonly provisionalAssignments:readonly any[]; readonly provisionallyAssignedTaskIds:readonly number[]; readonly residualPendingTaskIds:readonly number[]; readonly residualProductiveTaskIds:readonly number[]; readonly provisionallySatisfiedDependencyTaskIds:readonly number[]; readonly provisionalOccupancyByContestant:Readonly<Record<string,number>>; readonly provisionalOccupancyBySpace:Readonly<Record<string,number>>; readonly provisionalOccupancyByResource:Readonly<Record<string,number>>; readonly residualMainFlowTaskIds:readonly number[]; readonly residualMainFlowAnchorEligibleTaskIds:readonly number[]; readonly firstAnchorTaskId:number|null; readonly firstClosureTaskIds:readonly number[]; readonly fingerprint:string; readonly readOnly:true; }

export function buildInitialConstructionResidualContext(args:{originInput:EngineInput; originOperationalState:OperationalState; stage2:any}):InitialConstructionResidualContext{
  const assignments=[...(args.stage2?.selectedAssignments??[])].map((a:any)=>({...a,resourceIds:[...(a.resourceIds??a.assignedResourceIds??[])].sort((x:number,y:number)=>x-y)})).sort((a,b)=>a.taskId-b.taskId);
  const assigned=uniq(assignments.map((a:any)=>Number(a.taskId)));
  const tasks=[...(args.originInput.tasks??[])].sort((a:any,b:any)=>a.id-b.id);
  const byId=new Map(tasks.map((t:any)=>[t.id,t]));
  const map:any=buildInitialConstructionMap({input:args.originInput,state:args.originOperationalState,planningMode:"INITIAL_CONSTRUCTION",provisionalAssignments:assignments,provisionallyAssignedTaskIds:assigned});
  const occC:Record<string,number>={}, occS:Record<string,number>={}, occR:Record<string,number>={};
  for(const a of assignments){ const t:any=byId.get(a.taskId); const m=dur(t); if(t?.contestantId!=null) occC[String(t.contestantId)]=(occC[String(t.contestantId)]??0)+m; if(a.spaceId!=null) occS[String(a.spaceId)]=(occS[String(a.spaceId)]??0)+m; for(const r of a.resourceIds??[]) occR[String(r)]=(occR[String(r)]??0)+m; }
  const payload={v:"INITIAL-CONSTRUCTION-RESIDUAL-CONTEXT-V1",basePartialPlanId:args.stage2?.selectedPartialPlanId??null,baseBranchId:args.stage2?.selectedBranchId??null,assigned,residualPendingTaskIds:map.pendingTaskCount,main:map.mainFlowPressure?.mainFlowAnchorEligibleTaskIds,occC,occS,occR};
  return deepFreeze({basePartialPlanId:args.stage2?.selectedPartialPlanId??null,baseBranchId:args.stage2?.selectedBranchId??null,provisionalAssignments:assignments,provisionallyAssignedTaskIds:assigned,residualPendingTaskIds:uniq((map as any).dependencyGraph.nodes.map((n:any)=>n.taskId).filter((id:number)=>!assigned.includes(id)&&tasks.find((t:any)=>t.id===id)?.status!=="done"&&tasks.find((t:any)=>t.id===id)?.status!=="in_progress")),residualProductiveTaskIds:uniq((map.mainFlowPressure?.mainFlowProductiveTaskIds??[]).concat((map.contestantPressure??[]).flatMap((c:any)=>tasks.filter((t:any)=>t.contestantId===c.contestantId&&!assigned.includes(t.id)).map((t:any)=>t.id)))),provisionallySatisfiedDependencyTaskIds:assigned,provisionalOccupancyByContestant:occC,provisionalOccupancyBySpace:occS,provisionalOccupancyByResource:occR,residualMainFlowTaskIds:map.mainFlowPressure?.mainFlowProductiveTaskIds??[],residualMainFlowAnchorEligibleTaskIds:map.mainFlowPressure?.mainFlowAnchorEligibleTaskIds??[],firstAnchorTaskId:args.stage2?.selectedAnchorTaskId??null,firstClosureTaskIds:args.stage2?.closureTaskIds??assigned,fingerprint:createHash("sha256").update(stableStringify(payload)).digest("hex"),readOnly:true});
}
