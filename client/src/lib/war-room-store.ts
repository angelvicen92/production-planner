// Read-only archive. Never counted as shared incidents, imported or deleted.
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

export function readLegacyIncidents(planId?: number | string | null): WarRoomIncident[] {
  if (!planId) return [];
  try {
    const raw = localStorage.getItem(keyFor(planId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}
