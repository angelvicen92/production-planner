import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import { engineTimeToMinute } from "./assistedTime";
import { validateManualAssistedDelta } from "./assistedProposalService";
import { applyPlanningBlockOperation, type PlanningBlockOperation } from "./assistedPlanningBlocks";
import { assertPlanningBlockTemporalOrder } from "../shared/assistedPlanningTaskOrdering";
import type { StageValidationReport } from "../shared/assistedStageValidation";
import { acceptedRequiredViolations, affectedTasksUnchanged, resolveActiveStageLineage } from "./assistedAcceptedBaseline";

export type AssistedPlanningErrorCode = "SESSION_NOT_FOUND" | "STALE_DRAFT" | "STALE_BASE_STAGE" | "STALE_CONFIG_REVISION" | "STALE_VALIDATION" | "VALIDATION_REQUIRED" | "VALIDATION_NOT_ACCEPTABLE" | "HARD_CONFIRMATION_REQUIRED" | "REQUIRED_CONFIRMATION_REQUIRED" | "RUN_RESULT_INVALID" | "UNSUPPORTED_ENGINE_INPUT" | "TASK_SET_MISMATCH" | "IMMUTABLE_TASK" | "UNSUPPORTED_MANUAL_FIELD" | "INVALID_MANUAL_DURATION" | "INVALID_MANUAL_RESET" | "INVALID_BLOCK_OPERATION" | "PLANNING_BLOCK_ORDER_CONFLICT" | "CORRUPT_EDIT_LEDGER" | "ASSISTED_DELTA_VALIDATION_UNSUPPORTED" | "INVALID_STAGE_TARGET" | "NO_REDO_AVAILABLE" | "NO_UNDO_AVAILABLE" | "CONCURRENT_ACCEPT";
export class AssistedPlanningError extends Error {
  constructor(readonly code: AssistedPlanningErrorCode, readonly status: 404 | 409 | 422) { super(code); this.name = "AssistedPlanningError"; }
}
const statuses: Record<AssistedPlanningErrorCode, 404 | 409 | 422> = {
  SESSION_NOT_FOUND: 404, STALE_DRAFT: 409, STALE_BASE_STAGE: 409, STALE_VALIDATION: 409,
  STALE_CONFIG_REVISION: 409, VALIDATION_REQUIRED: 422, VALIDATION_NOT_ACCEPTABLE: 422, RUN_RESULT_INVALID: 422, UNSUPPORTED_ENGINE_INPUT: 422, TASK_SET_MISMATCH: 409,
  INVALID_STAGE_TARGET: 422, NO_REDO_AVAILABLE: 409, CONCURRENT_ACCEPT: 409,
  IMMUTABLE_TASK: 422, UNSUPPORTED_MANUAL_FIELD: 422, INVALID_MANUAL_DURATION: 422, INVALID_MANUAL_RESET: 422, CORRUPT_EDIT_LEDGER: 409,
  ASSISTED_DELTA_VALIDATION_UNSUPPORTED: 422, NO_UNDO_AVAILABLE: 409,
  INVALID_BLOCK_OPERATION: 422,
  PLANNING_BLOCK_ORDER_CONFLICT: 422,
  HARD_CONFIRMATION_REQUIRED: 422, REQUIRED_CONFIRMATION_REQUIRED: 422,
};
function dbError(error: any): never {
  const code = (Object.keys(statuses) as AssistedPlanningErrorCode[]).find((candidate) => String(error?.message ?? "").includes(candidate));
  if (code) throw new AssistedPlanningError(code, statuses[code]);
  throw error;
}
function provenance(authority: string) { return { authority, authorityContractVersion: 1 }; }

export type DraftChange = { taskId: number; startPlanned?: string | null; endPlanned?: string | null; zoneId?: number | null; spaceId?: number | null; locationLabel?: string | null; durationOverride?: number | null; camerasOverride?: number | null };
type AssistedRpc = (name: string, parameters: Record<string, unknown>) => Promise<{ error: unknown }>;
type AssistedPlanningServiceDependencies = {
  buildInput?: typeof buildEngineInput;
  buildConfigRevision?: typeof buildEffectivePlanConfigRevisionV1;
  validateManual?: typeof validateManualAssistedDelta;
};

