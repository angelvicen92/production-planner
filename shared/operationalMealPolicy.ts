import {z} from 'zod';
const id=z.number().int().positive().max(2147483647);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const operationalMealPolicySchema=z.object({
 id:z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),
 window:z.object({start:time,end:time}).strict(),durationMinutes:id,
 planResourceItemIds:z.array(id),spaceIds:z.array(id).optional(),
}).strict();
const base=z.object({contractVersion:z.literal(1),policies:z.array(operationalMealPolicySchema)}).strict();
/** One explicit obligation per physical scope; no unit/name inference. */
export const dailyOperationalMealsSchema=base.superRefine((value,ctx)=>{
 const ids=new Set<string>(),resources=new Set<number>();
 const minute=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));
 for(const p of value.policies){
  const start=minute(p.window.start),end=minute(p.window.end);
  if(ids.has(p.id)||start>=end||start%5||end%5||p.durationMinutes%5||p.durationMinutes>end-start
   ||!p.planResourceItemIds.length&&!p.spaceIds?.length||new Set(p.spaceIds??[]).size!==(p.spaceIds??[]).length
   ||p.planResourceItemIds.some(id=>resources.has(id)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Descanso incoherente o recurso repetido. Usa una ventana y duración válidas y un único descanso por recurso físico.'});
  ids.add(p.id);p.planResourceItemIds.forEach(id=>resources.add(id));
 }
}).transform(value=>({...value,policies:value.policies.map(p=>({...p,planResourceItemIds:[...p.planResourceItemIds].sort((a,b)=>a-b),spaceIds:[...(p.spaceIds??[])].sort((a,b)=>a-b)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)}));
export type DailyOperationalMeals=z.infer<typeof dailyOperationalMealsSchema>;
export const persistedDailyOperationalMealsSchema=base.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})}).strict().superRefine((v,ctx)=>{
 const parsed=dailyOperationalMealsSchema.safeParse({contractVersion:v.contractVersion,policies:v.policies});if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue(issue);
}).transform(v=>({...v,...dailyOperationalMealsSchema.parse({contractVersion:v.contractVersion,policies:v.policies})}));
