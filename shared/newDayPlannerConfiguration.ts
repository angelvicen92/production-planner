import { z } from "zod";

const positive = z.number().int().positive();
export const templatePlannerOperationSchema = z.object({
  contractVersion: z.literal(1),
  kind: z.enum(["main", "vocal", "auxiliary", "technical"]),
}).strict();
export type TemplatePlannerOperation = z.infer<typeof templatePlannerOperationSchema>;

/** IDs are stable catalogue references, independent of editable display names. */
export const setupFamiliesConfigurationSchema = z.object({
  families:z.array(z.object({id:positive.max(2147483647),name:z.string().trim().min(1).max(120)}).strict()).min(1),
  policies:z.array(z.object({spaceId:positive,familyIds:z.array(positive).min(1),
    orderConstraint:z.enum(["EXPLICIT","UNSPECIFIED"]),familyOrder:z.array(positive).optional(),
    oneBlockPerFamily:z.literal(true),reentry:z.literal("FORBIDDEN"),
    preparationMinutesBetweenFamilies:positive.multipleOf(5),
  }).strict()).min(1),
}).strict().superRefine((value,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  const ids=new Set(value.families.map(f=>f.id)),spaces=new Set(value.policies.map(p=>p.spaceId));
  if(ids.size!==value.families.length||spaces.size!==value.policies.length)fail("Familias o espacios duplicados.");
  for(const policy of value.policies){
    const families=new Set(policy.familyIds);
    if(families.size!==policy.familyIds.length||policy.familyIds.some(id=>!ids.has(id)))fail("Familia desconocida o duplicada en el espacio.");
    if(policy.orderConstraint==="UNSPECIFIED"&&policy.familyOrder!==undefined)fail("El orden flexible no declara una secuencia.");
    if(policy.orderConstraint==="EXPLICIT"&&(!policy.familyOrder||new Set(policy.familyOrder).size!==families.size||policy.familyOrder.length!==families.size||policy.familyOrder.some(id=>!families.has(id))))fail("El orden explícito debe contener cada familia del espacio una sola vez.");
  }
});
export type SetupFamiliesConfiguration = z.infer<typeof setupFamiliesConfigurationSchema>;

/** Explicit structural profiles. No task identities or scheduled times. */
const common = z.object({
  contractVersion: z.literal(1),
  transport: z.literal("NONE"),
  setup: z.enum(["NONE","FAMILIES"]),
  setupFamilies: setupFamiliesConfigurationSchema.optional(),
  meals: z.literal("DAY_CONFIGURATION"),
  searchPolicy: z.enum(["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"]),
  searchBudget: z.object({bestK:positive, maxBacktracks:positive, maxPatterns:positive,
    maxBranchExpansions:positive.max(100_000)}).strict(),
  timeGridMinutes: z.literal(5),
  resourceTransitionMinutes: z.number().int().nonnegative(),
}).strict();
export const newDayPlannerConfigurationSchema = z.discriminatedUnion("scenario", [
  common.extend({scenario:z.literal("MAIN_WITH_VOCAL_FEEDER"),
  mainFlow: z.object({spaceId:positive,
    preferredEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    continuity:z.literal("REQUIRED"), maxBlocksByKey:positive, minTasksPerBlock:positive}).strict(),
}).strict(),
  common.extend({scenario:z.literal("STANDALONE_ONLY"),searchPolicy:z.literal("EXACT_CONSTRUCTIVE")}).strict(),
]).superRefine((value,ctx)=>{
  if((value.setup==="FAMILIES")!==(value.setupFamilies!==undefined))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Montajes requiere familias y políticas completas; NONE no las declara.",path:["setupFamilies"]});
  if(value.setup==="FAMILIES"&&value.searchPolicy!=="EXACT_CONSTRUCTIVE")
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Montajes requiere construcción exacta.",path:["searchPolicy"]});
  if(value.setup==="FAMILIES"&&value.scenario==="MAIN_WITH_VOCAL_FEEDER"&&value.setupFamilies?.policies.some(p=>p.spaceId===value.mainFlow.spaceId))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"El flujo principal no admite familias de montaje.",path:["setupFamilies"]});
});
export type NewDayPlannerConfiguration = z.infer<typeof newDayPlannerConfigurationSchema>;
export const newDayPlannerSnapshotSchema = z.object({contractVersion:z.literal(1),
  sourceRevision:z.number().int().nonnegative(), configuration:newDayPlannerConfigurationSchema.nullable()}).strict();
export type NewDayPlannerSnapshot = z.infer<typeof newDayPlannerSnapshotSchema>;

// Legacy rules remain opaque; the new operational declaration is always typed.
export const templateRulesWithPlannerOperationSchema = z.any().superRefine((value,ctx)=>{
  if(value?.plannerNextOperation != null && !templatePlannerOperationSchema.safeParse(value.plannerNextOperation).success)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Rol operativo Planner Next inválido.",path:["plannerNextOperation"]});
});
