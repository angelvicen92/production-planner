import {z} from 'zod';
const id=z.number().int().positive().max(2147483647);
/** This native operation has both sides. Ordering is authored, never inferred from labels. */
export const anchoredAccompanimentStructureSchema=z.object({contractVersion:z.literal(1),policies:z.array(z.object({
 id:z.string().trim().min(1).max(120),anchorTaskId:id,beforeTaskIds:z.array(id).length(1),afterTaskIds:z.array(id).length(1),
 itinerantUnitId:id,adjacency:z.literal('REQUIRED'),internalTransition:z.literal('INCLUDED'),resourceContinuity:z.literal('REQUIRED'),
}).strict()).max(1)}).strict();
export type AnchoredAccompanimentStructure=z.infer<typeof anchoredAccompanimentStructureSchema>;
export const persistedAnchoredAccompanimentStructureSchema=anchoredAccompanimentStructureSchema.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})}).strict();
