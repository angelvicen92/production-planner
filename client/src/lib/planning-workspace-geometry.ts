/** Visual geometry only. These values never enter the planning contract. */
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 300;
export function clampZoom(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) : 100;
}
export function zoomAxes(x: number, y: number, axis: "x" | "y" | "linked", factor: number) {
  if (axis === "x") return { zoomX: clampZoom(x * factor), zoomY: y };
  if (axis === "y") return { zoomX: x, zoomY: clampZoom(y * factor) };
  const bounded = Math.min(MAX_ZOOM / Math.max(x, y), Math.max(MIN_ZOOM / Math.min(x, y), factor));
  return { zoomX: x * bounded, zoomY: y * bounded };
}
export function planningRange(dayStart: number, dayEnd: number, tasks: { startPlanned?: string | null; endPlanned?: string | null }[], frame: "day" | "tasks") {
  const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const starts = tasks.flatMap(task => task.startPlanned ? [minutes(task.startPlanned)] : []).filter(Number.isFinite);
  const ends = tasks.flatMap(task => task.endPlanned ? [minutes(task.endPlanned)] : []).filter(Number.isFinite);
  const padding = frame === "tasks" ? 15 : 0;
  const first = starts.length ? Math.floor((Math.min(...starts) - padding) / 15) * 15 : dayStart;
  const last = ends.length ? Math.ceil((Math.max(...ends) + padding) / 15) * 15 : dayEnd;
  const start = frame === "tasks" ? first : Math.min(dayStart, first);
  return { start, end: Math.max(start + 60, frame === "tasks" ? last : Math.max(dayEnd, last)) };

}
export function assignedPlanningLocations(tasks: {spaceId?: number | null; zoneId?: number | null}[], spaces: {id: number; zoneId?: number | null}[]) {
  const spaceIds = new Set<number>();
  const zoneIds = new Set<number>();
  const zones = new Map(spaces.map(space => [Number(space.id), space.zoneId]));
  for (const task of tasks) {
    const space = Number(task.spaceId);
    if (space > 0) spaceIds.add(space);
    const zone = Number((space > 0 ? zones.get(space) : null) ?? task.zoneId);
    if (zone > 0) zoneIds.add(zone);
  }
  return { spaceIds, zoneIds };
}
export function clampPanelRatio(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(30, Math.min(70, value)) : 50;
}
