import { hhmmToMinutes, formatRange } from './time';

// Informational projection only. These relationships never grant execution authority.
export type SheetTask = {
  id: number; planId: number; zoneId?: number | null; spaceId?: number | null;
  contestantId?: number | null; startPlanned?: string | null; endPlanned?: string | null;
  startReal?: string | null; endReal?: string | null; status?: string;
  locationLabel?: string | null; assignedResources?: number[] | null;
  comment1Text?: string | null; comment2Text?: string | null;
  template?: { name?: string; defaultCameras?: number | null } | null;
  camerasOverride?: number | null;
};
export type SheetAssignment = {
  id: number; planId: number; staffPersonId: number; staffPersonName: string;
  staffRole: 'production' | 'editorial'; scopeType: string;
  zoneId?: number | null; spaceId?: number | null;
  realityTeamCode?: string | null; itinerantTeamId?: number | null;
};
export type SheetResource = {
  id: number; planId: number; resourceItemId: number | null; name: string;
  isAvailable: boolean; typeId: number; type: { code: string; name: string };
};
export type SheetData = {
  tasks: SheetTask[]; assignments: SheetAssignment[];
  modes: { zoneId: number; mode: 'zone' | 'space' }[];
  daySpaces: { spaceId: number; zoneId: number | null }[];
  zones: { id: number; name: string }[]; spaces: { id: number; name: string }[];
  people: { id: number; name: string; isActive?: boolean }[];
  resources: SheetResource[];
  zoneResources: { zoneId: number; planResourceItemIds: number[] }[];
  spaceResources: { spaceId: number; planResourceItemIds: number[] }[];
  contestants: { id: number; name: string }[];
};
export type SheetTarget =
  | { kind: 'general' }
  | { kind: 'mine'; staffPersonId?: number | null; resourceItemId?: number | null }
  | { kind: 'person'; id: number }
  | { kind: 'resource'; id: number }
  | { kind: 'role'; role: 'production' | 'editorial' | 'realization' }
  | { kind: 'resource-type'; id: number }
  | { kind: 'zone' | 'space'; id: number };

export const staffRoleLabel = (role: string) => role === 'production' ? 'Producción / ayudante' : 'Redacción / Reality';
export const canPreviewSheet = (role: string | null | undefined) => role === 'admin' || role === 'production';

export function sheetZone(task: SheetTask, data: SheetData) {
  // Use the day's spatial snapshot, never today's mutable general catalog.
  return task.zoneId ?? data.daySpaces.find(s => s.spaceId === task.spaceId)?.zoneId ?? null;
}
function zoneConsistent(task: SheetTask, data: SheetData) {
  const snapshotZone = data.daySpaces.find(s => s.spaceId === task.spaceId)?.zoneId;
  return task.zoneId == null || snapshotZone == null || task.zoneId === snapshotZone;
}
export function assignmentLabel(a: SheetAssignment, data: SheetData) {
  if (a.scopeType === 'zone') return `Plató · ${data.zones.find(z => z.id === a.zoneId)?.name ?? 'Nombre no disponible'}`;
  if (a.scopeType === 'space') return `Espacio · ${data.spaces.find(s => s.id === a.spaceId)?.name ?? 'Nombre no disponible'}`;
  return a.scopeType === 'itinerant_team' ? 'Equipo itinerante' : 'Equipo reality';
}
export function effectiveSheetAssignments(data: SheetData, planId: number) {
  return data.assignments.filter(a => {
    if (a.planId !== planId || data.people.find(p => p.id === a.staffPersonId)?.isActive === false) return false;
    const zone = a.scopeType === 'space' ? data.daySpaces.find(s => s.spaceId === a.spaceId)?.zoneId : a.zoneId;
    const mode = data.modes.find(m => m.zoneId === zone)?.mode;
    // Same missing-mode semantics as 096: neither invent zone inheritance nor
    // suppress a directly assigned space when no mode row exists.
    if (a.scopeType === 'zone') return !!a.zoneId && mode !== 'space';
    if (a.scopeType === 'space') return !!a.spaceId && mode !== 'zone';
    return a.scopeType === 'reality_team' || a.scopeType === 'itinerant_team';
  });
}
function assignmentMatches(a: SheetAssignment, task: SheetTask, data: SheetData) {
  if (a.scopeType === 'space') return a.spaceId === task.spaceId;
  if (a.scopeType === 'zone') return zoneConsistent(task, data) && a.zoneId === sheetZone(task, data);
  // The task API exposes no effective team selection from the day snapshot.
  // A general template requirement (even "specific") is not that selection.
  return false;
}
export function taskSheetResources(task: SheetTask, data: SheetData, planId: number) {
  const ids = new Set(Array.isArray(task.assignedResources) ? task.assignedResources : []);
  for (const a of data.spaceResources) if (a.spaceId === task.spaceId) a.planResourceItemIds.forEach(id => ids.add(id));
  for (const a of data.zoneResources) if (zoneConsistent(task, data) && a.zoneId === sheetZone(task, data)) a.planResourceItemIds.forEach(id => ids.add(id));
  return {
    resources: data.resources.filter(r => r.planId === planId && r.isAvailable && ids.has(r.id)),
    incomplete: [...ids].some(id => !data.resources.some(r => r.planId === planId && r.id === id && r.isAvailable)),
  };
}
export function sheetTaskName(task: SheetTask) { return task.template?.name || 'Actividad sin nombre'; }
export function sheetLocation(task: SheetTask, data: SheetData) {
  if (task.spaceId) return data.spaces.find(s => s.id === task.spaceId)?.name ?? 'Espacio sin nombre disponible';
  if (sheetZone(task, data)) return data.zones.find(z => z.id === sheetZone(task, data))?.name ?? 'Plató sin nombre disponible';
  return task.locationLabel || 'Ubicación por definir';
}

