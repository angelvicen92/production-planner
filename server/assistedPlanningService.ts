import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { buildEngineInput } from "../engine/buildInput";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

export type AssistedPlanningErrorCode = "SESSION_NOT_FOUND" | "STALE_DRAFT" | "STALE_BASE_STAGE" | "STALE_CONFIG_REVISION" | "STALE_VALIDATION" | "VALIDATION_REQUIRED" | "VALIDATION_NOT_ACCEPTABLE" | "RUN_RESULT_INVALID" | "UNSUPPORTED_ENGINE_INPUT" | "TASK_SET_MISMATCH" | "IMMUTABLE_TASK" | "ASSISTED_DELTA_VALIDATION_UNSUPPORTED" | "INVALID_STAGE_TARGET" | "NO_REDO_AVAILABLE" | "CONCURRENT_ACCEPT";
export class AssistedPlanningError extends Error {
  constructor(readonly code: AssistedPlanningErrorCode, readonly status: 404 | 409 | 422) { super(code); this.name = "AssistedPlanningError"; }
}
const statuses: Record<AssistedPlanningErrorCode, 404 | 409 | 422> = {
  SESSION_NOT_FOUND: 404, STALE_DRAFT: 409, STALE_BASE_STAGE: 409, STALE_VALIDATION: 409,
  STALE_CONFIG_REVISION: 409, VALIDATION_REQUIRED: 422, VALIDATION_NOT_ACCEPTABLE: 422, RUN_RESULT_INVALID: 422, UNSUPPORTED_ENGINE_INPUT: 422, TASK_SET_MISMATCH: 409,
  INVALID_STAGE_TARGET: 422, NO_REDO_AVAILABLE: 409, CONCURRENT_ACCEPT: 409,
  IMMUTABLE_TASK: 422, ASSISTED_DELTA_VALIDATION_UNSUPPORTED: 422,
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
    return { session, activeStage, draft: session.draftSnapshotJson, draftBaseStageId: session.draftBaseStageId,
      draftFingerprint: session.draftFingerprint, currentConfigRevisionId: session.currentConfigRevisionId, validation, history: stages };
  }

  async patchDraft(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number, changes: DraftChange[]) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    const ids = new Set<number>();
    for (const change of changes) { if (ids.has(change.taskId)) throw new AssistedPlanningError("TASK_SET_MISMATCH", 409); ids.add(change.taskId); }
    const current = session.draftSnapshotJson as unknown as AssistedPlanningSnapshotV1;
    const known = new Set(current.tasks.map((task) => task.taskId));
    if ([...ids].some((id) => !known.has(id))) throw new AssistedPlanningError("TASK_SET_MISMATCH", 409);
    const byId = new Map(changes.map((change) => [change.taskId, change]));
    const snapshot = buildAssistedPlanningSnapshotV1(current.tasks.map((task) => ({ id: task.taskId, ...task, ...(byId.get(task.taskId) ?? {}) })));
    const fingerprint = fingerprintAssistedPlanningSnapshotV1(snapshot);
    const { error } = await this.rpc("assisted_patch_draft", { p_plan_id: planId, p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId, p_snapshot: snapshot, p_fingerprint: fingerprint });
    if (error) dbError(error); return this.state(planId);
  }
  async accept(planId: number, userId: string, expectedDraftFingerprint: string, expectedBaseStageId: number) {
    const { error } = await this.rpc("assisted_accept_stage", { p_plan_id: planId, p_user_id: userId, p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId });
    if (error) dbError(error); return this.state(planId);
  }
  async validateDraft(planId: number, expectedDraftFingerprint: string, expectedBaseStageId: number) {
    const session = await this.storage.getActiveAssistedPlanningSession(planId);
    if (!session) throw new AssistedPlanningError("SESSION_NOT_FOUND", 404);
    if (session.draftFingerprint !== expectedDraftFingerprint) throw new AssistedPlanningError("STALE_DRAFT", 409);
    if (session.draftBaseStageId !== expectedBaseStageId) throw new AssistedPlanningError("STALE_BASE_STAGE", 409);
    if ((session.draftScopeJson as any)?.editKind === "MANUAL") {
      // ASST-007 fails closed until every capability touched by the bounded
      // delta can be represented losslessly by the scoped Planner Next input.
      throw new AssistedPlanningError("ASSISTED_DELTA_VALIDATION_UNSUPPORTED", 422);
    }
    const [input, optimizerSnapshot, taskTemplateSnapshots, persistedRevision] = await Promise.all([
      this.buildInput(planId), this.storage.getPlanOptimizerSnapshot(planId),
      this.storage.getPlanTaskTemplateSnapshots(planId), this.storage.getPlanConfigRevision(session.currentConfigRevisionId),
    ]);
    const actual = (this.dependencies.buildConfigRevision ?? buildEffectivePlanConfigRevisionV1)({ planId, optimizerSnapshot, taskTemplateSnapshots,
      optimizerProvenance: provenance("plan_optimizer_snapshots"), taskTemplateProvenance: provenance("plan_task_template_snapshots"),
      authorities: projectEffectiveAuthoritiesFromEngineInputV1(input) });
    if (!persistedRevision || persistedRevision.planId !== planId || persistedRevision.fingerprint !== actual.configurationFingerprint)
      throw new AssistedPlanningError("STALE_CONFIG_REVISION", 409);
    const { error } = await this.rpc("assisted_record_proposal_clean_validation", { p_plan_id: planId,
      p_expected_fingerprint: expectedDraftFingerprint, p_expected_base: expectedBaseStageId,
      p_expected_config: session.currentConfigRevisionId });
    if (error) dbError(error);
    const state = await this.state(planId);
    return { current: true, mode: "PROPOSAL_CERTIFIED_CLEAN_V1", validation: state.validation };
  }
  async rollback(planId: number, targetStageId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: targetStageId, p_redo: false }); if (error) dbError(error); return this.state(planId); }
  async redo(planId: number) { const { error } = await this.rpc("assisted_move_stage", { p_plan_id: planId, p_target: null, p_redo: true }); if (error) dbError(error); return this.state(planId); }
}
