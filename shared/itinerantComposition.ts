import { z } from 'zod';

const id = z.number().int().positive().safe();
export const itinerantWindowSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict().refine(value => value.start < value.end, 'La disponibilidad debe terminar después de empezar.');
export const itinerantCompositionInput = z.object({
  code: z.string().trim().min(1), name: z.string().trim().min(1),
  resourceItemIds: z.array(id).min(1).refine(ids => new Set(ids).size === ids.length, 'Miembros duplicados.'),
  availabilityWindows: z.array(itinerantWindowSchema).min(1).nullable(),
  transitionMinutes: z.number().int().min(0).max(1440).nullable(),
  isActive: z.boolean(), orderIndex: z.number().int().default(0),
}).strict();
export const itinerantCompositionUpdate = itinerantCompositionInput.extend({expectedRevision: z.number().int().nonnegative()});
/** Unconfigured legacy catalog entries remain readable, but cannot be saved empty. */
export const itinerantTeamSchema = itinerantCompositionInput.extend({
  id, revision:z.number().int().nonnegative(), resourceItemIds:z.array(id),
});
export type ItinerantCompositionInput = z.infer<typeof itinerantCompositionInput>;
export type ItinerantTeam = ItinerantCompositionInput & {id: number; revision: number};

export const dailyItinerantUnitSchema = z.object({
  id, plan_id: id, source_team_id: id, source_revision: z.number().int().nonnegative(),
  code: z.string().min(1), name: z.string().min(1),
  availability_windows: z.array(itinerantWindowSchema).min(1).nullable(),
  transition_minutes: z.number().int().nonnegative().nullable(),
  members: z.array(z.object({resourceItemId: id, planResourceItemId: id}).strict()).min(1),
}).strict();
export type DailyItinerantUnit = z.infer<typeof dailyItinerantUnitSchema>;
