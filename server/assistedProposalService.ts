import { certifyDailyTechnicalChain } from "./technicalChainCertificate";
import {resolveEffectiveTaskResourceAssignments} from "../engine/planner-next/integration/effectiveTaskResourceAssignments";
import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, minuteToEngineTime } from "../engine/planner-next/integration/engineInputAdapter";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "../engine/planner-next/assistedPlanning";
import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledTask } from "../engine/planner-next/contracts";
import { analyticalFutureEligibleTaskIds, expandVisiblePrerequisites, resolveAssistedScope, ScopeResolutionError } from "./assistedScopeResolver";
import { certifyGlobalParticipantMealGate } from "./globalParticipantMealGate";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import type { BuildEffectivePlanConfigRevisionInputV1, EffectivePlanConfigRevisionV1 } from "./effectivePlanConfigRevision";
import type { EngineInput } from "../engine/types";
import type { AssistedProposalRequest, AssistedProposalRunResultV1 } from "../shared/assistedProposalContracts";
import { validatePlan } from "../engine/planner-next/validate";
import { fingerprint } from "../engine/planner-next/fingerprint";
import { createViolationKey, type StageViolation } from "../shared/assistedStageValidation";
import type { ValidationViolationDetail } from "../engine/planner-next/contracts";
import { affectedTasksUnchanged, resolveActiveStageLineage } from "./assistedAcceptedBaseline";
import { materializeItinerantUnitAssignment } from "../engine/planner-next/itinerantUnitAssignment";
import {materializeNominalResourceChoice,nominalResourceAssignmentMatches} from '../engine/planner-next/nominalResourceChoice';
import { materializeScheduledItinerantUnitMeals } from "../engine/planner-next/itinerantUnitMeals";
import { roundPreparationId } from "../engine/planner-next/roundSynchronization";
import { structuralWitnessIdentity, type FutureStructuralWitness } from "../engine/planner-next/anonymousPipelineWitness";

export function projectPlannerViolations(details:readonly ValidationViolationDetail[],identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[]):StageViolation[]{
  const map=(namespace:string,ids:readonly string[])=>ids.map(id=>{const acceptedNamespaces=namespace==="resource"?["resource","plan-resource","resource-item"]:[namespace];const matches=identityMap.filter(item=>acceptedNamespaces.includes(item.namespace)&&item.canonicalId===id);const sourceId=Number(matches[0]?.sourceId);
    if(matches.length!==1||!Number.isInteger(sourceId))throw new Error(`UNPROJECTABLE_VALIDATION_IDENTITY:${namespace}:${id}`);return sourceId;}).sort((a,b)=>a-b);
  return details.map(detail=>{const affectedTaskIds=map("task",detail.affectedTaskIds),affectedResourceIds=map("resource",detail.affectedResourceIds),affectedSpaceIds=map("space",detail.affectedSpaceIds);
    return {ruleCode:detail.ruleCode,severity:detail.severity,affectedTaskIds,affectedResourceIds,affectedSpaceIds,details:{dimensions:detail.dimensions},inheritedAcceptedExceptionId:null,
      violationKey:createViolationKey({ruleCode:detail.ruleCode,affectedTaskIds,affectedResourceIds,affectedSpaceIds,dimensions:detail.dimensions})};});
}

export { analyticalFutureEligibleTaskIds } from "./assistedScopeResolver";

export function evaluateAcceptedViolationDelta(candidateViolations:readonly StageViolation[],acceptedBaseline:readonly {severity:string;violationKey:string}[],unstructuredReasonCodes:readonly string[]=[]){
  const inheritedKeys=new Set(candidateViolations.filter(candidate=>acceptedBaseline.some(accepted=>accepted.severity===candidate.severity&&accepted.violationKey===candidate.violationKey)).map(item=>item.violationKey));
  const inheritedHardViolationCount=candidateViolations.filter(item=>item.severity==="HARD"&&inheritedKeys.has(item.violationKey)).length;
  const inheritedRequiredViolationCount=candidateViolations.filter(item=>item.severity==="REQUIRED"&&inheritedKeys.has(item.violationKey)).length;
  const newHardViolationCount=candidateViolations.filter(item=>item.severity==="HARD"&&!inheritedKeys.has(item.violationKey)).length+unstructuredReasonCodes.length;
  const newRequiredViolationCount=candidateViolations.filter(item=>item.severity==="REQUIRED"&&!inheritedKeys.has(item.violationKey)).length;
  return {inheritedHardViolationCount,inheritedRequiredViolationCount,newHardViolationCount,newRequiredViolationCount,
    proposalEligible:newHardViolationCount===0&&newRequiredViolationCount===0};
}

export type AssistedProposalErrorCode = "STALE_OBLIGATION_SOURCES"|"INVALID_SCOPE"|"EMPTY_SCOPE"|"STALE_DRAFT"|"STALE_BASE_STAGE"|"DIRTY_DRAFT"|"STALE_CONFIG_REVISION"|"RUN_NOT_FOUND"|"RUN_NOT_READY"|"RUN_HAS_NO_PROPOSAL"|"RUN_SESSION_MISMATCH"|"RUN_RESULT_INVALID"|"UNSUPPORTED_ENGINE_INPUT";
export class AssistedProposalError extends Error {
  constructor(readonly code: AssistedProposalErrorCode, readonly status: 404|409|422) { super(code); }
}
const mapDbError = (error: any): never => {
  const code = (["STALE_OBLIGATION_SOURCES","STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION","RUN_NOT_FOUND","RUN_NOT_READY","RUN_HAS_NO_PROPOSAL","RUN_SESSION_MISMATCH","RUN_RESULT_INVALID"] as const)
    .find(candidate => String(error?.message ?? "").includes(candidate));
  if (code) throw new AssistedProposalError(code, code === "RUN_NOT_FOUND" ? 404 : code === "RUN_HAS_NO_PROPOSAL" ? 422 : 409);
  throw error;
};

