import type { SheetAssignment, SheetData, SheetTask } from './call-sheet-projection';

export function callSheetFixture(): SheetData {
  const task = (id: number, spaceId: number | null, zoneId: number | null, start = '09:00'): SheetTask => ({
    id, planId: 1, spaceId, zoneId, startPlanned: start, endPlanned: '10:00', status: 'pending',
    contestantId: 71, template: { name: `Actividad ${id}`, defaultCameras: 2 },
  });
  const assignment = (id: number, staffPersonId: number, staffRole: 'production' | 'editorial', scopeType: string, zoneId: number | null, spaceId: number | null): SheetAssignment => ({
    id, planId: 1, staffPersonId, staffPersonName: ['Ana', 'Bruno', 'Celia', 'Diego'][staffPersonId - 1] || 'Elena', staffRole, scopeType, zoneId, spaceId,
  });
  return {
    tasks: [task(11, 101, 10), task(12, 102, 10), task(13, 201, 20, '09:30'), task(14, null, null), { ...task(15, 201, 20), planId: 2 }],
    assignments: [assignment(31, 1, 'production', 'zone', 10, null), assignment(32, 2, 'production', 'zone', 10, null), assignment(33, 3, 'editorial', 'space', null, 201), assignment(34, 4, 'production', 'space', null, 201)],
    modes: [{ zoneId: 10, mode: 'zone' }, { zoneId: 20, mode: 'space' }],
    daySpaces: [{ spaceId: 101, zoneId: 10 }, { spaceId: 102, zoneId: 10 }, { spaceId: 201, zoneId: 20 }],
    people: ['Ana', 'Bruno', 'Celia', 'Diego', 'Elena'].map((name, i) => ({ id: i + 1, name, isActive: true })),
    zones: [{ id: 10, name: 'Plató Norte' }, { id: 20, name: 'Plató Sur' }],
    spaces: [{ id: 101, name: 'Sala Norte' }, { id: 102, name: 'Sala Anexa' }, { id: 201, name: 'Sala Sur' }],
    resources: [
      { id: 501, planId: 1, resourceItemId: 91, name: 'Cámara nominal A', isAvailable: true, typeId: 7, type: { code: 'CAM', name: 'Cámara' } },
      { id: 502, planId: 1, resourceItemId: 92, name: 'Cámara nominal B', isAvailable: true, typeId: 7, type: { code: 'CAM', name: 'Cámara' } },
      { id: 503, planId: 1, resourceItemId: 93, name: 'Coach vocal', isAvailable: true, typeId: 8, type: { code: 'VOCAL', name: 'Coach vocal' } },
    ],
    zoneResources: [{ zoneId: 10, planResourceItemIds: [501] }],
    spaceResources: [{ spaceId: 201, planResourceItemIds: [502, 503] }],
    contestants: [{ id: 71, name: 'Participante confirmado' }],
  };
}
