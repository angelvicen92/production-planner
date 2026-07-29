import { createHash } from "node:crypto";
import type { ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask } from "./contracts";
export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[]): string {
  const stable = [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((task) => task.kind === "technical"
    ? ({ id: task.id, kind: task.kind, start: task.start, end: task.end, spaceId: task.spaceId, requiredResourceIds: [...(task.requiredResourceIds ?? [])].sort(), ...(task.dependencies.length ? { dependencies: [...task.dependencies].sort() } : {}) })
    : task.jointGroupId === undefined ? ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId}) : ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId,jointGroupId:task.jointGroupId}));
  const preparationRecords = [...preparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind})=>({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind}));
  const mealRecords=[...meals].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,kind,spaceId,entryIndex,duration,start,end})=>({id,kind,spaceId,entryIndex,duration,start,end}));
  return createHash("sha256").update(JSON.stringify(preparationRecords.length||mealRecords.length ? [...stable, ...preparationRecords,...mealRecords] : stable)).digest("hex");
}
