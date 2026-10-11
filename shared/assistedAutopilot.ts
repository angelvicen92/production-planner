import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshotContracts";
import type { AssistedProposalRunResultV1, AssistedScopeSelector } from "./assistedProposalContracts";
import { isPlanningRunStale } from "./planning-run-state";

type Stage = {
  id: number; ordinal: number; parentStageId?: number | null; proposalRunId?: number | null;
  snapshotFingerprint: string; snapshotJson: AssistedPlanningSnapshotV1;
};
export interface AutopilotState {
  session: { id: number; status: string };
  activeStage: Stage;
  draft: AssistedPlanningSnapshotV1;
  draftFingerprint: string;
  draftBaseStageId: number;
  currentConfigRevisionId: number;
  history: Stage[];
  acceptedExceptions: unknown[];
  validation: null | {
    id: number; draftFingerprint: string; baseStageId: number; configRevisionId: number;
    hardCount: number; requiredCount: number; reportJson: Record<string, unknown>;
  };
}
export interface AutopilotPlan {
  dailyTasks: Array<Record<string, any> & { id: number; status: string }>;
  [key: string]: any;
}
export interface AutopilotRecommendation {
  selector: AssistedScopeSelector | null; taskIds: number[];
  expectedDraftFingerprint: string; expectedBaseStageId: number;
}
export interface AutopilotRun {
  id: number; status: string; assisted_session_id: number; base_stage_id: number;
  config_revision_id: number; source_draft_fingerprint: string;
  assisted_result_json: AssistedProposalRunResultV1 | null;
  updated_at?: string; started_at?: string; message?: string;
}
type Guard = { expectedDraftFingerprint: string; expectedBaseStageId: number };
export interface AutopilotApi {
  state(): Promise<AutopilotState>;
  plan(): Promise<AutopilotPlan>;
  nextScope(): Promise<AutopilotRecommendation>;
  propose(body: Guard & { selector: AssistedScopeSelector; includePrerequisites: false }): Promise<{ runId: number }>;
  run(id: number): Promise<AutopilotRun>;
  apply(id: number, body: Guard): Promise<unknown>;
  validate(body: Guard): Promise<unknown>;
  accept(body: Guard & { confirmation: "NONE" }): Promise<unknown>;
}
export type AutopilotPhase = "READING" | "SELECTING" | "GENERATING" | "APPLYING" | "VALIDATING" | "ACCEPTING" | "VERIFYING" | "STOPPED" | "FAILED" | "COMPLETE";
export interface AutopilotProgress {
  phase: AutopilotPhase; stage: number; completed: number; total: number;
  scope: AssistedScopeSelector | null; scopeTaskIds: number[]; runId: number | null;
  stopRequested: boolean; message: string; code?: string;
  /** Keep the actual persisted run Evidence available after any stop. */
  result?: AssistedProposalRunResultV1;
}

class Halt extends Error {}
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Halt(code); }
// Key order from jsonb is not stable; array order and every field remain material.
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const placed = (task: { startPlanned?: unknown; endPlanned?: unknown }) => Boolean(task.startPlanned && task.endPlanned);
const guard = (s: AutopilotState): Guard => ({ expectedDraftFingerprint: s.draftFingerprint, expectedBaseStageId: Number(s.draftBaseStageId) });

