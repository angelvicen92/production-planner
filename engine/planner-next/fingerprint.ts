import { createHash } from "node:crypto";
import type { ScheduledSetupPreparation, ScheduledTask } from "./contracts";
export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = []): string {
  const stable = [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map(({id,start,end,spaceId,participantId,coachId}) => ({id,start,end,spaceId,participantId,coachId}));
  const preparationRecords = [...preparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind})=>({id,start,end,spaceId,setupFamilyId,entryIndex,duration,kind}));
  return createHash("sha256").update(JSON.stringify(preparationRecords.length ? [...stable, ...preparationRecords] : stable)).digest("hex");
}
