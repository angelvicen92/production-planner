import type { EngineInput, ProtectedBreakInput } from "../../types";
import type { Window } from "../contracts";
import { engineTimeToMinute } from "./engineTime";

export type ItinerantUnitMealDefect = "INVALID_ID" | "INVALID_UNIT" | "INVALID_TIME" | "MIXED_SCOPE" | "OVERLAP" | "AMBIGUOUS_DUPLICATE";
export interface ResolvedItinerantUnitMeal {
  readonly breakId: string;
  readonly itinerantTeamId: number;
  readonly itinerantUnitId: string;
  readonly interval: Readonly<Window>;
  readonly sourcePath: string;
  readonly defects: readonly ItinerantUnitMealDefect[];
  readonly status: "SUPPORTED" | "UNSUPPORTED";
}

const compare=(a:string,b:string)=>a.localeCompare(b,"en");
const scoped=(entry:ProtectedBreakInput)=>entry.kind==="meal"&&entry.itinerantTeamId!=null;

/** Normalizes only explicitly identified, fixed meals scoped to one assigned unit. */
export function resolveAssignedItinerantUnitMealBreaks(input:EngineInput):readonly ResolvedItinerantUnitMeal[]{
  const sources:[ProtectedBreakInput,string][]=[];
  if(input.actualMeal&&scoped(input.actualMeal))sources.push([input.actualMeal,"actualMeal"]);
  input.protectedBreaks?.forEach((entry,index)=>{if(scoped(entry))sources.push([entry,`protectedBreaks.${index}`]);});
  const idCounts=new Map<string,number>();for(const [entry] of sources){const id=entry.id==null?"":String(entry.id);idCounts.set(id,(idCounts.get(id)??0)+1);}
  const meals=sources.map(([entry,sourcePath])=>{
    const defects:ItinerantUnitMealDefect[]=[];const breakId=entry.id==null?"":String(entry.id);
    if(!breakId)defects.push("INVALID_ID");else if((idCounts.get(breakId)??0)>1)defects.push("AMBIGUOUS_DUPLICATE");
    const unit=entry.itinerantTeamId!;if(!Number.isInteger(unit)||unit<=0)defects.push("INVALID_UNIT");
    if(entry.contestantId!=null||entry.spaceId!=null||entry.zoneId!=null||entry.kind!=="meal")defects.push("MIXED_SCOPE");
    const start=engineTimeToMinute(entry.start),end=engineTimeToMinute(entry.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)defects.push("INVALID_TIME");
    return {breakId,itinerantTeamId:unit,itinerantUnitId:`itinerant-team:${unit}`,interval:{start,end},sourcePath,defects,status:defects.length?"UNSUPPORTED" as const:"SUPPORTED" as const};
  }).sort((a,b)=>compare(a.itinerantUnitId,b.itinerantUnitId)||a.interval.start-b.interval.start||compare(a.breakId,b.breakId));
  for(let i=0;i<meals.length;i++)for(let j=i+1;j<meals.length;j++){const a=meals[i]!,b=meals[j]!;if(a.itinerantUnitId!==b.itinerantUnitId)continue;if(a.interval.start<b.interval.end&&b.interval.start<a.interval.end)for(const meal of [a,b]){if(!meal.defects.includes("OVERLAP"))meal.defects.push("OVERLAP");meal.status="UNSUPPORTED";}}
  return meals;
}
