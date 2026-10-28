import { z } from "zod";

const id = z.number().int().positive().max(2147483647);
export const resourceRouteTransitionSchema = z.object({
  planResourceItemId: id,
  fromSpaceId: id,
  toSpaceId: id,
  minutes: id.multipleOf(5),
}).strict();
const base = z.object({contractVersion:z.literal(1),routes:z.array(resourceRouteTransitionSchema)}).strict();
export const dailyResourceRouteTransitionsSchema = base.superRefine(({routes},ctx) => {
  const keys = new Set<string>();
  routes.forEach((route,index) => {
    const key = `${route.planResourceItemId}:${route.fromSpaceId}:${route.toSpaceId}`;
    if (route.fromSpaceId === route.toSpaceId || keys.has(key)) ctx.addIssue({code:z.ZodIssueCode.custom,
      path:["routes",index],message:"Origen y destino deben ser distintos y la ruta no puede estar duplicada."});
    keys.add(key);
  });
}).transform(value => ({...value,routes:[...value.routes].sort((a,b) => a.planResourceItemId-b.planResourceItemId
  || a.fromSpaceId-b.fromSpaceId || a.toSpaceId-b.toSpaceId)}));
export type DailyResourceRouteTransitions = z.infer<typeof dailyResourceRouteTransitionsSchema>;
export const persistedDailyResourceRouteTransitionsSchema = base.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})})
  .superRefine((value,ctx) => {
    const parsed = dailyResourceRouteTransitionsSchema.safeParse({contractVersion:value.contractVersion,routes:value.routes});
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue(issue);
  });
