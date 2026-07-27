import { createHash } from "node:crypto";
import type { ScheduledTask } from "./contracts";
export function fingerprint(tasks: ScheduledTask[]): string {
  const stable = [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map(({id,start,end,spaceId,participantId,coachId}) => ({id,start,end,spaceId,participantId,coachId}));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
