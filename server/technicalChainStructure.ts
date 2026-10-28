import type { EngineInput } from "../engine/types";
import { persistedTechnicalChainStructureSchema, technicalChainStructureSchema, type TechnicalChainStructure } from "../shared/technicalChainStructure";
import { resolveEffectiveTaskResourceAssignments } from "../engine/planner-next/integration/effectiveTaskResourceAssignments";
import { fixedItinerantCompositionSupported } from "./itinerantComposition";
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
/** The certified physical intersection. Other structure families retain their guards. */
export function requiredPhaseCompositionSupported(input:EngineInput) {
  // Native Main intentionally omits the historical profile discriminant. Its
  // materialization diagnostics distinguish it from a legacy mainFlow payload.
  return !!input.plannerNext && input.plannerNext.searchPolicy==="EXACT_CONSTRUCTIVE"
    && (input.plannerNext.profile==="STANDALONE_ONLY"
      || !!input.plannerNext.mainFlow && Array.isArray(input.plannerNextMaterializationIssues)) && input.mealMode==="global_hard_break"
    && !input.dailyTaskOperationScopes?.length && !input.roundSynchronizations?.length && !input.setupPolicies?.length
    && !input.operationContinuityGroups?.length && !input.anchoredAccompaniments?.length && !input.transportSettings
    && fixedItinerantCompositionSupported(input) && (!input.operationalMealPolicies?.length||input.dailyOperationalMealsVersion===1)
    && !input.tasks.filter(t=>t.status!=="cancelled").some(t=>t.setupFamilyId
      ||Object.keys(t.resourceRequirements?.byType??{}).length||t.resourceRequirements?.anyOf?.length
      ||t.blocksSpace===false||t.agendaScope==="ITINERANT_UNIT"||t.allowsSpaceOverlap===true);
}
export function hasDailyRequiredPhases(input:EngineInput) {
  return input.dailyTechnicalChainsVersion===1 && !!input.technicalChains?.length && input.technicalChains.every(p=>!!p.phases);
}
export function technicalChainCombinationSupported(input:EngineInput) {
  const legacySupported=!input.dailyTaskOperationScopes?.length && input.plannerNext?.profile==="STANDALONE_ONLY" && !input.roundSynchronizations?.length && !input.setupPolicies?.length
    && !input.operationContinuityGroups?.length && !input.anchoredAccompaniments?.length && !input.operationalMealPolicies?.length
    && !input.itinerantTeamAvailability?.length && !input.tasks.some(t=>t.jointGroupId||t.setupFamilyId);
  return hasDailyRequiredPhases(input)?requiredPhaseCompositionSupported(input):legacySupported||!input.technicalChains?.length&&requiredPhaseCompositionSupported(input);
}
function validatePhasedMembers(input:EngineInput,policy:NonNullable<EngineInput['technicalChains']>[number]) {
  if(JSON.stringify(policy.phases!.flat())!==JSON.stringify(policy.orderedTaskIds))throw defect("TECHNICAL_CHAIN_INVALID_PHASES");
  const byId=new Map(input.tasks.map(t=>[t.id,t])),phaseById=new Map(policy.phases!.flatMap((phase,i)=>phase.map(id=>[id,i] as const)));
  const assignments=resolveEffectiveTaskResourceAssignments(input);
  const groups=new Set<string>();
  for(const id of policy.orderedTaskIds){
    const task=byId.get(id);
    if(!task||task.planId!==input.planId||task.status==="cancelled"||!['auxiliary','technical'].includes(task.plannerNextKind??'')
      ||task.operationalRole!=="productive_task"||!input.planSpaceSettings?.some(s=>s.spaceId===task.spaceId))throw defect("TECHNICAL_CHAIN_INVALID_MEMBER");
    if(task.jointGroupId){
      if(groups.has(task.jointGroupId))throw defect("TECHNICAL_CHAIN_DUPLICATE_PHYSICAL_OPERATION");
      groups.add(task.jointGroupId);
      for(const peer of input.tasks.filter(t=>t.jointGroupId===task.jointGroupId))phaseById.set(peer.id,phaseById.get(id)!);
    }
    // [] adds no universal identity. Effective task requirements remain in the
    // physical assignment authority; a nonempty declaration must hold for all.
    if(policy.requiredResourceIds.some(id=>!assignments.assignments.find(a=>a.taskId===task.id)?.effectiveResourceIds.includes(id)))
      throw defect("TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED");
  }
  // Dependencies constrain permutations; they never impose the array's order.
  // Check peers as individual obligations, including prerequisites outside the unit.
  const visiting=new Set<number>(),done=new Set<number>();
  const visit=(id:number)=>{
    if(visiting.has(id))throw defect("TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES");
    if(done.has(id))return;
    visiting.add(id);
    const task=byId.get(id);if(!task||task.status==='cancelled')throw defect("TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES");
    for(const dep of task.dependsOnTaskIds??(task.dependsOnTaskId?[task.dependsOnTaskId]:[])){
      if(phaseById.has(id)&&phaseById.has(dep)&&phaseById.get(dep)!>phaseById.get(id)!)throw defect("TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES");
      visit(dep);
    }
    visiting.delete(id);done.add(id);
  };
  for(const id of phaseById.keys())visit(id);
  for(const [root,phase] of phaseById){
    const pending=[root],seen=new Set<number>();
    while(pending.length){
      const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);
      if(phaseById.has(id)&&phaseById.get(id)!>phase)throw defect("TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES");
      const t=byId.get(id)!;pending.push(...(t.dependsOnTaskIds??(t.dependsOnTaskId?[t.dependsOnTaskId]:[])));
    }
  }
}
export function validateDailyTechnicalChains(input:EngineInput,structure:TechnicalChainStructure):EngineInput {
  const next=withDailyTechnicalChains(input,structure);
  if(!technicalChainCombinationSupported(next))throw defect("UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION");
  for(const policy of structure.policies){
    const ids=policy.orderedTaskIds;
    if(new Set(ids).size!==ids.length||new Set(policy.requiredResourceIds).size!==policy.requiredResourceIds.length)throw defect("TECHNICAL_CHAIN_DUPLICATE_MEMBER_OR_RESOURCE");
    if(policy.phases){validatePhasedMembers(next,policy);continue;}
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
