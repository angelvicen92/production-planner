import type { EngineInput } from "../engine/types";
import { persistedRoundSynchronizationStructureSchema, roundSynchronizationStructureSchema, type RoundSynchronizationStructure } from "../shared/roundSynchronizationStructure";
import { resolveEngineInputRoundSynchronizations } from "../engine/planner-next/integration/engineInputRoundSynchronizations";

export const roundStructureError = (code:string, details?:unknown) => Object.assign(new Error(code),{status:422,details});
export function dailyRoundAuthority(row:Record<string,any>) {
  const raw=row.daily_round_synchronization;
  if(raw==null)return null;
  const parsed=persistedRoundSynchronizationStructureSchema.safeParse(raw);
  if(!parsed.success)throw roundStructureError("UNSUPPORTED_ROUND_STRUCTURE",parsed.error.issues);
  if(row.planner_next_configuration!=null||row.round_preparation_overrides?.length||!row.planner_next_profile)
    throw roundStructureError("ROUND_STRUCTURE_AUTHORITY_CONFLICT");
  return parsed.data;
}
export function withDailyRoundStructure(input:EngineInput, structure:RoundSynchronizationStructure):EngineInput {
  const parsed=roundSynchronizationStructureSchema.parse(structure);
  // Preserve the historical absence, including its fingerprint.
  return {...input,dailyRoundSynchronizationVersion:parsed.policies.length?1:undefined,roundSynchronizations:parsed.policies.length?parsed.policies:undefined};
}
export function validateDailyRoundStructure(input:EngineInput, structure:RoundSynchronizationStructure) {
  const candidate=withDailyRoundStructure(input,structure);
  if(input.plannerNext?.profile!=="STANDALONE_ONLY"||input.plannerNext.timeGridMinutes!==5
    ||input.technicalChains?.length||input.tasks.some(t=>t.jointGroupId!=null)||input.operationContinuityGroups?.length
    ||input.setupPolicies?.length||input.anchoredAccompaniments?.length||input.operationalMealPolicies?.length||input.itinerantTeamAvailability?.length)throw roundStructureError("UNSUPPORTED_ROUND_STRUCTURE_COMBINATION");
  const result=resolveEngineInputRoundSynchronizations(candidate,5);
  if(result.invalidContainer||result.defects.length)throw roundStructureError("UNSUPPORTED_ROUND_STRUCTURE",result.defects);
  return candidate;
}
export function applyDailyRoundStructure(input:EngineInput,row:Record<string,any>):EngineInput {
  const authority=dailyRoundAuthority(row);
  return authority?withDailyRoundStructure(input,{contractVersion:1,policies:authority.policies}):input;
}
