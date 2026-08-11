import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Space, SpaceMealPolicy } from "./contracts";
import { contains, overlaps } from "./time";

export const spacesWithMealPolicy=(problem:PlannerNextProblem):Space[]=>[...problem.spaces].filter(s=>s.mealPolicy!==undefined).sort((a,b)=>a.id.localeCompare(b.id));
export const spaceMealPolicy=(problem:PlannerNextProblem,id:string):SpaceMealPolicy|undefined=>problem.spaces.find(s=>s.id===id)?.mealPolicy;
export const spaceMealId=(spaceId:string):string=>`space-meal:${spaceId}:1`;
export const createScheduledSpaceMeal=(spaceId:string,start:number,duration:number):ScheduledSpaceMeal=>({id:spaceMealId(spaceId),kind:"space-meal",spaceId,entryIndex:1,duration,start,end:start+duration});
export const sortedSpaceMeals=(meals:ScheduledSpaceMeal[])=>[...meals].sort((a,b)=>a.spaceId.localeCompare(b.spaceId)||a.start-b.start||a.id.localeCompare(b.id));
export const isRequiredBlockMealSpace=(problem:PlannerNextProblem,spaceId:string)=>problem.spaces.some(s=>s.id===spaceId&&s.secondaryContinuity==="REQUIRED"&&s.mealPolicy!==undefined);
export const isMainFlowMealSpace=(problem:PlannerNextProblem,spaceId:string)=>spaceId===problem.mainFlow.spaceId&&spaceMealPolicy(problem,spaceId)!==undefined;
/** Whether protectedMeal is represented by the explicit, space-local main-flow meal. */
export const hasExplicitMainFlowMeal=(problem:PlannerNextProblem):boolean=>{const policy=spaceMealPolicy(problem,problem.mainFlow.spaceId),meal=problem.protectedMeal;return meal!==undefined&&policy!==undefined&&policy.duration===meal.end-meal.start&&policy.window.start<=meal.start&&policy.window.end>=meal.end&&problem.mainFlow.preferredEnd===meal.start};
/** Legacy protected meals are global; an aligned explicit main meal only blocks its space. */
export const protectedMealBlocksSpace=(problem:PlannerNextProblem,spaceId:string):boolean=>problem.protectedMeal!==undefined&&(!hasExplicitMainFlowMeal(problem)||spaceId===problem.mainFlow.spaceId);
export const occupationAvoidsProtectedMeal=(problem:PlannerNextProblem,spaceId:string,start:number,end:number):boolean=>!problem.protectedMeal||!protectedMealBlocksSpace(problem,spaceId)||!overlaps({start,end},problem.protectedMeal);
export const independentSpaceMealIds=(problem:PlannerNextProblem,meals:ScheduledSpaceMeal[])=>spacesWithMealPolicy(problem).map(s=>s.id).filter(id=>!isRequiredBlockMealSpace(problem,id)&&!isMainFlowMealSpace(problem,id)&&!meals.some(m=>m.spaceId===id));
export const requiredBlockMealSpaceIds=(problem:PlannerNextProblem,meals:ScheduledSpaceMeal[])=>spacesWithMealPolicy(problem).map(s=>s.id).filter(id=>isRequiredBlockMealSpace(problem,id)&&!meals.some(m=>m.spaceId===id));
export const pendingSpaceMealIds=independentSpaceMealIds;
export const spaceMealWithinDay=(problem:PlannerNextProblem,m:Pick<ScheduledSpaceMeal,"start"|"end">)=>m.start>=problem.day.start&&m.end<=problem.day.end;
export const spaceMealWithinWindow=(p:SpaceMealPolicy,m:Pick<ScheduledSpaceMeal,"start"|"end">)=>m.start>=p.window.start&&m.end<=p.window.end;
export const spaceMealWithinAvailability=(space:Space,m:Pick<ScheduledSpaceMeal,"start"|"end">)=>contains(space.availability,m.start,m.end);
export const spaceMealAvoidsTasks=(m:ScheduledSpaceMeal,tasks:ScheduledTask[])=>!tasks.some(t=>t.spaceId===m.spaceId&&overlaps(t,m));
export const assignedResourceIdsForSpace=(problem:PlannerNextProblem,spaceId:string):string[]=>problem.resources.filter(resource=>resource.assignedSpaceId===spaceId).map(({id})=>id).sort();
export const spaceMealAvoidsAssignedResourceTasks=(problem:PlannerNextProblem,m:ScheduledSpaceMeal,tasks:ScheduledTask[]):boolean=>{const ids=new Set(assignedResourceIdsForSpace(problem,m.spaceId));return ids.size===0||!tasks.some(task=>(task.requiredResourceIds??[]).some(id=>ids.has(id))&&overlaps(task,m));};
export const spaceMealAvoidsMeals=(m:ScheduledSpaceMeal,meals:ScheduledSpaceMeal[])=>!meals.some(x=>x.spaceId===m.spaceId&&overlaps(x,m));
export function spaceMealPotentialStarts(problem:PlannerNextProblem,spaceId:string):number[]{const p=spaceMealPolicy(problem,spaceId);if(!p)return [];const out:number[]=[];const first=Math.ceil(p.window.start/5)*5;for(let start=first;start+p.duration<=p.window.end;start+=5)out.push(start);return out}
export function canPlaceSpaceMeal(problem:PlannerNextProblem,spaceId:string,start:number,tasks:ScheduledTask[],meals:ScheduledSpaceMeal[]):boolean{const p=spaceMealPolicy(problem,spaceId),s=problem.spaces.find(x=>x.id===spaceId);if(!p||!s||!Number.isFinite(p.duration)||p.duration<=0||start%5!==0)return false;const m=createScheduledSpaceMeal(spaceId,start,p.duration);return spaceMealWithinDay(problem,m)&&spaceMealWithinWindow(p,m)&&spaceMealWithinAvailability(s,m)&&spaceMealAvoidsTasks(m,tasks)&&spaceMealAvoidsAssignedResourceTasks(problem,m,tasks)&&spaceMealAvoidsMeals(m,meals)}
export function spaceMealCandidateStarts(problem:PlannerNextProblem,spaceId:string,tasks:ScheduledTask[],meals:ScheduledSpaceMeal[]):number[]{return spaceMealPotentialStarts(problem,spaceId).filter(start=>canPlaceSpaceMeal(problem,spaceId,start,tasks,meals))}
export type SpaceOccupation={start:number;end:number};
export const combineSpaceOccupations=(spaceId:string,tasks:ScheduledTask[],meals:ScheduledSpaceMeal[]):SpaceOccupation[]=>[...tasks.filter(t=>t.spaceId===spaceId),...meals.filter(m=>m.spaceId===spaceId)].map(({start,end})=>({start,end})).sort((a,b)=>a.start-b.start||a.end-b.end);
export const occupationMinutes=(xs:SpaceOccupation[])=>xs.reduce((n,x)=>n+x.end-x.start,0);
export const occupiedStart=(xs:SpaceOccupation[])=>xs.length?Math.min(...xs.map(x=>x.start)):null;
export const occupiedEnd=(xs:SpaceOccupation[])=>xs.length?Math.max(...xs.map(x=>x.end)):null;
export const occupiedBlockCount=(xs:SpaceOccupation[])=>xs.reduce((r,x)=>{const last=r.at(-1);if(last&&x.start<=last.end)last.end=Math.max(last.end,x.end);else r.push({...x});return r},[] as SpaceOccupation[]).length;
export const internalGapMinutes=(xs:SpaceOccupation[])=>{const start=occupiedStart(xs),end=occupiedEnd(xs);return start===null||end===null?0:end-start-occupationMinutes(xs)};
