import type { OperationalMealPolicy, PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, SpaceMealPolicy } from "./contracts";
import { createScheduledSpaceMeal } from "./spaceMeals";
export interface MainFlowTimeline { key:string; slots:number[]; meal:ScheduledSpaceMeal; splitIndex:number; morningTaskCount:number; afternoonTaskCount:number; strategyRank:number }
export interface MainFlowTimelineRange { cut:number; strategyRank:number; startMin:number; startMax:number; step:number;
  feasibleCount:number; rawCount:number; analyticallyEliminated:number }
export interface MainFlowTimelineDomain { ranges:MainFlowTimelineRange[]; domainCount:number; feasibleCount:number; analyticallyEliminated:number }
export const mainFlowOperationalMealPolicy=(p:PlannerNextProblem):OperationalMealPolicy|undefined=>p.operationalMealPolicies?.find(policy=>{
  const mains=p.tasks.filter(task=>task.kind==="main"&&task.spaceId===p.mainFlow.spaceId);
  return mains.length>1&&mains.every(task=>policy.spaceIds.includes(task.spaceId)
    ||(task.requiredResourceIds??[]).some(id=>policy.resourceIds.includes(id)));
});
export const mainFlowMealPolicy=(p:PlannerNextProblem):SpaceMealPolicy|undefined=>p.spaces.find(s=>s.id===p.mainFlow.spaceId)?.mealPolicy
  ??mainFlowOperationalMealPolicy(p);
export const mainFlowMealIsOperational=(p:PlannerNextProblem)=>p.spaces.find(s=>s.id===p.mainFlow.spaceId)?.mealPolicy===undefined
  &&mainFlowOperationalMealPolicy(p)!==undefined;
export const hasMainFlowMeal=(p:PlannerNextProblem)=>mainFlowMealPolicy(p)!==undefined;
export const mainFlowMealAligned=(p:PlannerNextProblem)=>{const x=mainFlowMealPolicy(p),m=p.protectedMeal;if(!x)return false;return m?x.window.start===m.start&&x.window.end===m.end&&x.duration===m.end-m.start:x.window.start+x.duration<=x.window.end};
export const createMainFlowMeal=(p:PlannerNextProblem,start=p.mainFlow.preferredEnd)=>createScheduledSpaceMeal(p.mainFlow.spaceId,start,mainFlowMealPolicy(p)!.duration);
export const blockBoundaries=(pattern:string[])=>pattern.slice(1).flatMap((key,i)=>key!==pattern[i]?[i+1]:[]);
export const isBlockBoundary=(pattern:string[],cut:number)=>cut>0&&cut<pattern.length&&pattern[cut-1]!==pattern[cut];
export const candidateCuts=(pattern:string[])=>[...blockBoundaries(pattern).sort((a,b)=>b-a),
  ...pattern.slice(1).flatMap((_,index)=>isBlockBoundary(pattern,index+1)?[]:[index+1])];
export function buildTimeline(p:PlannerNextProblem,pattern:string[],duration:number,cut:number,mealStart=p.mainFlow.preferredEnd):MainFlowTimeline{const meal=createMainFlowMeal(p,mealStart),slots:number[]=[];for(let i=0;i<cut;i++)slots.push(meal.start-cut*duration+i*duration);for(let i=cut;i<pattern.length;i++)slots.push(meal.end+(i-cut)*duration);const key=`SPLIT|${cut}|MEAL:${mealStart}|${pattern.join("|")}|${slots.join("|")}`;return{key,slots,meal,splitIndex:cut,morningTaskCount:cut,afternoonTaskCount:pattern.length-cut,strategyRank:isBlockBoundary(pattern,cut)?0:1}}
export const candidateTimelineDomain=(p:PlannerNextProblem,pattern:string[],duration:number):MainFlowTimelineDomain=>{
  const policy=mainFlowMealPolicy(p)!,step=5;
  const rawCount=p.protectedMeal?1:Math.max(0,Math.floor((policy.window.end-policy.duration-policy.window.start)/step)+1);
  const ranges=candidateCuts(pattern).map((cut):MainFlowTimelineRange=>{
    const lower=Math.max(policy.window.start,p.day.start+cut*duration);
    const upper=Math.min(policy.window.end-policy.duration,p.day.end-policy.duration-(pattern.length-cut)*duration);
    const startMin=p.protectedMeal?.start??policy.window.start+Math.ceil((lower-policy.window.start)/step)*step;
    const startMax=p.protectedMeal?.start??policy.window.start+Math.floor((upper-policy.window.start)/step)*step;
    const feasibleCount=p.protectedMeal
      ?Number(p.protectedMeal.start>=lower&&p.protectedMeal.start<=upper)
      :Math.max(0,Math.floor((startMax-startMin)/step)+1);
    return{cut,strategyRank:isBlockBoundary(pattern,cut)?0:1,startMin,startMax,step,feasibleCount,rawCount,
      analyticallyEliminated:rawCount-feasibleCount};
  });
  return{ranges,domainCount:ranges.reduce((sum,range)=>sum+range.rawCount,0),
    feasibleCount:ranges.reduce((sum,range)=>sum+range.feasibleCount,0),
    analyticallyEliminated:ranges.reduce((sum,range)=>sum+range.analyticallyEliminated,0)};
};
export const candidateTimelines=(p:PlannerNextProblem,pattern:string[],duration:number):MainFlowTimeline[]=>{
  const domain=candidateTimelineDomain(p,pattern,duration),timelines:MainFlowTimeline[]=[];
  for(const range of domain.ranges)for(let index=0;index<range.feasibleCount;index++)
    timelines.push(buildTimeline(p,pattern,duration,range.cut,range.startMin+index*range.step));
  return orderTimelines(timelines);
};
export const timelineSignature=(x:MainFlowTimeline)=>x.key;
export const orderTimelines=(xs:MainFlowTimeline[])=>[...xs].sort((a,b)=>a.strategyRank-b.strategyRank||b.splitIndex-a.splitIndex||a.key.localeCompare(b.key));
export const combineMainFlowOccupations=(tasks:ScheduledTask[],meal:ScheduledSpaceMeal)=>[...tasks,meal].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
