import {
  itinerantOperationProfiles,
  itinerantUnitProfiles,
} from "./focalA2RealityReference";

interface ScheduledOperation {
  id: string;
  participantId?: string;
  start: number;
  end: number;
  spaceId: string;
  requiredResourceIds?: string[];
}

export function evaluateFocalA2RealityUnits(
  tasks: ReadonlyArray<ScheduledOperation>,
  inputUnchanged: boolean,
) {
  const standalone = itinerantOperationProfiles.filter((operation) => operation.type === "STANDALONE");
  const scheduled = tasks.filter((task) => standalone.some((operation) => operation.id === task.id));
  const resourceConflicts: string[] = [];
  const participantConflicts: string[] = [];
  for (let left = 0; left < scheduled.length; left += 1) {
    for (let right = left + 1; right < scheduled.length; right += 1) {
      const a = scheduled[left]!;
      const b = scheduled[right]!;
      if (a.start >= b.end || b.start >= a.end) continue;
      if ((a.requiredResourceIds ?? []).some((id) => b.requiredResourceIds?.includes(id))) {
        resourceConflicts.push(`${a.id}:${b.id}`);
      }
      if (a.participantId === b.participantId) participantConflicts.push(`${a.id}:${b.id}`);
    }
  }
  const agendas = Object.fromEntries(itinerantUnitProfiles.map((unit) => {
    const operations = scheduled.filter((task) => task.requiredResourceIds?.some((id) => unit.memberResourceIds.includes(id)));
    return [unit.id, operations.sort((a, b) => a.start - b.start).map((task) => ({
      taskId: task.id, start: task.start, end: task.end, spaceId: task.spaceId,
    }))];
  }));
  return {
    plannedTaskCount: scheduled.length,
    sharedResourceConflicts: resourceConflicts,
    participantOverlapConflicts: participantConflicts,
    agendas,
    inputUnchanged,
  };
}
