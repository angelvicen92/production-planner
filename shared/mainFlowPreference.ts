import { z } from 'zod';

export const mainFlowPreferenceSchema = z.object({
  blockCountPolicy: z.discriminatedUnion('mode', [
    z.object({mode:z.literal('AUTO_MIN_FEASIBLE')}).strict(),
    z.object({mode:z.literal('SOFT_PREFER_N'),count:z.number().int().positive().safe()}).strict(),
  ]),
  mealSplitPreference: z.discriminatedUnion('mode', [
    z.object({mode:z.literal('OFF')}).strict(),
    z.object({mode:z.literal('PREFERRED'),beforeMealBlocks:z.number().int().nonnegative().safe(),afterMealBlocks:z.number().int().nonnegative().safe()}).strict(),
  ]),
}).strict().superRefine((value,ctx)=>{
  if(value.mealSplitPreference.mode==='PREFERRED' && (value.blockCountPolicy.mode!=='SOFT_PREFER_N'
    || value.mealSplitPreference.beforeMealBlocks+value.mealSplitPreference.afterMealBlocks!==value.blockCountPolicy.count))
    ctx.addIssue({code:'custom',path:['mealSplitPreference'],message:'El reparto debe sumar el número preferido de bloques.'});
});
export type MainFlowPreference = z.infer<typeof mainFlowPreferenceSchema>;
export type PreferredMealSplit = Extract<MainFlowPreference['mealSplitPreference'],{mode:'PREFERRED'}>;
export const autoMainFlowPreference:MainFlowPreference={blockCountPolicy:{mode:'AUTO_MIN_FEASIBLE'},mealSplitPreference:{mode:'OFF'}};

/** SQL stores operational fields, not an opaque scheduler payload. NULL count is AUTO. */
export function mainFlowPreferenceFromRow(row:Record<string,any>,prefix='main_'):MainFlowPreference {
  const count=row[`${prefix}preferred_block_count`],before=row[`${prefix}before_meal_blocks`];
  return mainFlowPreferenceSchema.parse({blockCountPolicy:count==null?{mode:'AUTO_MIN_FEASIBLE'}:{mode:'SOFT_PREFER_N',count:Number(count)},
    mealSplitPreference:before==null?{mode:'OFF'}:{mode:'PREFERRED',beforeMealBlocks:Number(before),afterMealBlocks:Number(count)-Number(before)}});
}
export function mainFlowPreferenceColumns(value:MainFlowPreference,prefix='main_') {
  const parsed=mainFlowPreferenceSchema.parse(value);
  return {[`${prefix}preferred_block_count`]:parsed.blockCountPolicy.mode==='SOFT_PREFER_N'?parsed.blockCountPolicy.count:null,
    [`${prefix}before_meal_blocks`]:parsed.mealSplitPreference.mode==='PREFERRED'?parsed.mealSplitPreference.beforeMealBlocks:null};
}

/** Public run Evidence consumed by product UI, without a solver dependency. */
export interface MainFlowPreferenceResultEvidence {
  requested:number;
  achieved:number|null;
  targetAchieved:boolean;
  mealSplitRequested:PreferredMealSplit|null;
  mealSplitAchieved:{total:number;mealStart:number|null;mealEnd:number|null;
    blocksBeforeMeal:number|null;blocksAfterMeal:number|null;blockSpansMeal:boolean}|null;
  mealSplitPreferenceAchieved:boolean|null;
  hardCertificate:{authority:"PROTECTED_MAIN_GEOMETRY";blocks:number;taskIds:string[]}|null;
}
