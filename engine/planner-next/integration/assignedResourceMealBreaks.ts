import type { EngineInput, TaskInput, TimeWindow } from "../../types";
import type { Window } from "../contracts";
import { resolveEffectivePlanResourceAvailability } from "./effectivePlanResourceAvailability";
import { resolveEffectiveTaskFixedInterval } from "./effectiveTaskFixedInterval";
import { engineTimeToMinute } from "./engineTime";

export type ResourceMealDefect = "INVALID_ID" | "INVALID_RESOURCE" | "INVALID_TIME" | "INVALID_DURATION" | "MIXED_SCOPE" | "MISSING_RESOURCE" | "OUTSIDE_AVAILABILITY" | "OVERLAP";
export interface ResolvedResourceMeal {
  readonly sourceTaskId: number; readonly breakId: string; readonly resourceIds: readonly number[];
  readonly interval: Readonly<TimeWindow>; readonly minuteInterval: Readonly<Window>;
  readonly status: "SUPPORTED" | "UNSUPPORTED"; readonly taskStatus: TaskInput["status"];
  readonly defects: readonly ResourceMealDefect[]; readonly readOnly: true;
}
export interface AssignedResourceMealsResolution {
  readonly meals: readonly ResolvedResourceMeal[];
  readonly availabilityByResourceId: ReadonlyMap<number, readonly Window[]>;
  readonly readOnly: true;
}
const compare=(a:string,b:string)=>a.localeCompare(b,"en");
const freeze=<T>(value:T):T=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value as Record<string,unknown>).forEach(freeze);}return value;};

/** Normalizes only the explicit, fixed resource_meal task contract. */
export function resolveAssignedResourceMealBreaks(input: EngineInput): AssignedResourceMealsResolution {
  const resourceById=new Map(input.planResourceItems.map(resource=>[resource.id,resource]));
  const seenBreakIds=new Set<string>(), seenTaskIds=new Set<number>();
  const meals=input.tasks.filter(task=>task.breakKind==="resource_meal"&&task.status!=="cancelled").map(task=>{
    const defects:ResourceMealDefect[]=[];
    const breakId=task.breakId==null?"":String(task.breakId);
    if(!breakId||seenBreakIds.has(breakId)||seenTaskIds.has(task.id))defects.push("INVALID_ID");
    if(breakId)seenBreakIds.add(breakId);seenTaskIds.add(task.id);
    const rawResourceIds=task.assignedResourceIds??[];
    const resourceIds=[...new Set(rawResourceIds.filter(id=>Number.isInteger(id)&&id>0))].sort((a,b)=>a-b);
    if(rawResourceIds.some(id=>!Number.isInteger(id)||id<=0))defects.push("INVALID_RESOURCE");
    if(!resourceIds.length)defects.push("INVALID_RESOURCE");
    if(resourceIds.some(id=>!resourceById.has(id)))defects.push("MISSING_RESOURCE");
    const hardRequirements=Object.keys(task.resourceRequirements?.byItem??{}).length+Object.keys(task.resourceRequirements?.byType??{}).length+(task.resourceRequirements?.anyOf?.length??0);
    if(task.contestantId!=null||task.spaceId!=null||task.zoneId!=null||task.itinerantTeamId!=null||task.allowedItinerantTeamIds?.length||hardRequirements||task.mealOccupiesSpace===true)defects.push("MIXED_SCOPE");
    const fixed=resolveEffectiveTaskFixedInterval(task,input.locks);
    let interval:TimeWindow={start:"",end:""}, minuteInterval:Window={start:-1,end:-1};
    if(fixed.status!=="EXACT")defects.push("INVALID_TIME"); else {interval={...fixed.interval};minuteInterval={start:engineTimeToMinute(interval.start),end:engineTimeToMinute(interval.end)};if(task.durationOverrideMin!=null&&task.durationOverrideMin!==minuteInterval.end-minuteInterval.start)defects.push("INVALID_DURATION");}
    for(const id of resourceIds){const source=resourceById.get(id);if(!source)continue;const availability=resolveEffectivePlanResourceAvailability(input.workDay,source);if(availability.status!=="AVAILABLE")defects.push("OUTSIDE_AVAILABILITY");else {const w={start:engineTimeToMinute(availability.effectiveWindow.start),end:engineTimeToMinute(availability.effectiveWindow.end)};if(minuteInterval.start<w.start||minuteInterval.end>w.end)defects.push("OUTSIDE_AVAILABILITY");}}
    return {sourceTaskId:task.id,breakId,resourceIds,interval,minuteInterval,status:defects.length?"UNSUPPORTED" as const:"SUPPORTED" as const,taskStatus:task.status,defects:[...new Set(defects)].sort(compare),readOnly:true as const};
  }).sort((a,b)=>a.minuteInterval.start-b.minuteInterval.start||a.minuteInterval.end-b.minuteInterval.end||compare(a.breakId,b.breakId)||a.sourceTaskId-b.sourceTaskId);
  for(let i=0;i<meals.length;i++)for(let j=i+1;j<meals.length;j++){const a=meals[i]!,b=meals[j]!;if(b.minuteInterval.start>=a.minuteInterval.end)break;if(a.resourceIds.some(id=>b.resourceIds.includes(id))){for(const meal of [a,b]){if(!meal.defects.includes("OVERLAP"))(meal.defects as ResourceMealDefect[]).push("OVERLAP");(meal as {status:"UNSUPPORTED"}).status="UNSUPPORTED";}}}
  const availabilityByResourceId=new Map<number,readonly Window[]>();
  for(const source of [...input.planResourceItems].sort((a,b)=>a.id-b.id)){const effective=resolveEffectivePlanResourceAvailability(input.workDay,source);if(effective.status!=="AVAILABLE")continue;let windows=[{start:engineTimeToMinute(effective.effectiveWindow.start),end:engineTimeToMinute(effective.effectiveWindow.end)}];for(const meal of meals.filter(m=>m.status==="SUPPORTED"&&m.resourceIds.includes(source.id)))windows=windows.flatMap(w=>w.end<=meal.minuteInterval.start||w.start>=meal.minuteInterval.end?[w]:[...(w.start<meal.minuteInterval.start?[{start:w.start,end:meal.minuteInterval.start}]:[]),...(meal.minuteInterval.end<w.end?[{start:meal.minuteInterval.end,end:w.end}]:[])]);availabilityByResourceId.set(source.id,freeze(windows));}
  return freeze({meals,availabilityByResourceId,readOnly:true});
}
