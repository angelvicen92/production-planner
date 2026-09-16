import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, minuteToEngineTime } from "../engine/planner-next/integration/engineInputAdapter";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "../engine/planner-next/assistedPlanning";
import type { PlannerNextProblem, ScheduledTask } from "../engine/planner-next/contracts";
import { expandVisiblePrerequisites, resolveAssistedScope, ScopeResolutionError } from "./assistedScopeResolver";
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

export function projectPlannerViolations(details:readonly ValidationViolationDetail[],identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[]):StageViolation[]{
  const map=(namespace:string,ids:readonly string[])=>ids.map(id=>{const matches=identityMap.filter(item=>item.namespace===namespace&&item.canonicalId===id);const sourceId=Number(matches[0]?.sourceId);
    if(matches.length!==1||!Number.isInteger(sourceId))throw new Error(`UNPROJECTABLE_VALIDATION_IDENTITY:${namespace}:${id}`);return sourceId;}).sort((a,b)=>a-b);
  return details.map(detail=>{const affectedTaskIds=map("task",detail.affectedTaskIds),affectedResourceIds=map("resource",detail.affectedResourceIds),affectedSpaceIds=map("space",detail.affectedSpaceIds);
    return {ruleCode:detail.ruleCode,severity:detail.severity,affectedTaskIds,affectedResourceIds,affectedSpaceIds,details:{dimensions:detail.dimensions},inheritedAcceptedExceptionId:null,
      violationKey:createViolationKey({ruleCode:detail.ruleCode,affectedTaskIds,affectedResourceIds,affectedSpaceIds,dimensions:detail.dimensions})};});
}

export type AssistedProposalErrorCode = "INVALID_SCOPE"|"EMPTY_SCOPE"|"STALE_DRAFT"|"STALE_BASE_STAGE"|"DIRTY_DRAFT"|"STALE_CONFIG_REVISION"|"RUN_NOT_FOUND"|"RUN_NOT_READY"|"RUN_HAS_NO_PROPOSAL"|"RUN_SESSION_MISMATCH"|"RUN_RESULT_INVALID"|"UNSUPPORTED_ENGINE_INPUT";
export class AssistedProposalError extends Error {
  constructor(readonly code: AssistedProposalErrorCode, readonly status: 404|409|422) { super(code); }
}
const mapDbError = (error: any): never => {
  const code = (["STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION","RUN_NOT_FOUND","RUN_NOT_READY","RUN_HAS_NO_PROPOSAL","RUN_SESSION_MISMATCH","RUN_RESULT_INVALID"] as const)
    .find(candidate => String(error?.message ?? "").includes(candidate));
  if (code) throw new AssistedProposalError(code, code === "RUN_NOT_FOUND" ? 404 : code === "RUN_HAS_NO_PROPOSAL" ? 422 : 409);
  throw error;
};

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

export function validateManualAssistedDelta(input:EngineInput,draft:AssistedPlanningSnapshotV1,touched:readonly number[]){
  const adapter=adaptEngineInputToPlannerNextProblem(input);if(adapter.status!=="SUPPORTED")return null;
  const canonicalByProduct=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
  if(touched.some(id=>!canonicalByProduct.has(id)))return null;
  const taskById=new Map(adapter.problem.tasks.map(task=>[task.id,task]));
  const protectedPlacements:ScheduledTask[]=draft.tasks.flatMap(row=>{if(!row.startPlanned||!row.endPlanned)return[];const canonical=canonicalByProduct.get(row.taskId),task=canonical?taskById.get(canonical):undefined;return task?[{...task,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}]:[];});
  const scope=createPlanningScope({kind:"TASK_IDS",value:touched.join(",")},{validationMode:"MANUAL_DELTA_CLEAN_V1"},touched.map(id=>canonicalByProduct.get(id)!));
  const assisted=buildAssistedProblem(adapter.problem,scope,protectedPlacements);
  const evidence=executeAssistedPlanning(assisted).evidence;
  const validationSummary=validatePlan(assisted.originalValidationProblem,protectedPlacements);
  return {...evidence,validationSummary,structuredViolations:projectPlannerViolations(validationSummary.violations??[],adapter.identityMap)};
}

