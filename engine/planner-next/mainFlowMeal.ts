import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, SpaceMealPolicy } from "./contracts";
import { createScheduledSpaceMeal } from "./spaceMeals";
export interface MainFlowMealAuthority extends SpaceMealPolicy { source:"SPACE_MEAL_POLICY"|"OPERATIONAL_MEAL_POLICY"|"CANONICALIZED"; sourceIds:string[] }
export interface MainFlowTimeline { key:string; slots:number[]; meal:ScheduledSpaceMeal; mealAuthority:MainFlowMealAuthority; splitIndex:number; morningTaskCount:number; afternoonTaskCount:number; strategyRank:number }
const samePolicy=(a:SpaceMealPolicy,b:SpaceMealPolicy)=>a.duration===b.duration&&a.window.start===b.window.start&&a.window.end===b.window.end;
/** Resolves the one effective Main-space meal without manufacturing a second obligation. */
export function mainFlowMealPolicy(p:PlannerNextProblem):MainFlowMealAuthority|undefined {
  const spacePolicy=p.spaces.find(s=>s.id===p.mainFlow.spaceId)?.mealPolicy;
  const operational=(p.operationalMealPolicies??[]).filter(policy=>policy.spaceIds.includes(p.mainFlow.spaceId));
  const policies=[...(spacePolicy?[spacePolicy]:[]),...operational];
  if(!policies.length)return undefined;
  if(policies.some(policy=>!samePolicy(policies[0]!,policy)))throw new Error("INCOMPATIBLE_MAIN_FLOW_MEAL_POLICIES");
  return {window:{...policies[0]!.window},duration:policies[0]!.duration,
    source:spacePolicy?(operational.length?"CANONICALIZED":"SPACE_MEAL_POLICY"):"OPERATIONAL_MEAL_POLICY",
    sourceIds:[...(spacePolicy?[p.mainFlow.spaceId]:[]),...operational.map(policy=>policy.id)].sort()};
}
export const hasMainFlowMeal=(p:PlannerNextProblem)=>mainFlowMealPolicy(p)!==undefined;
export const mainFlowMealAligned=(p:PlannerNextProblem)=>{const x=mainFlowMealPolicy(p),m=p.protectedMeal;if(!x)return false;return m?x.window.start===m.start&&x.window.end===m.end&&x.duration===m.end-m.start&&p.mainFlow.preferredEnd===m.start:x.window.start<=p.mainFlow.preferredEnd&&p.mainFlow.preferredEnd+x.duration<=x.window.end};
export const createMainFlowMeal=(p:PlannerNextProblem)=>{const policy=mainFlowMealPolicy(p)!;const latest=policy.window.end-policy.duration;const start=Math.min(Math.max(p.mainFlow.preferredEnd,policy.window.start),latest);return createScheduledSpaceMeal(p.mainFlow.spaceId,start,policy.duration)};
export const blockBoundaries=(pattern:string[])=>pattern.slice(1).flatMap((key,i)=>key!==pattern[i]?[i+1]:[]);
export const isBlockBoundary=(pattern:string[],cut:number)=>cut>0&&cut<pattern.length&&pattern[cut-1]!==pattern[cut];
export const preferredCandidateCuts=(pattern:string[])=>[pattern.length,...blockBoundaries(pattern).sort((a,b)=>b-a)];
export const fallbackCandidateCuts=(pattern:string[])=>{const preferred=new Set(preferredCandidateCuts(pattern));return pattern.map((_,i)=>i).filter(cut=>cut>0&&!preferred.has(cut))};
export const candidateCuts=(pattern:string[])=>[...preferredCandidateCuts(pattern),...fallbackCandidateCuts(pattern)];
export function buildTimeline(p:PlannerNextProblem,pattern:string[],duration:number,cut:number):MainFlowTimeline{const mealAuthority=mainFlowMealPolicy(p)!;const meal=createMainFlowMeal(p),slots:number[]=[];for(let i=0;i<cut;i++)slots.push(meal.start-cut*duration+i*duration);for(let i=cut;i<pattern.length;i++)slots.push(meal.end+(i-cut)*duration);const key=`${cut===pattern.length?"ALL_MORNING":"SPLIT"}|${cut}|${pattern.join("|")}|${slots.join("|")}`;return{key,slots,meal,mealAuthority,splitIndex:cut,morningTaskCount:cut,afternoonTaskCount:pattern.length-cut,strategyRank:cut===pattern.length?0:isBlockBoundary(pattern,cut)?1:2}}
export const timelineSignature=(x:MainFlowTimeline)=>x.key;
export const orderTimelines=(xs:MainFlowTimeline[])=>[...xs].sort((a,b)=>a.strategyRank-b.strategyRank||b.splitIndex-a.splitIndex||a.key.localeCompare(b.key));
export const combineMainFlowOccupations=(tasks:ScheduledTask[],meal:ScheduledSpaceMeal)=>[...tasks,meal].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
