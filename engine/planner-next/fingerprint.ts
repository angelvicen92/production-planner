import { createHash } from "node:crypto";
import type { ScheduledSetupPreparation, ScheduledTask } from "./contracts";
export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = []): string {
  const stable = [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((task) => task.kind === "technical"
    ? ({ id: task.id, kind: task.kind, start: task.start, end: task.end, spaceId: task.spaceId, requiredResourceIds: [...(task.requiredResourceIds ?? [])].sort() })
    : task.jointGroupId === undefined ? ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId}) : ({id:task.id,start:task.start,end:task.end,spaceId:task.spaceId,participantId:task.participantId,coachId:task.coachId,jointGroupId:task.jointGroupId}));
  const preparationRecords = [...preparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind})=>({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind}));
  return createHash("sha256").update(JSON.stringify(preparationRecords.length ? [...stable, ...preparationRecords] : stable)).digest("hex");
}