/** Evidence-only seam: same immutable placements, validated by Planner Next without search. */
export function createManualDeltaValidationHarness(problem:PlannerNextProblem,identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[]){
  return (_input:EngineInput,draft:AssistedPlanningSnapshotV1,touched:readonly number[])=>{
    const canonicalByProduct=new Map(identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId])),taskById=new Map(problem.tasks.map(task=>[task.id,task]));
    const placements:ScheduledTask[]=draft.tasks.flatMap(row=>{if(!row.startPlanned||!row.endPlanned)return[];const id=canonicalByProduct.get(row.taskId),task=id?taskById.get(id):undefined;return task?[{...task,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}]:[];});
    const scopeIds=touched.map(id=>canonicalByProduct.get(id)!);
    const assisted=buildAssistedProblem(problem,createPlanningScope({kind:"TASK_IDS",value:scopeIds.join(",")},{validationMode:"MANUAL_DELTA_CLEAN_V1"},scopeIds),placements);
    const validation=validatePlan(assisted.originalValidationProblem,placements),completeForScope=scopeIds.every(id=>placements.some(row=>row.id===id));
    return {scopeTaskCount:touched.length,scopeTaskIds:scopeIds,supportingTaskIds:assisted.supportingTaskIds,supportingReasonByTaskId:assisted.supportingReasonByTaskId,protectedPlacementCount:placements.length,protectedPlacementsPreserved:true,proposalCount:completeForScope&&validation.hardValid?1:0,completeForScope,hardValid:validation.hardValid,requiredValid:validation.hardValid,fingerprint:fingerprint(placements),work:{},causalDiagnostic:null,reasonCodes:validation.reasonCodes,validationSummary:validation,structuredViolations:projectPlannerViolations(validation.violations??[],identityMap)};
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
    if (base.snapshotFingerprint !== session.draftFingerprint) throw new AssistedProposalError("DIRTY_DRAFT",409);
    const input = await this.dependencies.buildInput(planId,this.storage); const adapter=adaptEngineInputToPlannerNextProblem(input);
    if(adapter.status!=="SUPPORTED") throw new AssistedProposalError("UNSUPPORTED_ENGINE_INPUT",422);
    let resolution;
    try { resolution=resolveAssistedScope(input,adapter,request.selector); if(request.includePrerequisites) resolution=expandVisiblePrerequisites(input,resolution,adapter); }
    catch(error) { if(error instanceof ScopeResolutionError) throw new AssistedProposalError(error.code,422); throw error; }
    const {data,error}=await this.runs.create({plan_id:planId,status:"running",engine:"planner-next",execution_kind:"ASSISTED_SCOPE",assisted_session_id:session.id,base_stage_id:base.id,config_revision_id:session.currentConfigRevisionId,scope_json:{selector:request.selector,metadata:resolution.scope.metadata},scope_task_ids_json:resolution.productTaskIds,include_prerequisites:request.includePrerequisites,source_draft_fingerprint:session.draftFingerprint});
    if(error) throw error; const runId=Number(data!.id);
    this.defer(()=>void this.run(planId,runId).catch(async failure=>{await this.runs.fail(planId,runId,failure instanceof Error?failure.message:String(failure));}));
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
    const sourceByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
    const taskById=new Map(adapter.problem.tasks.map(t=>[t.id,t]));
    const baseSnapshot=stage.snapshotJson as unknown as AssistedPlanningSnapshotV1;
    const protectedPlacements: ScheduledTask[]=baseSnapshot.tasks.flatMap(row=>{
      if(!row.startPlanned||!row.endPlanned) return []; const id=sourceByCanonical.get(row.taskId); const task=id?taskById.get(id):undefined;
      return task?[{...task,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}]:[];
    });
    const productByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const canonicalByProduct=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
    const spaceByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="space").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const taskInputById=new Map(input.tasks.map(t=>[t.id,t]));
    const lineage=resolveActiveStageLineage(await this.storage.listAssistedPlanningStages(session.id),stage.id);
    const acceptedBaseline=(await Promise.all(lineage.map(async origin=>(await this.storage.listPlanningAcceptedExceptions(origin.id)).filter(exception=>exception.status==="ACTIVE"&&exception.configRevisionId===session.currentConfigRevisionId&&affectedTasksUnchanged(origin.snapshotJson,baseSnapshot,exception.affectedTaskIdsJson))))).flat();
    const canonicalIds=(namespace:string,ids:readonly number[])=>ids.map(id=>{const match=adapter.identityMap.find(item=>item.namespace===namespace&&Number(item.sourceId)===id);if(!match)throw new Error(`UNPROJECTABLE_VALIDATION_IDENTITY:${namespace}:${id}`);return match.canonicalId;});
    const baselineViolations=acceptedBaseline.map(item=>({ruleCode:item.ruleCode,severity:item.severity as "HARD"|"REQUIRED",affectedTaskIds:canonicalIds("task",item.affectedTaskIdsJson),affectedResourceIds:canonicalIds("resource",item.affectedResourceIdsJson??[]),affectedSpaceIds:canonicalIds("space",item.affectedSpaceIdsJson??[]),dimensions:(item.detailsJson as any)?.dimensions??{}}));
    const execution=this.runner(buildAssistedProblem(adapter.problem,resolution.scope,protectedPlacements),{violations:baselineViolations});
    const proposal=execution.proposal?.map(item=>{const taskId=productByCanonical.get(item.id)!; return {taskId,startPlanned:minuteToEngineTime(item.start),endPlanned:minuteToEngineTime(item.end),spaceId:spaceByCanonical.get(item.spaceId)!,zoneId:taskInputById.get(taskId)?.zoneId??null};})??null;
    const proposalById=new Map((proposal??[]).map(item=>[item.taskId,item]));
    const proposedDraftSnapshot=proposal ? buildAssistedPlanningSnapshotV1(baseSnapshot.tasks.map(task=>({id:task.taskId,...task,...(proposalById.get(task.taskId)??{})})), baseSnapshot.planningBlocks) : null;
    const proposedDraftFingerprint=proposedDraftSnapshot ? fingerprintAssistedPlanningSnapshotV1(proposedDraftSnapshot) : null;
    const candidateDetails=(execution.evidence as any).violations as ValidationViolationDetail[]|undefined;
    const candidateViolations=projectPlannerViolations(candidateDetails??[],adapter.identityMap);
    const inheritedHard=candidateViolations.filter(item=>item.severity==="HARD"&&acceptedBaseline.some(exception=>exception.severity==="HARD"&&exception.violationKey===item.violationKey));
    const inheritedRequired=candidateViolations.filter(item=>item.severity==="REQUIRED"&&acceptedBaseline.some(exception=>exception.severity==="REQUIRED"&&exception.violationKey===item.violationKey));
    const inheritedKeys=new Set([...inheritedHard,...inheritedRequired].map(item=>item.violationKey));
    const unstructured=(execution.evidence as any).unstructuredReasonCodes as string[]|undefined;
    const newHardViolationCount=candidateViolations.filter(item=>item.severity==="HARD"&&!inheritedKeys.has(item.violationKey)).length+(unstructured?.length??0);
    const newRequiredViolationCount=candidateViolations.filter(item=>item.severity==="REQUIRED"&&!inheritedKeys.has(item.violationKey)).length;
    const proposalEligible=newHardViolationCount===0&&newRequiredViolationCount===0;
    const evidence={...execution.evidence,hardValid:candidateViolations.every(item=>item.severity!=="HARD"),requiredValid:newRequiredViolationCount===0,
      inheritedAcceptedHardViolationCount:inheritedHard.length,inheritedAcceptedRequiredViolationCount:inheritedRequired.length,
      newHardViolationCount,newRequiredViolationCount,proposalEligible,violations:candidateDetails??[]};
    const safeProposal=proposal&&proposalEligible?proposal:null;
    const safeSnapshot=safeProposal?proposedDraftSnapshot:null,safeFingerprint=safeProposal?proposedDraftFingerprint:null;
    const result:AssistedProposalRunResultV1={contractVersion:1,outcome:safeProposal?"PROPOSAL":"NO_PROPOSAL",selector,scopeTaskIds:run.scope_task_ids_json,includePrerequisites:run.include_prerequisites,proposal:safeProposal,proposedDraftSnapshot:safeSnapshot,proposedDraftFingerprint:safeFingerprint,evidence:evidence as unknown as Record<string,unknown>,reasonCodes:execution.evidence.reasonCodes};
    return this.finish(planId,run,result);
  }

  private async finish(planId:number,run:any,result:AssistedProposalRunResultV1){const {error}=await this.runs.finish(planId,Number(run.id),result);if(error)throw error;return result;}
  async get(planId:number,runId:number){const {data,error}=await this.runs.find(planId,runId);if(error)throw error;if(!data)throw new AssistedProposalError("RUN_NOT_FOUND",404);return data;}
  async apply(planId:number,runId:number,expectedDraftFingerprint:string,expectedBaseStageId:number){const {error}=await this.runs.apply({p_plan_id:planId,p_run_id:runId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId});if(error)mapDbError(error);return this.get(planId,runId);}
}
