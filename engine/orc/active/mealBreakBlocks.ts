import type { TimeWindow } from "../../types";
import type { OperationalState } from "../contracts";
import { resolveORCMealSemantics } from "../state/mealSemanticsResolver";

export const DEFAULT_MEAL_BREAK_DURATION_MINUTES = 75;
export const MEAL_BREAK_BLOCK_REASON = "meal_break_block_cannot_fit_in_window";
const toMin=(t?:string|null)=>{const p=String(t??"").split(":").map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:null};
const hh=(x:number)=>`${String(Math.floor(x/60)).padStart(2,"0")}:${String(x%60).padStart(2,"0")}`;
const readAlias=(o:any)=> o?.spaceMealBreakMinutes ?? o?.space_meal_break_minutes ?? o?.mealBreakDurationMinutes ?? o?.meal_break_duration_minutes;
const normalize=(v:unknown, source:string)=>{ if(v===null||v===undefined||v==="") return null; const n=Number(v); if(Number.isFinite(n)&&n>=0) return {minutes:Math.floor(n), source, warnings:[] as string[]}; return {minutes:DEFAULT_MEAL_BREAK_DURATION_MINUTES, source:"default", warnings:["meal_break_duration_invalid_defaulted"]}; };
export function resolveSpaceMealBreakDurationMinutes(root:any, context:any={}){
 const candidates:[unknown,string][]=[
  [context?.planBreak?.durationMinutes ?? context?.planBreak?.duration_minutes,"plan_breaks.duration_minutes"],
  [readAlias(context?.zone) ?? context?.zoneMealBreakDurationMinutes,"zone.space_meal_break_minutes"],
  [readAlias(root?.plan) ?? readAlias(root?.constraints?.plan) ?? readAlias(root),"plans.space_meal_break_minutes"],
  [readAlias(root?.programSettings) ?? readAlias(root?.constraints?.programSettings) ?? readAlias(root?.settings),"program_settings.space_meal_break_minutes"],
 ];
 const warnings:string[]=[];
 for(const [value,source] of candidates){const r=normalize(value,source); if(!r) continue; warnings.push(...r.warnings); if(r.warnings.length===0) return {...r,warnings};}
 return {minutes:DEFAULT_MEAL_BREAK_DURATION_MINUTES, source:"default", warnings};
}
export function resolveMealBreakDurationMinutes(root:any){return resolveSpaceMealBreakDurationMinutes(root);}
export type MealBreakBlock = { id:string; taskId:number; spaceId:number; startPlanned:string; endPlanned:string; assignedResourceIds:number[]; operationalRole:"meal_break_placeholder"; blocksSpace:true; countsAsWork:false; countsForMainFlow:false; countsForResourceLoad:false; countsForTalentLoad:false; isMealBreakBlock:true; visibleInSpacePlanning:true; readOnly:true; breakId?:number; diagnosticOnly?:boolean; materializable?:boolean };
export function isMealBreakPlanningEntry(e:any){return e?.isMealBreakBlock===true || e?.operationalRole==="meal_break_placeholder" || e?.breakKind==="space_meal" || e?.breakKind==="itinerant_meal" || String(e?.id??"").startsWith("meal-break:");}
export function buildMealBreakBlocksForSpaces(args:{operationalState?:OperationalState|null; mealBreakDurationMinutes?:number|null; mealWindow?:TimeWindow|null; spaceIds?:number[]|null}){
 const s:any=args.operationalState; const resolved=args.mealBreakDurationMinutes==null?resolveSpaceMealBreakDurationMinutes(s):resolveSpaceMealBreakDurationMinutes({spaceMealBreakMinutes:args.mealBreakDurationMinutes}); const d=resolved.minutes; const warnings=[...resolved.warnings];
 const blockers:string[]=[]; const blocks:MealBreakBlock[]=[]; const realBreaks=(s?.planning??[]).filter((e:any)=>e?.breakKind==="space_meal"&&Number(e?.breakId ?? Math.abs(Number(e?.id)))>0&&e?.spaceId!=null);
 for(const e of realBreaks){const breakId=Number(e.breakId ?? Math.abs(Number(e.id))); const start=e.startPlanned??e.lockedStart??e.fixedWindowStart; const end=e.endPlanned??e.lockedEnd??(toMin(start)!=null?hh((toMin(start) as number)+Number(e.durationOverrideMin??e.durationMinutes??d)):null); if(!start||!end) continue; blocks.push({id:`plan-break:${breakId}`,breakId,taskId:-breakId,spaceId:Number(e.spaceId),startPlanned:String(start),endPlanned:String(end),assignedResourceIds:[...new Set(e.assignedResourceIds??[])].map(Number).filter(Number.isFinite),operationalRole:"meal_break_placeholder",blocksSpace:true,countsAsWork:false,countsForMainFlow:false,countsForResourceLoad:false,countsForTalentLoad:false,isMealBreakBlock:true,visibleInSpacePlanning:true,readOnly:true,materializable:true,diagnosticOnly:false}); }
 const meal=resolveORCMealSemantics(s as any); const win=args.mealWindow ?? meal.placementWindows[0] ?? meal.actualMealBreaks[0] ?? meal.globalHardBreaks[0] ?? s?.availability?.mealWindow ?? s?.availability?.meal ?? null; const a=toMin(win?.start), b=toMin(win?.end);
 if(d===0) return {mealBreakDurationMinutes:0,mealBreakConfigSource:resolved.source,mealBreakSourceOfTruth:"config_disabled",blocks,warnings,blockers,evidence:{disabled:true,readOnly:true},readOnly:true as const};
 if(blocks.length>0) return {mealBreakDurationMinutes:d,mealBreakConfigSource:resolved.source,mealBreakSourceOfTruth:"plan_breaks",blocks,warnings,blockers,evidence:{planBreakIdsBySpaceId:Object.fromEntries(blocks.map(b=>[b.spaceId,b.breakId])),mealBreakBlocksFromPlanBreaks:true,mealBreakBlocksPersisted:true,mealBreakBlocksVisibleInPlanning:true,materializableMealBreakTaskIds:blocks.map(b=>b.taskId),diagnosticOnlyMealBreakTaskIds:[],invalidSyntheticMealBreakIdsDetected:false,readOnly:true},readOnly:true as const};
 if(!s||!win||a==null||b==null||b-a<d){blockers.push(MEAL_BREAK_BLOCK_REASON);return {mealBreakDurationMinutes:d,mealBreakConfigSource:resolved.source,mealBreakSourceOfTruth:"diagnostic_only",blocks,warnings,blockers,evidence:{window:win,mealBreakBlocksPersisted:false,readOnly:true},readOnly:true as const};}
 const spaces=(args.spaceIds?.length?args.spaceIds:Object.keys(s.spaces?.nameById??{}).map(Number)).filter(Number.isFinite).sort((x,y)=>x-y); const start=a,end=a+d;
 for(const spaceId of spaces){const resources=[...new Set((s.planning??[]).filter((e:any)=>e.spaceId===spaceId).flatMap((e:any)=>e.assignedResourceIds??[]))].map(Number).filter(Number.isFinite).sort((x,y)=>x-y); blocks.push({id:`meal-break:${s.planId}:${spaceId}:${hh(start)}-${hh(end)}`,taskId:-(900000000+spaceId),spaceId,startPlanned:hh(start),endPlanned:hh(end),assignedResourceIds:resources,operationalRole:"meal_break_placeholder",blocksSpace:true,countsAsWork:false,countsForMainFlow:false,countsForResourceLoad:false,countsForTalentLoad:false,isMealBreakBlock:true,visibleInSpacePlanning:true,readOnly:true,diagnosticOnly:true,materializable:false});}
 return {mealBreakDurationMinutes:d,mealBreakConfigSource:resolved.source,mealBreakSourceOfTruth:"diagnostic_only",blocks,warnings,blockers,evidence:{window:win,spaceCount:spaces.length,blocksGenerated:blocks.length,mealBreakBlocksPersisted:false,mealBreakBlocksVisibleInPlanning:false,mealBreakBlocksFromPlanBreaks:false,materializableMealBreakTaskIds:[],diagnosticOnlyMealBreakTaskIds:blocks.map(b=>b.taskId),invalidSyntheticMealBreakIdsDetected:blocks.some(b=>b.taskId<=-900000000),readOnly:true},readOnly:true as const};
}
