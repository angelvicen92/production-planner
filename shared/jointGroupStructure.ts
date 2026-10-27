import {z} from 'zod';
const member=z.number().int().positive().max(2147483647);
/** Real daily identities only. A group never creates or merges obligations. */
const structureBase=z.object({contractVersion:z.literal(1),groups:z.array(z.object({
 id:z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),taskIds:z.array(member).min(2),
}).strict())}).strict();
export const jointGroupStructureSchema=structureBase.superRefine((value,ctx)=>{
 const ids=new Set<string>(),tasks=new Set<number>();
 for(const group of value.groups){
  if(ids.has(group.id))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Identidad de operación conjunta duplicada.'});
  ids.add(group.id);
  for(const id of group.taskIds){if(tasks.has(id))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Una tarea sólo puede pertenecer a una operación conjunta.'});tasks.add(id);}
 }
}).transform(value=>({...value,groups:value.groups.map(g=>({...g,taskIds:[...g.taskIds].sort((a,b)=>a-b)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)}));
export type JointGroupStructure=z.infer<typeof jointGroupStructureSchema>;
export const persistedJointGroupStructureSchema=structureBase.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})}).strict().superRefine((v,ctx)=>{
 const result=jointGroupStructureSchema.safeParse({contractVersion:v.contractVersion,groups:v.groups});if(!result.success)for(const issue of result.error.issues)ctx.addIssue(issue);
}).transform(v=>({...v,...jointGroupStructureSchema.parse({contractVersion:v.contractVersion,groups:v.groups})}));
