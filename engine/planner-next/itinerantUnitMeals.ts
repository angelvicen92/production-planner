import type { PlannerNextProblem, ScheduledItinerantUnitMeal } from "./contracts";

export function materializeScheduledItinerantUnitMeals(problem:PlannerNextProblem):ScheduledItinerantUnitMeal[]{
  return [...(problem.itinerantUnitMeals??[])].sort((a,b)=>a.id.localeCompare(b.id,"en")||a.itinerantUnitId.localeCompare(b.itinerantUnitId,"en")).map(meal=>({id:meal.id,itinerantUnitId:meal.itinerantUnitId,start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
}
