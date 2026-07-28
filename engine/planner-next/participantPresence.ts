import type { ScheduledTask } from "./contracts";

export function participantPresenceSpan(participantId: string, tasks: ScheduledTask[]): number {
  const own = tasks.filter((task) => task.participantId === participantId);
  return own.length === 0 ? 0 : Math.max(...own.map((x) => x.end)) - Math.min(...own.map((x) => x.start));
}
export function participantPresenceIncrement(participantId: string, tasks: ScheduledTask[], added: ScheduledTask): number {
  return participantPresenceSpan(participantId, [...tasks, added]) - participantPresenceSpan(participantId, tasks);
}