export function assistedProposalFailureMessage(failure:unknown):string {
  if(failure instanceof Error)return failure.message;
  if(failure&&typeof failure==='object'){
    const {message,code,details}=failure as Record<string,unknown>;
    if(typeof message==='string')return [message,...[code,details].filter((value):value is string=>typeof value==='string'&&value.length>0)].join(' · ');
  }
  return String(failure);
}

type DbResult<T = any> = Promise<{ data?: T | null; error: any }>;
export interface AssistedProposalRunAccess {
  create(values: Record<string, unknown>): DbResult<{ id: number }>;
  find(planId: number, runId: number): DbResult;
  fail(planId: number, runId: number, message: string): DbResult;
  finish(planId: number, runId: number, result: AssistedProposalRunResultV1): DbResult;
  apply(parameters: Record<string, unknown>): DbResult;
}
const defaultRunAccess: AssistedProposalRunAccess = {
  async create(values) { const { data, error } = await supabaseAdmin.from("planning_runs").insert(values).select("id").single(); return { data, error }; },
  async find(planId, runId) { const { data, error } = await supabaseAdmin.from("planning_runs").select("*").eq("id",runId).eq("plan_id",planId).eq("execution_kind","ASSISTED_SCOPE").maybeSingle(); return { data, error }; },
  async fail(planId,runId,message) { const { data,error }=await supabaseAdmin.from("planning_runs").update({status:"error",message,finished_at:new Date().toISOString()}).eq("id",runId).eq("plan_id",planId); return {data,error}; },
  async finish(planId,runId,result) { const {data,error}=await supabaseAdmin.rpc("assisted_finish_proposal",{p_plan_id:planId,p_run_id:runId,p_result:result}); return {data,error}; },
  async apply(parameters) { const {data,error}=await supabaseAdmin.rpc("assisted_apply_proposal",parameters); return {data,error}; },
};
type AssistedRunner = typeof executeAssistedPlanning;
export interface AssistedProposalServiceDependencies {
  readonly buildInput: (planId: number, storage: IStorage) => Promise<EngineInput>;
  readonly buildConfigRevision: (input: BuildEffectivePlanConfigRevisionInputV1) => EffectivePlanConfigRevisionV1;
}
const defaultDependencies: AssistedProposalServiceDependencies = {
  buildInput: buildEngineInput,
  buildConfigRevision: buildEffectivePlanConfigRevisionV1,
};
const provenance = (authority:string) => ({authority,authorityContractVersion:1});

function projectDirectResourcesToCanonical(identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[],ids:readonly number[]):string[]{
  return [...new Set(ids)].sort((a,b)=>a-b).map(id=>{
    const matches=identityMap.filter(item=>item.namespace==="plan-resource"&&Number(item.sourceId)===id);
    const canonical=[...new Set(matches.map(item=>item.canonicalId))];
    if(canonical.length!==1)throw new Error(`UNPROJECTABLE_PLAN_RESOURCE:${id}`);
    return canonical[0]!;
  });
}
function projectDirectResourcesToProduct(identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[],ids:readonly string[]):number[]{
  return [...new Set(ids)].sort().map(id=>{
    const matches=identityMap.filter(item=>item.namespace==="plan-resource"&&item.canonicalId===id);
    const product=[...new Set(matches.map(item=>Number(item.sourceId)).filter(Number.isInteger))];
    if(product.length!==1)throw new Error(`UNPROJECTABLE_PLAN_RESOURCE:${id}`);
    return product[0]!;
  }).sort((a,b)=>a-b);
}
function materializeSnapshotTask(problem:PlannerNextProblem,source:ScheduledTask|PlannerNextProblem["tasks"][number],row:AssistedPlanningSnapshotV1["tasks"][number],identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[],unitByProduct:ReadonlyMap<number,string>){
  if(row.assignedResourceIds!==undefined)projectDirectResourcesToCanonical(identityMap,row.assignedResourceIds);
  let selected=row.itinerantTeamId===undefined?source:materializeItinerantUnitAssignment(problem,source,unitByProduct.get(row.itinerantTeamId)??"");
  if(selected?.nominalResourceChoice){
    const ids=projectDirectResourcesToCanonical(identityMap,row.assignedResourceIds??[]).filter(id=>id!==selected!.coachId);
    const choices=ids.filter(id=>selected!.nominalResourceChoice!.resourceIds.includes(id));
    if(choices.length!==1)throw new Error(`INVALID_SNAPSHOT_NOMINAL_RESOURCE:${row.taskId}`);
    selected=materializeNominalResourceChoice(selected,choices[0]);
    if(!selected||JSON.stringify([...(selected.requiredResourceIds??[])].sort())!==JSON.stringify(ids.sort()))
      throw new Error(`INVALID_SNAPSHOT_NOMINAL_RESOURCE:${row.taskId}`);
  }
  return selected;
}

