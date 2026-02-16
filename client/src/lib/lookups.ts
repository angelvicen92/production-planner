export function buildZonesById(zones: any[] = []) {
  return new Map(zones.map((zone) => [Number(zone.id), zone]));
}

export function buildSpacesById(spaces: any[] = []) {
  return new Map(spaces.map((space) => [Number(space.id), space]));
}

export function getZoneName(zoneId: unknown, zonesById: Map<number, any>) {
  const zone = zonesById.get(Number(zoneId));
  return zone?.name || "Zona por definir";
}

export function getSpaceName(spaceId: unknown, spacesById: Map<number, any>) {
  const space = spacesById.get(Number(spaceId));
  return space?.name || "Espacio por definir";
}

export function getTaskName(task: any) {
  return (
    task?.template?.name ||
    task?.name ||
    task?.title ||
    (task?.id ? `Tarea #${task.id}` : "Tarea sin nombre")
  );
}
