import {z} from 'zod';

const id=z.number().int().positive().max(2147483647);
/** Daily task identities; selection is separate from eligible template units. */
export const dailyTaskOperationScopeSchema=z.object({
 taskId:id,
 agendaScope:z.enum(['PHYSICAL_SPACE','ITINERANT_UNIT']),
 resourceInheritance:z.enum(['LOCATION','OPERATION_ONLY']),
 blocksSpace:z.boolean(),
 itinerantUnitId:id.nullable(),
 declaredResourceIds:z.array(id).refine(ids=>new Set(ids).size===ids.length,'Recurso directo duplicado.'),
}).strict();
export const dailyTaskOperationScopesSchema=z.object({contractVersion:z.literal(1),policies:z.array(dailyTaskOperationScopeSchema)
 .refine(policies=>new Set(policies.map(p=>p.taskId)).size===policies.length,'Actividad duplicada.')}).strict();
export const persistedDailyTaskOperationScopesSchema=dailyTaskOperationScopesSchema.extend({by:z.string().uuid(),at:z.string()});
export type DailyTaskOperationScopes=z.infer<typeof dailyTaskOperationScopesSchema>;