/** Shared product → canonical materialization used by proposals and manual replay. */
export function materializeAssistedSnapshotOccupations(problem:PlannerNextProblem,
  identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[],baseSnapshot:AssistedPlanningSnapshotV1){
    const sourceByCanonical=new Map(identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
    const taskById=new Map(problem.tasks.map(t=>[t.id,t]));
    const canonicalUnitBySource=new Map(identityMap.filter(i=>i.namespace==="itinerant-team").map(i=>[Number(i.sourceId),i.canonicalId]));
    const protectedPlacements: ScheduledTask[]=baseSnapshot.tasks.flatMap(row=>{
      if(!row.startPlanned||!row.endPlanned) return []; const id=sourceByCanonical.get(row.taskId); const source=id?taskById.get(id):undefined;
      const task=source?materializeSnapshotTask(problem,source,row,identityMap,canonicalUnitBySource):undefined;
      if(source&&!task)throw new Error(`INVALID_SNAPSHOT_ITINERANT_UNIT:${row.taskId}`);
      const start=engineTimeToMinute(row.startPlanned),end=engineTimeToMinute(row.endPlanned);
      return task?[{...task,duration:end-start,start,end}]:[];
    });
    const operationalPolicyById=new Map((problem.operationalMealPolicies??[]).map(policy=>[policy.id,policy]));
    const protectedOperationalMeals=(baseSnapshot.operationalMeals??[]).map(meal=>{
      const policy=operationalPolicyById.get(meal.policyId);
      if(!policy)throw new Error(`UNREPRESENTABLE_PROTECTED_OPERATIONAL_MEAL:${meal.policyId}`);
      const start=engineTimeToMinute(meal.startPlanned),end=engineTimeToMinute(meal.endPlanned);
      return {id:meal.policyId,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],duration:end-start,start,end};
    });
    const canonicalSpaceBySource=new Map(identityMap.filter(i=>i.namespace==="space").map(i=>[Number(i.sourceId),i.canonicalId]));
    const canonicalFamilyBySource=new Map(identityMap.filter(i=>i.namespace==="setup-family").map(i=>[i.sourceId,i.canonicalId]));
    const protectedSetupPreparations:ScheduledSetupPreparation[]=(baseSnapshot.setupPreparations??[]).map(item=>{
      const spaceId=canonicalSpaceBySource.get(item.spaceId),setupFamilyId=canonicalFamilyBySource.get(item.setupFamilyId);
      if(!spaceId||!setupFamilyId)throw new Error(`UNREPRESENTABLE_PROTECTED_SETUP_PREPARATION:${item.id}`);
      return {...item,kind:"setup-preparation",spaceId,setupFamilyId};
    });
    const canonicalSynchronizationBySource=new Map(identityMap.filter(i=>i.namespace==="round-synchronization").map(i=>[i.sourceId,i.canonicalId]));
    const protectedRoundPreparations:ScheduledRoundPreparation[]=(baseSnapshot.roundPreparations??[]).map(item=>{
      const spaceId=canonicalSpaceBySource.get(item.spaceId),synchronizationId=canonicalSynchronizationBySource.get(item.synchronizationId);
      if(!spaceId||!synchronizationId)throw new Error(`UNREPRESENTABLE_PROTECTED_ROUND_PREPARATION:${item.id}`);
      return {...item,id:roundPreparationId(synchronizationId,spaceId,item.roundIndex),kind:"round-preparation",spaceId,synchronizationId};
    });
    const mealBySourceId=new Map((problem.participantMeals??[]).map(meal=>[meal.sourceTaskId,meal]));
    const protectedParticipantMeals:ScheduledParticipantMeal[]=baseSnapshot.tasks.flatMap(row=>{
      if(!row.startPlanned||!row.endPlanned)return[];
      const sourceTaskId=sourceByCanonical.get(row.taskId),obligation=sourceTaskId?mealBySourceId.get(sourceTaskId):undefined;
      if(!obligation)return[];
      const start=engineTimeToMinute(row.startPlanned),end=engineTimeToMinute(row.endPlanned);
      return [{id:obligation.id,sourceTaskId:sourceTaskId!,participantId:obligation.participantId,duration:end-start,start,end}];
    });
  return {protectedPlacements,protectedOperationalMeals,protectedSetupPreparations,protectedRoundPreparations,protectedParticipantMeals};
}

/** Revalidate the persisted physical witness, never rediscover it with another search. */
export function assertNominalProposalWitness(input:EngineInput,draft:AssistedPlanningSnapshotV1,result:AssistedProposalRunResultV1){
  if(input.dailyJointGroupsVersion!==1&&input.dailyAnchoredAccompanimentsVersion!==2&&!input.tasks.some(task=>task.resourceRequirements?.anyOf?.length||Object.keys(task.resourceRequirements?.byType??{}).length))return;
  const adapter=adaptEngineInputToPlannerNextProblem(input);
  if(adapter.status!=='SUPPORTED')throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
  const problem=adapter.problem,proof=result.evidence.nominalPhysicalFutureWitness as any;
  if(!proof||!Array.isArray(proof.tasks)||proof.tasks.length!==problem.tasks.length
    ||new Set(proof.tasks.map((task:ScheduledTask)=>task.id)).size!==problem.tasks.length
    ||proof.fingerprint!==fingerprint(proof.tasks))throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
  for(const actual of proof.tasks as ScheduledTask[]){
    const base=problem.tasks.find(task=>task.id===actual.id);
    const expected=base&&actual.itinerantUnitId?materializeItinerantUnitAssignment(problem,base,actual.itinerantUnitId):base;
    if(!expected||!nominalResourceAssignmentMatches(expected,actual)
      ||actual.kind!==expected.kind||actual.spaceId!==expected.spaceId||actual.participantId!==expected.participantId
      ||actual.coachId!==expected.coachId||actual.blockKey!==expected.blockKey||actual.jointGroupId!==expected.jointGroupId
      ||(actual.blocksSpace??true)!==(expected.blocksSpace??true)||actual.duration!==expected.duration
      ||JSON.stringify([...actual.dependencies].sort())!==JSON.stringify([...expected.dependencies].sort())
      ||!expected.nominalResourceChoice&&JSON.stringify([...(actual.requiredResourceIds??[])].sort())!==JSON.stringify([...(expected.requiredResourceIds??[])].sort()))
      throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
  }
  const context=materializeAssistedSnapshotOccupations(problem,adapter.identityMap,draft);
  for(const placed of context.protectedPlacements){
    const certified=proof.tasks.find((task:ScheduledTask)=>task.id===placed.id);
    if(!certified||placed.start!==certified.start||placed.end!==certified.end||placed.spaceId!==certified.spaceId||placed.itinerantUnitId!==certified.itinerantUnitId
      ||JSON.stringify([...(placed.requiredResourceIds??[])].sort())!==JSON.stringify([...(certified.requiredResourceIds??[])].sort()))
      throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
  }
  if(!validatePlan(problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],
    proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]).hardValid)
    throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
}

