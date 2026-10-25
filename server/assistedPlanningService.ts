import { bootstrapAdditionReasons, type BootstrapAdditionsPreview } from "../shared/assistedBootstrapAdditions";
import { plannerReadiness } from "./plannerReadiness";
import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { buildAssistedPlanningSnapshotV1, rebuildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import { engineTimeToMinute } from "./assistedTime";
import { validateManualAssistedDelta, ManualValidationUnsupportedError,assertPersistedNominalProposalWitness } from "./assistedProposalService";
import { applyPlanningBlockOperation, type PlanningBlockOperation } from "./assistedPlanningBlocks";
import { assertPlanningBlockTemporalOrder } from "../shared/assistedPlanningTaskOrdering";
import type { StageValidationReport } from "../shared/assistedStageValidation";
import { affectedTasksUnchanged, resolveActiveStageLineage } from "./assistedAcceptedBaseline";
import {recommendNextAssistedScope} from './assistedScopeOrchestrator';
import {getUserRole} from './authz';
import {newStageDeviationCounts} from '../shared/assistedStageValidation';
import { assistedWorkingOrigin, projectAssistedWorkingOrigin } from './assistedWorkingOrigin';

export type AssistedPlanningErrorCode = "ROUND_STRUCTURE_CERTIFICATE_INVALID" | "ROUND_STRUCTURE_PROTECTED_DECISIONS" | "STALE_ROUND_STRUCTURE_REPLAY" | keyof typeof bootstrapAdditionReasons | "ASSISTED_ACCEPT_FORBIDDEN" | "HARD_ADMIN_AUTHORIZATION_REQUIRED" | "SESSION_NOT_FOUND" | "STALE_DRAFT" | "STALE_BASE_STAGE" | "STALE_CONFIG_REVISION" | "STALE_VALIDATION" | "VALIDATION_REQUIRED" | "VALIDATION_NOT_ACCEPTABLE" | "HARD_CONFIRMATION_REQUIRED" | "REQUIRED_CONFIRMATION_REQUIRED" | "RUN_RESULT_INVALID" | "UNSUPPORTED_ENGINE_INPUT" | "TASK_SET_MISMATCH" | "IMMUTABLE_TASK" | "UNSUPPORTED_MANUAL_FIELD" | "INVALID_MANUAL_DURATION" | "INVALID_MANUAL_RESET" | "INVALID_BLOCK_OPERATION" | "PLANNING_BLOCK_ORDER_CONFLICT" | "CORRUPT_EDIT_LEDGER" | "ASSISTED_DELTA_VALIDATION_UNSUPPORTED" | "INVALID_STAGE_TARGET" | "NO_REDO_AVAILABLE" | "NO_UNDO_AVAILABLE" | "CONCURRENT_ACCEPT" | "STALE_OBLIGATION_SOURCES" | "RESTORE_EXECUTION_CONFLICT" | "RESTART_PROTECTED_DAY" | "RESTART_RUNNING_PROPOSAL";
export class AssistedPlanningError extends Error {
  constructor(readonly code: AssistedPlanningErrorCode, readonly status: 403 | 404 | 409 | 422,
    readonly validationDiagnostics?:{phase:string;reasonCodes:readonly string[]}) { super(code); this.name = "AssistedPlanningError"; }
}
const statuses: Record<AssistedPlanningErrorCode, 403 | 404 | 409 | 422> = {
  ...Object.fromEntries(Object.keys(bootstrapAdditionReasons).map(code => [code, 409])) as Record<keyof typeof bootstrapAdditionReasons, 409>,
  ROUND_STRUCTURE_CERTIFICATE_INVALID:422, ROUND_STRUCTURE_PROTECTED_DECISIONS:409, STALE_ROUND_STRUCTURE_REPLAY:409,
  ASSISTED_ACCEPT_FORBIDDEN: 403, HARD_ADMIN_AUTHORIZATION_REQUIRED: 403,
  SESSION_NOT_FOUND: 404, STALE_DRAFT: 409, STALE_BASE_STAGE: 409, STALE_VALIDATION: 409,
  STALE_CONFIG_REVISION: 409, VALIDATION_REQUIRED: 422, VALIDATION_NOT_ACCEPTABLE: 422, RUN_RESULT_INVALID: 422, UNSUPPORTED_ENGINE_INPUT: 422, TASK_SET_MISMATCH: 409,
  STALE_OBLIGATION_SOURCES:409, RESTORE_EXECUTION_CONFLICT:422,
  RESTART_PROTECTED_DAY: 422, RESTART_RUNNING_PROPOSAL: 409,
  INVALID_STAGE_TARGET: 422, NO_REDO_AVAILABLE: 409, CONCURRENT_ACCEPT: 409,
  IMMUTABLE_TASK: 422, UNSUPPORTED_MANUAL_FIELD: 422, INVALID_MANUAL_DURATION: 422, INVALID_MANUAL_RESET: 422, CORRUPT_EDIT_LEDGER: 409,
  ASSISTED_DELTA_VALIDATION_UNSUPPORTED: 422, NO_UNDO_AVAILABLE: 409,
  INVALID_BLOCK_OPERATION: 422,
  PLANNING_BLOCK_ORDER_CONFLICT: 422,
  HARD_CONFIRMATION_REQUIRED: 422, REQUIRED_CONFIRMATION_REQUIRED: 422,
};
function dbError(error: any): never {
  if(error?.code === "55P03" || error?.code === "40P01") throw new AssistedPlanningError("REBOOTSTRAP_STALE_SOURCES",409);
  const code = (Object.keys(statuses) as AssistedPlanningErrorCode[]).find((candidate) => String(error?.message ?? "").includes(candidate));
  if (code) throw new AssistedPlanningError(code, statuses[code]);
  throw error;
}
function provenance(authority: string) { return { authority, authorityContractVersion: 1 }; }

export type DraftChange = { taskId: number; startPlanned?: string | null; endPlanned?: string | null; zoneId?: number | null; spaceId?: number | null; locationLabel?: string | null; durationOverride?: number | null; camerasOverride?: number | null };
type AssistedRpc = (name: string, parameters: Record<string, unknown>) => Promise<{ error: unknown; data?: any }>;
type AssistedPlanningServiceDependencies = {
  lookupRole?: typeof getUserRole;
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
  private async assertNominalDraftWitness(planId:number,session:any,input?:Awaited<ReturnType<typeof buildEngineInput>>){
    input??=await this.buildInput(planId);
    if(!input.tasks.some(task=>task.resourceRequirements?.anyOf?.length||Object.keys(task.resourceRequirements?.byType??{}).length))return;
    if(session.draftScopeJson?.editKind==='MANUAL')return; // Manual validator separately fails closed on uncertified future.
    const runId=Number(session.draftScopeJson?.proposalRunId);
    try{await assertPersistedNominalProposalWitness(planId,runId,input,session.draftSnapshotJson);}
    catch{throw new AssistedPlanningError('RUN_RESULT_INVALID',422);}
  }

  /** Read-only recommendation. The operator sees the selection before generating. */
  async recommendNextScope(planId:number) {
    const [input,session]=await Promise.all([this.buildInput(planId),this.storage.getActiveAssistedPlanningSession(planId)]);
    if(!session)throw new AssistedPlanningError('SESSION_NOT_FOUND',404);
    const eligible=input.tasks.filter(t=>t.id>0&&(t.status==='pending'||t.status==='interrupted')).map(t=>t.id);
    const recommendation=recommendNextAssistedScope(input,session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1,eligible);
    return {selector:recommendation?.selector??null,taskIds:recommendation?.memberTaskIds??[],
      expectedDraftFingerprint:session.draftFingerprint,expectedBaseStageId:session.draftBaseStageId};
  }

  async start(planId: number, userId: string) {
    const existing = await this.storage.getActiveAssistedPlanningSession(planId);
    if (existing) return this.state(planId);
    const {data: sourceToken, error: sourceError} = await this.rpc("assisted_bootstrap_source_token", {p_plan_id:planId});
    if (sourceError) dbError(sourceError);
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
    const { error } = await this.rpc("assisted_guarded_bootstrap_session", { p_source_token:sourceToken, p_plan_id: planId, p_user_id: userId, p_identity: identity, p_replay: replay, p_snapshot: snapshot, p_fingerprint: fingerprintAssistedPlanningSnapshotV1(snapshot) });
    if (error) dbError(error);
    return this.state(planId);
  }

  private async additionsCandidate(planId: number) {
    const read = async () => {
      const {data,error} = await this.rpc("assisted_preview_bootstrap_additions", {p_plan_id:planId});
      if(error) dbError(error);
      return data as BootstrapAdditionsPreview;
    };
    const preview = await read();
    if (!preview.allowed) return {preview};
    const [input, optimizerSnapshot, taskTemplateSnapshots, tasks] = await Promise.all([
      this.buildInput(planId), this.storage.getPlanOptimizerSnapshot(planId),
      this.storage.getPlanTaskTemplateSnapshots(planId), this.storage.getTasksForPlan(planId),
    ]);
    const revisionInput = {planId, optimizerSnapshot, taskTemplateSnapshots,
      optimizerProvenance:provenance("plan_optimizer_snapshots"), taskTemplateProvenance:provenance("plan_task_template_snapshots"),
      authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
    const identity = (this.dependencies.buildConfigRevision ?? buildEffectivePlanConfigRevisionV1)(revisionInput);
    const replay = buildEffectivePlanConfigReplaySnapshotV1(revisionInput);
    const snapshot = buildAssistedPlanningSnapshotV1(tasks);
    const after = await read();
    if (JSON.stringify(preview) !== JSON.stringify(after)) throw new AssistedPlanningError("REBOOTSTRAP_STALE_SOURCES",409);
    if (plannerReadiness(input,{status:"READY",issues:[]}).status !== "READY")
      return {preview:{...preview,allowed:false,reason:"UNSUPPORTED_ENGINE_INPUT" as const}};
    if(preview.mode === 'POST_STAGE') {
      const stages = await this.storage.listAssistedPlanningStages(preview.expectedSessionId);
      const pending = [...(preview.pendingTaskSnapshots ?? []), ...snapshot.tasks.filter(task => preview.addedTaskIds.includes(task.taskId))];
      const projections = Object.fromEntries(stages.map(stage => [String(stage.id), projectAssistedWorkingOrigin(stage.snapshotJson as unknown as AssistedPlanningSnapshotV1, pending)]));
      return {preview,identity,replay,snapshot,projections};
    }
    return {preview,identity,replay,snapshot,projections:undefined};
  }

  async previewAdditions(planId: number) { return (await this.additionsCandidate(planId)).preview; }

  async incorporateAdditions(planId:number, userId:string, expected:BootstrapAdditionsPreview) {
    const role = await (this.dependencies.lookupRole ?? getUserRole)(userId);
    if(role!=="admin" && role!=="production") throw new AssistedPlanningError("ASSISTED_ACCEPT_FORBIDDEN",403);
    const candidate = await this.additionsCandidate(planId);
    const {preview,identity,replay,snapshot,projections} = candidate;
    if (preview.expectedSessionId!==expected.expectedSessionId || preview.expectedBaseStageId!==expected.expectedBaseStageId)
      throw new AssistedPlanningError("STALE_BASE_STAGE",409);
    if(preview.expectedDraftFingerprint!==expected.expectedDraftFingerprint) throw new AssistedPlanningError("STALE_DRAFT",409);
    if(preview.expectedConfigRevisionId!==expected.expectedConfigRevisionId) throw new AssistedPlanningError("STALE_CONFIG_REVISION",409);
    if(preview.sourceToken!==expected.sourceToken) throw new AssistedPlanningError("REBOOTSTRAP_STALE_SOURCES",409);
    if(JSON.stringify(preview.addedTaskIds)!==JSON.stringify(expected.addedTaskIds)) throw new AssistedPlanningError("REBOOTSTRAP_STALE_SOURCES",409);
    if(!preview.allowed || !snapshot) throw new AssistedPlanningError(preview.reason ?? "REBOOTSTRAP_STALE_SOURCES",409);
    const {error} = await this.rpc(preview.mode==='POST_STAGE'?"assisted_incorporate_stage_additions":"assisted_rebootstrap_additions", {p_plan_id:planId,p_user_id:userId,
      p_expected_session:expected.expectedSessionId,p_expected_base:expected.expectedBaseStageId,
      p_expected_fingerprint:expected.expectedDraftFingerprint,p_expected_config:expected.expectedConfigRevisionId,
      p_source_token:expected.sourceToken,p_identity:identity,p_replay:replay,p_snapshot:snapshot,
      p_fingerprint:fingerprintAssistedPlanningSnapshotV1(snapshot),
      ...(projections?{p_added_task_ids:expected.addedTaskIds,p_projections:projections}:{})});
    if(error) dbError(error);
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
    const acceptedExceptions=(await Promise.all(lineage.map(async stage=>(await this.storage.listPlanningAcceptedExceptions(stage.id)??[]).filter(item=>item.status==="ACTIVE"&&item.severity==="HARD"&&affectedTasksUnchanged(stage.snapshotJson,session.draftSnapshotJson,item.affectedTaskIdsJson))))).flat();
    return { session, activeStage, draft: session.draftSnapshotJson, draftBaseStageId: session.draftBaseStageId,
      draftFingerprint: session.draftFingerprint, currentConfigRevisionId: session.currentConfigRevisionId, validation,
      workingOrigin: activeStage ? {...assistedWorkingOrigin(session,activeStage), transitionId:session.obligationTransitionId ?? null,
        restoredStageId:activeStage.id, restoredStageFingerprint:activeStage.snapshotFingerprint,
        pendingLaterTaskIds:(session.workingSnapshotJson as unknown as AssistedPlanningSnapshotV1 | null)?.tasks.filter(task=>!(activeStage.snapshotJson as unknown as AssistedPlanningSnapshotV1).tasks.some(old=>old.taskId===task.taskId)).map(task=>task.taskId)??[]} : null,
      acceptedExceptions: (acceptedExceptions ?? []).filter(item=>item.status==="ACTIVE"), history: stages };
  }

  async historyTimings(planId: number) {
    const timings = await this.storage.getAssistedPlanningHistoryTimings(planId);
    if (!timings) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    return timings;
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
    const snapshot = rebuildAssistedPlanningSnapshotV1({ ...current, tasks: current.tasks.map(task => ({ ...task, ...(byId.get(task.taskId) ?? {}) })) });
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
    const snapshot = rebuildAssistedPlanningSnapshotV1(result.snapshot);
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
    const baseSnapshot=assistedWorkingOrigin(session,base).snapshot;
    const snapshot = rebuildAssistedPlanningSnapshotV1(baseSnapshot);
    const fingerprint = fingerprintAssistedPlanningSnapshotV1(snapshot);
    if (fingerprint !== assistedWorkingOrigin(session,base).fingerprint) throw new AssistedPlanningError("CORRUPT_EDIT_LEDGER", 409);
    const { error } = await this.rpc("assisted_patch_draft", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint,
      p_expected_base: expectedBaseStageId, p_snapshot: snapshot, p_fingerprint: fingerprint });
    if (error) dbError(error);
    return this.state(planId);
  }
  async accept(planId: number, userId: string, expectedDraftFingerprint: string, expectedBaseStageId: number,
    confirmation: "NONE"|"REQUIRED_DEVIATIONS"|"HARD_EXCEPTIONS" = "NONE") {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    const validation = session?.draftValidationId ? await this.storage.getPlanningStageValidation(session.draftValidationId) : null;
    const current = session && validation && validation.sessionId === session.id && validation.planId === planId
      && validation.draftFingerprint === session.draftFingerprint && validation.draftFingerprint === expectedDraftFingerprint
      && validation.baseStageId === session.draftBaseStageId && validation.baseStageId === expectedBaseStageId
      && validation.configRevisionId === session.currentConfigRevisionId;
    // Re-read server authority immediately before the privileged RPC. Never
    // authorize a critical decision from client state, a JWT role or middleware cache.
    const role = await (this.dependencies.lookupRole ?? getUserRole)(userId);
    if (role !== 'admin' && role !== 'production') throw new AssistedPlanningError('ASSISTED_ACCEPT_FORBIDDEN', 403);
    // Until nominal delegation exists, only admin may supply the RPC's critical
    // confirmation. This also closes a clean-report -> new-HARD race: the RPC
    // rechecks its locked validation and cannot accept a new HARD with NONE/REQUIRED.
    if (role !== 'admin' && (confirmation === 'HARD_EXCEPTIONS' || (current && newStageDeviationCounts(validation).newHardCount > 0)))
      throw new AssistedPlanningError('HARD_ADMIN_AUTHORIZATION_REQUIRED', 403);
    if(validation?.reportJson?.nominalResourceFuture==='CERTIFIED'&&session)await this.assertNominalDraftWitness(planId,session);
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
    const sourceCheck=session.workingSnapshotJson?await this.rpc('assisted_bootstrap_source_token',{p_plan_id:planId}):null;
    if(sourceCheck?.error)dbError(sourceCheck.error);
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
      await this.assertNominalDraftWitness(planId,session,input);
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
    const baseSnapshot = assistedWorkingOrigin(session,base).snapshot;
    const baseById = new Map(baseSnapshot.tasks.map(task => [task.taskId, task]));
    const touched = draft.tasks.filter(task => {
      const prior = baseById.get(task.taskId);
      return prior && (prior.startPlanned !== task.startPlanned || prior.endPlanned !== task.endPlanned);
    }).map(task => task.taskId).concat(((session.draftScopeJson as any)?.manualTouchedTaskIds ?? []) as number[]).filter((id,index,all)=>all.indexOf(id)===index).sort((a,b)=>a-b);
    if (touched.length === 0) throw new AssistedPlanningError("VALIDATION_REQUIRED", 422);
    let evidence;
    try{evidence=(this.dependencies.validateManual??validateManualAssistedDelta)(input,draft,touched);}
    catch(error){
      if(error instanceof ManualValidationUnsupportedError)throw new AssistedPlanningError('ASSISTED_DELTA_VALIDATION_UNSUPPORTED',422,{phase:error.phase,reasonCodes:error.reasonCodes});
      throw error;
    }
    if(!evidence)throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422,{phase:'REPRESENTATION',reasonCodes:[]});
    const normalized=(evidence as any).structuredViolations as import("../shared/assistedStageValidation").StageViolation[];
    if(!Array.isArray(normalized))throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422,{phase:'STRUCTURED_REPORT',reasonCodes:[]});
    if(((evidence as any).validationSummary?.unstructuredReasonCodes?.length??0)>0)
      throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED",422,{phase:'RULE_IDENTITY',reasonCodes:evidence.validationSummary.unstructuredReasonCodes!});
    const lineage=resolveActiveStageLineage(await this.storage.listAssistedPlanningStages(session.id) as any,expectedBaseStageId);
    // The revision is immutable provenance, not an applicability gate. An untouched
    // placement remains grandfathered; exact violation identity below prevents a
    // materially different rule result from inheriting the old decision.
    const accepted=(await Promise.all(lineage.map(async origin=>(await this.storage.listPlanningAcceptedExceptions(origin.id)??[]).filter(item=>item.status==="ACTIVE"&&affectedTasksUnchanged(origin.snapshotJson,draft,item.affectedTaskIdsJson))))).flat();
    const draftById=new Map(draft.tasks.map(task=>[task.taskId,task]));
    const violations=normalized.map(violation=>{
      const inherited=accepted.find(item=>item.severity===violation.severity&&item.violationKey===violation.violationKey);
      const taskChanges=violation.affectedTaskIds.flatMap(taskId=>{
        const before=baseById.get(taskId),after=draftById.get(taskId);
        return before&&after&&(before.startPlanned!==after.startPlanned||before.endPlanned!==after.endPlanned)
          ?[{taskId,before:{start:before.startPlanned,end:before.endPlanned},after:{start:after.startPlanned,end:after.endPlanned}}]:[];
      });
      return {...violation,details:{...violation.details,taskChanges},inheritedAcceptedExceptionId:inherited?.id??null};
    });
    const hardCount=violations.filter(item=>item.severity==="HARD").length,requiredCount=violations.filter(item=>item.severity==="REQUIRED").length;
    const newHardCount=violations.filter(item=>item.severity==="HARD"&&item.inheritedAcceptedExceptionId==null).length;
    const newRequiredCount=violations.filter(item=>item.severity==="REQUIRED"&&item.inheritedAcceptedExceptionId==null).length;
    const report:StageValidationReport={...(sourceCheck?.data?{sourceToken:sourceCheck.data}:{}),contractVersion:1,mode:"MANUAL_STAGE_VALIDATION_V1",changedTaskIds:touched,completeForScope:evidence.completeForScope,
      protectedPlacementsPreserved:evidence.protectedPlacementsPreserved,hardValid:hardCount===0,hardCount,requiredCount,newHardCount,newRequiredCount,preferredCount:evidence.validationSummary?.operationContinuity?.filter(group=>group.policy==="PREFERRED"&&group.gapMinutes>0).length??0,violations,
      preferredAssessment:evidence.validationSummary?.operationContinuity?"OPERATION_CONTINUITY_QUANTIFIED":"NOT_CLASSIFIED",
      ...(evidence.validationSummary?.operationContinuity?{operationContinuity:evidence.validationSummary?.operationContinuity}:{}),supportingTaskIds:evidence.supportingTaskIds,supportingReasonByTaskId:evidence.supportingReasonByTaskId,
      reasonCodes:evidence.reasonCodes,work:evidence.work,fingerprint:evidence.fingerprint,futureFullDayFeasibility:"NOT_CERTIFIED"};
    const { error } = await this.rpc("assisted_record_stage_validation", { p_plan_id: planId,
      p_expected_fingerprint: expectedDraftFingerprint,p_expected_base:expectedBaseStageId,
      p_expected_config:session.currentConfigRevisionId,p_report:report });
    if (error) dbError(error);
    const state = await this.state(planId);
    return { current: true, mode: "MANUAL_STAGE_VALIDATION_V1", validation: state.validation };
  }
  async restart(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number) {
    const { error } = await this.rpc("assisted_restart_bootstrap", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId });
    if (error) dbError(error);
    return this.state(planId);
  }

  async rollback(planId: number, targetStageId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: targetStageId, p_redo: false }); if (error) dbError(error); return this.state(planId); }
  async redo(planId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: null, p_redo: true }); if (error) dbError(error); return this.state(planId); }
  async undoDraft(planId:number,expectedDraftFingerprint:string,expectedBaseStageId:number) { const {error}=await this.rpc("assisted_move_draft_edit",{p_plan_id:planId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId,p_redo:false});if(error)dbError(error);return this.state(planId); }
  async redoDraft(planId:number,expectedDraftFingerprint:string,expectedBaseStageId:number) { const {error}=await this.rpc("assisted_move_draft_edit",{p_plan_id:planId,p_expected_fingerprint:expectedDraftFingerprint,p_expected_base:expectedBaseStageId,p_redo:true});if(error)dbError(error);return this.state(planId); }
}
