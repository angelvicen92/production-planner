import {dailyResourceRouteAuthority,withDailyResourceRoutes} from "./resourceRouteTransitions";
import {dailyOperationalMealsAuthority,withDailyOperationalMeals} from './operationalMealPolicy';
import {dailyJointAuthority,withDailyJointGroups} from "./jointGroupStructure";
import { dailyTechnicalChainAuthority, validateDailyTechnicalChains } from "./technicalChainStructure";
import {dailyAnchoredAuthority,withDailyAnchoredAccompaniments} from './anchoredAccompanimentStructure';
import {dailyTaskOperationScopesAuthority,withDailyTaskOperationScopes} from './dailyTaskOperationScopes';
import { validateDailyRoundStructure, dailyRoundAuthority } from "./roundSynchronizationStructure";
import { applyEffectiveOperationContinuity, candidateOperationContinuity } from "./operationContinuity";
import { transportBoundsSchema } from "../shared/transportPolicy";
import { mainFlowPreferenceFromRow } from "../shared/mainFlowPreference";
import { withMainFlowPreference, validateMainFlowPreference } from "./mainFlowPreference";
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
import { candidateRoundPreparations } from "./roundPreparation";
import { preflightEngineInputForPlannerNext } from "../engine/planner-next/integration/engineInputPreflight";

type Operation = "EDIT" | "RESTORE" | "REFRESH";
type OperationPayload = DayConfigEdit | DayConfigRestore | DayConfigRefresh;
type PlanRow = Record<string, unknown>;

const mapPlan = (p: PlanRow) => ({
  planId: Number(p.id),
  revisionId: p.current_config_revision_id == null ? null : Number(p.current_config_revision_id),
  workday: { effective: { start: p.work_start, end: p.work_end }, baseline: { start: p.work_baseline_start, end: p.work_baseline_end }, source: p.work_config_source, override: { by: p.work_override_by, at: p.work_override_at } },
  meal: { effective: { start: p.meal_start, end: p.meal_end, mode: p.meal_mode }, baseline: { start: p.meal_baseline_start, end: p.meal_baseline_end, mode: p.meal_baseline_mode }, source: p.meal_config_source, override: { by: p.meal_override_by, at: p.meal_override_at } },
  mainFlowPreference:{effective:mainFlowPreferenceFromRow(p),baseline:mainFlowPreferenceFromRow(p,"main_baseline_"),source:p.main_preference_source,override:{by:p.main_preference_override_by,at:p.main_preference_override_at}},
  participantTransition:{effective:Number(p.participant_transition_minutes),baseline:Number(p.participant_transition_baseline_minutes),source:p.participant_transition_config_source,override:{by:p.participant_transition_override_by,at:p.participant_transition_override_at}},
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
    supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode,default_participant_transition_minutes,main_preferred_block_count,main_before_meal_blocks").eq("id", 1).single(),
  ]);
  if (pe || !p) throw Object.assign(new Error("PLAN_NOT_FOUND"), { status: 404, cause: pe });
  if (ge || !g) throw ge;
  const current = mapPlan(p);
  return { ...current, generalCandidate: { workday: { start: g.default_work_start, end: g.default_work_end }, meal: { start: g.meal_start, end: g.meal_end, mode: g.meal_mode },participantTransitionMinutes:Number(g.default_participant_transition_minutes),mainFlowPreference:mainFlowPreferenceFromRow(g) }, effects: {
    WORKDAY_WINDOW: p.work_config_source === "LEGACY_BACKFILL" ? "REQUIRES_EXPLICIT_ADOPTION" : p.work_config_source === "DAY_OVERRIDE" ? "UPDATE_BASELINE_KEEP_EFFECTIVE" : "UPDATE_BASELINE_AND_EFFECTIVE",
    GLOBAL_MEAL_BREAK: p.meal_config_source === "LEGACY_BACKFILL" ? "REQUIRES_EXPLICIT_ADOPTION" : p.meal_config_source === "DAY_OVERRIDE" ? "UPDATE_BASELINE_KEEP_EFFECTIVE" : "UPDATE_BASELINE_AND_EFFECTIVE",
    PARTICIPANT_TRANSITION:p.participant_transition_config_source==="LEGACY_BACKFILL"?"REQUIRES_EXPLICIT_ADOPTION":p.participant_transition_config_source==="DAY_OVERRIDE"?"UPDATE_BASELINE_KEEP_EFFECTIVE":"UPDATE_BASELINE_AND_EFFECTIVE",
    BLOCK_COUNT_POLICY:p.main_preference_source==="LEGACY_BACKFILL"?"REQUIRES_EXPLICIT_ADOPTION":p.main_preference_source==="DAY_OVERRIDE"?"UPDATE_BASELINE_KEEP_EFFECTIVE":"UPDATE_BASELINE_AND_EFFECTIVE",
    OPTIMIZATION: "VALIDATED_BY_OPTIMIZER_PREVIEW",
  } };
}

