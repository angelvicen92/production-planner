import type { ControlRoomProjection, SpaceMetric, TaskMetric, ZoneMetric } from '../../lib/control-room-metrics';

export type ActivityFilters = {
  zone: string;
  space: string;
  state: 'all' | TaskMetric['state'];
  activity: 'all' | 'active' | 'problems';
};
export const allActivities: ActivityFilters = { zone: 'all', space: 'all', state: 'all', activity: 'all' };
export type SpaceSelection = { unit: SpaceMetric; tasks: TaskMetric[] };
export type ZoneSelection = { zone: ZoneMetric; spaces: SpaceSelection[] };

/** Select existing metrics only. Never reconstruct execution, permissions or time. */
export function selectActivities(metrics: ControlRoomProjection, filters: ActivityFilters): ZoneSelection[] {
  return metrics.zones.filter(zone => filters.zone === 'all' || zone.key === filters.zone).map(zone => ({
    zone,
    spaces: zone.spaces.filter(unit =>
      (filters.space === 'all' || unit.key === filters.space) &&
      (filters.activity === 'all' || filters.activity === 'active' && unit.current.length > 0 || filters.activity === 'problems' && unit.problems)
    ).map(unit => ({ unit, tasks: unit.tasks.filter(task => filters.state === 'all' || task.state === filters.state) }))
      .filter(({ tasks }) => filters.state === 'all' || tasks.length > 0),
  })).filter(({ zone, spaces }) => spaces.length > 0 || zone.spaces.length === 0 && filters.space === 'all' && filters.state === 'all' && filters.activity === 'all');
}

export function activitySections(tasks: TaskMetric[]) {
  return {
    current: tasks.filter(task => task.state === 'in_progress'),
    // Input already follows the authoritative projection's planning order.
    pending: tasks.filter(task => task.state === 'pending' || task.state === 'interrupted'),
    completed: tasks.filter(task => task.state === 'done').sort((a, b) =>
      (b.realEnd ?? -Infinity) - (a.realEnd ?? -Infinity) || a.id - b.id),
    other: tasks.filter(task => task.state === 'cancelled' || task.state === 'unknown'),
  };
}