export class AssistedPlanningService {
  constructor(
    private readonly storage: IStorage,
    private readonly rpc: AssistedRpc = async (name, parameters) => supabaseAdmin.rpc(name, parameters),
    private readonly dependencies: AssistedPlanningServiceDependencies = {},
  ) {}

  private buildInput(planId: number) {
    return (this.dependencies.buildInput ?? buildEngineInput)(planId, this.storage);
  }

  async start(planId: number, userId: string) {
    const existing = await this.storage.getActiveAssistedPlanningSession(planId);
    if (existing) return this.state(planId);
    const [engineInput, optimizerSnapshot, taskTemplateSnapshots, tasks] = await Promise.all([
      this.buildInput(planId), this.storage.getPlanOptimizerSnapshot(planId),
      this.storage.getPlanTaskTemplateSnapshots(planId), this.storage.getTasksForPlan(planId),
    ]);
    const revisionInput = { planId, optimizerSnapshot, taskTemplateSnapshots,
      optimizerProvenance: provenance("plan_optimizer_snapshots"), taskTemplateProvenance: provenance("plan_task_template_snapshots"),
      authorities: projectEffectiveAuthoritiesFromEngineInputV1(engineInput) };
    const identity = (this.dependencies.buildConfigRevision ?? buildEffectivePlanConfigRevisionV1)(revisionInput);
    const replay = buildEffectivePlanConfigReplaySnapshotV1(revisionInput);
    const snapshot = buildAssistedPlanningSnapshotV1(tasks);
    const { error } = await this.rpc("assisted_bootstrap_session", { p_plan_id: planId, p_user_id: userId, p_identity: identity, p_replay: replay, p_snapshot: snapshot, p_fingerprint: fingerprintAssistedPlanningSnapshotV1(snapshot) });
    if (error) dbError(error);
    return this.state(planId);
  }

