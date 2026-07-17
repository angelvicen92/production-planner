import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveORCPlanningEntryOperationalRoleMetadata, type ORCOperationalRoleMetadata } from "../state/nonWorkTaskClassifier";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import { resolveORCTaskDependencyGraph } from "../state/dependencySemantics";

const sorted=(values:Iterable<number>)=>[...new Set(values)].filter(Number.isFinite).sort((a,b)=>a-b);
const fingerprint=(ids:readonly number[])=>createHash("sha256").update(stableStringify(ids)).digest("hex");
const syntheticRoles=new Set(["meal_break_placeholder","arrival_placeholder","call_time_placeholder","space_break_placeholder","global_break_placeholder","non_operational_placeholder"]);

export interface InitialConstructionTaskUniverse {
 readonly strictProductiveWorkTaskIds:readonly number[]; readonly transportArrivalTaskIds:readonly number[];
 readonly transportDepartureTaskIds:readonly number[]; readonly syntheticNonConstructiveTaskIds:readonly number[];
 readonly constructiveTargetTaskIds:readonly number[]; readonly constructiveSupportTaskIds:readonly number[];
 readonly constructiveExecutionTaskIds:readonly number[]; readonly excludedTaskIdsByReason:Readonly<Record<string,readonly number[]>>;
 readonly roleByTaskId:Readonly<Record<string,ORCOperationalRoleMetadata>>; readonly targetRoleCounts:Readonly<Record<string,number>>;
 readonly constructiveTargetFingerprint:string; readonly constructiveExecutionFingerprint:string; readonly readOnly:true;
}

/** Canonical, phase-local definition of work Initial Construction may execute. */
export function resolveInitialConstructionTaskUniverse(args:{input:EngineInput;state?:OperationalState|null;provisionallyAssignedTaskIds?:readonly number[]}):InitialConstructionTaskUniverse {
 const tasks=[...(args.input.tasks??[])].sort((a,b)=>a.id-b.id), byId=new Map(tasks.map(t=>[t.id,t]));
 const transport=resolveORCTransportContract(args.input as any), meal=(args.input.actualMeal??args.input.mealWindow??args.input.meal) as any;
 const assigned=new Set((args.provisionallyAssignedTaskIds??[]).map(Number)), protectedIds=new Set((args.state?.locks??[]).map(x=>Number(x.taskId)));
 for(const task of tasks) if(task.status==="done"||task.status==="in_progress") protectedIds.add(task.id);
 const roles=new Map(tasks.map(task=>[task.id,resolveORCPlanningEntryOperationalRoleMetadata({task,entry:{taskId:task.id,startPlanned:(task as any).startPlanned??(task as any).fixedWindowStart??(task as any).start,endPlanned:(task as any).endPlanned??(task as any).fixedWindowEnd??(task as any).end,assignedResourceIds:(task as any).assignedResourceIds??[],spaceId:task.spaceId??null} as any,mealWindow:meal,transportContract:transport})]));
 const pending=tasks.filter(t=>!protectedIds.has(t.id)&&!assigned.has(t.id));
 const strict=sorted(pending.filter(t=>roles.get(t.id)!.countsAsWork).map(t=>t.id));
 const arrivals=sorted(pending.filter(t=>roles.get(t.id)!.role==="transport_arrival").map(t=>t.id));
 const departures=sorted(pending.filter(t=>roles.get(t.id)!.role==="transport_departure").map(t=>t.id));
 const synthetic=sorted(pending.filter(t=>syntheticRoles.has(roles.get(t.id)!.role)&&(Number(t.id)<0||(t as any).isPlaceholder===true||(t as any).nonOperational===true||(t as any).planningOnly===true||(t as any).blockingOnly===true)).map(t=>t.id));
 const target=sorted([...strict,...arrivals]), targetSet=new Set(target), graph=resolveORCTaskDependencyGraph(tasks);
 const closure=new Set<number>(), stack=target.flatMap(id=>graph.prerequisitesByTaskId.get(id)??[]);
 while(stack.length){const id=Number(stack.pop());if(closure.has(id))continue;closure.add(id);stack.push(...(graph.prerequisitesByTaskId.get(id)??[]));}
 const support=sorted([...closure].filter(id=>{const role=roles.get(id);return byId.has(id)&&!targetSet.has(id)&&!assigned.has(id)&&!protectedIds.has(id)&&role?.role!=="transport_departure"&&!syntheticRoles.has(role?.role??"");}));
 const execution=sorted([...target,...support]);
 const excluded={transport_departure:departures,synthetic_non_constructive:synthetic,protected_or_satisfied:sorted([...protectedIds,...assigned]),not_required_for_constructive_target:sorted(pending.map(t=>t.id).filter(id=>!execution.includes(id)&&!departures.includes(id)&&!synthetic.includes(id)))};
 const targetRoleCounts:Record<string,number>={};for(const id of target){const r=roles.get(id)!.role;targetRoleCounts[r]=(targetRoleCounts[r]??0)+1;}
 return deepFreeze({strictProductiveWorkTaskIds:strict,transportArrivalTaskIds:arrivals,transportDepartureTaskIds:departures,syntheticNonConstructiveTaskIds:synthetic,constructiveTargetTaskIds:target,constructiveSupportTaskIds:support,constructiveExecutionTaskIds:execution,excludedTaskIdsByReason:excluded,roleByTaskId:Object.fromEntries([...roles].map(([id,r])=>[String(id),r])),targetRoleCounts,constructiveTargetFingerprint:fingerprint(target),constructiveExecutionFingerprint:fingerprint(execution),readOnly:true}) as InitialConstructionTaskUniverse;
}