/** Proposal persistence remains owned here; workflow only asks for revalidation. */
export async function assertPersistedNominalProposalWitness(planId:number,runId:number,input:EngineInput,draft:AssistedPlanningSnapshotV1){
  const {data,error}=await defaultRunAccess.find(planId,runId);
  if(error||!data)throw new Error('INVALID_NOMINAL_PHYSICAL_WITNESS');
  assertNominalProposalWitness(input,draft,data.assisted_result_json);
}

export class ManualValidationUnsupportedError extends Error {
  constructor(readonly phase:'ENGINE_INPUT'|'SNAPSHOT'|'OCCUPATIONS'|'VIOLATION_IDENTITY',readonly reasonCodes:readonly string[]){
    super('ASSISTED_DELTA_VALIDATION_UNSUPPORTED');
  }
}

export function validateManualAssistedDelta(input:EngineInput,draft:AssistedPlanningSnapshotV1,touched:readonly number[]){
  const adapter=adaptEngineInputToPlannerNextProblem(input);
  if(adapter.status!=="SUPPORTED")throw new ManualValidationUnsupportedError('ENGINE_INPUT',adapter.reasonCodes);
  try{return validateMaterializedManualDelta(adapter.problem,adapter.identityMap,draft,touched);}
  catch(error){
    if(error instanceof Error&&error.message.startsWith('UNPROJECTABLE_VALIDATION_IDENTITY:'))
      throw new ManualValidationUnsupportedError('VIOLATION_IDENTITY',['VALIDATION_IDENTITY_UNREPRESENTABLE']);
    if(error instanceof Error&&['UNREPRESENTABLE_PROTECTED_','UNPROJECTABLE_PLAN_RESOURCE:','INVALID_SNAPSHOT_ITINERANT_UNIT:','INVALID_SNAPSHOT_NOMINAL_RESOURCE:'].some(prefix=>error.message.startsWith(prefix)))
      throw new ManualValidationUnsupportedError('OCCUPATIONS',['SNAPSHOT_OCCUPATION_UNREPRESENTABLE']);
    throw error;
  }
}