function candidateInput(input: EngineInput, plan: PlanRow, general: PlanRow, operation: Operation, payload: OperationPayload): EngineInput {
  let start = String(plan.work_start), end = String(plan.work_end);
  let mealStart = String(plan.meal_start), mealEnd = String(plan.meal_end);
  let mealMode = String(plan.meal_mode) as EngineInput["mealMode"];
  let participantTransitionMinutes=Number(plan.participant_transition_minutes);
  if (operation === "EDIT") {
    const edit = payload as DayConfigEdit;
    if (edit.workday) ({ start, end } = edit.workday);
    if (edit.meal) ({ start: mealStart, end: mealEnd, mode: mealMode } = edit.meal);
    if(edit.participantTransitionMinutes!==undefined)participantTransitionMinutes=edit.participantTransitionMinutes;
  } else if (operation === "RESTORE") {
    const capability = (payload as DayConfigRestore).capability;
    if (capability === "WORKDAY_WINDOW") {
      start = String(plan.work_baseline_start); end = String(plan.work_baseline_end);
    } else if (capability === "GLOBAL_MEAL_BREAK") {
      mealStart = String(plan.meal_baseline_start); mealEnd = String(plan.meal_baseline_end);
      mealMode = String(plan.meal_baseline_mode) as EngineInput["mealMode"];
    } else if(capability==="PARTICIPANT_TRANSITION"){
      participantTransitionMinutes=Number(plan.participant_transition_baseline_minutes);
    }
  } else {
    const refresh = payload as DayConfigRefresh;
    const selected = new Set(refresh.capabilities);
    const adoptWork = plan.work_config_source !== "LEGACY_BACKFILL" || refresh.legacyTreatment === "ADOPT_GENERAL_AS_INHERITED";
    const adoptMeal = plan.meal_config_source !== "LEGACY_BACKFILL" || refresh.legacyTreatment === "ADOPT_GENERAL_AS_INHERITED";
    const adoptParticipant=plan.participant_transition_config_source!=="LEGACY_BACKFILL"||refresh.legacyTreatment==="ADOPT_GENERAL_AS_INHERITED";
    if (selected.has("WORKDAY_WINDOW") && adoptWork && plan.work_config_source !== "DAY_OVERRIDE") {
      start = String(general.default_work_start); end = String(general.default_work_end);
    }
    if (selected.has("GLOBAL_MEAL_BREAK") && adoptMeal && plan.meal_config_source !== "DAY_OVERRIDE") {
      mealStart = String(general.meal_start); mealEnd = String(general.meal_end);
      mealMode = String(general.meal_mode) as EngineInput["mealMode"];
    }
    if(selected.has("PARTICIPANT_TRANSITION")&&adoptParticipant&&plan.participant_transition_config_source!=="DAY_OVERRIDE")participantTransitionMinutes=Number(general.default_participant_transition_minutes);
  }
  const requested=operation==="EDIT"?(payload as DayConfigEdit).mainFlowPreference
    :operation==="RESTORE"&&(payload as DayConfigRestore).capability==="BLOCK_COUNT_POLICY"?mainFlowPreferenceFromRow(plan,"main_baseline_")
    :operation==="REFRESH"&&(payload as DayConfigRefresh).capabilities.includes("BLOCK_COUNT_POLICY")&&plan.main_preference_source!=="DAY_OVERRIDE"&&(plan.main_preference_source!=="LEGACY_BACKFILL"||(payload as DayConfigRefresh).legacyTreatment==="ADOPT_GENERAL_AS_INHERITED")?mainFlowPreferenceFromRow(general):undefined;
  if(requested){validateMainFlowPreference(input,requested);input=withMainFlowPreference(input,requested);}
  return { ...input, workDay: { start, end }, meal: { start: mealStart, end: mealEnd }, mealWindow: { start: mealStart, end: mealEnd }, mealMode,defaultParticipantTransitionMinutes:participantTransitionMinutes };
}