export function isAutopilotClean(s: AutopilotState | undefined): boolean {
  return Boolean(s?.session.status === "ACTIVE" && s.activeStage && Number(s.activeStage.id) === Number(s.draftBaseStageId)
    && s.activeStage.snapshotFingerprint === s.draftFingerprint && equal(s.activeStage.snapshotJson, s.draft));
}
function protectedSnapshot(before: AssistedPlanningSnapshotV1, after: AssistedPlanningSnapshotV1) {
  assert(equal(before.tasks.map(t => t.taskId).sort((a, b) => a - b), after.tasks.map(t => t.taskId).sort((a, b) => a - b)), "TASK_SET_MISMATCH");
  for (const task of before.tasks.filter(placed)) assert(equal(task, after.tasks.find(t => t.taskId === task.taskId)), "PROTECTION_CHANGED");
  for (const field of ["planningBlocks", "operationalMeals", "setupPreparations", "roundPreparations"] as const)
    for (const item of before[field] ?? []) assert((after[field] ?? []).some(next => equal(item, next)), "PROTECTION_CHANGED");
}
function progress(s: AutopilotState, plan: AutopilotPlan) {
  assert(equal(plan.dailyTasks.map(t => Number(t.id)).sort((a, b) => a - b), s.draft.tasks.map(t => t.taskId).sort((a, b) => a - b)), "TASK_SET_MISMATCH");
  const eligible = plan.dailyTasks.filter(t => t.status === "pending" || t.status === "interrupted");
  const pending = eligible.filter(t => !placed(s.draft.tasks.find(row => row.taskId === Number(t.id))!)).map(t => Number(t.id));
  return { pending, completed: plan.dailyTasks.length - pending.length, total: plan.dailyTasks.length };
}
function persisted(s: AutopilotState, plan: AutopilotPlan) {
  for (const task of s.activeStage.snapshotJson.tasks) {
    const row = plan.dailyTasks.find(t => Number(t.id) === task.taskId);
    assert(row, "TASK_SET_MISMATCH");
    for (const field of ["startPlanned", "endPlanned", "zoneId", "spaceId", "locationLabel", "durationOverride", "camerasOverride"] as const)
      assert((row[field] ?? null) === task[field], "PERSISTENCE_CHANGED");
    assert(equal([...(row.assignedResources ?? row.assignedResourceIds ?? [])].sort((a, b) => a - b), [...(task.assignedResourceIds ?? [])].sort((a, b) => a - b)), "PERSISTENCE_CHANGED");
  }
}
export function autopilotErrorMessage(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string };
  const code = String(e?.code ?? e?.message ?? error);
  if (e?.status === 401 || e?.status === 403 || code === "UNAUTHORIZED") return "La ejecución se detuvo: necesitas permisos vigentes para aceptar etapas.";
  if (/STALE_|CONCURRENT|PERSISTENCE_CHANGED|TASK_SET_MISMATCH/.test(code)) return "La ejecución se detuvo porque el borrador, la etapa, las tareas o la configuración cambiaron. Revisa el estado actual antes de continuar.";
  if (code === "DIRTY_DRAFT") return "Acepta o revisa los cambios del borrador antes de iniciar la ejecución automática.";
  if (code === "EMPTY_SCOPE") return "El selector no encontró un alcance, pero quedan obligaciones pendientes. Se conservan las etapas y la Evidence para revisar el motivo.";
  if (code === "PROTECTION_CHANGED") return "La ejecución se detuvo porque una decisión previamente aceptada no se conservó literalmente.";
  if (/PROPOSAL|RUN_/.test(code)) return "La ejecución se detuvo porque el run no produjo una propuesta completa, certificada y aplicable. Revisa su Evidence.";
  if (/VALIDATION|ALERT|EXCEPTION/.test(code)) return "La ejecución se detuvo: la validación o las alertas requieren revisión humana. El borrador y las etapas aceptadas se conservan.";
  if (code === "NO_PROGRESS") return "La etapa no confirmó un avance persistido. Se ha detenido la ejecución para evitar repetir aceptaciones.";
  if (code === "ALREADY_RUNNING") return "Ya hay una ejecución automática activa para esta jornada.";
  return "La ejecución se detuvo por un error. Revisa el estado del servidor y la última ejecución antes de continuar.";
}

const owners = new Map<number, AssistedAutopilot>();
/** A tab owns a delegation. No mutation is retried, resumed in the background or
 * issued after disposal. Existing HTTP/RPC guards arbitrate other tabs/users. */
