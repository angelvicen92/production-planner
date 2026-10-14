import { z } from 'zod';

export const incidentTypes = {
  delay: 'Retraso', resource_unavailable: 'Recurso no disponible', space_blocked: 'Espacio bloqueado',
  contestant_missing: 'Concursante no localizado', task_interrupted: 'Tarea interrumpida',
  editorial_change: 'Cambio editorial', technical: 'Problema técnico', priority_change: 'Cambio de prioridad',
  meal_break: 'Comida/descanso', other: 'Otro',
} as const;
export const incidentSeverities = { info: 'Informativa', warn: 'Importante', critical: 'Crítica' } as const;
export const incidentStatuses = { open: 'Abierta', escalated: 'Escalada', resolved: 'Resuelta' } as const;
const reference = z.number().int().positive().safe().nullable();
const note = z.string().trim().max(4000).nullable();
export const incidentFieldsSchema = z.object({
  type: z.enum(['delay', 'resource_unavailable', 'space_blocked', 'contestant_missing', 'task_interrupted', 'editorial_change', 'technical', 'priority_change', 'meal_break', 'other']),
  severity: z.enum(['info', 'warn', 'critical']), description: z.string().trim().min(1).max(4000),
  taskId: reference.default(null), contestantId: reference.default(null), zoneId: reference.default(null),
  spaceId: reference.default(null), resourceId: reference.default(null), responsibleId: reference.default(null),
  cause: note.default(null), context: note.default(null),
});
export const createIncidentSchema = incidentFieldsSchema.extend({ requestId: z.string().uuid() }).strict();
export const updateIncidentSchema = incidentFieldsSchema.partial().extend({ expectedVersion: z.number().int().positive() }).strict()
  .refine(value => Object.keys(value).length > 1, 'Indica al menos un cambio.');
export const transitionIncidentSchema = z.object({ expectedVersion: z.number().int().positive(), note: z.string().trim().min(1).max(4000) }).strict();
export const incidentSchema = incidentFieldsSchema.extend({
  id: z.string().uuid(), planId: z.number(), version: z.number(), status: z.enum(['open', 'escalated', 'resolved']),
  authorId: z.string().uuid(), authorName: z.string(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable(),
  resolutionNote: z.string().nullable(), canManage: z.boolean(),
  taskName: z.string().nullable(), contestantName: z.string().nullable(), zoneName: z.string().nullable(),
  spaceName: z.string().nullable(), resourceName: z.string().nullable(), responsibleName: z.string().nullable(),
});
export type Incident = z.infer<typeof incidentSchema>;
export type IncidentFields = z.infer<typeof incidentFieldsSchema>;
export type CreateIncident = z.infer<typeof createIncidentSchema>;
export const incidentEventSchema = z.object({
  id: z.number(), version: z.number(), action: z.enum(['created', 'updated', 'resolved', 'reopened', 'escalated']),
  actorName: z.string(), createdAt: z.string(), note: z.string().nullable(), snapshot: incidentSchema,
});
export const incidentDetailSchema = z.object({ incident: incidentSchema, events: z.array(incidentEventSchema) });
const option = z.object({ id: z.number(), name: z.string() });
export const incidentContextSchema = z.object({
  role: z.enum(['admin', 'production', 'aux', 'viewer']), canCreate: z.boolean(),
  tasks: z.array(option.extend({ zoneId: reference, spaceId: reference, contestantId: reference, canReport: z.boolean() })),
  zones: z.array(option), spaces: z.array(option.extend({ zoneId: z.number() })),
  contestants: z.array(option), resources: z.array(option), responsibles: z.array(option),
});
export type IncidentContext = z.infer<typeof incidentContextSchema>;

// Explicit correspondence only for reviewed historical suggestions; local notes
// are never imported, counted or written to the shared record automatically.
export const legacyIncidentType = { Interrupción: 'task_interrupted', Decisión: 'editorial_change', Cambio: 'priority_change', Riesgo: 'other', Nota: 'other' } as const;
