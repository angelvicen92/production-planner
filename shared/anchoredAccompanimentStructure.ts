import {z} from 'zod';
const id=z.number().int().positive().max(2147483647);
/** This native operation has both sides. Ordering is authored, never inferred from labels. */
const policy=z.object({
 id:z.string().trim().min(1).max(120),anchorTaskId:id,beforeTaskIds:z.array(id).length(1),afterTaskIds:z.array(id).length(1),
 adjacency:z.literal('REQUIRED'),internalTransition:z.literal('INCLUDED'),resourceContinuity:z.literal('REQUIRED'),
});
const legacy=z.object({contractVersion:z.literal(1),policies:z.array(policy.extend({itinerantUnitId:id}).strict()).max(1)}).strict();
const choice=z.object({contractVersion:z.literal(2),policies:z.array(z.union([
 policy.extend({itinerantUnitId:id}).strict(),
 policy.extend({eligibleItinerantUnitIds:z.array(id).min(1).refine(ids=>new Set(ids).size===ids.length,'Unidades duplicadas')}).strict(),
]))}).strict();
export const anchoredAccompanimentStructureSchema=z.union([legacy,choice]);
export type AnchoredAccompanimentStructure=z.infer<typeof anchoredAccompanimentStructureSchema>;
export type AnchoredAccompanimentPolicy=AnchoredAccompanimentStructure['policies'][number];
export const anchoredPolicyUnitIds=(p:AnchoredAccompanimentPolicy):number[]=>'itinerantUnitId' in p?[p.itinerantUnitId]:[...p.eligibleItinerantUnitIds];
const audit={by:z.string().uuid(),at:z.string().datetime({offset:true})};
export const persistedAnchoredAccompanimentStructureSchema=z.union([legacy.extend(audit).strict(),choice.extend(audit).strict()]);
