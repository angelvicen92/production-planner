import type { EngineInput } from "../engine/types";
import { persistedTechnicalChainStructureSchema, technicalChainStructureSchema, type TechnicalChainStructure } from "../shared/technicalChainStructure";
const defect = (code:string) => Object.assign(new Error(code),{status:422});
export function dailyTechnicalChainAuthority(row:Record<string,any>) {
  if(row.daily_technical_chains==null)return null;
  const value=persistedTechnicalChainStructureSchema.safeParse(row.daily_technical_chains);
  if(!value.success)throw defect("UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE");
  if(row.planner_next_configuration!=null||!row.planner_next_profile)throw defect("TECHNICAL_CHAIN_AUTHORITY_CONFLICT");
  return value.data;
}
export function withDailyTechnicalChains(input:EngineInput,structure:TechnicalChainStructure):EngineInput {
  const parsed=technicalChainStructureSchema.parse(structure);
  return {...input,dailyTechnicalChainsVersion:parsed.policies.length?1:undefined,technicalChains:parsed.policies.length?parsed.policies:undefined};
}
export function technicalChainCombinationSupported(input:EngineInput) {
  return !input.dailyTaskOperationScopes?.length && input.plannerNext?.profile==="STANDALONE_ONLY" && !input.roundSynchronizations?.length && !input.setupPolicies?.length
    && !input.operationContinuityGroups?.length && !input.anchoredAccompaniments?.length && !input.operationalMealPolicies?.length
    && !input.itinerantTeamAvailability?.length && !input.tasks.some(t=>t.jointGroupId||t.setupFamilyId);
}
export function validateDailyTechnicalChains(input:EngineInput,structure:TechnicalChainStructure):EngineInput {
  const next=withDailyTechnicalChains(input,structure);
  if(!technicalChainCombinationSupported(input))throw defect("UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION");
  for(const policy of structure.policies){
    const ids=policy.orderedTaskIds;
    if(new Set(ids).size!==ids.length||new Set(policy.requiredResourceIds).size!==policy.requiredResourceIds.length)throw defect("TECHNICAL_CHAIN_DUPLICATE_MEMBER_OR_RESOURCE");
    for(const [i,id] of ids.entries()){
      const task=input.tasks.find(t=>t.id===id&&t.planId===input.planId);
      if(!task||task.plannerNextKind!=="technical"||task.contestantId!=null||task.jointGroupId||task.setupFamilyId
        ||task.blocksSpace===false||task.agendaScope==="ITINERANT_UNIT"||task.allowsSpaceOverlap===true
        ||!input.planSpaceSettings?.some(s=>s.spaceId===task.spaceId))throw defect("TECHNICAL_CHAIN_INVALID_MEMBER");
      if(Object.keys(task.resourceRequirements?.byType??{}).length||(task.resourceRequirements?.anyOf?.length??0)
        ||Object.values(task.resourceRequirements?.byItem??{}).some(q=>q!==1))throw defect("UNSUPPORTED_TECHNICAL_CHAIN_RESOURCE_REQUIREMENTS");
      const deps=task.dependsOnTaskIds??(task.dependsOnTaskId?[task.dependsOnTaskId]:[]);
      // This gate admits only the demonstrated linear component, no branching or external prerequisites.
      if(deps.length!==(i?1:0)||(i&&deps[0]!==ids[i-1])||input.tasks.some(t=>t.id!==ids[i+1]&&(t.dependsOnTaskIds??(t.dependsOnTaskId?[t.dependsOnTaskId]:[])).includes(id)))throw defect("TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES");
      for(const resourceId of policy.requiredResourceIds){
        const r=input.planResourceItems.find(r=>r.id===resourceId);
        if(!r||task.resourceRequirements?.byItem?.[r.resourceItemId!]!==1)throw defect("TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED");
      }
    }
  }
  return next;
}
export function applyDailyTechnicalChains(input:EngineInput,row:Record<string,any>):EngineInput {
  const value=dailyTechnicalChainAuthority(row);
  return value?validateDailyTechnicalChains(input,{contractVersion:1,policies:value.policies}):input;
}
