import type { EngineInput, ProtectedBreakInput } from "../../types";
import type { Window } from "../contracts";

export type ItinerantUnitMealDefect = "INVALID_ID"|"INVALID_UNIT"|"INVALID_TIME"|"OUTSIDE_DAY"|"OFF_GRID"|"MIXED_SCOPE"|"OVERLAP"|"AMBIGUOUS_DUPLICATE";
export interface ResolvedItinerantUnitMeal { readonly breakId:string;readonly itinerantTeamId:number;readonly itinerantUnitId:string;readonly interval:Readonly<Window>;readonly sourcePath:string;readonly defects:readonly ItinerantUnitMealDefect[];readonly status:"SUPPORTED"|"UNSUPPORTED" }
const compare=(a:string,b:string)=>a.localeCompare(b,"en");
const freeze=<T>(value:T):T=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value as Record<string,unknown>).forEach(freeze);}return value;};
function minute(value:unknown):number|null{if(typeof value!=="string"||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return null;const [h,m]=value.split(":").map(Number);return h!*60+m!;}
const scoped=(entry:ProtectedBreakInput)=>entry.kind==="meal"&&entry.itinerantTeamId!=null;

/** Pure, crash-safe normalization of explicit fixed unit-scoped meals. */
export function resolveAssignedItinerantUnitMealBreaks(input:EngineInput):readonly ResolvedItinerantUnitMeal[]{
  const sources:Array<[ProtectedBreakInput,string]>=[];if(input.actualMeal&&scoped(input.actualMeal))sources.push([input.actualMeal,"actualMeal"]);input.protectedBreaks?.forEach((entry,index)=>{if(scoped(entry))sources.push([entry,`protectedBreaks.${index}`]);});
  const ids=new Map<string,number>();for(const [entry] of sources){const id=entry.id==null?"":String(entry.id);ids.set(id,(ids.get(id)??0)+1);}const dayStart=minute(input.workDay?.start),dayEnd=minute(input.workDay?.end);
  const drafts=sources.map(([entry,sourcePath])=>{const defects:ItinerantUnitMealDefect[]=[];const breakId=entry.id==null?"":String(entry.id);if(!breakId)defects.push("INVALID_ID");else if((ids.get(breakId)??0)>1)defects.push("AMBIGUOUS_DUPLICATE");const unit=entry.itinerantTeamId as number;if(!Number.isInteger(unit)||unit<=0)defects.push("INVALID_UNIT");if(entry.contestantId!=null||entry.spaceId!=null||entry.zoneId!=null)defects.push("MIXED_SCOPE");const start=minute(entry.start),end=minute(entry.end);if(start===null||end===null||start>=end)defects.push("INVALID_TIME");if(start!==null&&end!==null&&dayStart!==null&&dayEnd!==null&&(start<dayStart||end>dayEnd))defects.push("OUTSIDE_DAY");if(start!==null&&end!==null&&(start%5!==0||end%5!==0))defects.push("OFF_GRID");return {breakId,itinerantTeamId:unit,itinerantUnitId:`itinerant-team:${String(unit)}`,interval:{start:start??-1,end:end??-1},sourcePath,defects};}).sort((a,b)=>compare(a.itinerantUnitId,b.itinerantUnitId)||a.interval.start-b.interval.start||compare(a.breakId,b.breakId));
  const overlaps=new Set<number>();for(let i=0;i<drafts.length;i++)for(let j=i+1;j<drafts.length;j++){const a=drafts[i]!,b=drafts[j]!;if(a.itinerantUnitId===b.itinerantUnitId&&a.interval.start<b.interval.end&&b.interval.start<a.interval.end){overlaps.add(i);overlaps.add(j);}}
  return freeze(drafts.map((draft,index)=>{const defects=[...draft.defects,...(overlaps.has(index)?["OVERLAP" as const]:[])].sort(compare);return {...draft,defects,status:defects.length?"UNSUPPORTED" as const:"SUPPORTED" as const};}));
}
