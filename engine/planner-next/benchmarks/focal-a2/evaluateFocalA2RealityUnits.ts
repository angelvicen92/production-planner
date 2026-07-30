import { itinerantOperationProfiles, itinerantUnitProfiles } from "./focalA2RealityReference";

interface ScheduledOperation { id: string; participantId?: string; start: number; end: number; spaceId: string; requiredResourceIds?: string[] }
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

export function evaluateFocalA2RealityUnits(tasks: ReadonlyArray<ScheduledOperation>, inputUnchanged: boolean) {
  const profiles = new Map(itinerantOperationProfiles.map((operation) => [operation.id, operation]));
  const scheduled = tasks.filter((task) => profiles.get(task.id)?.type === "STANDALONE");
  const resourceConflicts: string[] = [];
  const participantConflicts: string[] = [];
  for (let left = 0; left < scheduled.length; left += 1) for (let right = left + 1; right < scheduled.length; right += 1) {
    const a = scheduled[left]!; const b = scheduled[right]!;
    if (a.start >= b.end || b.start >= a.end) continue;
    if ((a.requiredResourceIds ?? []).some((id) => b.requiredResourceIds?.includes(id))) resourceConflicts.push(`${a.id}:${b.id}`);
    if (a.participantId === b.participantId) participantConflicts.push(`${a.id}:${b.id}`);
  }
  const membershipCounts = new Map<string, number>();
  const agendas = Object.fromEntries(itinerantUnitProfiles.map((unit) => {
    const configured = itinerantOperationProfiles.filter((operation) => operation.unitId === unit.id && operation.type === "STANDALONE");
    const operations = scheduled.filter((task) => profiles.get(task.id)?.unitId === unit.id).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    operations.forEach((task) => membershipCounts.set(task.id, (membershipCounts.get(task.id) ?? 0) + 1));
    const configuredOperationIds = configured.map(({ id }) => id);
    const scheduledOperationIds = operations.map(({ id }) => id);
    const start = operations.length ? Math.min(...operations.map((task) => task.start)) : null;
    const end = operations.length ? Math.max(...operations.map((task) => task.end)) : null;
    const productiveMinutes = operations.reduce((sum, task) => sum + task.end - task.start, 0);
    const operationalBlockCount = operations.reduce((count, task, index) => count + (index === 0 || operations[index - 1]!.end < task.start ? 1 : 0), 0);
    const locationSequence = operations.filter((task, index) => index === 0 || operations[index - 1]!.spaceId !== task.spaceId).map((task) => task.spaceId);
    const exactComposition = operations.every((task) => sameSet(task.requiredResourceIds ?? [], unit.memberResourceIds));
    const operationsOutsideUnitAvailability=operations.filter(task=>!unit.availability.some(window=>window.start<=task.start&&task.end<=window.end)).map(task=>task.id);
    return [unit.id, {
      unitId:unit.id,memberResourceIds:[...unit.memberResourceIds],availability:unit.availability.map(window=>({...window})),
      operationIds:configuredOperationIds, plannedOperationIds:scheduledOperationIds,
      configuredOperationIds, scheduledOperationIds,
      missingOperationIds: configuredOperationIds.filter((id) => !scheduledOperationIds.includes(id)),
      unexpectedOperationIds: scheduledOperationIds.filter((id) => !configuredOperationIds.includes(id)),
      operationCount: configuredOperationIds.length, scheduledOperationCount: operations.length,
      presenceStart:start, presenceEnd:end, start, end, productiveMinutes, presenceSpanMinutes:start === null || end === null ? 0 : end-start, spanMinutes: start === null || end === null ? 0 : end - start,
      internalGapMinutes: start === null || end === null ? 0 : end - start - productiveMinutes,
      operationalBlockCount, locationSequence, moveCount: Math.max(0, locationSequence.length - 1),
      exactCompositionSatisfied:exactComposition, availabilitySatisfied:operationsOutsideUnitAvailability.length===0,operationsOutsideUnitAvailability,
      exactMembershipSatisfied: configuredOperationIds.length === scheduledOperationIds.length
        && configuredOperationIds.every((id) => scheduledOperationIds.includes(id)) && exactComposition,
    }];
  }));
  const duplicateOperationIds = scheduled.filter((task) => (membershipCounts.get(task.id) ?? 0) > 1).map(({ id }) => id);
  const unassignedOperationIds = scheduled.filter((task) => (membershipCounts.get(task.id) ?? 0) === 0).map(({ id }) => id);
  return { plannedTaskCount: scheduled.length, sharedResourceConflicts: resourceConflicts, participantOverlapConflicts: participantConflicts,
    agendas, duplicateOperationIds, unassignedOperationIds, exactMembershipSatisfied: duplicateOperationIds.length === 0 && unassignedOperationIds.length === 0
      && Object.values(agendas).every((agenda) => agenda.exactMembershipSatisfied), inputUnchanged };
}
