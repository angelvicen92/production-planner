export type WarRoomIncident = {
  id: string;
  timestamp: string;
  type: "Interrupción" | "Decisión" | "Cambio" | "Riesgo" | "Nota";
  severity: "info" | "warn" | "critical";
  text: string;
  zoneId: number | null;
  spaceId: number | null;
  taskId: number | null;
  resolved: boolean;
};

const keyFor = (planId: number | string) => `war-room-${planId}`;

export function getIncidents(planId?: number | string | null): WarRoomIncident[] {
  if (!planId) return [];
  try {
    const raw = localStorage.getItem(keyFor(planId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addIncident(
  planId: number | string,
  incidentPartial: Partial<WarRoomIncident>,
): WarRoomIncident | null {
  if (!planId) return null;
  const nextIncident: WarRoomIncident = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: incidentPartial.type || "Nota",
    severity: incidentPartial.severity || "info",
    text: incidentPartial.text?.trim() || "Incidencia sin detalle",
    zoneId: Number(incidentPartial.zoneId) || null,
    spaceId: Number(incidentPartial.spaceId) || null,
    taskId: Number(incidentPartial.taskId) || null,
    resolved: false,
  };

  const current = getIncidents(planId);
  localStorage.setItem(keyFor(planId), JSON.stringify([nextIncident, ...current]));
  return nextIncident;
}

export function toggleResolved(planId: number | string, id: string) {
  const incidents = getIncidents(planId).map((incident) =>
    incident.id === id ? { ...incident, resolved: !incident.resolved } : incident,
  );
  localStorage.setItem(keyFor(planId), JSON.stringify(incidents));
  return incidents;
}