function validateMaterializedManualDelta(problem:PlannerNextProblem,
  identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[],draft:AssistedPlanningSnapshotV1,touched:readonly number[]){
  const canonicalByProduct=new Map(identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
  if(touched.some(id=>!canonicalByProduct.has(id)))throw new ManualValidationUnsupportedError('SNAPSHOT',['UNKNOWN_MANUAL_TASK_IDENTITY']);
  const materializableIds=new Set([...problem.tasks.map(task=>task.id),...(problem.participantMeals??[]).map(meal=>meal.sourceTaskId)]);
  if(draft.tasks.some(row=>(row.startPlanned===null)!==(row.endPlanned===null)
    ||(row.startPlanned!==null&&!materializableIds.has(canonicalByProduct.get(row.taskId)??""))))throw new ManualValidationUnsupportedError('SNAPSHOT',['SNAPSHOT_TASK_UNREPRESENTABLE']);
  const context=materializeAssistedSnapshotOccupations(problem,identityMap,draft);
  const {protectedPlacements,protectedOperationalMeals,protectedSetupPreparations,protectedParticipantMeals,protectedRoundPreparations}=context;
  if(problem.tasks.some(task=>task.nominalResourceChoice))
    throw new ManualValidationUnsupportedError('OCCUPATIONS',['NOMINAL_PHYSICAL_FUTURE_REQUIRES_CERTIFIED_PROPOSAL']);
  const scopeIds=touched.map(id=>canonicalByProduct.get(id)!);
  const assisted=buildAssistedProblem(problem,createPlanningScope({kind:"TASK_IDS",value:scopeIds.join(",")},
    {validationMode:"MANUAL_DELTA_CLEAN_V1"},scopeIds),protectedPlacements,undefined,
    protectedOperationalMeals,protectedSetupPreparations,protectedParticipantMeals,protectedRoundPreparations);
  const validationProblem=assisted.originalValidationProblem;
  const resourceMeals=(validationProblem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,
    resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  // Space meals have no placement field in SnapshotV1. Do not invent witnesses;
  // a required, unrepresented space meal remains a fail-closed reason code.
  const validationSummary=validatePlan(validationProblem,[...protectedPlacements],[...protectedSetupPreparations],[],
    [...protectedParticipantMeals],resourceMeals,materializeScheduledItinerantUnitMeals(validationProblem),
    [...protectedRoundPreparations],[...protectedOperationalMeals]);
  const placedIds=new Set([...protectedPlacements.map(row=>row.id),...protectedParticipantMeals.map(row=>row.sourceTaskId)]);
  const completeForScope=scopeIds.every(id=>placedIds.has(id));
  return {scopeTaskCount:touched.length,scopeTaskIds:scopeIds,supportingTaskIds:assisted.supportingTaskIds,
    supportingReasonByTaskId:assisted.supportingReasonByTaskId,protectedPlacementCount:protectedPlacements.length,
    protectedPlacementsPreserved:true,proposalCount:completeForScope&&validationSummary.hardValid?1:0,
    completeForScope,hardValid:validationSummary.hardValid,requiredValid:validationSummary.hardValid,
    fingerprint:fingerprintAssistedPlanningSnapshotV1(draft),work:{},causalDiagnostic:null,
    reasonCodes:validationSummary.reasonCodes,validationSummary,
    structuredViolations:projectPlannerViolations(validationSummary.violations??[],identityMap)};
}

/** Evidence seam: same complete materialization and validator, without search. */
export function createManualDeltaValidationHarness(problem:PlannerNextProblem,identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[]){
  return (_input:EngineInput,draft:AssistedPlanningSnapshotV1,touched:readonly number[])=>{
    const result=validateMaterializedManualDelta(problem,identityMap,draft,touched);
    if(!result)throw new Error("UNKNOWN_MANUAL_SCOPE_TASK_ID");
    return result;
  };
}

export class AssistedProposalService {
  constructor(private readonly storage: IStorage, private readonly defer: (work:()=>void)=>void = queueMicrotask,
    private readonly runs: AssistedProposalRunAccess = defaultRunAccess, private readonly runner: AssistedRunner = executeAssistedPlanning,
    private readonly dependencies: AssistedProposalServiceDependencies = defaultDependencies) {}

  async request(planId: number, request: AssistedProposalRequest) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedProposalError("RUN_SESSION_MISMATCH",404);
    if (session.draftBaseStageId !== request.expectedBaseStageId) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    if (session.draftFingerprint !== request.expectedDraftFingerprint) throw new AssistedProposalError("STALE_DRAFT",409);
    const base = await this.storage.getAssistedPlanningStage(request.expectedBaseStageId);
    if (!base || base.sessionId !== session.id || base.planId !== planId) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    if ((session.workingFingerprint ?? base.snapshotFingerprint) !== session.draftFingerprint) throw new AssistedProposalError("DIRTY_DRAFT",409);
    const input = await this.dependencies.buildInput(planId,this.storage); const adapter=adaptEngineInputToPlannerNextProblem(input);
    if(adapter.status!=="SUPPORTED") throw new AssistedProposalError("UNSUPPORTED_ENGINE_INPUT",422);
    let resolution;
    try { resolution=resolveAssistedScope(input,adapter,request.selector); if(request.includePrerequisites) resolution=expandVisiblePrerequisites(input,resolution,adapter); }
    catch(error) { if(error instanceof ScopeResolutionError) throw new AssistedProposalError(error.code,422); throw error; }
    const {data,error}=await this.runs.create({plan_id:planId,status:"running",engine:"planner-next",execution_kind:"ASSISTED_SCOPE",assisted_session_id:session.id,base_stage_id:base.id,config_revision_id:session.currentConfigRevisionId,scope_json:{selector:request.selector,metadata:resolution.scope.metadata},scope_task_ids_json:resolution.productTaskIds,include_prerequisites:request.includePrerequisites,source_draft_fingerprint:session.draftFingerprint});
    if(error) mapDbError(error); const runId=Number(data!.id);
    this.defer(()=>void this.run(planId,runId).catch(async failure=>{await this.runs.fail(planId,runId,assistedProposalFailureMessage(failure));}));
    return {runId};
  }

  async run(planId:number,runId:number) {
    const {data:run,error}=await this.runs.find(planId,runId); if(error) throw error; if(!run) throw new AssistedProposalError("RUN_NOT_FOUND",404);
    const session=await this.storage.getActiveAssistedPlanningSession(planId);
    if(!session||session.id!==Number(run.assisted_session_id)) throw new AssistedProposalError("RUN_SESSION_MISMATCH",409);
    if(session.currentConfigRevisionId!==Number(run.config_revision_id)) throw new AssistedProposalError("STALE_CONFIG_REVISION",409);
    const [input,optimizerSnapshot,taskTemplateSnapshots,persistedRevision]=await Promise.all([
      this.dependencies.buildInput(planId,this.storage), this.storage.getPlanOptimizerSnapshot(planId),
      this.storage.getPlanTaskTemplateSnapshots(planId), this.storage.getPlanConfigRevision(Number(run.config_revision_id)),
    ]);
    const actual=this.dependencies.buildConfigRevision({planId,optimizerSnapshot,taskTemplateSnapshots,
      optimizerProvenance:provenance("plan_optimizer_snapshots"),taskTemplateProvenance:provenance("plan_task_template_snapshots"),
      authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)});
    if(!persistedRevision || persistedRevision.planId!==planId || persistedRevision.fingerprint!==actual.configurationFingerprint)
      throw new AssistedProposalError("STALE_CONFIG_REVISION",409);
    const adapter=adaptEngineInputToPlannerNextProblem(input); const selector=run.scope_json.selector;
    if(adapter.status!=="SUPPORTED") return this.finish(planId,run,{contractVersion:1,outcome:"UNSUPPORTED",selector,scopeTaskIds:run.scope_task_ids_json,includePrerequisites:run.include_prerequisites,proposal:null,proposedDraftSnapshot:null,proposedDraftFingerprint:null,evidence:adapter.diagnostics as unknown as Record<string,unknown>,reasonCodes:adapter.reasonCodes});
    const resolution=resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:run.scope_task_ids_json});
    const stage=await this.storage.getAssistedPlanningStage(Number(run.base_stage_id)); if(!stage) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    if(run.source_origin_snapshot_json && (session.draftBaseStageId!==Number(run.base_stage_id)||session.draftFingerprint!==run.source_draft_fingerprint))
      throw new AssistedProposalError("STALE_DRAFT",409);
    const baseSnapshot=(run.source_origin_snapshot_json ?? session.workingSnapshotJson ?? stage.snapshotJson) as unknown as AssistedPlanningSnapshotV1;
    const {protectedPlacements,protectedOperationalMeals,protectedSetupPreparations,protectedRoundPreparations,protectedParticipantMeals}=
      materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,baseSnapshot);
    const operationalPolicyById=new Map((adapter.problem.operationalMealPolicies??[]).map(policy=>[policy.id,policy]));
    const productByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const canonicalByProduct=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
    const spaceByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="space").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const sourceUnitByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="itinerant-team").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const taskInputById=new Map(input.tasks.map(t=>[t.id,t]));
    const lineage=resolveActiveStageLineage(await this.storage.listAssistedPlanningStages(session.id),stage.id);
    const acceptedBaseline=(await Promise.all(lineage.map(async origin=>(await this.storage.listPlanningAcceptedExceptions(origin.id)).filter(exception=>exception.status==="ACTIVE"&&affectedTasksUnchanged(origin.snapshotJson,baseSnapshot,exception.affectedTaskIdsJson))))).flat();
    const canonicalIds=(namespace:string,ids:readonly number[])=>ids.map(id=>{const match=adapter.identityMap.find(item=>(namespace==="resource"?["resource","plan-resource","resource-item"].includes(item.namespace):item.namespace===namespace)&&Number(item.sourceId)===id);if(!match)throw new Error(`UNPROJECTABLE_VALIDATION_IDENTITY:${namespace}:${id}`);return match.canonicalId;});
    const baselineViolations=acceptedBaseline.map(item=>({ruleCode:item.ruleCode,severity:item.severity as "HARD"|"REQUIRED",affectedTaskIds:canonicalIds("task",item.affectedTaskIdsJson),affectedResourceIds:canonicalIds("resource",item.affectedResourceIdsJson??[]),affectedSpaceIds:canonicalIds("space",item.affectedSpaceIdsJson??[]),dimensions:(item.detailsJson as any)?.dimensions??{}}));
    const lineageWitnessSets:FutureStructuralWitness[][]=[];
    for(const witnessStage of lineage){
      const proposalRunId=(witnessStage as typeof witnessStage&{proposalRunId?:number|null}).proposalRunId;
      if(proposalRunId===null||proposalRunId===undefined)continue;
      const {data:priorRun,error:priorError}=await this.runs.find(planId,Number(proposalRunId));
      if(priorError)throw priorError;
      const witnesses=(priorRun?.assisted_result_json?.evidence?.futureStructuralWitnesses
        ??priorRun?.assistedResultJson?.evidence?.futureStructuralWitnesses
        ??priorRun?.result_json?.evidence?.futureStructuralWitnesses) as FutureStructuralWitness[]|undefined;
      lineageWitnessSets.push([...(witnesses??[])]);
    }
    const selectedPipeline=lineageWitnessSets.flatMap((witnesses,stageIndex)=>witnesses.filter((item):item is Extract<FutureStructuralWitness,{kind:"FIXED_SUPPORTING_PIPELINE"}>=>item.kind==="FIXED_SUPPORTING_PIPELINE").map(witness=>({witness,stageIndex})))
      .sort((a,b)=>a.stageIndex-b.stageIndex||b.witness.version-a.witness.version)[0]?.witness;
    const priorFutureStructuralWitnesses:FutureStructuralWitness[]=[];if(selectedPipeline)priorFutureStructuralWitnesses.push(selectedPipeline);
    const seenWitnessIdentities=new Set(selectedPipeline?[structuralWitnessIdentity(selectedPipeline)]:[]);
    for(const witnesses of lineageWitnessSets)for(const witness of witnesses){if(!witness?.kind||witness.kind==="FIXED_SUPPORTING_PIPELINE")continue;
      if(witness.kind==="ITINERANT_AGENDA"&&witness.supportingFingerprint!==(selectedPipeline?.fingerprint??null))continue;
      const identity=structuralWitnessIdentity(witness);if(seenWitnessIdentities.has(identity))continue;
      seenWitnessIdentities.add(identity);priorFutureStructuralWitnesses.push(witness);}
    const futureEligible=analyticalFutureEligibleTaskIds(input,adapter.identityMap);
    const assistedProblem=buildAssistedProblem(adapter.problem,resolution.scope,protectedPlacements,futureEligible,
      protectedOperationalMeals,protectedSetupPreparations,protectedParticipantMeals,protectedRoundPreparations,
      priorFutureStructuralWitnesses);
    const execution=this.runner(assistedProblem,{violations:baselineViolations});
    const concreteByTaskId=new Map(resolveEffectiveTaskResourceAssignments(input).assignments.map(a=>[a.taskId,a.byItemResourceIds??[]]));
    const proposal=execution.proposal?.map(item=>{
      const taskId=productByCanonical.get(item.id)!;
      const sourceTask=taskInputById.get(taskId)!;
      const selectedUnit=item.itinerantUnitId===undefined?undefined:sourceUnitByCanonical.get(item.itinerantUnitId);
      if(item.itinerantUnitId!==undefined&&!selectedUnit)throw new Error(`UNPROJECTABLE_ITINERANT_UNIT:${item.itinerantUnitId}`);
      const concrete=concreteByTaskId.get(taskId)??[];
      let assignedResourceIds:readonly number[]|undefined;
      if(concrete.length)assignedResourceIds=[...new Set([...(sourceTask.assignedResourceIds??[]),...concrete])].sort((a,b)=>a-b);
      if(item.itinerantUnitId!==undefined){
        const declared=sourceTask.declaredResourceIds === undefined ? undefined : projectDirectResourcesToCanonical(adapter.identityMap,sourceTask.declaredResourceIds);
        const direct=projectDirectResourcesToCanonical(adapter.identityMap,sourceTask.assignedResourceIds??[]);
        const domain=item.allowedItinerantUnitIds?.length?item.allowedItinerantUnitIds:item.itinerantUnitId?[item.itinerantUnitId]:[];
        const domainResources=new Set((adapter.problem.itinerantUnits??[]).filter(unit=>domain.includes(unit.id)).flatMap(unit=>unit.resourceIds??[]));
        const selectedResources=(adapter.problem.itinerantUnits??[]).find(unit=>unit.id===item.itinerantUnitId)?.resourceIds;
        if(!selectedResources)throw new Error(`UNPROJECTABLE_ITINERANT_UNIT:${item.itinerantUnitId}`);
        assignedResourceIds=projectDirectResourcesToProduct(adapter.identityMap,[
          ...direct.filter(id=>(sourceTask.resourceInheritance === "OPERATION_ONLY" && (declared === undefined || declared.includes(id))) || !domainResources.has(id)),
          ...selectedResources,...projectDirectResourcesToCanonical(adapter.identityMap,concrete),
          ...(sourceTask.resourceInheritance === "OPERATION_ONLY" ? item.nonSubstitutableResourceIds ?? [] : declared ?? []),
        ]);
      }
      if(input.dailyTechnicalChainsVersion===1){
        // Persist the physical resources actually consumed by this native
        // proposal, including inherited location requirements used by its future.
        assignedResourceIds=projectDirectResourcesToProduct(adapter.identityMap,[
          ...(item.requiredResourceIds??[]),...projectDirectResourcesToCanonical(adapter.identityMap,assignedResourceIds??[]),
        ]);
      }
      const canonicalTask=adapter.problem.tasks.find(task=>task.id===item.id)!;
      if(input.dailyAnchoredAccompanimentsVersion===2&&input.anchoredAccompaniments?.some(p=>[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds].includes(taskId)))
        assignedResourceIds=projectDirectResourcesToProduct(adapter.identityMap,[...(item.requiredResourceIds??[]),...(item.coachId?[item.coachId]:[])]);
      if(canonicalTask.nominalResourceChoice){
        if(!nominalResourceAssignmentMatches(canonicalTask,item))throw new Error(`INVALID_PROPOSAL_NOMINAL_RESOURCE:${taskId}`);
        assignedResourceIds=projectDirectResourcesToProduct(adapter.identityMap,[...(item.requiredResourceIds??[]),
          ...projectDirectResourcesToCanonical(adapter.identityMap,sourceTask.assignedResourceIds??[]).filter(id=>id===item.coachId)]);
      }
      return {taskId,startPlanned:minuteToEngineTime(item.start),endPlanned:minuteToEngineTime(item.end),
        spaceId:spaceByCanonical.get(item.spaceId)!,zoneId:sourceTask.zoneId??null,
        ...(selectedUnit===undefined?{}:{itinerantTeamId:selectedUnit}),
        ...(assignedResourceIds===undefined?{}:{assignedResourceIds})};
    })??null;
    const proposalById=new Map((proposal??[]).map(item=>[item.taskId,item]));
    const mealProposalById=new Map<number,{startPlanned:string;endPlanned:string;spaceId:null}>();
    const retainedMealSources=new Set(assistedProblem.retainedParticipantMealSourceIds);
    const materializedMeals=(execution.evidence.selectedMealWitnesses?.participant?.scheduled??[])
      .filter(meal=>retainedMealSources.has(meal.sourceTaskId));
    for(const meal of materializedMeals){
      const taskId=productByCanonical.get(meal.sourceTaskId);
      if(!taskId)throw new Error(`UNPROJECTABLE_PARTICIPANT_MEAL_SOURCE:${meal.sourceTaskId}`);
      mealProposalById.set(taskId,{startPlanned:minuteToEngineTime(meal.start),endPlanned:minuteToEngineTime(meal.end),spaceId:null});
    }
    const acceptedMeals=[...(baseSnapshot.operationalMeals??[])];
    const acceptedTasks=new Map([...protectedPlacements,...(execution.proposal??[])].map(task=>[task.id,task]));
    for(const selected of execution.evidence.selectedMealWitnesses?.operational?.scheduled??[]){
      if(acceptedMeals.some(meal=>meal.policyId===selected.id))continue;
      const policy=operationalPolicyById.get(selected.id);
      if(!policy)throw new Error(`UNPROJECTABLE_OPERATIONAL_MEAL:${selected.id}`);
      // Only accepted/proposed consumers close a unit. Future assignments stay
      // virtual; every explicitly admissible composition still counts until
      // the task has an accepted materialized resource assignment.
      const consumers=adapter.problem.tasks.filter(source=>{
        const task=acceptedTasks.get(source.id)??source;
        const domain=task.allowedItinerantUnitIds?.length?task.allowedItinerantUnitIds:task.itinerantUnitId?[task.itinerantUnitId]:[];
        const resources=[...(task.requiredResourceIds??[]),...(task.coachId===undefined?[]:[task.coachId]),
          ...(acceptedTasks.has(task.id)?[]:(adapter.problem.itinerantUnits??[]).filter(unit=>domain.includes(unit.id)).flatMap(unit=>unit.resourceIds??[]))];
        return policy.spaceIds.includes(task.spaceId)||resources.some(id=>policy.resourceIds.includes(id));
      });
      if(consumers.length&&consumers.every(task=>acceptedTasks.has(task.id)))
        acceptedMeals.push({policyId:selected.id,startPlanned:minuteToEngineTime(selected.start),endPlanned:minuteToEngineTime(selected.end)});
    }
    const sourceFamilyByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="setup-family").map(i=>[i.canonicalId,i.sourceId]));
    const acceptedPreparations=(execution.evidence.selectedSetupPreparations??[]).map(item=>{
      const spaceId=spaceByCanonical.get(item.spaceId),setupFamilyId=sourceFamilyByCanonical.get(item.setupFamilyId);
      if(!spaceId||!setupFamilyId)throw new Error(`UNPROJECTABLE_SETUP_PREPARATION:${item.id}`);
      return {id:item.id,spaceId,setupFamilyId,entryIndex:item.entryIndex,duration:item.duration,start:item.start,end:item.end};
    });
    const sourceSynchronizationByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="round-synchronization").map(i=>[i.canonicalId,i.sourceId]));
    const acceptedRoundPreparations=(execution.evidence.selectedRoundPreparations??[]).map(item=>{
      const spaceId=spaceByCanonical.get(item.spaceId),synchronizationId=sourceSynchronizationByCanonical.get(item.synchronizationId);
      if(!spaceId||!synchronizationId)throw new Error(`UNPROJECTABLE_ROUND_PREPARATION:${item.id}`);
      return {id:roundPreparationId(synchronizationId,String(spaceId),item.roundIndex),synchronizationId,spaceId,roundIndex:item.roundIndex,duration:item.duration,start:item.start,end:item.end};
    });
    const proposedDraftSnapshot=proposal ? buildAssistedPlanningSnapshotV1(baseSnapshot.tasks.map(task=>({id:task.taskId,...task,...(proposalById.get(task.taskId)??{}),...(mealProposalById.get(task.taskId)??{})})), baseSnapshot.planningBlocks, acceptedMeals, acceptedPreparations, acceptedRoundPreparations) : null;
    const proposedDraftFingerprint=proposedDraftSnapshot ? fingerprintAssistedPlanningSnapshotV1(proposedDraftSnapshot) : null;
    const candidateDetails=(execution.evidence as any).violations as ValidationViolationDetail[]|undefined;
    const candidateViolations=projectPlannerViolations(candidateDetails??[],adapter.identityMap);
    const unstructured=(execution.evidence as any).unstructuredReasonCodes as string[]|undefined;
    // validatePlan has already removed reason codes represented by structured
    // violations. Every remaining code is therefore a distinct anonymous HARD
    // and cannot inherit an AcceptedException without an exact identity.
    const delta=evaluateAcceptedViolationDelta(candidateViolations,acceptedBaseline,unstructured);
    const {newHardViolationCount,newRequiredViolationCount,proposalEligible}=delta;
    const mealFeasibility=execution.evidence.participantMealFutureFeasibility;
    const firstMealPrune=mealFeasibility.firstPrune;
    const blockingMealIds=mealFeasibility.blockingMealTaskIds??[];
    const globalMealEvidence=certifyGlobalParticipantMealGate(adapter.problem.participantMeals??[],protectedParticipantMeals,
      execution.evidence.selectedMealWitnesses?.participant?.scheduled??[],execution.evidence.reasonCodes??[],{
        zeroDomainMealSourceIds:firstMealPrune?.domainResult==="ZERO_DOMAIN"?[firstMealPrune.blockingMealTaskId]:[],
        infeasibleMealSourceIds:firstMealPrune?.domainResult==="ANALYTIC_COLLECTIVE_INFEASIBLE"
          || execution.evidence.reasonCodes.includes("PARTICIPANT_MEALS_JOINTLY_INFEASIBLE")?blockingMealIds:[],
      });
    const globalMealGate=globalMealEvidence.globalMealGate;
    const technicalChainCertificate=input.dailyTechnicalChainsVersion===1&&proposal
      ?certifyDailyTechnicalChain(adapter.problem,[...protectedPlacements,...(execution.proposal??[])],
        adapter.problem.budget.maxBranchExpansions-Number(execution.evidence.work.branchBudgetConsumed??execution.evidence.work.branchesExplored??0)):null;
    const technicalChainGate=!technicalChainCertificate||technicalChainCertificate.status==="WITNESS";
    const evidence={...execution.evidence,...(technicalChainCertificate?{technicalChainCertificate}:{}),hardValid:candidateViolations.every(item=>item.severity!=="HARD"),requiredValid:newRequiredViolationCount===0,
      inheritedAcceptedHardViolationCount:delta.inheritedHardViolationCount,inheritedAcceptedRequiredViolationCount:delta.inheritedRequiredViolationCount,
      newHardViolationCount,newRequiredViolationCount,proposalEligible:proposalEligible&&globalMealGate==="PASS"&&technicalChainGate,violations:candidateDetails??[],
      ...globalMealEvidence};
    const safeProposal=proposal&&proposalEligible&&globalMealGate==="PASS"&&technicalChainGate?proposal:null;
    const safeSnapshot=safeProposal?proposedDraftSnapshot:null,safeFingerprint=safeProposal?proposedDraftFingerprint:null;
    const result:AssistedProposalRunResultV1={contractVersion:1,outcome:safeProposal?"PROPOSAL":"NO_PROPOSAL",selector,scopeTaskIds:run.scope_task_ids_json,includePrerequisites:run.include_prerequisites,proposal:safeProposal,proposedDraftSnapshot:safeSnapshot,proposedDraftFingerprint:safeFingerprint,evidence:evidence as unknown as Record<string,unknown>,reasonCodes:execution.evidence.reasonCodes};
    return this.finish(planId,run,result);
  }

  private async finish(planId:number,run:any,result:AssistedProposalRunResultV1){
    // A synchronous search can outlive idle HTTP connections. Drain pending
    // socket-close callbacks before reusing the Node 20 fetch pool for this RPC.
    // Two turns include the close-callback phase after the first check phase.
    await new Promise<void>(resolve=>setImmediate(resolve));
    await new Promise<void>(resolve=>setImmediate(resolve));
    const {error}=await this.runs.finish(planId,Number(run.id),result);if(error)throw error;return result;
  }
  async get(planId:number,runId:number){const {data,error}=await this.runs.find(planId,runId);if(error)throw error;if(!data)throw new AssistedProposalError("RUN_NOT_FOUND",404);return data;}
  async discard(planId:number,runId:number,expectedDraftFingerprint:string,expectedBaseStageId:number) {
    const {error}=await supabaseAdmin.rpc("assisted_discard_pending_proposal",{p_plan_id:planId,p_run_id:runId,p_expected_base:expectedBaseStageId,p_expected_fingerprint:expectedDraftFingerprint});
    if(error)mapDbError(error);
    return {discarded:true};
  }
  async apply(planId:number,runId:number,expectedDraftFingerprint:string,expectedBaseStageId:number){const {error}=await this.runs.apply({p_plan_id:planId,p_run_id:runId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId});if(error)mapDbError(error);return this.get(planId,runId);}
}
