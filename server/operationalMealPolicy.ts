import { hasDailyRequiredPhases, requiredPhaseCompositionSupported } from "./technicalChainStructure";
import {isDeepStrictEqual} from 'node:util';
import type {EngineInput} from '../engine/types';
import {dailyOperationalMealsSchema,persistedDailyOperationalMealsSchema,type DailyOperationalMeals} from '../shared/operationalMealPolicy';
import {resolveFlexibleOperationalMealPolicies} from '../engine/planner-next/integration/flexibleOperationalMealPolicies';
const defect=(message:string)=>Object.assign(new Error(message),{status:422});
export function dailyOperationalMealsAuthority(row:Record<string,any>){
 if(row.daily_operational_meal_policies==null)return null;
 const parsed=persistedDailyOperationalMealsSchema.safeParse(row.daily_operational_meal_policies);
 if(!parsed.success||row.planner_next_configuration!=null||!row.planner_next_profile?.configuration)throw defect('OPERATIONAL_MEAL_AUTHORITY_CONFLICT');
 return parsed.data;
}
export function operationalMealsCombinationSupported(input:EngineInput){
 return !!input.plannerNext&&!input.setupPolicies?.length&&!input.roundSynchronizations?.length&&(!input.technicalChains?.length||(hasDailyRequiredPhases(input)&&requiredPhaseCompositionSupported(input)))
  &&!input.anchoredAccompaniments?.length&&!input.operationContinuityGroups?.length
  &&!input.transportSettings;
}
export function withDailyOperationalMeals(input:EngineInput,raw:DailyOperationalMeals):EngineInput{
 const {policies}=dailyOperationalMealsSchema.parse(raw);
 if(policies.length&&!operationalMealsCombinationSupported(input))throw defect('UNSUPPORTED_OPERATIONAL_MEAL_COMBINATION');
 const candidate={...input,operationalMealPolicies:policies.length?policies:undefined,dailyOperationalMealsVersion:policies.length?1 as const:undefined};
 const resolved=resolveFlexibleOperationalMealPolicies(candidate);
 if(resolved.some(p=>p.status!=='SUPPORTED'))throw defect('INVALID_OPERATIONAL_MEAL_SCOPE_OR_WINDOW');
 return candidate;
}
export function applyDailyOperationalMeals(input:EngineInput,row:Record<string,any>,replay?:Record<string,any>):EngineInput{
 const raw=dailyOperationalMealsAuthority(row);if(!raw)return input;
 const effective=withDailyOperationalMeals(input,{contractVersion:1,policies:raw.policies});
 if(row.current_config_revision_id!=null){
  const authority=replay?.authorities?.plan_workday?.[0]?.plannerNextAuthorities;
  if(!isDeepStrictEqual(authority?.operationalMealPolicies,effective.operationalMealPolicies)||authority?.dailyOperationalMealsVersion!==effective.dailyOperationalMealsVersion)
   throw defect('OPERATIONAL_MEAL_REVISION_NOT_MATERIALIZED');
 }
 return effective;
}