export function projectCallSheet(data: SheetData, planId: number, target: SheetTarget) {
  const allAssignments = effectiveSheetAssignments(data, planId);
  const personId = target.kind === 'person' ? target.id : target.kind === 'mine' ? target.staffPersonId : null;
  const assignments = allAssignments.filter(a =>
    personId ? a.staffPersonId === personId : target.kind === 'role' ? a.staffRole === target.role :
    target.kind === 'zone' ? (a.scopeType === 'zone' ? a.zoneId === target.id : a.scopeType === 'space' && data.daySpaces.some(s => s.spaceId === a.spaceId && s.zoneId === target.id)) :
    target.kind === 'space' ? (a.scopeType === 'space' ? a.spaceId === target.id : a.scopeType === 'zone' && data.daySpaces.some(s => s.spaceId === target.id && s.zoneId === a.zoneId)) : target.kind === 'general');
  const nominalResource = target.kind === 'mine' ? target.resourceItemId : null;
  const recipientResources = data.resources.filter(r => r.planId === planId && r.isAvailable &&
    (target.kind === 'resource' ? r.id === target.id : target.kind === 'resource-type' ? r.typeId === target.id : nominalResource != null && r.resourceItemId === nominalResource));
  const warnings = new Set<string>();
  if (target.kind === 'mine' && !personId && !nominalResource) warnings.add('Sin vínculo personal o de recurso confirmado. Puedes consultar la vista general autorizada.');
  if (target.kind === 'person') warnings.add('Esta vista usa sus asignaciones de personal. No se dispone de su vínculo nominal a recursos para asociar otras actividades.');
  if (target.kind === 'role' && target.role === 'realization') warnings.add('Realización: no existe una relación estructurada que identifique sus actividades. Consulta la vista general, identificada como tal.');
  if (assignments.some(a => ['reality_team', 'itinerant_team'].includes(a.scopeType))) warnings.add('Asignación no verificable: no se puede comprobar qué actividades corresponden al equipo itinerante / reality de esta jornada. Estas asignaciones no incorporan actividades.');
  const entries = data.tasks.filter(t => t.planId === planId).flatMap(task => {
    const assigned = assignments.filter(a => assignmentMatches(a, task, data));
    const effectiveResources = taskSheetResources(task, data, planId);
    const used = effectiveResources.resources.filter(r => recipientResources.some(candidate => candidate.id === r.id));
    const reasons = assigned.map(a => `${staffRoleLabel(a.staffRole)} · ${assignmentLabel(a, data)}`);
    used.forEach(r => reasons.push(`Recurso nominal efectivo · ${r.name}`));
    const include = target.kind === 'general' ||
      (target.kind === 'zone' && zoneConsistent(task, data) && sheetZone(task, data) === target.id) ||
      (target.kind === 'space' && task.spaceId === target.id) ||
      (!['zone', 'space'].includes(target.kind) && reasons.length > 0);
    if (!include) return [];
    if (!task.spaceId && !task.zoneId && !task.locationLabel) warnings.add('Hay actividades sin ubicación prevista.');
    if (!zoneConsistent(task, data)) warnings.add('Hay ubicaciones con plató y espacio incompatibles; no se ha inferido su asignación por plató.');
    if (hhmmToMinutes(task.startPlanned) === null || hhmmToMinutes(task.endPlanned) === null) warnings.add('Hay actividades sin horario previsto completo.');
    if (effectiveResources.incomplete) warnings.add('Recursos incompletos: hay referencias sin recurso disponible en el snapshot del día.');
    return [{ task, reasons: [...new Set(reasons)], assignmentIds: assigned.map(a => a.id), resources: effectiveResources.resources }];
  }).sort((a, b) => (hhmmToMinutes(a.task.startPlanned) ?? Infinity) - (hhmmToMinutes(b.task.startPlanned) ?? Infinity) || a.task.id - b.task.id);
  if (!entries.length && target.kind !== 'general') warnings.add('Sin asignación confirmada con actividades asociables para esta jornada. No se ha añadido la agenda general.');
  return { entries, assignments, recipientResources, warnings: [...warnings] };
}

export function sheetSimultaneous(task: SheetTask, tasks: SheetTask[]) {
  const start = hhmmToMinutes(task.startPlanned), end = hhmmToMinutes(task.endPlanned);
  if (start === null || end === null || end <= start || task.status === 'cancelled') return [];
  return tasks.filter(t => t.id !== task.id && t.status !== 'cancelled' &&
    hhmmToMinutes(t.startPlanned) !== null && hhmmToMinutes(t.endPlanned) !== null &&
    hhmmToMinutes(t.startPlanned)! < hhmmToMinutes(t.endPlanned)! &&
    hhmmToMinutes(t.startPlanned)! < end && hhmmToMinutes(t.endPlanned)! > start);
}

export function callSheetSummary(title: string, date: string, projection: ReturnType<typeof projectCallSheet>, data: SheetData) {
  return [`Hoja del día · ${date} · ${title}`, 'Solo lectura · Horarios y ubicaciones previstos',
    ...projection.warnings,
    ...projection.entries.map(({ task, resources }) => `${formatRange(task.startPlanned, task.endPlanned)} · ${sheetTaskName(task)} · ${sheetLocation(task, data)} · ${data.contestants.find(c => c.id === task.contestantId)?.name ?? 'Participante no disponible'} · Recursos: ${resources.map(r => r.name).join(', ') || 'Sin recurso nominal confirmado'}`),
  ].join('\n');
}