  async state(planId: number) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    const [activeStage, stages, validation] = await Promise.all([
      session.activeStageId ? this.storage.getAssistedPlanningStage(session.activeStageId) : null,
      this.storage.listAssistedPlanningStages(session.id),
      session.draftValidationId ? this.storage.getPlanningStageValidation(session.draftValidationId) : null,
    ]);
    const lineage=session.activeStageId?resolveActiveStageLineage((stages.some(stage=>stage.id===session.activeStageId)||!activeStage?stages:[...stages,activeStage]) as any,session.activeStageId):[];
    const acceptedExceptions=(await Promise.all(lineage.map(async stage=>(await this.storage.listPlanningAcceptedExceptions(stage.id)??[]).filter(item=>item.status==="ACTIVE"&&affectedTasksUnchanged(stage.snapshotJson,session.draftSnapshotJson,item.affectedTaskIdsJson))))).flat();
    return { session, activeStage, draft: session.draftSnapshotJson, draftBaseStageId: session.draftBaseStageId,
      draftFingerprint: session.draftFingerprint, currentConfigRevisionId: session.currentConfigRevisionId, validation,
      acceptedExceptions: (acceptedExceptions ?? []).filter(item=>item.status==="ACTIVE"), history: stages };
  }

  async patchDraft(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number, changes: DraftChange[]) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    const ids = new Set<number>();
    for (const change of changes) {
      if (Object.keys(change).some((key) => !["taskId", "startPlanned", "endPlanned"].includes(key)))
        throw new AssistedPlanningError("UNSUPPORTED_MANUAL_FIELD", 422);
      if (ids.has(change.taskId)) throw new AssistedPlanningError("TASK_SET_MISMATCH", 409); ids.add(change.taskId);
    }
    const current = session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1;
    const known = new Set(current.tasks.map((task) => task.taskId));
    if ([...ids].some((id) => !known.has(id))) throw new AssistedPlanningError("TASK_SET_MISMATCH", 409);
    const [persisted,baseStage] = await Promise.all([this.storage.getTasksForPlan(planId),this.storage.getAssistedPlanningStage(expectedBaseStageId)]);
    if(!baseStage || baseStage.sessionId!==session.id || baseStage.planId!==planId) throw new AssistedPlanningError("STALE_BASE_STAGE",409);
    const baseById=new Map((baseStage.snapshotJson as unknown as AssistedPlanningSnapshotV1).tasks.map(task=>[task.taskId,task]));
    const persistedById = new Map(persisted.map((task: any) => [Number(task.id), task]));
    for (const change of changes) {
      const row: any = persistedById.get(change.taskId);
      if (!row || !["pending", "interrupted"].includes(String(row.status))) throw new AssistedPlanningError("IMMUTABLE_TASK", 422);
      const before = current.tasks.find((task) => task.taskId === change.taskId)!;
      const hasStart=Object.prototype.hasOwnProperty.call(change,"startPlanned"),hasEnd=Object.prototype.hasOwnProperty.call(change,"endPlanned");
      if(!hasStart||!hasEnd) throw new AssistedPlanningError("INVALID_MANUAL_DURATION",422);
      const start=change.startPlanned,end=change.endPlanned;
      if((start===null)!==(end===null)) throw new AssistedPlanningError("INVALID_MANUAL_RESET",422);
      if(start===null&&end===null){const base=baseById.get(change.taskId);if(!base||base.startPlanned!==null||base.endPlanned!==null)throw new AssistedPlanningError("INVALID_MANUAL_RESET",422);continue;}
      if(typeof start!=="string"||typeof end!=="string"||!before.startPlanned||!before.endPlanned
        ||engineTimeToMinute(end)-engineTimeToMinute(start)!==engineTimeToMinute(before.endPlanned)-engineTimeToMinute(before.startPlanned))
        throw new AssistedPlanningError("INVALID_MANUAL_DURATION",422);
    }
    const byId = new Map(changes.map((change) => [change.taskId, change]));
    const snapshot = buildAssistedPlanningSnapshotV1(current.tasks.map((task) => ({ id: task.taskId, ...task, ...(byId.get(task.taskId) ?? {}) })), current.planningBlocks);
    try { assertPlanningBlockTemporalOrder(snapshot); } catch { throw new AssistedPlanningError("PLANNING_BLOCK_ORDER_CONFLICT", 422); }
    const fingerprint = fingerprintAssistedPlanningSnapshotV1(snapshot);
    const { error } = await this.rpc("assisted_patch_draft", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId, p_snapshot: snapshot, p_fingerprint: fingerprint });
    if (error) dbError(error); return this.state(planId);
  }
  async editPlanningBlocks(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number, operation: PlanningBlockOperation) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    if (session.draftFingerprint !== expectedDraftFingerprint) throw new AssistedPlanningError("STALE_DRAFT", 409);
    if (session.draftBaseStageId !== expectedBaseStageId) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    const rows = await this.storage.getTasksForPlan(planId);
    let result;
    try {
      result = applyPlanningBlockOperation(session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1, operation, rows.map((row: any) => ({
        id: Number(row.id), status: String(row.status), templateId: Number(row.templateId ?? row.template_id), spaceId: row.spaceId ?? row.space_id ?? null,
      })), (session.draftScopeJson as any)?.originalScope ?? session.draftScopeJson ?? {});
    } catch {
      throw new AssistedPlanningError("INVALID_BLOCK_OPERATION", 422);
    }
    const snapshot = buildAssistedPlanningSnapshotV1(result.snapshot.tasks.map((task) => ({ id: task.taskId, ...task })), result.snapshot.planningBlocks);
    const fingerprint = fingerprintAssistedPlanningSnapshotV1(snapshot);
    const { error } = await this.rpc("assisted_patch_draft", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint,
      p_expected_base: expectedBaseStageId, p_snapshot: snapshot, p_fingerprint: fingerprint });
    if (error) dbError(error);
    return this.state(planId);
  }
  async resetDraft(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    if (session.draftFingerprint !== expectedDraftFingerprint) throw new AssistedPlanningError("STALE_DRAFT", 409);
    if (session.draftBaseStageId !== expectedBaseStageId) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    const base = await this.storage.getAssistedPlanningStage(expectedBaseStageId);
    if (!base || base.sessionId !== session.id || base.planId !== planId) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    const snapshot = buildAssistedPlanningSnapshotV1((base.snapshotJson as unknown as AssistedPlanningSnapshotV1).tasks.map(task => ({ id: task.taskId, ...task })), (base.snapshotJson as unknown as AssistedPlanningSnapshotV1).planningBlocks);
    const fingerprint = fingerprintAssistedPlanningSnapshotV1(snapshot);
    if (fingerprint !== base.snapshotFingerprint) throw new AssistedPlanningError("CORRUPT_EDIT_LEDGER", 409);
    const { error } = await this.rpc("assisted_patch_draft", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint,
      p_expected_base: expectedBaseStageId, p_snapshot: snapshot, p_fingerprint: base.snapshotFingerprint });
    if (error) dbError(error);
    return this.state(planId);
  }
  async accept(planId: number, userId: string, expectedDraftFingerprint: string, expectedBaseStageId: number,
    confirmation: "NONE"|"REQUIRED_DEVIATIONS"|"HARD_EXCEPTIONS" = "NONE") {
    const { error } = await this.rpc("assisted_accept_stage", { p_plan_id: planId, p_user_id: userId, p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId, p_confirmation: confirmation });
    if (error) dbError(error); return this.state(planId);
  }
  async validateDraft(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    if (session.draftFingerprint !== expectedDraftFingerprint) throw new AssistedPlanningError("STALE_DRAFT", 409);
    if (session.draftBaseStageId !== expectedBaseStageId) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    try { assertPlanningBlockTemporalOrder(session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1); }
    catch { throw new AssistedPlanningError("PLANNING_BLOCK_ORDER_CONFLICT", 422); }
    const [input, optimizerSnapshot, taskTemplateSnapshots, persistedRevision] = await Promise.all([
      this.buildInput(planId), this.storage.getPlanOptimizerSnapshot(planId),
      this.storage.getPlanTaskTemplateSnapshots(planId), this.storage.getPlanConfigRevision(session.currentConfigRevisionId),
    ]);
    const actual = (this.dependencies.buildConfigRevision ?? buildEffectivePlanConfigRevisionV1)({ planId, optimizerSnapshot, taskTemplateSnapshots,
      optimizerProvenance: provenance("plan_optimizer_snapshots"), taskTemplateProvenance: provenance("plan_task_template_snapshots"),
      authorities: projectEffectiveAuthoritiesFromEngineInputV1(input) });
    if (!persistedRevision || persistedRevision.planId !== planId || persistedRevision.fingerprint !== actual.configurationFingerprint)
      throw new AssistedPlanningError("STALE_CONFIG_REVISION", 409);
    if ((session.draftScopeJson as any)?.editKind !== "MANUAL") {
      const { error } = await this.rpc("assisted_record_proposal_clean_validation", { p_plan_id: planId,
        p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId,
        p_expected_config: session.currentConfigRevisionId });
      if (error) dbError(error);
      const state = await this.state(planId);
      return { current: true, mode: "PROPOSAL_CERTIFIED_CLEAN_V1", validation: state.validation };
    }
    const base = await this.storage.getAssistedPlanningStage(expectedBaseStageId);
    if (!base || base.sessionId !== session.id) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    const draft = session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1;
    const baseSnapshot = base.snapshotJson as unknown as AssistedPlanningSnapshotV1;
    const baseById = new Map(baseSnapshot.tasks.map(task => [task.taskId, task]));
    const touched = draft.tasks.filter(task => {
      const prior = baseById.get(task.taskId);
      return prior && (prior.startPlanned !== task.startPlanned || prior.endPlanned !== task.endPlanned);
    }).map(task => task.taskId).concat(((session.draftScopeJson as any)?.manualTouchedTaskIds ?? []) as number[]).filter((id,index,all)=>all.indexOf(id)===index).sort((a,b)=>a-b);
    if (touched.length === 0) throw new AssistedPlanningError("VALIDATION_REQUIRED", 422);
    const evidence=(this.dependencies.validateManual??validateManualAssistedDelta)(input,draft,touched);
    if(!evidence)throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422);
    const normalized=(evidence as any).structuredViolations as import("../shared/assistedStageValidation").StageViolation[];
    if(!Array.isArray(normalized))throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422);
    if(((evidence as any).validationSummary?.unstructuredReasonCodes?.length??0)>0)
      throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422);
    const lineage=resolveActiveStageLineage(await this.storage.listAssistedPlanningStages(session.id) as any,expectedBaseStageId);
    const accepted=(await Promise.all(lineage.map(async origin=>(await this.storage.listPlanningAcceptedExceptions(origin.id)??[]).filter(item=>item.status==="ACTIVE"&&affectedTasksUnchanged(origin.snapshotJson,draft,item.affectedTaskIdsJson))))).flat();
    const requiredBaseline=acceptedRequiredViolations(lineage,draft);
    const violations=normalized.map(violation=>{const inherited=accepted.find(item=>item.violationKey===violation.violationKey);const inheritedRequired=violation.severity==="REQUIRED"&&requiredBaseline.some(item=>item.violationKey===violation.violationKey);return inherited?{...violation,inheritedAcceptedExceptionId:inherited.id}:inheritedRequired?{...violation,details:{...violation.details,inheritedAcceptedRequired:true}}:violation;});
    const hardCount=violations.filter(item=>item.severity==="HARD").length,requiredCount=violations.filter(item=>item.severity==="REQUIRED").length;
    const newHardCount=violations.filter(item=>item.severity==="HARD"&&item.inheritedAcceptedExceptionId==null).length;
    const newRequiredCount=violations.filter(item=>item.severity==="REQUIRED"&&!(item.details as any).inheritedAcceptedRequired).length;
    const report:StageValidationReport={contractVersion:1,mode:"MANUAL_STAGE_VALIDATION_V1",changedTaskIds:touched,completeForScope:evidence.completeForScope,
      protectedPlacementsPreserved:evidence.protectedPlacementsPreserved,hardValid:hardCount===0,hardCount,requiredCount,newHardCount,newRequiredCount,preferredCount:0,violations,
      preferredAssessment:"NOT_CLASSIFIED",supportingTaskIds:evidence.supportingTaskIds,supportingReasonByTaskId:evidence.supportingReasonByTaskId,
      reasonCodes:evidence.reasonCodes,work:evidence.work,fingerprint:evidence.fingerprint,futureFullDayFeasibility:"NOT_CERTIFIED"};
    const { error } = await this.rpc("assisted_record_stage_validation", { p_plan_id: planId,
      p_expected_fingerprint: expectedDraftFingerprint,p_expected_base:expectedBaseStageId,
      p_expected_config:session.currentConfigRevisionId,p_report:report });
    if (error) dbError(error);
    const state = await this.state(planId);
    return { current: true, mode: "MANUAL_STAGE_VALIDATION_V1", validation: state.validation };
  }
  async rollback(planId: number, targetStageId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: targetStageId, p_redo: false }); if (error) dbError(error); return this.state(planId); }
  async redo(planId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: null, p_redo: true }); if (error) dbError(error); return this.state(planId); }
  async undoDraft(planId:number,expectedDraftFingerprint:string,expectedBaseStageId:number) { const {error}=await this.rpc("assisted_move_draft_edit",{p_plan_id:planId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId,p_redo:false});if(error)dbError(error);return this.state(planId); }
  async redoDraft(planId:number,expectedDraftFingerprint:string,expectedBaseStageId:number) { const {error}=await this.rpc("assisted_move_draft_edit",{p_plan_id:planId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId,p_redo:true});if(error)dbError(error);return this.state(planId); }
}