export async function applyDayConfigurationOperation(planId: number, actorId: string, operation: Operation, payload: OperationPayload, repository: IStorage = storage) {
  const [{ data: plan, error: planError }, { data: general, error: generalError }, { data: optimizerState, error: optimizerStateError }] = await Promise.all([
    supabaseAdmin.from("plans").select("*").eq("id", planId).single(),
    supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode,default_participant_transition_minutes,main_preferred_block_count,main_before_meal_blocks").eq("id", 1).single(),
    supabaseAdmin.from("plan_optimizer_snapshots").select("baseline_snapshot").eq("plan_id", planId).single(),
  ]);
  if (planError || !plan) throw Object.assign(new Error("PLAN_NOT_FOUND"), { status: 404, cause: planError });
  if (generalError || !general) throw generalError;
  if (optimizerStateError || !optimizerState) throw optimizerStateError;
  const resourceRouteEdit = operation === "EDIT" ? (payload as DayConfigEdit).resourceRouteTransitions : undefined;
  const chainEdit = operation === "EDIT" ? (payload as DayConfigEdit).technicalChains : undefined;
  const anchoredEdit = operation === "EDIT" ? (payload as DayConfigEdit).anchoredAccompaniments : undefined;
  const operationalMealEdit=operation === "EDIT" ? (payload as DayConfigEdit).operationalMealPolicies : undefined;
  const jointEdit = operation === "EDIT" ? (payload as DayConfigEdit).jointGroups : undefined;
  const scopeEdit = operation === "EDIT" ? (payload as DayConfigEdit).taskOperationScopes : undefined;
  const structureEdit = operation === "EDIT" ? (payload as DayConfigEdit).roundSynchronization : undefined;
  const roundEdit = operation === "EDIT" ? (payload as DayConfigEdit).roundPreparation : undefined;
  const roundRestore = operation === "RESTORE" && (payload as DayConfigRestore).capability === "SYNCHRONIZED_ROUNDS"
    ? payload as Extract<DayConfigRestore, { capability: "SYNCHRONIZED_ROUNDS" }> : undefined;
  const continuityEdit = operation === "EDIT" ? (payload as DayConfigEdit).operationContinuity : undefined;
  const continuityRestore = operation === "RESTORE" && (payload as DayConfigRestore).capability === "OPERATION_CONTINUITY" ? payload as Extract<DayConfigRestore,{capability:"OPERATION_CONTINUITY"}> : undefined;
  const expectedRevision = plan.current_config_revision_id == null ? null : Number(plan.current_config_revision_id);
  if ((resourceRouteEdit || operationalMealEdit || jointEdit || scopeEdit || anchoredEdit || chainEdit || structureEdit || roundEdit || roundRestore || continuityEdit || continuityRestore) && (payload as DayConfigEdit).expectedRevisionId !== expectedRevision)
    throw Object.assign(new Error("STALE_CONFIG_REVISION"), { status: 409 });
  const mainPreferenceBaseline=operation==="REFRESH"&&(payload as DayConfigRefresh).capabilities.includes("BLOCK_COUNT_POLICY")
    ?mainFlowPreferenceFromRow(general):undefined;
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
  // Rebuild from the candidate daily snapshot before deriving its authorities.
  // Merely swapping replay.optimizerSnapshot leaves EngineInput/maxima stale.
  const candidateRepository = new Proxy(repository, {get(target,key,receiver){
    return key === 'getPlanOptimizerSnapshot' ? async()=>effectiveOptimizer : Reflect.get(target,key,receiver);
  }});
  const optimizerInput = optimizerSelected ? await buildEngineInput(planId,candidateRepository) : current.input;
  transportBoundsSchema.parse(optimizerInput);
  let nextInput = resourceRouteEdit || structureEdit || chainEdit ? optimizerInput : candidateInput(optimizerInput, plan, general, operation, payload);
  if (resourceRouteEdit) {
    dailyResourceRouteAuthority(plan);
    if (!plan.planner_next_profile?.configuration || plan.planner_next_configuration != null)
      throw Object.assign(new Error("RESOURCE_ROUTE_AUTHORITY_CONFLICT"),{status:422});
    nextInput = withDailyResourceRoutes(nextInput,resourceRouteEdit);
    const readiness = preflightEngineInputForPlannerNext(nextInput);
    if (readiness.status !== "SUPPORTED") throw Object.assign(new Error(`UNSUPPORTED_RESOURCE_ROUTE: ${readiness.reasonCodes.join(", ")}`),{status:422});
  }
  if(operationalMealEdit){
    dailyOperationalMealsAuthority(plan);
    if(!plan.planner_next_profile?.configuration||plan.planner_next_configuration!=null)throw Object.assign(new Error("OPERATIONAL_MEAL_AUTHORITY_CONFLICT"),{status:422});
    nextInput=withDailyOperationalMeals(optimizerInput,operationalMealEdit);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=="SUPPORTED")throw Object.assign(new Error(`UNSUPPORTED_OPERATIONAL_MEAL: ${readiness.reasonCodes.join(", ")}`),{status:422});
  }
  if(jointEdit){
    dailyJointAuthority(plan);
    if(!plan.planner_next_profile||plan.planner_next_configuration!=null)throw Object.assign(new Error('JOINT_AUTHORITY_CONFLICT'),{status:422});
    const baseRepository=new Proxy(repository,{get(target,key,receiver){return key==='getPlanEngineInputDetails'?async(id:number)=>{const details=await target.getPlanEngineInputDetails(id);return {...details,plan:{...(details as any).plan,daily_joint_groups:null}};}:Reflect.get(target,key,receiver);}});
    nextInput=withDailyJointGroups(await buildEngineInput(planId,baseRepository),jointEdit);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=='SUPPORTED')throw Object.assign(new Error(`UNSUPPORTED_JOINT_GROUP: ${readiness.reasonCodes.join(', ')}`),{status:422});
  }
  if(scopeEdit){
    dailyTaskOperationScopesAuthority(plan);
    if(!plan.planner_next_profile||plan.planner_next_configuration!=null)throw Object.assign(new Error('TASK_SCOPE_AUTHORITY_CONFLICT'),{status:422});
    const baseRepository=new Proxy(repository,{get(target,key,receiver){return key==='getPlanEngineInputDetails'?async(id:number)=>{const details=await target.getPlanEngineInputDetails(id);return {...details,plan:{...(details as any).plan,daily_task_operation_scopes:null}};}:Reflect.get(target,key,receiver);}});
    nextInput=withDailyTaskOperationScopes({...await buildEngineInput(planId,baseRepository),dailyTaskOperationScopes:current.input.dailyTaskOperationScopes},scopeEdit);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=='SUPPORTED')throw Object.assign(new Error(`UNSUPPORTED_TASK_SCOPE: ${readiness.reasonCodes.join(', ')}`),{status:422});
  }
  if(anchoredEdit){
    dailyAnchoredAuthority(plan);
    if(!plan.planner_next_profile||plan.planner_next_configuration!=null)throw Object.assign(new Error('ANCHORED_AUTHORITY_CONFLICT'),{status:422});
    // Rebuild the native base when editing/removing, rather than retaining old virtual fields.
    const baseRepository=new Proxy(repository,{get(target,key,receiver){return key==='getPlanEngineInputDetails'?async(id:number)=>{const details=await target.getPlanEngineInputDetails(id);return {...details,plan:{...(details as any).plan,daily_anchored_accompaniments:null}};}:Reflect.get(target,key,receiver);}});
    nextInput=withDailyAnchoredAccompaniments(await buildEngineInput(planId,baseRepository),anchoredEdit);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=='SUPPORTED')throw Object.assign(new Error(`UNSUPPORTED_ANCHORED_OPERATION: ${readiness.reasonCodes.join(', ')}`),{status:422});
  }
  if (structureEdit) {
    dailyRoundAuthority(plan);
    if (!plan.planner_next_profile || plan.planner_next_configuration != null) throw Object.assign(new Error("ROUND_STRUCTURE_AUTHORITY_CONFLICT"),{status:422});
    const profile=plan.planner_next_profile as {configuration?:{scenario?:string;transport?:string;setup?:string}};
    if(profile.configuration?.scenario!=="STANDALONE_ONLY"||profile.configuration.transport!=="NONE"||profile.configuration.setup!=="NONE")
      throw Object.assign(new Error("UNSUPPORTED_ROUND_STRUCTURE_COMBINATION"),{status:422});
    nextInput = validateDailyRoundStructure(nextInput,structureEdit);
    const readiness = preflightEngineInputForPlannerNext(nextInput);
    if (readiness.status !== "SUPPORTED") throw Object.assign(new Error(`UNSUPPORTED_ROUND_STRUCTURE: ${readiness.reasonCodes.join(", ")}`),{status:422});
  }
  if (chainEdit) {
    dailyTechnicalChainAuthority(plan);
    if (!plan.planner_next_profile || plan.planner_next_configuration != null || plan.planner_next_profile.configuration?.transport !== "NONE" || plan.planner_next_profile.configuration?.setup !== "NONE") throw Object.assign(new Error("TECHNICAL_CHAIN_AUTHORITY_CONFLICT"),{status:422});
    nextInput = validateDailyTechnicalChains(nextInput,chainEdit);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=="SUPPORTED")throw Object.assign(new Error(`UNSUPPORTED_TECHNICAL_CHAIN: ${readiness.reasonCodes.join(", ")}`),{status:422});
  }
  if (roundEdit || roundRestore) {
    nextInput = candidateRoundPreparations(nextInput, plan, (roundEdit ?? roundRestore!.roundPreparation), roundEdit?.preparationMinutesBetweenRounds, actorId);
    const readiness = preflightEngineInputForPlannerNext(nextInput);
    if (readiness.status !== "SUPPORTED") throw Object.assign(new Error(`La preparación no es representable con la configuración efectiva (rejilla de ${nextInput.plannerNext?.timeGridMinutes} minutos). ${readiness.reasonCodes.join(", ")}`), { status: 422 });
  }
  if (continuityEdit || continuityRestore) {
    const snapshots=await repository.getPlanTaskTemplateSnapshots(planId);
    const baseline=applyEffectiveOperationContinuity({...nextInput,operationContinuityGroups:undefined},{...plan,operation_continuity_overrides:[]},snapshots);
    nextInput=candidateOperationContinuity(nextInput,continuityEdit??continuityRestore!.operationContinuity,!!continuityRestore,baseline);
    if(nextInput.dailyTechnicalChainsVersion===1)nextInput=validateDailyTechnicalChains(nextInput,{contractVersion:1,policies:nextInput.technicalChains??[]});
    const readiness=preflightEngineInputForPlannerNext(nextInput);
    if(readiness.status!=="SUPPORTED") throw Object.assign(new Error("La continuidad no es representable con la configuración efectiva."),{status:422});
  }
  const candidate = await buildCanonicalPlanConfig(planId, repository, nextInput, effectiveOptimizer);
  const { data, error } = await supabaseAdmin.rpc("apply_day_config_operation_v5", {
    p_plan_id: planId, p_actor: actorId, p_operation: operation, p_payload: {...payload,...(optimizerBaseline?{optimizerBaseline}: {}),...(mainPreferenceBaseline?{mainPreferenceBaseline}: {})},
    p_expected_revision: plan.current_config_revision_id == null ? null : Number(plan.current_config_revision_id),
    p_expected_identity: current.identity, p_expected_replay: current.replay,
    p_candidate_identity: candidate.identity, p_candidate_replay: candidate.replay,
    p_diff: { operation, payload,...(mainPreferenceBaseline?{mainPreferenceBaseline}: {}) },
  });
  if (error?.code === "55P03" || error?.code === "40P01")
    throw Object.assign(new Error("STALE_CONFIG_SOURCES"),{status:409,cause:error});
  if (error) throw Object.assign(error, { status: error.message.includes("PERMISSION_DENIED") ? 403 : /STALE_|RESOURCE_ROUTE|ROUND_|TECHNICAL_CHAIN|ANCHORED_|TASK_SCOPE|JOINT_|OPERATIONAL_MEAL|OPERATION_CONTINUITY/.test(error.message) ? 409 : 500 });
  const { data: updated, error: updatedError } = await supabaseAdmin.from("plans").select("*").eq("id", planId).single();
  if (updatedError || !updated) throw updatedError;
  return { ...mapPlan(updated), revisionId: Number(data) };
}

