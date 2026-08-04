import { createHash } from "node:crypto";
import type { ScheduledItinerantUnitMeal, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask } from "./contracts";
export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], itinerantMeals:ScheduledItinerantUnitMeal[]=[]): string {
  const stable = [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((task) => task.kind === "technical"
    ? ({ id: task.id, kind: task.kind, start: task.start, end: task.end, spaceId: task.spaceId, itinerantUnitId:task.itinerantUnitId, requiredResourceIds: [...(task.requiredResourceIds ?? [])].sort(), ...(task.dependencies.length ? { dependencies: [...task.dependencies].sort() } : {}) })
    : task.jointGroupId === undefined ? ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId,itinerantUnitId:task.itinerantUnitId}) : ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId,jointGroupId:task.jointGroupId,itinerantUnitId:task.itinerantUnitId}));
  const preparationRecords = [...preparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind})=>({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind}));
  const mealRecords=[...meals].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,kind,spaceId,entryIndex,duration,start,end})=>({id,kind,spaceId,entryIndex,duration,start,end}));
  const itinerantMealRecords=[...itinerantMeals].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,itinerantUnitId,start,end,duration})=>({id,itinerantUnitId,start,end,duration}));
  return createHash("sha256").update(JSON.stringify(preparationRecords.length||mealRecords.length||itinerantMealRecords.length ? [...stable,...preparationRecords,...mealRecords,...itinerantMealRecords] : stable)).digest("hex");
}
