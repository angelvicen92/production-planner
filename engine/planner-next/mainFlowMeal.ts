import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, SpaceMealPolicy } from "./contracts";
import { createScheduledSpaceMeal } from "./spaceMeals";
export interface MainFlowTimeline { key:string; slots:number[]; meal:ScheduledSpaceMeal; splitIndex:number; morningTaskCount:number; afternoonTaskCount:number; strategyRank:number }
export const mainFlowMealPolicy=(p:PlannerNextProblem):SpaceMealPolicy|undefined=>p.spaces.find(s=>s.id===p.mainFlow.spaceId)?.mealPolicy;
export const hasMainFlowMeal=(p:PlannerNextProblem)=>mainFlowMealPolicy(p)!==undefined;
export const mainFlowMealAligned=(p:PlannerNextProblem)=>{const x=mainFlowMealPolicy(p),m=p.protectedMeal;if(!x)return false;return m?x.window.start===m.start&&x.window.end===m.end&&x.duration===m.end-m.start&&p.mainFlow.preferredEnd===m.start:x.window.start<=p.mainFlow.preferredEnd&&p.mainFlow.preferredEnd+x.duration<=x.window.end};
export const createMainFlowMeal=(p:PlannerNextProblem)=>createScheduledSpaceMeal(p.mainFlow.spaceId,p.mainFlow.preferredEnd,mainFlowMealPolicy(p)!.duration);
export const blockBoundaries=(pattern:string[])=>pattern.slice(1).flatMap((key,i)=>key!==pattern[i]?[i+1]:[]);
export const isBlockBoundary=(pattern:string[],cut:number)=>cut>0&&cut<pattern.length&&pattern[cut-1]!==pattern[cut];
export const candidateCuts=(pattern:string[])=>[pattern.length,...blockBoundaries(pattern).sort((a,b)=>b-a)];
export function buildTimeline(p:PlannerNextProblem,pattern:string[],duration:number,cut:number):MainFlowTimeline{const meal=createMainFlowMeal(p),slots:number[]=[];for(let i=0;i<cut;i++)slots.push(meal.start-cut*duration+i*duration);for(let i=cut;i<pattern.length;i++)slots.push(meal.end+(i-cut)*duration);const key=`${cut===pattern.length?"ALL_MORNING":"SPLIT"}|${cut}|${pattern.join("|")}|${slots.join("|")}`;return{key,slots,meal,splitIndex:cut,morningTaskCount:cut,afternoonTaskCount:pattern.length-cut,strategyRank:cut===pattern.length?0:1}}
export const timelineSignature=(x:MainFlowTimeline)=>x.key;
export const orderTimelines=(xs:MainFlowTimeline[])=>[...xs].sort((a,b)=>a.strategyRank-b.strategyRank||b.splitIndex-a.splitIndex||a.key.localeCompare(b.key));
export const combineMainFlowOccupations=(tasks:ScheduledTask[],meal:ScheduledSpaceMeal)=>[...tasks,meal].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