/** The existing v5 writer owns CAS, canonical revision and the S0 source transition. */
export async function applyResourceAvailabilityOperation(
  planId: number, actorId: string, itemId: number,
  window: { availabilityStart: string | null; availabilityEnd: string | null; expectedRevisionId: number | null },
  repository: IStorage = storage,
) {
  const { data: plan, error: planError } = await supabaseAdmin.from("plans").select("current_config_revision_id").eq("id",planId).single();
  if (planError || !plan) throw Object.assign(new Error("PLAN_NOT_FOUND"),{status:404});
  if ((plan.current_config_revision_id == null ? null : Number(plan.current_config_revision_id)) !== window.expectedRevisionId)
    throw Object.assign(new Error("STALE_CONFIG_REVISION"),{status:409});
  const current = await buildCanonicalPlanConfig(planId,repository);
  if (!current.input.planResourceItems.some(row=>row.id===itemId)) throw Object.assign(new Error("RESOURCE_NOT_FOUND"),{status:404});
  const nextInput = {...current.input, planResourceItems:current.input.planResourceItems.map(row=>row.id===itemId
    ? {...row,availabilityStart:window.availabilityStart,availabilityEnd:window.availabilityEnd} : row)};
  const candidate = await buildCanonicalPlanConfig(planId,repository,nextInput);
  const {data,error} = await supabaseAdmin.rpc("apply_day_config_operation_v5",{
    p_plan_id:planId,p_actor:actorId,p_operation:"RESOURCE_AVAILABILITY",
    p_payload:{resourceAvailability:{id:itemId,availabilityStart:window.availabilityStart,availabilityEnd:window.availabilityEnd},expectedRevisionId:window.expectedRevisionId},
    p_expected_revision:window.expectedRevisionId,p_expected_identity:current.identity,p_expected_replay:current.replay,
    p_candidate_identity:candidate.identity,p_candidate_replay:candidate.replay,
    p_diff:{operation:"EDIT",resourceAvailability:{id:itemId,availabilityStart:window.availabilityStart,availabilityEnd:window.availabilityEnd}},
  });
  if(error?.message==='INVALID_OPERATION') throw Object.assign(new Error('La edición horaria no está disponible en esta instalación.'),{status:409});
  if(error) throw Object.assign(new Error(error.message),{status:error.code==='55P03'||error.code==='40P01'||/STALE_|RESOURCE_AVAILABILITY_/.test(error.message)?409:error.message.includes('PERMISSION_DENIED')?403:500});
  return {success:true,revisionId:Number(data)};
}