export class AssistedAutopilot {
  private running = false;
  private disposed = false;
  private stop = false;
  private last: AutopilotProgress = { phase: "READING", stage: 0, completed: 0, total: 0, scope: null, scopeTaskIds: [], runId: null, stopRequested: false, message: "Leyendo el estado actual…" };
  constructor(private readonly planId: number, private readonly api: AutopilotApi, private readonly options: {
    authorized: () => boolean;
    hasPendingAlerts: (plan: AutopilotPlan, draft: AssistedPlanningSnapshotV1) => boolean;
    onProgress: (value: AutopilotProgress) => void;
    wait?: () => Promise<void>;
  }) {}
  requestStop() { this.stop = true; this.emit(this.last.phase, "Se detendrá al terminar la etapa en curso."); }
  dispose() { this.disposed = true; }
  private check() { assert(!this.disposed, "DISPOSED"); assert(this.options.authorized(), "UNAUTHORIZED"); }
  private emit(phase: AutopilotPhase, message: string, patch: Partial<AutopilotProgress> = {}) {
    this.last = { ...this.last, ...patch, phase, message, stopRequested: this.stop };
    if (!this.disposed) this.options.onProgress(this.last);
  }
  private async call<T>(action: () => Promise<T>): Promise<T> { this.check(); const result = await action(); this.check(); return result; }
  private async read() {
    const s = await this.call(() => this.api.state());
    const plan = await this.call(() => this.api.plan());
    assert(s.session.status === "ACTIVE", "STALE_SESSION");
    return { s, plan, counts: progress(s, plan) };
  }
  private same(before: AutopilotState, after: AutopilotState, fingerprint = before.draftFingerprint) {
    assert(Number(before.session.id) === Number(after.session.id), "STALE_SESSION");
    assert(Number(before.currentConfigRevisionId) === Number(after.currentConfigRevisionId), "STALE_CONFIG_REVISION");
    assert(Number(before.draftBaseStageId) === Number(after.draftBaseStageId) && Number(before.activeStage.id) === Number(after.activeStage.id), "STALE_BASE_STAGE");
    assert(after.draftFingerprint === fingerprint, "STALE_DRAFT");
    assert(equal(before.history, after.history), "PROTECTION_CHANGED");
    assert(equal(before.acceptedExceptions, after.acceptedExceptions), "EXCEPTION_CHANGED");
  }
  async start(): Promise<AutopilotProgress> {
    if (this.running || owners.has(this.planId)) throw new Halt("ALREADY_RUNNING");
    this.running = true; owners.set(this.planId, this);
    try {
      let current = await this.read();
      assert(isAutopilotClean(current.s), "DIRTY_DRAFT");
      persisted(current.s, current.plan);
      const config = current.s.currentConfigRevisionId;
      while (true) {
        this.emit("READING", "Estado persistido comprobado.", { stage: current.s.activeStage.ordinal, completed: current.counts.completed, total: current.counts.total });
        assert(Number(current.s.currentConfigRevisionId) === Number(config), "STALE_CONFIG_REVISION");
        assert(isAutopilotClean(current.s), "DIRTY_DRAFT");
        persisted(current.s, current.plan);
        if (this.stop) { this.emit("STOPPED", "Ejecución detenida. Puedes continuar desde la última etapa aceptada."); break; }
        this.emit("SELECTING", "Seleccionando las siguientes obligaciones…");
        const scope = await this.call(() => this.api.nextScope());
        assert(scope.expectedDraftFingerprint === current.s.draftFingerprint && Number(scope.expectedBaseStageId) === Number(current.s.draftBaseStageId), "STALE_DRAFT");
        if (!scope.selector) {
          assert(current.counts.pending.length === 0 && scope.taskIds.length === 0, "EMPTY_SCOPE");
          const final = await this.read(); this.same(current.s, final.s);
          assert(isAutopilotClean(final.s) && final.counts.pending.length === 0, "STALE_DRAFT"); persisted(final.s, final.plan);
          assert(!this.options.hasPendingAlerts(final.plan, final.s.draft), "PENDING_ALERTS");
          this.emit("COMPLETE", "Todas las obligaciones están completadas y persistidas."); break;
        }
        assert(scope.taskIds.length > 0 && new Set(scope.taskIds).size === scope.taskIds.length && scope.taskIds.every(id => current.counts.pending.includes(id)), "EMPTY_SCOPE");
        this.emit("GENERATING", "Generando una propuesta certificada…", { scope: scope.selector, scopeTaskIds: scope.taskIds });
        const requested = await this.call(() => this.api.propose({ ...guard(current.s), selector: scope.selector!, includePrerequisites: false }));
        assert(Number.isInteger(Number(requested.runId)) && Number(requested.runId) > 0, "RUN_RESULT_INVALID");
        const runId = Number(requested.runId); this.emit("GENERATING", "Esperando el resultado del run…", { runId });
        let run: AutopilotRun | undefined;
        const pollingStartedAt = new Date().toISOString();
        const wait = () => this.call(this.options.wait ?? (() => new Promise<void>(resolve => setTimeout(resolve, 1000))));
        const runStale = () => isPlanningRunStale({ status: run?.status ?? "running", updatedAt: run?.updated_at ?? run?.started_at ?? pollingStartedAt });
        while (true) {
          try { run = await this.call(() => this.api.run(runId)); }
          catch (error) {
            // The synchronous product search can occupy the HTTP server longer
            // than one read request. An aborted GET does not cancel/fail the
            // persisted run. Poll again under the existing stale-run authority;
            // HTTP errors and every mutation failure still stop immediately.
            if ((error as any)?.name !== "AbortError" || this.disposed) throw error;
            assert(!runStale(), "RUN_STALE");
            this.emit("GENERATING", "Esperando el resultado de la ejecución; todavía no hay una nueva lectura del servidor…");
            await wait(); continue;
          }
          assert(Number(run.id) === runId && Number(run.assisted_session_id) === Number(current.s.session.id) && Number(run.base_stage_id) === Number(current.s.draftBaseStageId)
            && Number(run.config_revision_id) === Number(config) && run.source_draft_fingerprint === current.s.draftFingerprint, "STALE_RUN");
          if (run.status !== "running" && run.status !== "queued") break;
          assert(!runStale(), "RUN_STALE"); await wait();
        }
        const result = run.assisted_result_json;
        if (result) this.emit("GENERATING", "Resultado recibido.", { result });
        assert(run.status === "success", run.message ?? "RUN_FAILED");
        assert(result?.contractVersion === 1 && result.outcome === "PROPOSAL", "RUN_NO_PROPOSAL");
        const e = result.evidence;
        assert(result.includePrerequisites === false && equal([...result.scopeTaskIds].sort((a, b) => a - b), [...scope.taskIds].sort((a, b) => a - b))
          && result.proposal && result.proposedDraftSnapshot && result.proposedDraftFingerprint
          && e.proposalCount === 1 && e.completeForScope === true && e.protectedPlacementsPreserved === true
          && e.hardValid === true && e.requiredValid === true && e.proposalEligible === true && e.globalMealGate === "PASS"
          && e.newHardViolationCount === 0 && e.newRequiredViolationCount === 0
          && e.inheritedAcceptedHardViolationCount === 0 && e.inheritedAcceptedRequiredViolationCount === 0, "PROPOSAL_NOT_CLEAN");
        protectedSnapshot(current.s.draft, result.proposedDraftSnapshot);
        const fresh = await this.read(); this.same(current.s, fresh.s); persisted(fresh.s, fresh.plan);
        this.emit("APPLYING", "Aplicando la propuesta al borrador…");
        await this.call(() => this.api.apply(runId, guard(fresh.s)));
        const applied = await this.read(); this.same(current.s, applied.s, result.proposedDraftFingerprint);
        assert(equal(applied.s.draft, result.proposedDraftSnapshot), "STALE_DRAFT"); persisted(applied.s, applied.plan);
        assert(!this.options.hasPendingAlerts(applied.plan, applied.s.draft), "PENDING_ALERTS");
        this.emit("VALIDATING", "Validando el borrador con el servicio existente…");
        await this.call(() => this.api.validate(guard(applied.s)));
        const validated = await this.read(); this.same(applied.s, validated.s); persisted(validated.s, validated.plan);
        const v = validated.s.validation;
        assert(v && v.draftFingerprint === validated.s.draftFingerprint && Number(v.baseStageId) === Number(validated.s.draftBaseStageId)
          && Number(v.configRevisionId) === Number(config), "STALE_VALIDATION");
        assert(v.hardCount === 0 && v.requiredCount === 0 && v.reportJson.mode === "PROPOSAL_CERTIFIED_CLEAN_V1"
          && Number(v.reportJson.proposalRunId) === runId && !this.options.hasPendingAlerts(validated.plan, validated.s.draft), "VALIDATION_NOT_CLEAN");
        this.emit("ACCEPTING", "Aceptando la etapa limpia con tu delegación…");
        await this.call(() => this.api.accept({ ...guard(validated.s), confirmation: "NONE" }));
        this.emit("VERIFYING", "Comprobando avance y protección de las etapas aceptadas…");
        const after = await this.read();
        assert(Number(after.s.currentConfigRevisionId) === Number(config) && Number(after.s.session.id) === Number(current.s.session.id), "STALE_CONFIG_REVISION");
        assert(isAutopilotClean(after.s) && Number(after.s.activeStage.parentStageId) === Number(current.s.activeStage.id)
          && Number(after.s.activeStage.proposalRunId) === runId && after.s.activeStage.ordinal > current.s.activeStage.ordinal
          && equal(after.s.draft, validated.s.draft) && after.counts.completed > current.counts.completed, "NO_PROGRESS");
        for (const stage of current.s.history) {
          const preserved = after.s.history.find(row => Number(row.id) === Number(stage.id));
          assert(preserved && equal(stage.snapshotJson, preserved.snapshotJson) && stage.snapshotFingerprint === preserved.snapshotFingerprint, "PROTECTION_CHANGED");
        }
        assert(equal(current.s.acceptedExceptions, after.s.acceptedExceptions), "EXCEPTION_CHANGED");
        protectedSnapshot(current.s.activeStage.snapshotJson, after.s.activeStage.snapshotJson); persisted(after.s, after.plan);
        current = after;
        this.emit("VERIFYING", "Etapa aceptada y persistida.", { stage: after.s.activeStage.ordinal, completed: after.counts.completed, total: after.counts.total });
      }
    } catch (error) {
      if (!this.disposed) this.emit("FAILED", autopilotErrorMessage(error), { code: String((error as any)?.code ?? (error as any)?.message ?? error) });
    } finally {
      this.running = false;
      if (owners.get(this.planId) === this) owners.delete(this.planId);
    }
    return this.last;
  }
}
