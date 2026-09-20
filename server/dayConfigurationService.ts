import { buildEngineInput } from "../engine/buildInput";
import type { EngineInput } from "../engine/types";
import type { DayConfigEdit, DayConfigRefresh, DayConfigRestore } from "../shared/dayConfig";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { buildEffectivePlanConfigRevisionV1, projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import type { IStorage } from "./storage";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { normalizePlanOptimizerSnapshotV1, type PlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { buildPlanOptimizerRefreshPreviewV1 } from "./planOptimizerSnapshotRefreshPreview";

type Operation = "EDIT" | "RESTORE" | "REFRESH";
type OperationPayload = DayConfigEdit | DayConfigRestore | DayConfigRefresh;
type PlanRow = Record<string, unknown>;

const mapPlan = (p: PlanRow) => ({
  planId: Number(p.id),
  revisionId: p.current_config_revision_id == null ? null : Number(p.current_config_revision_id),
  workday: { effective: { start: p.work_start, end: p.work_end }, baseline: { start: p.work_baseline_start, end: p.work_baseline_end }, source: p.work_config_source, override: { by: p.work_override_by, at: p.work_override_at } },
  meal: { effective: { start: p.meal_start, end: p.meal_end, mode: p.meal_mode }, baseline: { start: p.meal_baseline_start, end: p.meal_baseline_end, mode: p.meal_baseline_mode }, source: p.meal_config_source, override: { by: p.meal_override_by, at: p.meal_override_at } },
});

const provenance = (authority: string) => ({ authority, authorityContractVersion: 1 });

export async function buildCanonicalPlanConfig(planId: number, repository: IStorage = storage, engineInput?: EngineInput, optimizerOverride?: PlanOptimizerSnapshotV1) {
  const [input, taskTemplateSnapshots, optimizerSnapshot] = await Promise.all([
    engineInput ?? buildEngineInput(planId, repository),
    repository.getPlanTaskTemplateSnapshots(planId),
    repository.getPlanOptimizerSnapshot(planId),
  ]);
  const revisionInput = {
    planId,
    taskTemplateSnapshots,
    optimizerSnapshot: optimizerOverride ?? optimizerSnapshot,
    taskTemplateProvenance: provenance("plan_task_template_snapshots"),
    optimizerProvenance: provenance("plan_optimizer_snapshots"),
    authorities: projectEffectiveAuthoritiesFromEngineInputV1(input),
  };
  return {
    input,
    identity: buildEffectivePlanConfigRevisionV1(revisionInput),
    replay: buildEffectivePlanConfigReplaySnapshotV1(revisionInput),
  };
}

export async function initializeDayConfigurationRevision(planId: number, actorId: string, repository: IStorage = storage) {
  const canonical = await buildCanonicalPlanConfig(planId, repository);
  const { data, error } = await supabaseAdmin.rpc("initialize_day_config_revision", {
    p_plan_id: planId, p_actor: actorId, p_identity: canonical.identity, p_replay: canonical.replay,
    p_diff: { workdaySource: "materialized", mealSource: "materialized" },
  });
  if (error) throw error;
  return Number(data);
}

export async function previewDayConfigurationRefresh(planId: number) {
  const [{ data: p, error: pe }, { data: g, error: ge }] = await Promise.all([
    supabaseAdmin.from("plans").select("*").eq("id", planId).single(),
    supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode").eq("id", 1).single(),
  ]);
  if (pe || !p) throw Object.assign(new Error("PLAN_NOT_FOUND"), { status: 404, cause: pe });
  if (ge || !g) throw ge;
  const current = mapPlan(p);
  return { ...current, generalCandidate: { workday: { start: g.default_work_start, end: g.default_work_end }, meal: { start: g.meal_start, end: g.meal_end, mode: g.meal_mode } }, effects: {
    WORKDAY_WINDOW: p.work_config_source === "LEGACY_BACKFILL" ? "REQUIRES_EXPLICIT_ADOPTION" : p.work_config_source === "DAY_OVERRIDE" ? "UPDATE_BASELINE_KEEP_EFFECTIVE" : "UPDATE_BASELINE_AND_EFFECTIVE",
    GLOBAL_MEAL_BREAK: p.meal_config_source === "LEGACY_BACKFILL" ? "REQUIRES_EXPLICIT_ADOPTION" : p.meal_config_source === "DAY_OVERRIDE" ? "UPDATE_BASELINE_KEEP_EFFECTIVE" : "UPDATE_BASELINE_AND_EFFECTIVE",
    OPTIMIZATION: "VALIDATED_BY_OPTIMIZER_PREVIEW",
  } };
}

function candidateInput(input: EngineInput, plan: PlanRow, general: PlanRow, operation: Operation, payload: OperationPayload): EngineInput {
  let start = String(plan.work_start), end = String(plan.work_end);
  let mealStart = String(plan.meal_start), mealEnd = String(plan.meal_end);
  let mealMode = String(plan.meal_mode) as EngineInput["mealMode"];
  if (operation === "EDIT") {
    const edit = payload as DayConfigEdit;
    if (edit.workday) ({ start, end } = edit.workday);
    if (edit.meal) ({ start: mealStart, end: mealEnd, mode: mealMode } = edit.meal);
  } else if (operation === "RESTORE") {
    if ((payload as DayConfigRestore).capability === "WORKDAY_WINDOW") {
      start = String(plan.work_baseline_start); end = String(plan.work_baseline_end);
    } else {
      mealStart = String(plan.meal_baseline_start); mealEnd = String(plan.meal_baseline_end);
      mealMode = String(plan.meal_baseline_mode) as EngineInput["mealMode"];
    }
  } else {
    const refresh = payload as DayConfigRefresh;
    const selected = new Set(refresh.capabilities);
    const adoptWork = plan.work_config_source !== "LEGACY_BACKFILL" || refresh.legacyTreatment === "ADOPT_GENERAL_AS_INHERITED";
    const adoptMeal = plan.meal_config_source !== "LEGACY_BACKFILL" || refresh.legacyTreatment === "ADOPT_GENERAL_AS_INHERITED";
    if (selected.has("WORKDAY_WINDOW") && adoptWork && plan.work_config_source !== "DAY_OVERRIDE") {
      start = String(general.default_work_start); end = String(general.default_work_end);
    }
    if (selected.has("GLOBAL_MEAL_BREAK") && adoptMeal && plan.meal_config_source !== "DAY_OVERRIDE") {
      mealStart = String(general.meal_start); mealEnd = String(general.meal_end);
      mealMode = String(general.meal_mode) as EngineInput["mealMode"];
    }
  }
  return { ...input, workDay: { start, end }, meal: { start: mealStart, end: mealEnd }, mealWindow: { start: mealStart, end: mealEnd }, mealMode };
}

export async function applyDayConfigurationOperation(planId: number, actorId: string, operation: Operation, payload: OperationPayload, repository: IStorage = storage) {
  const [{ data: plan, error: planError }, { data: general, error: generalError }, { data: optimizerState, error: optimizerStateError }] = await Promise.all([
    supabaseAdmin.from("plans").select("*").eq("id", planId).single(),
    supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode").eq("id", 1).single(),
    supabaseAdmin.from("plan_optimizer_snapshots").select("baseline_snapshot").eq("plan_id", planId).single(),
  ]);
  if (planError || !plan) throw Object.assign(new Error("PLAN_NOT_FOUND"), { status: 404, cause: planError });
  if (generalError || !general) throw generalError;
  if (optimizerStateError || !optimizerState) throw optimizerStateError;
  const current = await buildCanonicalPlanConfig(planId, repository);
  let effectiveOptimizer = current.replay.optimizerSnapshot;
  let optimizerBaseline: PlanOptimizerSnapshotV1 | undefined;
  const optimizerSelected = operation === "RESTORE"
    ? (payload as DayConfigRestore).capability === "OPTIMIZATION"
    : operation === "REFRESH"
      ? (payload as DayConfigRefresh).capabilities.includes("OPTIMIZATION")
      : (payload as DayConfigEdit).optimizer !== undefined;
  if (optimizerSelected) {
    const rawBaseline = (optimizerState as any).baseline_snapshot;
    if (operation === "RESTORE") {
      if (!rawBaseline || current.replay.optimizerSnapshot.source !== "DAY_OVERRIDE") throw Object.assign(new Error("OPTIMIZER_RESTORE_NOT_AVAILABLE"), { status: 409 });
      effectiveOptimizer = normalizePlanOptimizerSnapshotV1(rawBaseline, {}, "INHERITED");
    } else if (operation === "EDIT") {
      effectiveOptimizer = normalizePlanOptimizerSnapshotV1((payload as DayConfigEdit).optimizer, {}, "DAY_OVERRIDE");
    } else {
      const [settings, templates, input] = await Promise.all([repository.getOptimizerSettings(), repository.getPlanTaskTemplateSnapshots(planId), Promise.resolve(current.input)]);
      const preview = buildPlanOptimizerRefreshPreviewV1({currentSnapshot:current.replay.optimizerSnapshot,globalOptimizerSettings:settings,dailyTemplateSnapshots:templates.map(t=>({sourceTemplateId:t.sourceTemplateId,templateName:t.templateName,planTemplateSnapshotId:t.planTemplateSnapshotId})),dailyZoneIds:(input.planZoneSettings??[]).map(z=>z.zoneId)});
      if (preview.status !== "READY") throw Object.assign(new Error(preview.incompatibilities[0]?.code ?? "OPTIMIZER_REFRESH_BLOCKED"), { status: 422 });
      optimizerBaseline = normalizePlanOptimizerSnapshotV1(preview.candidate, {}, "INHERITED");
      effectiveOptimizer = current.replay.optimizerSnapshot.source === "DAY_OVERRIDE" ? current.replay.optimizerSnapshot : optimizerBaseline;
    }
  }
  const candidate = await buildCanonicalPlanConfig(planId, repository, candidateInput(current.input, plan, general, operation, payload), effectiveOptimizer);
  const { data, error } = await supabaseAdmin.rpc("apply_day_config_operation_v2", {
    p_plan_id: planId, p_actor: actorId, p_operation: operation, p_payload: {...payload,...(optimizerBaseline?{optimizerBaseline}: {})},
    p_expected_revision: plan.current_config_revision_id == null ? null : Number(plan.current_config_revision_id),
    p_expected_identity: current.identity, p_expected_replay: current.replay,
    p_candidate_identity: candidate.identity, p_candidate_replay: candidate.replay,
    p_diff: { operation, payload },
  });
  if (error) throw error;
  const { data: updated, error: updatedError } = await supabaseAdmin.from("plans").select("*").eq("id", planId).single();
  if (updatedError || !updated) throw updatedError;
  return { ...mapPlan(updated), revisionId: Number(data) };
}
