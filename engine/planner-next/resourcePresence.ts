import type { PreferenceLevel, Resource, ScheduledTask } from "./contracts";

/** Small fixed weights keep NEXT-003 explicit; callers cannot supply arbitrary numeric weights. */
const PRESENCE_WEIGHTS: Record<PreferenceLevel, number> = {
  OFF: 0, LOW: 1, MEDIUM: 2, HIGH: 4, MAXIMUM: 8,
};

export function presencePreferenceWeight(level: PreferenceLevel): number {
  return PRESENCE_WEIGHTS[level];
}

export function resourcePresenceMetrics(resources: Resource[], tasks: ScheduledTask[]): {
  presenceMinutesById: Record<string, number>;
  internalGapMinutesById: Record<string, number>;
} {
  const presenceMinutesById: Record<string, number> = {};
  const internalGapMinutesById: Record<string, number> = {};
  for (const resource of [...resources].sort((a, b) => a.id.localeCompare(b.id))) {
    const own = tasks.filter((task) => (task.requiredResourceIds ?? []).includes(resource.id))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    const span = own.length === 0 ? 0 : Math.max(...own.map(({ end }) => end)) - Math.min(...own.map(({ start }) => start));
    presenceMinutesById[resource.id] = span;
    internalGapMinutesById[resource.id] = span - own.reduce((sum, task) => sum + task.duration, 0);
  }
  return { presenceMinutesById, internalGapMinutesById };
}

export function resourcePresenceIncrement(resourceId: string, before: ScheduledTask[], added: ScheduledTask): number {
  const relevant = before.filter((task) => (task.requiredResourceIds ?? []).includes(resourceId));
  const span = (items: ScheduledTask[]) => items.length === 0 ? 0
    : Math.max(...items.map(({ end }) => end)) - Math.min(...items.map(({ start }) => start));
  return span([...relevant, added]) - span(relevant);
}
