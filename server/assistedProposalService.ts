import { createHash } from "node:crypto";
import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { adaptEngineInputToPlannerNextProblem, engineTimeToMinute, minuteToEngineTime } from "../engine/planner-next/integration/engineInputAdapter";
import { buildAssistedProblem, executeAssistedPlanning } from "../engine/planner-next/assistedPlanning";
import type { ScheduledTask } from "../engine/planner-next/contracts";
import { expandVisiblePrerequisites, resolveAssistedScope, ScopeResolutionError } from "./assistedScopeResolver";
import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import type { AssistedProposalRequest, AssistedProposalRunResultV1 } from "../shared/assistedProposalContracts";

export type AssistedProposalErrorCode = "INVALID_SCOPE"|"EMPTY_SCOPE"|"STALE_DRAFT"|"STALE_BASE_STAGE"|"DIRTY_DRAFT"|"STALE_CONFIG_REVISION"|"RUN_NOT_FOUND"|"RUN_NOT_READY"|"RUN_HAS_NO_PROPOSAL"|"RUN_SESSION_MISMATCH"|"RUN_RESULT_INVALID"|"UNSUPPORTED_ENGINE_INPUT";
export class AssistedProposalError extends Error {
  constructor(readonly code: AssistedProposalErrorCode, readonly status: 404|409|422) { super(code); }
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mapDbError = (error: any): never => {
  const code = (["STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION","RUN_NOT_FOUND","RUN_NOT_READY","RUN_HAS_NO_PROPOSAL","RUN_SESSION_MISMATCH","RUN_RESULT_INVALID"] as const)
    .find(candidate => String(error?.message ?? "").includes(candidate));
  if (code) throw new AssistedProposalError(code, code === "RUN_NOT_FOUND" ? 404 : code === "RUN_HAS_NO_PROPOSAL" ? 422 : 409);
  throw error;
};

export class AssistedProposalService {
  constructor(private readonly storage: IStorage, private readonly defer: (work:()=>void)=>void = queueMicrotask) {}
  async request(planId: number, request: AssistedProposalRequest) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedProposalError("RUN_SESSION_MISMATCH",404);
    if (session.draftBaseStageId !== request.expectedBaseStageId) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    if (session.draftFingerprint !== request.expectedDraftFingerprint) throw new AssistedProposalError("STALE_DRAFT",409);
    const base = await this.storage.getAssistedPlanningStage(request.expectedBaseStageId);
    if (!base || base.sessionId !== session.id || base.planId !== planId) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    if (base.snapshotFingerprint !== session.draftFingerprint) throw new AssistedProposalError("DIRTY_DRAFT",409);
    const input = await buildEngineInput(planId,this.storage); const adapter=adaptEngineInputToPlannerNextProblem(input);
    if(adapter.status!=="SUPPORTED") throw new AssistedProposalError("UNSUPPORTED_ENGINE_INPUT",422);
    let resolution;
    try { resolution=resolveAssistedScope(input,adapter,request.selector); if(request.includePrerequisites) resolution=expandVisiblePrerequisites(resolution,adapter); }
    catch(error) { if(error instanceof ScopeResolutionError) throw new AssistedProposalError(error.code,422); throw error; }
    const {data,error}=await supabaseAdmin.from("planning_runs").insert({plan_id:planId,status:"running",engine:"planner-next",execution_kind:"ASSISTED_SCOPE",assisted_session_id:session.id,base_stage_id:base.id,config_revision_id:session.currentConfigRevisionId,scope_json:{selector:request.selector,metadata:resolution.scope.metadata},scope_task_ids_json:resolution.productTaskIds,include_prerequisites:request.includePrerequisites,source_draft_fingerprint:session.draftFingerprint}).select("id").single();
    if(error) throw error; const runId=Number(data.id);
    this.defer(()=>void this.run(planId,runId).catch(async failure=>{await supabaseAdmin.from("planning_runs").update({status:"error",message:failure instanceof Error?failure.message:String(failure),finished_at:new Date().toISOString()}).eq("id",runId).eq("plan_id",planId);}));
    return {runId};
  }
  async run(planId:number,runId:number) {
    const {data:run,error}=await supabaseAdmin.from("planning_runs").select("*").eq("id",runId).eq("plan_id",planId).single(); if(error) throw error;
    const session=await this.storage.getActiveAssistedPlanningSession(planId); if(!session||session.id!==Number(run.assisted_session_id)) throw new AssistedProposalError("RUN_SESSION_MISMATCH",409);
    if(session.currentConfigRevisionId!==Number(run.config_revision_id)) throw new AssistedProposalError("STALE_CONFIG_REVISION",409);
    const input=await buildEngineInput(planId,this.storage); const adapter=adaptEngineInputToPlannerNextProblem(input);
    const selector=run.scope_json.selector; if(adapter.status!=="SUPPORTED") return this.finish(run, {contractVersion:1,outcome:"UNSUPPORTED",selector,scopeTaskIds:run.scope_task_ids_json,includePrerequisites:run.include_prerequisites,proposal:null,evidence:adapter.diagnostics as unknown as Record<string,unknown>,reasonCodes:adapter.reasonCodes});
    const resolution=resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:run.scope_task_ids_json});
    const stage=await this.storage.getAssistedPlanningStage(Number(run.base_stage_id)); if(!stage) throw new AssistedProposalError("STALE_BASE_STAGE",409);
    const sourceByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[Number(i.sourceId),i.canonicalId]));
    const taskById=new Map(adapter.problem.tasks.map(t=>[t.id,t]));
    const protectedPlacements: ScheduledTask[]=(stage.snapshotJson as unknown as AssistedPlanningSnapshotV1).tasks.flatMap(row=>{
      if(!row.startPlanned||!row.endPlanned) return []; const id=sourceByCanonical.get(row.taskId); const task=id?taskById.get(id):undefined;
      return task?[{...task,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}]:[];
    });
    const assisted=buildAssistedProblem(adapter.problem,resolution.scope,protectedPlacements); const execution=executeAssistedPlanning(assisted);
    const productByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="task").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const spaceByCanonical=new Map(adapter.identityMap.filter(i=>i.namespace==="space").map(i=>[i.canonicalId,Number(i.sourceId)]));
    const taskInputById=new Map(input.tasks.map(t=>[t.id,t]));
    const proposal=execution.proposal?.map(item=>{const taskId=productByCanonical.get(item.id)!; return {taskId,startPlanned:minuteToEngineTime(item.start),endPlanned:minuteToEngineTime(item.end),spaceId:spaceByCanonical.get(item.spaceId)!,zoneId:taskInputById.get(taskId)?.zoneId??null};})??null;
    const result:AssistedProposalRunResultV1={contractVersion:1,outcome:proposal?"PROPOSAL":"NO_PROPOSAL",selector,scopeTaskIds:run.scope_task_ids_json,includePrerequisites:run.include_prerequisites,proposal,evidence:execution.evidence as unknown as Record<string,unknown>,reasonCodes:execution.evidence.reasonCodes}; return this.finish(run,result);
  }
  private async finish(run:any,result:AssistedProposalRunResultV1){const {error}=await supabaseAdmin.from("planning_runs").update({status:"success",assisted_result_json:result,result_fingerprint:sha(result),finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",run.id).eq("status","running");if(error)throw error;return result;}
  async get(planId:number,runId:number){const {data,error}=await supabaseAdmin.from("planning_runs").select("*").eq("id",runId).eq("plan_id",planId).eq("execution_kind","ASSISTED_SCOPE").maybeSingle();if(error)throw error;if(!data)throw new AssistedProposalError("RUN_NOT_FOUND",404);return data;}
  async apply(planId:number,runId:number,expectedDraftFingerprint:string,expectedBaseStageId:number){const {error}=await supabaseAdmin.rpc("assisted_apply_proposal",{p_plan_id:planId,p_run_id:runId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId});if(error)mapDbError(error);return this.get(planId,runId);}
}
