import { supabaseAdmin } from "./supabase";
import {
  Plan,
  PlanSummary,
  InsertPlan,
  DailyTask,
  InsertDailyTask,
  TaskTemplate,
  Lock,
  InsertLock,
} from "@shared/schema";
import {
  OptimizerHeuristicKey,
  coerceOptimizationMode,
  clampAdvancedValue,
  clampBasicLevel,
  normalizeHeuristicSetting,
} from "@shared/optimizer";

function getEuropeMadridTimeHHMM(): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return formatted.slice(0, 5);
}

function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function coerceSecond(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const sec = Math.floor(n);
  if (sec < 0 || sec > 59) return null;
  return sec;
}

export interface IStorage {
  // Plans
  getPlans(): Promise<PlanSummary[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  deletePlan(planId: number): Promise<boolean>;

  // Contestants
  getContestantsByPlan(planId: number): Promise<any[]>;
  createContestantForPlan(planId: number, contestant: any): Promise<any>;

  // Tasks
  getTasksForPlan(planId: number): Promise<DailyTask[]>;
  createDailyTask(task: InsertDailyTask): Promise<DailyTask>;
  updateTaskStatus(
    taskId: number,
    updates: {
      status: "pending" | "in_progress" | "done" | "interrupted" | "cancelled";
      effectiveTimeHHMM?: string;
      effectiveSeconds?: number;
    },
    userId: string,
  ): Promise<DailyTask>;
  resetTask(taskId: number, userId: string, effectiveTimeHHMM?: string): Promise<DailyTask>;

  // Templates
  getTaskTemplates(): Promise<TaskTemplate[]>;
  createTaskTemplate(template: any): Promise<TaskTemplate>;
  updateTaskTemplate(templateId: number, patch: any): Promise<TaskTemplate>;
  deleteTaskTemplate(templateId: number): Promise<void>;

  // Zones (Platós)
  getZones(): Promise<any[]>;
  createZone(input: { name: string }): Promise<any>;
  updateZone(id: number, input: { name: string; uiColor?: string | null; minimizeChangesLevel?: number; minimizeChangesMinChain?: number; groupingLevel?: unknown; groupingMinChain?: unknown }): Promise<any>;

  // Spaces (hierarchy)
  getSpaces(): Promise<any[]>;
  createSpace(input: {
    name: string;
    zoneId: number;
    priorityLevel?: number;
    parentSpaceId?: number | null;
  }): Promise<any>;
  updateSpace(
    id: number,
    patch: {
      name?: string;
      zoneId?: number;
      priorityLevel?: number;
      parentSpaceId?: number | null;
      minimizeChangesLevel?: number;
      minimizeChangesMinChain?: number;
      groupingLevel?: unknown;
      groupingMinChain?: unknown;
    },
  ): Promise<any>;

  // Locks
  getLocksForPlan(planId: number): Promise<Lock[]>;
  createLock(lock: InsertLock): Promise<Lock>;

  // Engine Data
  getPlanFullDetails(planId: number): Promise<
    | {
        plan: Plan;
        tasks: DailyTask[];
        locks: Lock[];
        availability: any[];
        breaks: any[];
      }
    | undefined
  >;

  syncPlanMealBreaks(planId: number): Promise<void>;
  savePlannedBreakTimes(planId: number, breakId: number, start: string, end: string): Promise<void>;
  lockBreakTimes(planId: number, breakId: number, start: string, end: string): Promise<void>;
  clearBreakLock(planId: number, breakId: number): Promise<void>;

  // Optimizer Settings (global)
  getOptimizerSettings(): Promise<{
    mainZoneId: number | null;
    optimizationMode: "basic" | "advanced";
    heuristics: Record<
      OptimizerHeuristicKey,
      { basicLevel: number; advancedValue: number }
    >;

    // legacy
    prioritizeMainZone: boolean;
    groupBySpaceAndTemplate: boolean;

    // ✅ niveles
    mainZonePriorityLevel: number; // 0..3
    groupingLevel: number; // 0..3
    contestantStayInZoneLevel: number; // 0..3

    // ✅ modos del plató principal
    mainZoneOptFinishEarly: boolean;
    mainZoneOptKeepBusy: boolean;

    // ✅ compactar concursantes
    contestantCompactLevel: number; // 0..3
    contestantTotalSpanLevel: number; // 0..3
    groupingZoneIds: number[];
    arrivalTaskTemplateName: string;
    departureTaskTemplateName: string;
    arrivalGroupingTarget: number;
    departureGroupingTarget: number;
    vanCapacity: number;
    weightArrivalDepartureGrouping: number;
  }>;

  // Resources (per plan, 1 a 1)
  // Returns null if the plan has no snapshot rows (e.g. legacy plan not initialized)
  getCamerasAvailableForPlan(planId: number): Promise<number | null>;

  // Inventario real del plan (plan_resource_items)
  getPlanResourceItemsForPlan(planId: number): Promise<
    Array<{
      id: number;
      resourceItemId: number;
      typeId: number;
      name: string;
      isAvailable: boolean;
    }>
  >;

  // Componentes de recursos compuestos (resource_item_components)
  // Key: parent resourceItemId -> [{componentResourceItemId, quantity}]
  getResourceItemComponentsMap(
    parentResourceItemIds: number[],
  ): Promise<
    Record<number, Array<{ componentResourceItemId: number; quantity: number }>>
  >;

  // Space Resource Assignments (per plan)
  // Key: spaceId -> planResourceItemIds
  getSpaceResourceAssignmentsForPlan(
    planId: number,
  ): Promise<Record<number, number[]>>;

  // Zone Resource Assignments (per plan)
  // Key: zoneId -> planResourceItemIds
  getZoneResourceAssignmentsForPlan(
    planId: number,
  ): Promise<Record<number, number[]>>;
  // Zone Resource Type Requirements (per plan)
  // Key: zoneId -> (resourceTypeId -> quantity)
  getZoneResourceTypeRequirementsForPlan(
    planId: number,
  ): Promise<Record<number, Record<number, number>>>;

  // Space Resource Type Requirements (per plan)
  // Key: spaceId -> (resourceTypeId -> quantity)
  getSpaceResourceTypeRequirementsForPlan(
    planId: number,
  ): Promise<Record<number, Record<number, number>>>;
}

export class SupabaseStorage implements IStorage {
  async syncPlanMealBreaks(planId: number): Promise<void> {
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id, meal_start, meal_end")
      .eq("id", planId)
      .single();
    if (planErr) throw planErr;

    const deriveMealBreakDuration = async (): Promise<number> => {
      const { data: settings, error: settingsErr } = await supabaseAdmin
        .from("program_settings")
        .select("meal_task_template_name, space_meal_break_minutes")
        .eq("id", 1)
        .maybeSingle();
      if (settingsErr) throw settingsErr;

      const mealTemplateName = String((settings as any)?.meal_task_template_name ?? "").trim();
      if (mealTemplateName) {
        const { data: tplByName, error: tplByNameErr } = await supabaseAdmin
          .from("task_templates")
          .select("default_duration")
          .ilike("name", mealTemplateName)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (tplByNameErr) throw tplByNameErr;
        const durationByName = Number((tplByName as any)?.default_duration ?? NaN);
        if (Number.isFinite(durationByName) && durationByName > 0) return durationByName;
      }

      const { data: mealTaskRow, error: mealTaskRowErr } = await supabaseAdmin
        .from("daily_tasks")
        .select("duration_override, template_id, template:task_templates(name, default_duration)")
        .eq("plan_id", planId)
        .eq("is_manual_block", false)
        .order("id", { ascending: true });
      if (mealTaskRowErr) throw mealTaskRowErr;

      const mealNameNorm = mealTemplateName.toLowerCase();
      const candidateDurations = (mealTaskRow ?? [])
        .filter((row: any) => mealNameNorm
          && String(row?.template?.name ?? "").trim().toLowerCase() === mealNameNorm)
        .map((row: any) => {
          const durationOverride = Number(row?.duration_override ?? NaN);
          if (Number.isFinite(durationOverride) && durationOverride > 0) return durationOverride;
          const defaultDuration = Number(row?.template?.default_duration ?? NaN);
          return Number.isFinite(defaultDuration) && defaultDuration > 0 ? defaultDuration : NaN;
        })
        .filter((d: number) => Number.isFinite(d) && d > 0);
      if (candidateDurations.length > 0) return Math.round(candidateDurations[0]);

      const fallback = Number((settings as any)?.space_meal_break_minutes ?? 45);
      return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 45;
    };

    const mealBreakDuration = await deriveMealBreakDuration();
    const spaceDuration = Math.max(1, mealBreakDuration);
    const itinerantDuration = Math.max(1, mealBreakDuration);

    const mealStart = String((plan as any)?.meal_start ?? "12:00");
    const mealEnd = String((plan as any)?.meal_end ?? "16:00");

    const { data: spaces } = await supabaseAdmin
      .from("spaces")
      .select("id");
    const { data: teams } = await supabaseAdmin
      .from("itinerant_teams")
      .select("id, is_active");

    const { data: existing } = await supabaseAdmin
      .from("plan_breaks")
      .select("id, kind, space_id, itinerant_team_id, duration_minutes, earliest_start, latest_end")
      .eq("plan_id", planId);

    const existingSpace = new Set<number>();
    const existingTeam = new Set<number>();
    for (const row of existing ?? []) {
      if ((row as any)?.kind === "space_meal" && (row as any)?.space_id) {
        existingSpace.add(Number((row as any).space_id));
      }
      if ((row as any)?.kind === "itinerant_meal" && (row as any)?.itinerant_team_id) {
        existingTeam.add(Number((row as any).itinerant_team_id));
      }
    }

    const toInsert: any[] = [];
    for (const s of spaces ?? []) {
      const sid = Number((s as any)?.id);
      if (!Number.isFinite(sid) || existingSpace.has(sid)) continue;
      toInsert.push({
        plan_id: planId,
        kind: "space_meal",
        space_id: sid,
        itinerant_team_id: null,
        duration_minutes: spaceDuration,
        earliest_start: mealStart,
        latest_end: mealEnd,
      });
    }
    for (const t of teams ?? []) {
      const tid = Number((t as any)?.id);
      const active = (t as any)?.is_active ?? true;
      if (!active || !Number.isFinite(tid) || existingTeam.has(tid)) continue;
      toInsert.push({
        plan_id: planId,
        kind: "itinerant_meal",
        space_id: null,
        itinerant_team_id: tid,
        duration_minutes: itinerantDuration,
        earliest_start: mealStart,
        latest_end: mealEnd,
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("plan_breaks").insert(toInsert);
      if (insErr) throw insErr;
    }

    const rows = existing ?? [];
    const spaceNeedTimeIds: number[] = [];
    const spaceNeedDurIds: number[] = [];
    const itinerantNeedTimeIds: number[] = [];
    const itinerantNeedDurIds: number[] = [];

    for (const row of rows as any[]) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) continue;

      const kind = String(row?.kind ?? "");
      const currentStart = String(row?.earliest_start ?? "");
      const currentEnd = String(row?.latest_end ?? "");
      const currentDuration = Number(row?.duration_minutes ?? NaN);

      const needTime = currentStart !== mealStart || currentEnd !== mealEnd;
      if (kind === "space_meal") {
        if (needTime) spaceNeedTimeIds.push(id);
        if (currentDuration !== spaceDuration) spaceNeedDurIds.push(id);
      } else if (kind === "itinerant_meal") {
        if (needTime) itinerantNeedTimeIds.push(id);
        if (currentDuration !== itinerantDuration) itinerantNeedDurIds.push(id);
      }
    }

    const updateByIds = async (ids: number[], patch: Record<string, any>) => {
      if (ids.length === 0) return;
      const { error } = await supabaseAdmin
        .from("plan_breaks")
        .update(patch)
        .in("id", ids);
      if (error) throw error;
    };

    await updateByIds(spaceNeedTimeIds, { earliest_start: mealStart, latest_end: mealEnd });
    await updateByIds(itinerantNeedTimeIds, { earliest_start: mealStart, latest_end: mealEnd });
    await updateByIds(spaceNeedDurIds, { duration_minutes: spaceDuration });
    await updateByIds(itinerantNeedDurIds, { duration_minutes: itinerantDuration });
  }

  async savePlannedBreakTimes(planId: number, breakId: number, start: string, end: string): Promise<void> {
    const { data: current, error: readError } = await supabaseAdmin
      .from("plan_breaks")
      .select("planned_start, planned_end")
      .eq("plan_id", planId)
      .eq("id", breakId)
      .maybeSingle();
    if (readError) throw readError;

    const currentStart = (current as any)?.planned_start ?? null;
    const currentEnd = (current as any)?.planned_end ?? null;
    if (currentStart === start && currentEnd === end) return;

    const { error } = await supabaseAdmin
      .from("plan_breaks")
      .update({ planned_start: start, planned_end: end })
      .eq("plan_id", planId)
      .eq("id", breakId);
    if (error) throw error;
  }


  async lockBreakTimes(planId: number, breakId: number, start: string, end: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("plan_breaks")
      .update({ locked_start: start, locked_end: end })
      .eq("plan_id", planId)
      .eq("id", breakId);
    if (error) throw error;
  }

  async clearBreakLock(planId: number, breakId: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from("plan_breaks")
      .update({ locked_start: null, locked_end: null })
      .eq("plan_id", planId)
      .eq("id", breakId);
    if (error) throw error;
  }

  async getPlans(): Promise<PlanSummary[]> {
    const { data, error } = await supabaseAdmin
      .from("plan_summaries")
      .select("*")
      .order("date", { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: Number(row?.id),
      date: row?.date,
      status: String(row?.status ?? "draft"),
      workStart: String(row?.work_start ?? ""),
      workEnd: String(row?.work_end ?? ""),
      mealStart: "12:00",
      mealEnd: "16:00",
      contestantMealDurationMinutes: 75,
      contestantMealMaxSimultaneous: 10,
      camerasAvailable: 0,
      isFavorite: false,
      contestantsCount: row?.contestants_count == null ? null : Number(row.contestants_count),
      tasksTotal: row?.tasks_total == null ? null : Number(row.tasks_total),
      tasksPlanned: row?.tasks_planned == null ? null : Number(row.tasks_planned),
      firstTaskStart: row?.first_task_start ?? null,
      lastTaskEnd: row?.last_task_end ?? null,
      minutesTasksTotal: row?.minutes_tasks_total == null ? null : Number(row.minutes_tasks_total),
      availableMinutes: row?.available_minutes == null ? null : Number(row.available_minutes),
      realSpanMinutes: row?.real_span_minutes == null ? null : Number(row.real_span_minutes),
      occupancyAvailablePct: row?.occupancy_available_pct == null ? null : Number(row.occupancy_available_pct),
      occupancyRealPct: row?.occupancy_real_pct == null ? null : Number(row.occupancy_real_pct),
    })) as PlanSummary[];
  }

  async getOptimizerSettings() {
    const { data, error } = await supabaseAdmin
      .from("optimizer_settings")
      .select(
        "main_zone_id, prioritize_main_zone, group_by_space_and_template, main_zone_priority_level, grouping_level, main_zone_opt_finish_early, main_zone_opt_keep_busy, contestant_compact_level, optimization_mode, main_zone_priority_advanced_value, grouping_advanced_value, contestant_compact_advanced_value, contestant_stay_in_zone_level, contestant_stay_in_zone_advanced_value, contestant_total_span_level, contestant_total_span_advanced_value, grouping_zone_ids, arrival_task_template_name, departure_task_template_name, arrival_grouping_target, departure_grouping_target, van_capacity, weight_arrival_departure_grouping",
      )
      .eq("id", 1)
      .single();

    if (error) throw error;

    const prioritizeMainZone = data?.prioritize_main_zone === true;
    const groupBySpaceAndTemplate = data?.group_by_space_and_template !== false;

    const mainZonePriorityLevel = clampBasicLevel(
      (data as any)?.main_zone_priority_level ?? (prioritizeMainZone ? 2 : 0),
    );
    const groupingLevel = clampBasicLevel(
      (data as any)?.grouping_level ?? (groupBySpaceAndTemplate ? 2 : 0),
    );
    const contestantCompactLevel = clampBasicLevel(
      (data as any)?.contestant_compact_level ?? 0,
    );
    const contestantStayInZoneLevel = clampBasicLevel(
      (data as any)?.contestant_stay_in_zone_level ?? 0,
    );
    const contestantTotalSpanLevel = 0;

    const heuristics = {
      mainZoneFinishEarly: normalizeHeuristicSetting({
        basicLevel: mainZonePriorityLevel,
        advancedValue: clampAdvancedValue(
          (data as any)?.main_zone_priority_advanced_value,
        ),
      }, mainZonePriorityLevel),
      mainZoneKeepBusy: normalizeHeuristicSetting({
        basicLevel: mainZonePriorityLevel,
        advancedValue: clampAdvancedValue(
          (data as any)?.main_zone_priority_advanced_value,
        ),
      }, mainZonePriorityLevel),
      contestantCompact: normalizeHeuristicSetting({
        basicLevel: contestantCompactLevel,
        advancedValue: clampAdvancedValue(
          (data as any)?.contestant_compact_advanced_value,
        ),
      }, contestantCompactLevel),
      groupBySpaceTemplateMatch: normalizeHeuristicSetting({
        basicLevel: groupingLevel,
        advancedValue: clampAdvancedValue((data as any)?.grouping_advanced_value),
      }, groupingLevel),
      groupBySpaceActive: normalizeHeuristicSetting({
        basicLevel: groupingLevel,
        advancedValue: clampAdvancedValue((data as any)?.grouping_advanced_value),
      }, groupingLevel),
      contestantStayInZone: normalizeHeuristicSetting({
        basicLevel: contestantStayInZoneLevel,
        advancedValue: clampAdvancedValue(
          (data as any)?.contestant_stay_in_zone_advanced_value,
        ),
      }, contestantStayInZoneLevel),
      contestantTotalSpan: normalizeHeuristicSetting({
        basicLevel: 0,
        advancedValue: 0,
      }, 0),
    } as const;

    return {
      mainZoneId:
        data?.main_zone_id === null || data?.main_zone_id === undefined
          ? null
          : Number(data.main_zone_id),

      optimizationMode: coerceOptimizationMode((data as any)?.optimization_mode),
      heuristics: heuristics as any,

      // legacy
      prioritizeMainZone,
      groupBySpaceAndTemplate,

      // ✅ niveles
      mainZonePriorityLevel,
      groupingLevel,
      contestantStayInZoneLevel,

      // ✅ modos del plató principal
      mainZoneOptFinishEarly:
        (data as any)?.main_zone_opt_finish_early !== false,
      mainZoneOptKeepBusy: (data as any)?.main_zone_opt_keep_busy !== false,

      // ✅ compactar concursantes
      contestantCompactLevel,
      contestantTotalSpanLevel,
      groupingZoneIds: Array.isArray((data as any)?.grouping_zone_ids) ? (data as any).grouping_zone_ids.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0) : [],
      arrivalTaskTemplateName: String((data as any)?.arrival_task_template_name ?? ""),
      departureTaskTemplateName: String((data as any)?.departure_task_template_name ?? ""),
      arrivalGroupingTarget: Math.max(0, Number((data as any)?.arrival_grouping_target ?? 0) || 0),
      departureGroupingTarget: Math.max(0, Number((data as any)?.departure_grouping_target ?? 0) || 0),
      vanCapacity: Math.max(0, Number((data as any)?.van_capacity ?? 0) || 0),
      weightArrivalDepartureGrouping: Math.max(0, Math.min(10, Number((data as any)?.weight_arrival_departure_grouping ?? 0) || 0)),
    };
  }

  async getContestantsByPlan(planId: number) {
    const { data, error } = await supabaseAdmin
      .from("contestants")
      .select("*")
      .eq("plan_id", planId)
      .order("id", { ascending: true });

    if (error) throw error;

    return (data || []).map((c: any) => ({
      id: c.id,
      planId: c.plan_id ?? null,
      name: c.name,
      instrument: c.instrument,
      instrumentName: c.instrument_name ?? null,

      coachId: c.coach_id ?? null, // legacy
      song: c.song ?? null,

      notes: c.notes ?? null,
      availabilityStart: c.availability_start ?? null,
      availabilityEnd: c.availability_end ?? null,

      vocalCoachPlanResourceItemId: c.vocal_coach_plan_resource_item_id ?? null,

      createdAt: c.created_at ?? null,
    }));
  }

  async createContestantForPlan(planId: number, contestant: any) {
    // ✅ Disponibilidad por defecto = horario del plan (solo al crear)
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("work_start, work_end")
      .eq("id", planId)
      .single();

    if (planErr) throw planErr;

    const payload = {
      plan_id: planId,
      name: contestant.name,
      instrument: contestant.instrument ?? false,
      instrument_name: contestant.instrumentName ?? null,

      coach_id: contestant.coachId ?? null, // legacy
      song: contestant.song ?? null,

      notes: contestant.notes ?? null,

      availability_start:
        contestant.availabilityStart ?? (planRow as any)?.work_start ?? null,
      availability_end:
        contestant.availabilityEnd ?? (planRow as any)?.work_end ?? null,

      vocal_coach_plan_resource_item_id:
        contestant.vocalCoachPlanResourceItemId ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("contestants")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const createdContestant = {
      id: data.id,
      planId: data.plan_id ?? null,
      name: data.name,
      instrument: data.instrument,

      coachId: data.coach_id ?? null, // legacy
      song: data.song ?? null,
      vocalCoachPlanResourceItemId:
        data.vocal_coach_plan_resource_item_id ?? null,

      createdAt: data.created_at ?? null,
    };

    // ✅ Auto-crear tareas por templates marcadas para creación automática al crear concursante
    try {
      const { data: autoTemplates, error: autoTemplatesErr } = await supabaseAdmin
        .from("task_templates")
        .select("id")
        .eq("auto_create_on_contestant_create", true);

      if (autoTemplatesErr) throw autoTemplatesErr;

      const templateIds = ((autoTemplates as any[]) ?? [])
        .map((row: any) => Number(row?.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      if (templateIds.length > 0) {
        const uniqueTemplateIds = Array.from(new Set(templateIds));
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("daily_tasks")
          .select("template_id")
          .eq("plan_id", planId)
          .eq("contestant_id", createdContestant.id)
          .in("template_id", uniqueTemplateIds);

        if (existingErr) throw existingErr;

        const existingSet = new Set<number>();
        for (const row of (existing as any[]) ?? []) {
          const tid = Number((row as any)?.template_id);
          if (Number.isFinite(tid) && tid > 0) existingSet.add(tid);
        }

        for (const templateId of uniqueTemplateIds) {
          if (existingSet.has(templateId)) continue;

          await this.createDailyTask({
            planId,
            templateId,
            contestantId: createdContestant.id,
            durationOverride: null,
            camerasOverride: null,
            status: "pending",
          } as any);
        }
      }
    } catch (e) {
      console.error("[AUTO CREATE CONTESTANT TEMPLATES] error", e);
      // No bloqueamos la creación del concursante si falla el auto-create
    }

    // ✅ Auto-crear tareas por Vocal Coach (si ya viene asignado al crear concursante)
    try {
      const priId = Number(createdContestant.vocalCoachPlanResourceItemId);
      if (Number.isFinite(priId) && priId > 0) {
        // 1) plan_resource_items -> resource_item_id (coach global)
        const { data: pri, error: priErr } = await supabaseAdmin
          .from("plan_resource_items")
          .select("resource_item_id")
          .eq("id", priId)
          .eq("plan_id", planId)
          .single();

        if (priErr) throw priErr;
        if (!pri) throw new Error("Vocal coach not found in this plan");

        const coachResourceItemId = Number((pri as any).resource_item_id);
        if (!Number.isFinite(coachResourceItemId) || coachResourceItemId <= 0) {
          throw new Error("Invalid coach resource_item_id");
        }

        // 2) reglas globales
        const { data: rules, error: rulesErr } = await supabaseAdmin
          .from("vocal_coach_rules")
          .select("task_template_id, default_space_id, sort_order, is_required")
          .eq("vocal_coach_resource_item_id", coachResourceItemId)
          .order("sort_order", { ascending: true });

        if (rulesErr) throw rulesErr;

        const coachRules = Array.isArray(rules)
          ? rules.map((r: any) => ({
              taskTemplateId: Number(r.task_template_id),
              defaultSpaceId: r.default_space_id ?? null,
              sortOrder: Number(r.sort_order ?? 0),
              isRequired: Boolean(r.is_required),
            }))
          : [];

        // 3) crear daily_tasks pending (sin duplicar)
        const templateIds = coachRules
          .map((r) => Number(r.taskTemplateId))
          .filter((n) => Number.isFinite(n) && n > 0);

        if (templateIds.length > 0) {
          const { data: existing, error: exErr } = await supabaseAdmin
            .from("daily_tasks")
            .select("template_id")
            .eq("plan_id", planId)
            .eq("contestant_id", createdContestant.id)
            .in("template_id", templateIds);

          if (exErr) throw exErr;

          const existingSet = new Set<number>();
          for (const row of (existing as any[]) ?? []) {
            const tid = Number((row as any).template_id);
            if (Number.isFinite(tid) && tid > 0) existingSet.add(tid);
          }

          for (const rule of coachRules) {
            if (existingSet.has(rule.taskTemplateId)) continue;

            await this.createDailyTask({
              planId,
              templateId: rule.taskTemplateId,
              contestantId: createdContestant.id,
              durationOverride: null,
              camerasOverride: null,
              status: "pending",
              spaceId: rule.defaultSpaceId ?? null,
            } as any);
          }
        }
      }
    } catch (e) {
      console.error("[AUTO CREATE VOCAL COACH TASKS] error", e);
      // No bloqueamos la creación del concursante si falla el auto-create
    }

    return createdContestant;
  }

  async updateContestantForPlan(
    planId: number,
    contestantId: number,
    patch: any,
  ) {
    const payload: any = {};

    // ✅ Si se asigna un coach, aplicamos reglas globales (vocal_coach_rules)
    // De: contestant.vocal_coach_plan_resource_item_id (snapshot del plan)
    // A: vocal_coach_rules.vocal_coach_resource_item_id (resource_items.id)
    const shouldApplyVocalCoachRules =
      Object.prototype.hasOwnProperty.call(
        patch,
        "vocalCoachPlanResourceItemId",
      ) &&
      patch.vocalCoachPlanResourceItemId !== null &&
      patch.vocalCoachPlanResourceItemId !== undefined;

    let coachResourceItemId: number | null = null;
    let coachRules: Array<{
      taskTemplateId: number;
      defaultSpaceId: number | null;
      sortOrder: number;
      isRequired: boolean;
    }> = [];

    if (shouldApplyVocalCoachRules) {
      const priId = Number(patch.vocalCoachPlanResourceItemId);
      if (!Number.isFinite(priId) || priId <= 0) {
        throw new Error("Invalid vocalCoachPlanResourceItemId");
      }

      // 1) plan_resource_items -> resource_item_id
      const { data: pri, error: priErr } = await supabaseAdmin
        .from("plan_resource_items")
        .select("resource_item_id")
        .eq("id", priId)
        .eq("plan_id", planId)
        .single();

      if (priErr) throw priErr;
      if (!pri) throw new Error("Vocal coach not found in this plan");

      coachResourceItemId = Number((pri as any).resource_item_id);
      if (!Number.isFinite(coachResourceItemId) || coachResourceItemId <= 0) {
        throw new Error("Invalid coach resource_item_id");
      }

      // 2) Reglas globales del coach
      const { data: rules, error: rulesErr } = await supabaseAdmin
        .from("vocal_coach_rules")
        .select("task_template_id, default_space_id, sort_order, is_required")
        .eq("vocal_coach_resource_item_id", coachResourceItemId)
        .order("sort_order", { ascending: true });

      if (rulesErr) throw rulesErr;
      coachRules = Array.isArray(rules)
        ? rules.map((r: any) => ({
            taskTemplateId: Number(r.task_template_id),
            defaultSpaceId: r.default_space_id ?? null,
            sortOrder: Number(r.sort_order ?? 0),
            isRequired: Boolean(r.is_required),
          }))
        : [];
    }

    if ("song" in patch) payload.song = patch.song ?? null;

    if ("instrument" in patch) payload.instrument = patch.instrument ?? false;
    if ("instrumentName" in patch)
      payload.instrument_name = patch.instrumentName ?? null;

    if ("notes" in patch) payload.notes = patch.notes ?? null;

    if ("availabilityStart" in patch)
      payload.availability_start = patch.availabilityStart ?? null;
    if ("availabilityEnd" in patch)
      payload.availability_end = patch.availabilityEnd ?? null;

    if ("vocalCoachPlanResourceItemId" in patch) {
      payload.vocal_coach_plan_resource_item_id =
        patch.vocalCoachPlanResourceItemId ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from("contestants")
      .update(payload)
      .eq("id", contestantId)
      .eq("plan_id", planId)
      .select("*")
      .single();

    if (error) throw error;
    if (!data) throw new Error("Contestant not found");

    // 3) Crear daily_tasks pending según reglas del coach (sin duplicar)
    if (shouldApplyVocalCoachRules && coachRules.length > 0) {
      const templateIds = coachRules
        .map((r) => Number(r.taskTemplateId))
        .filter((n) => Number.isFinite(n) && n > 0);

      if (templateIds.length > 0) {
        const { data: existing, error: exErr } = await supabaseAdmin
          .from("daily_tasks")
          .select("template_id")
          .eq("plan_id", planId)
          .eq("contestant_id", contestantId)
          .in("template_id", templateIds);

        if (exErr) throw exErr;

        const existingSet = new Set<number>();
        for (const row of (existing as any[]) ?? []) {
          const tid = Number((row as any).template_id);
          if (Number.isFinite(tid) && tid > 0) existingSet.add(tid);
        }

        for (const rule of coachRules) {
          if (existingSet.has(rule.taskTemplateId)) continue; // ❌ no duplicar

          // ✅ no tocamos in_progress/done (solo creamos pendientes)
          await this.createDailyTask({
            planId,
            templateId: rule.taskTemplateId,
            contestantId,
            durationOverride: null,
            camerasOverride: null,
            status: "pending",

            // hereda zoneId desde spaceId si hace falta (ver createDailyTask)
            spaceId: rule.defaultSpaceId ?? null,
          } as any);
        }
      }
    }

    return {
      id: data.id,
      planId: data.plan_id ?? null,
      name: data.name,
      instrument: data.instrument,

      coachId: data.coach_id ?? null, // legacy
      song: data.song ?? null,
      vocalCoachPlanResourceItemId:
        data.vocal_coach_plan_resource_item_id ?? null,

      createdAt: data.created_at ?? null,
    };
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const { data, error } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return data as Plan;
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const { data, error } = await supabaseAdmin
      .from("plans")
      .insert({
        date: plan.date,
        work_start: plan.workStart,
        work_end: plan.workEnd,
        meal_start: plan.mealStart,
        meal_end: plan.mealEnd,

        contestant_meal_duration_minutes:
          plan.contestantMealDurationMinutes ?? 75,
        contestant_meal_max_simultaneous:
          plan.contestantMealMaxSimultaneous ?? 10,

        // Deprecated in UI (now derived from plan_resource_items), but still stored for legacy compatibility
        cameras_available: plan.camerasAvailable ?? 0,
        status: plan.status,
      })
      .select()
      .single();
    if (error) throw error;

    // Snapshot de recursos por defecto -> unidades del plan (plan_resource_items)
    // + Snapshot de asignación de recursos por espacio (plan_space_resource_assignments)
    try {
      const { data: items, error: itemsErr } = await supabaseAdmin
        .from("resource_items")
        .select("id, type_id, name")
        .eq("is_active", true);

      if (itemsErr) throw itemsErr;

      if (items && items.length > 0) {
        const rows = items.map((i: any) => ({
          plan_id: data.id,
          type_id: i.type_id,
          resource_item_id: i.id,
          name: i.name,
          is_available: true,
          source: "default",
        }));

        const { error: snapErr } = await supabaseAdmin
          .from("plan_resource_items")
          .insert(rows);

        if (snapErr) throw snapErr;
      }

      // ✅ Snapshot: recursos asignados a ZONAS/PLATÓS (defaults -> plan)
      const { data: defaults, error: defErr } = await supabaseAdmin
        .from("zone_resource_defaults")
        .select("zone_id, resource_item_id");

      if (defErr) throw defErr;

      if ((defaults ?? []).length > 0) {
        const { data: planItems, error: planItemsErr } = await supabaseAdmin
          .from("plan_resource_items")
          .select("id, resource_item_id")
          .eq("plan_id", data.id);

        if (planItemsErr) throw planItemsErr;

        const planItemIdByResourceItemId = new Map<number, number>();
        for (const pi of planItems ?? []) {
          const rid = Number((pi as any).resource_item_id);
          const pid = Number((pi as any).id);
          if (Number.isFinite(rid) && Number.isFinite(pid)) {
            planItemIdByResourceItemId.set(rid, pid);
          }
        }

        const assignRows = (defaults ?? [])
          .map((d: any) => {
            const zoneId = Number(d.zone_id);
            const resourceItemId = Number(d.resource_item_id);
            const planResourceItemId =
              planItemIdByResourceItemId.get(resourceItemId);

            if (!planResourceItemId) return null;

            return {
              plan_id: data.id,
              zone_id: zoneId,
              plan_resource_item_id: planResourceItemId,
            };
          })
          .filter(Boolean) as any[];

        if (assignRows.length > 0) {
          const { error: aErr } = await supabaseAdmin
            .from("plan_zone_resource_assignments")
            .insert(assignRows);

          if (aErr) throw aErr;
        }
      }
      // ✅ Snapshot: requisitos genéricos por tipo (ZONAS -> plan)
      const { data: zoneTypeDefs, error: ztdErr } = await supabaseAdmin
        .from("zone_resource_type_defaults")
        .select("zone_id, resource_type_id, quantity");

      if (ztdErr) throw ztdErr;

      if ((zoneTypeDefs ?? []).length > 0) {
        const rows = (zoneTypeDefs ?? [])
          .map((r: any) => ({
            plan_id: data.id,
            zone_id: Number(r.zone_id),
            resource_type_id: Number(r.resource_type_id),
            quantity: Number(r.quantity ?? 0),
          }))
          .filter(
            (x: any) =>
              Number.isFinite(x.zone_id) && Number.isFinite(x.resource_type_id),
          );

        if (rows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from("plan_zone_resource_type_requirements")
            .insert(rows);

          if (insErr) throw insErr;
        }
      }

      // ✅ Snapshot: requisitos genéricos por tipo (ESPACIOS -> plan)
      const { data: spaceTypeDefs, error: stdErr } = await supabaseAdmin
        .from("space_resource_type_defaults")
        .select("space_id, resource_type_id, quantity");

      if (stdErr) throw stdErr;

      if ((spaceTypeDefs ?? []).length > 0) {
        const rows = (spaceTypeDefs ?? [])
          .map((r: any) => ({
            plan_id: data.id,
            space_id: Number(r.space_id),
            resource_type_id: Number(r.resource_type_id),
            quantity: Number(r.quantity ?? 0),
          }))
          .filter(
            (x: any) =>
              Number.isFinite(x.space_id) &&
              Number.isFinite(x.resource_type_id),
          );

        if (rows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from("plan_space_resource_type_requirements")
            .insert(rows);

          if (insErr) throw insErr;
        }
      }
    } catch (e: any) {
      await supabaseAdmin.from("plans").delete().eq("id", data.id);
      throw new Error(e?.message || "Failed to snapshot resources for plan");
    }

    try {
      // ✅ Snapshot: defaults de ROLES (Settings -> Plan)
      const { data: staffModeDefs, error: smdErr } = await supabaseAdmin
        .from("staff_zone_mode_defaults")
        .select("zone_id, mode");

      if (smdErr) throw smdErr;

      if ((staffModeDefs ?? []).length > 0) {
        const rows = (staffModeDefs ?? [])
          .map((r: any) => ({
            plan_id: data.id,
            zone_id: Number(r.zone_id),
            mode: r.mode === "space" ? "space" : "zone",
          }))
          .filter((x: any) => Number.isFinite(x.zone_id));

        if (rows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from("plan_zone_staff_mode")
            .insert(rows);
          if (insErr) throw insErr;
        }
      }

      const { data: staffAsgDefs, error: sadErr } = await supabaseAdmin
        .from("staff_assignment_defaults")
        .select("id, staff_role, staff_person_id, scope_type, zone_id, space_id, reality_team_code, itinerant_team_id");
      if (sadErr) throw sadErr;

      if ((staffAsgDefs ?? []).length > 0) {
        const rows: any[] = [];

        for (const a of staffAsgDefs ?? []) {
          const staffPersonId = Number((a as any).staff_person_id);
          if (!Number.isFinite(staffPersonId) || staffPersonId <= 0) {
            console.warn("[createPlan] Skipping invalid staff_assignment_default", {
              id: (a as any)?.id ?? null,
              reason: "invalid_staff_person_id",
              row: a,
            });
            continue;
          }

          if ((a as any).scope_type === "zone") {
            const zoneId = Number((a as any).zone_id);
            if (!Number.isFinite(zoneId) || zoneId <= 0) {
              console.warn("[createPlan] Skipping invalid staff_assignment_default", {
                id: (a as any)?.id ?? null,
                reason: "invalid_zone_scope",
                row: a,
              });
              continue;
            }

            rows.push({
              plan_id: data.id,
              staff_role: (a as any).staff_role,
              staff_person_id: staffPersonId,
              scope_type: "zone",
              zone_id: zoneId,
              space_id: null,
              reality_team_code: null,
              itinerant_team_id: null,
            });
            continue;
          }

          if ((a as any).scope_type === "space") {
            const spaceId = Number((a as any).space_id);
            if (!Number.isFinite(spaceId) || spaceId <= 0) {
              console.warn("[createPlan] Skipping invalid staff_assignment_default", {
                id: (a as any)?.id ?? null,
                reason: "invalid_space_scope",
                row: a,
              });
              continue;
            }

            rows.push({
              plan_id: data.id,
              staff_role: (a as any).staff_role,
              staff_person_id: staffPersonId,
              scope_type: "space",
              zone_id: null,
              space_id: spaceId,
              reality_team_code: null,
              itinerant_team_id: null,
            });
            continue;
          }

          if ((a as any).scope_type === "reality_team") {
            const realityTeamCode = String((a as any).reality_team_code ?? "").trim();
            if (realityTeamCode.length === 0) {
              console.warn("[createPlan] Skipping invalid staff_assignment_default", {
                id: (a as any)?.id ?? null,
                reason: "invalid_reality_team_scope",
                row: a,
              });
              continue;
            }

            rows.push({
              plan_id: data.id,
              staff_role: (a as any).staff_role,
              staff_person_id: staffPersonId,
              scope_type: "reality_team",
              zone_id: null,
              space_id: null,
              reality_team_code: realityTeamCode,
              itinerant_team_id: null,
            });
            continue;
          }

          if ((a as any).scope_type === "itinerant_team") {
            const itinerantTeamId = Number((a as any).itinerant_team_id);
            if (!Number.isFinite(itinerantTeamId) || itinerantTeamId <= 0) {
              console.warn("[createPlan] Skipping invalid staff_assignment_default", {
                id: (a as any)?.id ?? null,
                reason: "invalid_itinerant_team_scope",
                row: a,
              });
              continue;
            }

            rows.push({
              plan_id: data.id,
              staff_role: (a as any).staff_role,
              staff_person_id: staffPersonId,
              scope_type: "itinerant_team",
              zone_id: null,
              space_id: null,
              reality_team_code: null,
              itinerant_team_id: itinerantTeamId,
            });
            continue;
          }

          console.warn("[createPlan] Skipping invalid staff_assignment_default", {
            id: (a as any)?.id ?? null,
            reason: "invalid_scope_type",
            row: a,
          });
        }

        if (rows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from("plan_staff_assignments")
            .insert(rows);
          if (insErr) throw insErr;
        }
      }
    } catch (e: any) {
      await supabaseAdmin.from("plans").delete().eq("id", data.id);
      throw new Error(e?.message || "Failed to snapshot staff defaults for plan");
    }

    await this.syncPlanMealBreaks(Number((data as any).id));
    return data as Plan;
  }

  async deletePlan(planId: number): Promise<boolean> {
    // 0) ¿Existe el plan?
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("id", planId)
      .maybeSingle();

    if (planErr) throw planErr;
    if (!planRow) return false;

    // 1) Bloqueo: no se borra si hay tareas ejecutadas
    const { data: executed, error: execErr } = await supabaseAdmin
      .from("daily_tasks")
      .select("id, status")
      .eq("plan_id", planId)
      .in("status", ["in_progress", "done"])
      .limit(1);

    if (execErr) throw execErr;

    if ((executed ?? []).length > 0) {
      throw new Error(
        "No se puede borrar el plan: tiene tareas en progreso o ya realizadas (in_progress/done).",
      );
    }

    // 2) Borrado en orden seguro por FKs
    // Locks dependen de daily_tasks
    const { error: locksErr } = await supabaseAdmin
      .from("locks")
      .delete()
      .eq("plan_id", planId);
    if (locksErr) throw locksErr;

    const { error: tasksErr } = await supabaseAdmin
      .from("daily_tasks")
      .delete()
      .eq("plan_id", planId);
    if (tasksErr) throw tasksErr;

    const { error: contestantsErr } = await supabaseAdmin
      .from("contestants")
      .delete()
      .eq("plan_id", planId);
    if (contestantsErr) throw contestantsErr;

    // Snapshots / pools / availability (si existen en este plan)
    const { error: priErr } = await supabaseAdmin
      .from("plan_resource_items")
      .delete()
      .eq("plan_id", planId);
    if (priErr) throw priErr;

    const { error: prpErr } = await supabaseAdmin
      .from("plan_resource_pools")
      .delete()
      .eq("plan_id", planId);
    if (prpErr) throw prpErr;

    const { error: raErr } = await supabaseAdmin
      .from("resource_availability")
      .delete()
      .eq("plan_id", planId);
    if (raErr) throw raErr;

    // Finalmente: el plan
    const { error: planDelErr } = await supabaseAdmin
      .from("plans")
      .delete()
      .eq("id", planId);
    if (planDelErr) throw planDelErr;

    return true;
  }

  // Zones (Platós)
  async getZones() {
    const { data, error } = await supabaseAdmin
      .from("zones")
      .select("*")
      .order("id");
    if (error) throw error;
    return data || [];
  }

  async createZone(input: { name: string }) {
    const { data, error } = await supabaseAdmin
      .from("zones")
      .insert({ name: input.name })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateZone(
    id: number,
    input: {
      name: string;
      uiColor?: string | null;
      minimizeChangesLevel?: number;
      minimizeChangesMinChain?: number;
      groupingLevel?: unknown;
      groupingMinChain?: unknown;
    },
  ) {
    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(n)));
    };

    const upd: any = {
      name: input.name,
      ui_color: input.uiColor ?? null,
    };
    if (Object.prototype.hasOwnProperty.call(input, "minimizeChangesLevel")) {
      upd.minimize_changes_level = clamp(input.minimizeChangesLevel, 0, 10, 0);
    }
    if (Object.prototype.hasOwnProperty.call(input, "minimizeChangesMinChain")) {
      upd.minimize_changes_min_chain = clamp(input.minimizeChangesMinChain, 1, 50, 4);
    }
    if (Object.prototype.hasOwnProperty.call(input, "groupingLevel")) {
      upd.grouping_level = clamp(input.groupingLevel, 0, 10, 0);
    }
    if (Object.prototype.hasOwnProperty.call(input, "groupingMinChain")) {
      upd.grouping_min_chain = clamp(input.groupingMinChain, 1, 50, 4);
    }

    const { data, error } = await supabaseAdmin
      .from("zones")
      .update(upd)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Spaces (hierarchy)
  async getSpaces() {
    const { data, error } = await supabaseAdmin
      .from("spaces")
      .select("*")
      .order("id");
    if (error) throw error;

    return (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      zoneId: s.zone_id,
      priorityLevel: s.priority_level,
      parentSpaceId: s.parent_space_id ?? null,
      abbrev: s.abbrev ?? null,
      minimizeChangesLevel: s.minimize_changes_level ?? 0,
      minimizeChangesMinChain: s.minimize_changes_min_chain ?? 4,
      groupingLevel: s.grouping_level ?? 0,
      groupingMinChain: s.grouping_min_chain ?? 4,
      groupingApplyToDescendants: Boolean(s.grouping_apply_to_descendants ?? false),
    }));
  }

  async createSpace(input: any) {
    // Bloqueo: máx 3 niveles (root -> child -> grandchild)
    // Si parentSpaceId tiene padre, entonces el nuevo sería nivel 3.
    // Si parentSpaceId tiene abuelo, entonces sería nivel 4 => prohibido.
    if (input.parentSpaceId) {
      const { data: parent, error: parentErr } = await supabaseAdmin
        .from("spaces")
        .select("id, parent_space_id, zone_id")
        .eq("id", input.parentSpaceId)
        .single();

      if (parentErr || !parent) throw new Error("Parent space not found");

      // Seguridad: mismo plató
      if (Number(parent.zone_id) !== Number(input.zoneId)) {
        throw new Error("Parent space must belong to the same Plató (zone)");
      }

      if (parent.parent_space_id) {
        const { data: grandParent, error: gpErr } = await supabaseAdmin
          .from("spaces")
          .select("id, parent_space_id")
          .eq("id", parent.parent_space_id)
          .single();

        if (gpErr || !grandParent)
          throw new Error("Invalid hierarchy (grandparent missing)");

        // Si el abuelo ya tiene padre => parent está en nivel 3 => hijo sería nivel 4
        if (grandParent.parent_space_id) {
          throw new Error("Max depth reached (3 levels)");
        }
      }
    }

    const insert = {
      name: input.name,
      zone_id: input.zoneId,
      priority_level: input.priorityLevel ?? 1,
      parent_space_id: input.parentSpaceId ?? null,
      abbrev: input.abbrev ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("spaces")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      zoneId: data.zone_id,
      priorityLevel: data.priority_level,
      parentSpaceId: data.parent_space_id ?? null,
      abbrev: data.abbrev ?? null,
      minimizeChangesLevel: data.minimize_changes_level ?? 0,
      minimizeChangesMinChain: data.minimize_changes_min_chain ?? 4,
      groupingLevel: data.grouping_level ?? 0,
      groupingMinChain: data.grouping_min_chain ?? 4,
      groupingApplyToDescendants: Boolean(data.grouping_apply_to_descendants ?? false),
    };
  }

  async updateSpace(id: number, patch: any) {
    const upd: any = {};
    if (typeof patch.name === "string") upd.name = patch.name;
    if (typeof patch.zoneId === "number") upd.zone_id = patch.zoneId;
    if (typeof patch.priorityLevel === "number")
      upd.priority_level = patch.priorityLevel;
    if (patch.parentSpaceId === null || typeof patch.parentSpaceId === "number")
      upd.parent_space_id = patch.parentSpaceId;
    if (patch.abbrev === null || typeof patch.abbrev === "string") upd.abbrev = patch.abbrev;
    const clamp = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.max(min, Math.min(max, Math.floor(n)));
    };
    if (Object.prototype.hasOwnProperty.call(patch, "minimizeChangesLevel")) {
      const n = clamp(patch.minimizeChangesLevel, 0, 10);
      if (n !== null) upd.minimize_changes_level = n;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "minimizeChangesMinChain")) {
      const n = clamp(patch.minimizeChangesMinChain, 1, 50);
      if (n !== null) upd.minimize_changes_min_chain = n;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "groupingLevel")) {
      const n = clamp(patch.groupingLevel, 0, 10);
      upd.grouping_level = n === null ? 0 : n;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "groupingMinChain")) {
      const n = clamp(patch.groupingMinChain, 1, 50);
      upd.grouping_min_chain = n === null ? 4 : n;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "groupingApplyToDescendants")) {
      const raw = patch.groupingApplyToDescendants;
      if (typeof raw === "boolean") upd.grouping_apply_to_descendants = raw;
      else if (typeof raw === "number") upd.grouping_apply_to_descendants = raw !== 0;
      else if (typeof raw === "string") {
        const v = raw.trim().toLowerCase();
        upd.grouping_apply_to_descendants = v === "true" || v === "1" || v === "yes" || v === "on";
      } else {
        upd.grouping_apply_to_descendants = false;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("spaces")
      .update(upd)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      zoneId: data.zone_id,
      priorityLevel: data.priority_level,
      parentSpaceId: data.parent_space_id ?? null,
      abbrev: data.abbrev ?? null,
      minimizeChangesLevel: data.minimize_changes_level ?? 0,
      minimizeChangesMinChain: data.minimize_changes_min_chain ?? 4,
      groupingLevel: data.grouping_level ?? 0,
      groupingMinChain: data.grouping_min_chain ?? 4,
      groupingApplyToDescendants: Boolean(data.grouping_apply_to_descendants ?? false),
    };
  }

  async getTasksForPlan(planId: number): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from("daily_tasks")
      .select("*, template:task_templates(*)")
      .eq("plan_id", planId);

    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      planId: t.plan_id,
      templateId: t.template_id,
      contestantId: t.contestant_id ?? null,
      durationOverride: t.duration_override ?? null,
      camerasOverride: t.cameras_override ?? null,

      // ✅ ubicación en daily_task
      zoneId: t.zone_id ?? null,
      spaceId: t.space_id ?? null,
      locationLabel: t.location_label ?? null,

      status: t.status,
      startPlanned: t.start_planned ?? null,
      endPlanned: t.end_planned ?? null,
      startReal: t.start_real ?? null,
      startRealSeconds: t.start_real_seconds ?? null,
      endReal: t.end_real ?? null,
      endRealSeconds: t.end_real_seconds ?? null,
      createdAt: t.created_at ?? null,
      // ✅ recursos asignados por el planificador (motor) (plan_resource_items.id[])
      assignedResources: t.assigned_resource_ids ?? null,
      comment1Text: t.comment1_text ?? null,
      comment1Color: t.comment1_color ?? null,
      comment2Text: t.comment2_text ?? null,
      comment2Color: t.comment2_color ?? null,

      template: t.template
        ? {
            id: t.template.id,
            name: t.template.name,
            defaultDuration: t.template.default_duration,
            defaultCameras: t.template.default_cameras,
            abbrev: t.template.abbrev ?? null,
            defaultComment1Color: t.template.default_comment1_color ?? null,
            defaultComment2Color: t.template.default_comment2_color ?? null,
            createdAt: t.template.created_at ?? null,

            // ✅ nuevo
            // ✅ nuevo
            uiColor: t.template.ui_color ?? null,
            uiColorSecondary: t.template.ui_color_secondary ?? null,

            // ✅ (opcional pero útil) ubicación por defecto del template
            zoneId: t.template.zone_id ?? null,
            spaceId: t.template.space_id ?? null,
            // ✅ requisitos de recursos (JSONB)
            resourceRequirements:
              t.template.resource_requirements ??
              (t.template as any).resourceRequirements ??
              null,
            itinerantTeamRequirement:
              t.template.itinerant_team_requirement ?? "none",
            itinerantTeamId:
              t.template.itinerant_team_id == null
                ? null
                : Number(t.template.itinerant_team_id),
          }
        : null,
    }));
  }

  async createDailyTask(task: InsertDailyTask): Promise<DailyTask> {
    // 1) Determinar ubicación final:
    //    - si viene override en el create (zoneId/spaceId), se respeta
    //    - si no viene, hereda del template
    //    - si viene spaceId sin zoneId, inferimos zoneId desde spaces (defensivo)
    let finalZoneId: number | null | undefined =
      (task as any).zoneId ?? (task as any).zone_id ?? undefined;
    let finalSpaceId: number | null | undefined =
      (task as any).spaceId ?? (task as any).space_id ?? undefined;

    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from("task_templates")
      .select("zone_id, space_id, default_comment1_color, default_comment2_color")
      .eq("id", task.templateId)
      .single();
    if (tplErr) throw tplErr;

    if (finalZoneId === undefined && finalSpaceId === undefined) {
      finalZoneId = (tpl as any)?.zone_id ?? null;
      finalSpaceId = (tpl as any)?.space_id ?? null;
    }

    // Si hay spaceId pero no zoneId, inferimos plató desde el espacio (robustez)
    if (
      (finalZoneId === undefined || finalZoneId === null) &&
      finalSpaceId !== undefined &&
      finalSpaceId !== null
    ) {
      const { data: sp, error: spErr } = await supabaseAdmin
        .from("spaces") // Engine Data
        .select("zone_id")
        .eq("id", finalSpaceId)
        .single();

      if (spErr) throw spErr;
      finalZoneId = (sp as any)?.zone_id ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from("daily_tasks")
      .insert({
        plan_id: task.planId,
        template_id: task.templateId,
        contestant_id: task.contestantId,
        duration_override: task.durationOverride,
        cameras_override: task.camerasOverride,
        status: task.status,

        // Ubicación heredada / override
        zone_id: finalZoneId ?? null,
        space_id: finalSpaceId ?? null,

        // Si es creación normal, no ponemos etiqueta (solo se usa cuando se borra ubicación)
        location_label: null,
        comment1_text: (task as any).comment1Text ?? null,
        comment1_color: (task as any).comment1Color ?? ((tpl as any)?.default_comment1_color ?? null),
        comment2_text: (task as any).comment2Text ?? null,
        comment2_color: (task as any).comment2Color ?? ((tpl as any)?.default_comment2_color ?? null),
      })
      .select()
      .single();

    if (error) throw error;
    return data as DailyTask;
  }

  async updatePlannedTimes(
    taskId: number,
    startPlanned: string,
    endPlanned: string,
    assignedResourceIds?: number[] | null,
  ): Promise<{ updated: true; task: any } | { updated: false; reason: "status_locked" }> {
    const ids = Array.isArray(assignedResourceIds)
      ? assignedResourceIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const { data, error } = await supabaseAdmin
      .from("daily_tasks")
      .update({
        start_planned: startPlanned,
        end_planned: endPlanned,
        // ✅ guardar recursos asignados por el motor
        assigned_resource_ids: ids.length > 0 ? ids : null,
      })
      .eq("id", taskId)
      .not("status", "in", "(in_progress,done)")
      .select();

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return { updated: false, reason: "status_locked" };
    }
    return { updated: true, task: row };
  }

  async updateAssignedResources(taskId: number, assignedResourceIds: number[]) {
    const ids = Array.isArray(assignedResourceIds)
      ? assignedResourceIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const { data, error } = await supabaseAdmin
      .from("daily_tasks")
      .update({
        assigned_resource_ids: ids.length > 0 ? ids : null,
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  async updateTaskStatus(
    taskId: number,
    updates: any,
    userId: string,
  ): Promise<DailyTask> {
    // 1. Get current task
    const { data: task, error: fetchError } = await supabaseAdmin
      .from("daily_tasks")
      .select("*")
      .eq("id", taskId)
      .single();
    if (fetchError || !task) throw new Error("Task not found");

    // 2. Business Rules
    if (["in_progress", "done"].includes(task.status as string)) {
      // Prohibit changing planned times or key identifiers
      // For now, we only allow status updates in this function
    }

    // ✅ Guardas de ejecución (evita estados imposibles en tiempo real)
    // - Un concursante no puede tener 2 tareas simultáneas
    // - Un espacio no puede tener 2 tareas simultáneas
    if (updates?.status === "in_progress") {
      const planId = Number(task.plan_id);
      const contestantId = task.contestant_id ? Number(task.contestant_id) : null;
      const spaceId = task.space_id ? Number(task.space_id) : null;

      if (contestantId && Number.isFinite(contestantId)) {
        const { data: cConflicts, error: cErr } = await supabaseAdmin
          .from("daily_tasks")
          .select("id")
          .eq("plan_id", planId)
          .eq("contestant_id", contestantId)
          .eq("status", "in_progress")
          .neq("id", taskId)
          .limit(1);

        if (cErr) throw cErr;
        if ((cConflicts ?? []).length > 0) {
          throw new Error(
            `No se puede iniciar: el concursante ya tiene otra tarea en curso (#${cConflicts![0].id}).`,
          );
        }
      }

      if (spaceId && Number.isFinite(spaceId)) {
        const { data: sConflicts, error: sErr } = await supabaseAdmin
          .from("daily_tasks")
          .select("id")
          .eq("plan_id", planId)
          .eq("space_id", spaceId)
          .eq("status", "in_progress")
          .neq("id", taskId)
          .limit(1);

        if (sErr) throw sErr;
        if ((sConflicts ?? []).length > 0) {
          throw new Error(
            `No se puede iniciar: este espacio ya tiene otra tarea en curso (#${sConflicts![0].id}).`,
          );
        }
      }
    }

    const effectiveTime = isValidHHMM(updates?.effectiveTimeHHMM)
      ? updates.effectiveTimeHHMM
      : getEuropeMadridTimeHHMM();
    const effectiveSeconds = coerceSecond(updates?.effectiveSeconds);

    const nextStartReal =
      updates?.status === "in_progress" && !task.start_real
        ? effectiveTime
        : (task.start_real ?? null);
    const nextStartRealSeconds =
      updates?.status === "in_progress" && !task.start_real
        ? effectiveSeconds
        : (task.start_real_seconds ?? null);

    const currentPausedTotalSeconds = Number(task.paused_total_seconds ?? 0);
    const currentPausedAtSeconds = Number.isFinite(Number(task.paused_at_seconds))
      ? Number(task.paused_at_seconds)
      : null;

    let nextPausedTotalSeconds = Number.isFinite(currentPausedTotalSeconds)
      ? Math.max(0, Math.floor(currentPausedTotalSeconds))
      : 0;
    let nextPausedAtSeconds = task.paused_at_seconds ?? null;
    let nextPausedAtHHMM = task.paused_at_hhmm ?? null;

    if (updates?.status === "interrupted") {
      nextPausedAtSeconds = effectiveSeconds;
      nextPausedAtHHMM = effectiveTime;
    }

    if (updates?.status === "in_progress" && String(task.status ?? "") === "interrupted") {
      if (currentPausedAtSeconds !== null && effectiveSeconds !== null) {
        const delta = Math.max(0, Math.floor(effectiveSeconds - currentPausedAtSeconds));
        nextPausedTotalSeconds = Math.max(0, nextPausedTotalSeconds + delta);
      }
      nextPausedAtSeconds = null;
      nextPausedAtHHMM = null;
    }

    if (["done", "cancelled"].includes(String(updates?.status)) && currentPausedAtSeconds !== null && effectiveSeconds !== null) {
      const delta = Math.max(0, Math.floor(effectiveSeconds - currentPausedAtSeconds));
      nextPausedTotalSeconds = Math.max(0, nextPausedTotalSeconds + delta);
      nextPausedAtSeconds = null;
      nextPausedAtHHMM = null;
    }

    const nextEndReal =
      ["done", "cancelled"].includes(String(updates?.status)) && !task.end_real
        ? effectiveTime
        : (task.end_real ?? null);
    const nextEndRealSeconds =
      ["done", "cancelled"].includes(String(updates?.status)) && !task.end_real
        ? effectiveSeconds
        : (task.end_real_seconds ?? null);

    // 3. Update status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_tasks")
      .update({
        status: updates.status,
        start_real: nextStartReal,
        end_real: nextEndReal,
        start_real_seconds: nextStartRealSeconds,
        end_real_seconds: nextEndRealSeconds,
        paused_total_seconds: nextPausedTotalSeconds,
        paused_at_seconds: nextPausedAtSeconds,
        paused_at_hhmm: nextPausedAtHHMM,
      })
      .eq("id", taskId)
      .select()
      .single();

    if (updateError) throw updateError;

    const { error: eventErr } = await supabaseAdmin.from("task_status_events").insert({
      plan_id: task.plan_id,
      task_id: task.id,
      status: updates.status,
      changed_by: userId ?? null,
      time_real: effectiveTime,
    });
    if (eventErr) throw eventErr;

    // 4. Create Execution Lock if in_progress or done
    if (["in_progress", "done"].includes(updates.status)) {
      if (!task?.id) throw new Error("Cannot create execution lock: taskId missing");
      await this.createLock({
        planId: task.plan_id,
        taskId: task.id,
        lockType: "full",
        lockedStart: nextStartReal || task.start_planned,
        lockedEnd: nextEndReal || task.end_planned,
        createdBy: userId,
        reason: `Execution lock for status: ${updates.status}`,
      });
    }

    return updated as DailyTask;
  }

  async resetTask(taskId: number, userId: string, effectiveTimeHHMM?: string): Promise<DailyTask> {
    const { data: task, error: fetchError } = await supabaseAdmin
      .from("daily_tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !task) throw new Error("Task not found");

    const previousStatus = String(task.status ?? "pending");
    const previousStartReal = task.start_real ?? null;
    const previousEndReal = task.end_real ?? null;

    const executionLockReasonPrefix = "Execution lock";

    const { data: taskLocks, error: locksErr } = await supabaseAdmin
      .from("locks")
      .select("id, lock_type, reason")
      .eq("plan_id", Number(task.plan_id))
      .eq("task_id", taskId)
      .in("lock_type", ["time", "full"]);

    if (locksErr) throw locksErr;

    const resetFromExecutedStatus = ["in_progress", "done"].includes(previousStatus);
    const lockIdsToDelete = (taskLocks ?? [])
      .filter((lock: any) => String(lock?.lock_type ?? "") === "full")
      .map((lock: any) => Number(lock?.id))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    let locksCleared = 0;
    let clearedExecutionFull = false;

    if (lockIdsToDelete.length > 0) {
      const { data: deletedLocks, error: delLocksErr } = await supabaseAdmin
        .from("locks")
        .delete()
        .in("id", lockIdsToDelete)
        .select("id, lock_type, reason");
      if (delLocksErr) throw delLocksErr;
      locksCleared = (deletedLocks ?? []).length;
      clearedExecutionFull = (deletedLocks ?? []).some(
        (lock: any) =>
          String(lock?.lock_type ?? "") === "full" &&
          String(lock?.reason ?? "").startsWith(executionLockReasonPrefix),
      );
    }

    const updatePatch: any = {
      status: "pending",
      start_real: null,
      end_real: null,
      start_real_seconds: null,
      end_real_seconds: null,
      paused_total_seconds: 0,
      paused_at_seconds: null,
      paused_at_hhmm: null,
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_tasks")
      .update(updatePatch)
      .eq("id", taskId)
      .select()
      .single();

    if (updateError) throw updateError;

    const { error: eventErr } = await supabaseAdmin.from("task_status_events").insert({
      plan_id: task.plan_id,
      task_id: task.id,
      status: "pending",
      changed_by: userId ?? null,
      time_real: isValidHHMM(effectiveTimeHHMM) ? effectiveTimeHHMM : getEuropeMadridTimeHHMM(),
    });

    if (eventErr) throw eventErr;

    console.info("[TASK_RESET]", {
      taskId: task.id,
      planId: task.plan_id,
      previousStatus,
      previousStartReal,
      previousEndReal,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });

    console.info("[TASK_RESET_LOCK_CLEANUP]", {
      taskId: task.id,
      planId: task.plan_id,
      locksDeletedCount: locksCleared,
      clearedExecutionFull,
      resetFromExecutedStatus,
    });

    return updated as DailyTask;
  }

  async updatePlan(planId: number, patch: any) {
    // aceptamos solo campos que sabemos (evita basura)
    const safe: any = {};
    if (patch.workStart) safe.work_start = patch.workStart;
    if (patch.workEnd) safe.work_end = patch.workEnd;
    if (patch.mealStart) safe.meal_start = patch.mealStart;
    if (patch.mealEnd) safe.meal_end = patch.mealEnd;
    if (typeof patch.camerasAvailable === "number")
      safe.cameras_available = patch.camerasAvailable;
    if (typeof patch.contestantMealDurationMinutes === "number")
      safe.contestant_meal_duration_minutes =
        patch.contestantMealDurationMinutes;

    if (typeof patch.contestantMealMaxSimultaneous === "number")
      safe.contestant_meal_max_simultaneous =
        patch.contestantMealMaxSimultaneous;

    const { data, error } = await supabaseAdmin
      .from("plans")
      .update(safe)
      .eq("id", planId)
      .select("*")
      .single();

    if (error) throw error;
    await this.syncPlanMealBreaks(planId);
    return data as any;
  }

  async getTaskTemplates(): Promise<TaskTemplate[]> {
    const { data, error } = await supabaseAdmin
      .from("task_templates")
      .select("*");
    if (error) throw error;

    // Normalizar a camelCase para el cliente
    return (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,

      defaultDuration: t.default_duration ?? t.defaultDuration ?? null,
      defaultCameras: t.default_cameras ?? t.defaultCameras ?? 0,
      autoCreateOnContestantCreate:
        t.auto_create_on_contestant_create ??
        t.autoCreateOnContestantCreate ??
        false,

      // ✅ Dependencias (multi): preferimos depends_on_template_ids (jsonb array)
      // Fallback defensivo: si viene el campo viejo, lo envolvemos en array.
      dependsOnTemplateIds: Array.isArray(t.depends_on_template_ids)
        ? (t.depends_on_template_ids as any[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        : t.depends_on_template_ids
          ? (() => {
              try {
                const parsed =
                  typeof t.depends_on_template_ids === "string"
                    ? JSON.parse(t.depends_on_template_ids)
                    : t.depends_on_template_ids;
                return Array.isArray(parsed)
                  ? parsed
                      .map((x: any) => Number(x))
                      .filter((n: any) => Number.isFinite(n))
                  : [];
              } catch {
                return [];
              }
            })()
          : (t.depends_on_template_id ?? t.dependsOnTemplateId) != null
            ? [Number(t.depends_on_template_id ?? t.dependsOnTemplateId)]
            : [],

      // ✅ ubicación por defecto (nuevo)
      zoneId: t.zone_id ?? t.zoneId ?? null,
      spaceId: t.space_id ?? t.spaceId ?? null,
      locationLabel: t.location_label ?? t.locationLabel ?? null,

      requiresAuxiliar: t.requires_auxiliar ?? t.requiresAuxiliar ?? false,

      requiresCoach: t.requires_coach ?? t.requiresCoach ?? false,
      requiresPresenter: t.requires_presenter ?? t.requiresPresenter ?? false,

      exclusiveAuxiliar: t.exclusive_auxiliar ?? t.exclusiveAuxiliar ?? false,
      setupId: t.setup_id ?? t.setupId ?? null,
      rulesJson: t.rules_json ?? t.rulesJson ?? null,
      resourceRequirements:
        t.resource_requirements ?? t.resourceRequirements ?? null,
      uiColor: t.ui_color ?? t.uiColor ?? null,
      uiColorSecondary: t.ui_color_secondary ?? t.uiColorSecondary ?? null,

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement:
        t.itinerant_team_requirement ?? t.itinerantTeamRequirement ?? "none",
      itinerantTeamId:
        t.itinerant_team_id == null
          ? null
          : Number(t.itinerant_team_id ?? t.itinerantTeamId),


      hasDependency: t.has_dependency ?? t.hasDependency ?? false,
      dependsOnTemplateId:
        t.depends_on_template_id ?? t.dependsOnTemplateId ?? null,
    })) as any;
  }

  async createTaskTemplate(template: any): Promise<TaskTemplate> {
    // El cliente manda camelCase (por contrato shared). En BD es snake_case.
    const insert: any = {
      name: template.name,
      default_duration: template.defaultDuration,
      resource_requirements: Object.prototype.hasOwnProperty.call(
        template,
        "resourceRequirements",
      )
        ? template.resourceRequirements
        : null,
      default_cameras: template.defaultCameras ?? 0,
      auto_create_on_contestant_create:
        template.autoCreateOnContestantCreate ?? false,
      abbrev: template.abbrev ?? null,
      default_comment1_color: template.defaultComment1Color ?? null,
      default_comment2_color: template.defaultComment2Color ?? null,
      requires_auxiliar: template.requiresAuxiliar ?? false,
      requires_coach: template.requiresCoach ?? false,
      requires_presenter: template.requiresPresenter ?? false,
      exclusive_auxiliar: template.exclusiveAuxiliar ?? false,
      setup_id: template.setupId ?? null,
      rules_json: template.rulesJson ?? null,
      ui_color: template.uiColor ?? null,
      ui_color_secondary: template.uiColorSecondary ?? null,

      // ✅ NUEVO: múltiples dependencias (si llegan), si no, heredamos la legacy (0/1)
      depends_on_template_ids: Array.isArray(template.dependsOnTemplateIds)
        ? template.dependsOnTemplateIds
        : (template.hasDependency ?? false) &&
            template.dependsOnTemplateId != null
          ? [template.dependsOnTemplateId]
          : [],

      // legacy (compat)
      has_dependency: Array.isArray(template.dependsOnTemplateIds)
        ? template.dependsOnTemplateIds.length > 0
        : (template.hasDependency ?? false),

      depends_on_template_id: Array.isArray(template.dependsOnTemplateIds)
        ? (template.dependsOnTemplateIds[0] ?? null)
        : (template.hasDependency ?? false)
          ? (template.dependsOnTemplateId ?? null)
          : null,

      // ✅ NUEVO: equipo itinerante requerido (none | any | specific)
      itinerant_team_requirement:
        template.itinerantTeamRequirement ?? "none",
      itinerant_team_id:
        (template.itinerantTeamRequirement ?? "none") === "specific"
          ? (template.itinerantTeamId ?? null)
          : null,

      zone_id: template.zoneId ?? null,
      space_id: template.spaceId ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("task_templates")
      .insert(insert)
      .select()
      .single();

    if (error) throw error;

    // Devolver camelCase
    return {
      id: data.id,
      name: data.name,
      defaultDuration: data.default_duration ?? null,
      defaultCameras: data.default_cameras ?? 0,
      autoCreateOnContestantCreate:
        (data as any).auto_create_on_contestant_create ?? false,
      abbrev: (data as any).abbrev ?? null,
      defaultComment1Color: (data as any).default_comment1_color ?? null,
      defaultComment2Color: (data as any).default_comment2_color ?? null,
      zoneId: data.zone_id ?? null,
      spaceId: data.space_id ?? null,
      requiresAuxiliar: data.requires_auxiliar ?? false,
      requiresCoach: data.requires_coach ?? false,
      requiresPresenter: data.requires_presenter ?? false,
      exclusiveAuxiliar: data.exclusive_auxiliar ?? false,
      setupId: data.setup_id ?? null,
      rulesJson: data.rules_json ?? null,
      resourceRequirements: (data as any).resource_requirements ?? null,
      uiColor: (data as any).ui_color ?? null,
      uiColorSecondary: (data as any).ui_color_secondary ?? null,

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement:
        (data as any).itinerant_team_requirement ?? "none",
      itinerantTeamId:
        (data as any).itinerant_team_id == null
          ? null
          : Number((data as any).itinerant_team_id),

      // ✅ NUEVO: múltiples dependencias devueltas al cliente
      dependsOnTemplateIds: Array.isArray((data as any).depends_on_template_ids)
        ? ((data as any).depends_on_template_ids as any[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        : [],
      locationLabel: data.location_label ?? null,
      hasDependency: (data as any).has_dependency ?? false,
      dependsOnTemplateId: (data as any).depends_on_template_id ?? null,
    } as any;
  }

  async updateTaskTemplate(
    templateId: number,
    patch: any,
  ): Promise<TaskTemplate> {
    const safe: any = {};
    if (typeof patch.name === "string") safe.name = patch.name;

    if (typeof patch.requiresAuxiliar === "boolean")
      safe.requires_auxiliar = patch.requiresAuxiliar;
    if (typeof patch.requiresCoach === "boolean")
      safe.requires_coach = patch.requiresCoach;
    if (typeof patch.requiresPresenter === "boolean")
      safe.requires_presenter = patch.requiresPresenter;
    if (typeof patch.exclusiveAuxiliar === "boolean")
      safe.exclusive_auxiliar = patch.exclusiveAuxiliar;

    if (patch.setupId === null || typeof patch.setupId === "number")
      safe.setup_id = patch.setupId;

    const hasRules = Object.prototype.hasOwnProperty.call(patch, "rulesJson");
    if (hasRules) safe.rules_json = patch.rulesJson;

    const hasRR = Object.prototype.hasOwnProperty.call(
      patch,
      "resourceRequirements",
    );
    if (hasRR) safe.resource_requirements = patch.resourceRequirements;
    if (typeof patch.defaultDuration === "number")
      safe.default_duration = patch.defaultDuration;
    if (typeof patch.defaultCameras === "number")
      safe.default_cameras = patch.defaultCameras;
    if (typeof patch.autoCreateOnContestantCreate === "boolean") {
      safe.auto_create_on_contestant_create =
        patch.autoCreateOnContestantCreate;
    }
    if (patch.abbrev === null || typeof patch.abbrev === "string") safe.abbrev = patch.abbrev;
    if (patch.defaultComment1Color === null || typeof patch.defaultComment1Color === "string") safe.default_comment1_color = patch.defaultComment1Color;
    if (patch.defaultComment2Color === null || typeof patch.defaultComment2Color === "string") safe.default_comment2_color = patch.defaultComment2Color;
    if (patch.uiColor === null || typeof patch.uiColor === "string") {
      safe.ui_color = patch.uiColor;
    }
    if (
      patch.uiColorSecondary === null ||
      typeof patch.uiColorSecondary === "string"
    ) {
      safe.ui_color_secondary = patch.uiColorSecondary;
    }
    // ✅ NUEVO: dependencias múltiples
    const hasDependsIds = Object.prototype.hasOwnProperty.call(
      patch,
      "dependsOnTemplateIds",
    );
    if (hasDependsIds) {
      const arr = Array.isArray(patch.dependsOnTemplateIds)
        ? patch.dependsOnTemplateIds
        : [];
      safe.depends_on_template_ids = arr;

      // sync legacy
      safe.has_dependency = arr.length > 0;
      safe.depends_on_template_id = arr.length > 0 ? arr[0] : null;
    }

    // legacy (compat) si NO llega el array
    if (!hasDependsIds) {
      if (typeof patch.hasDependency === "boolean")
        safe.has_dependency = patch.hasDependency;

      const hasDependsId = Object.prototype.hasOwnProperty.call(
        patch,
        "dependsOnTemplateId",
      );
      if (hasDependsId) {
        safe.depends_on_template_id = patch.dependsOnTemplateId;
      }

      // coherencia: si desactivan dependencia, limpiamos
      if (
        typeof patch.hasDependency === "boolean" &&
        patch.hasDependency === false
      ) {
        safe.depends_on_template_id = null;
        safe.depends_on_template_ids = [];
      }
    }

    // coherencia: si desactivan dependencia, limpiamos el id
    if (
      typeof patch.hasDependency === "boolean" &&
      patch.hasDependency === false
    ) {
      safe.depends_on_template_id = null;
    }
    const hasZoneId = Object.prototype.hasOwnProperty.call(patch, "zoneId");
    const hasSpaceId = Object.prototype.hasOwnProperty.call(patch, "spaceId");

    // ✅ NUEVO: equipo itinerante requerido (none | any | specific)
    const hasTeamReq = Object.prototype.hasOwnProperty.call(
      patch,
      "itinerantTeamRequirement",
    );
    const hasTeamId = Object.prototype.hasOwnProperty.call(
      patch,
      "itinerantTeamId",
    );

    if (hasTeamReq) {
      const v =
        patch.itinerantTeamRequirement === "any"
          ? "any"
          : patch.itinerantTeamRequirement === "specific"
            ? "specific"
            : "none";
      safe.itinerant_team_requirement = v;

      // coherencia automática
      if (v !== "specific") safe.itinerant_team_id = null;
      if (v === "specific" && !hasTeamId) {
        // si pasan a specific pero no mandan id en este patch, lo dejamos como estaba (no tocamos)
      }
    }

    if (hasTeamId) {
      // si llega id, solo tiene sentido si el requirement es specific
      // si no han mandado requirement en este patch, asumimos que quieren specific
      if (!hasTeamReq) safe.itinerant_team_requirement = "specific";
      safe.itinerant_team_id = patch.itinerantTeamId ?? null;
    }

    if (patch.zoneId === null || typeof patch.zoneId === "number")
      safe.zone_id = patch.zoneId;
    if (patch.spaceId === null || typeof patch.spaceId === "number")
      safe.space_id = patch.spaceId;

    // Si el usuario toca la ubicación, quitamos la etiqueta de "Espacio borrado"
    if (hasZoneId || hasSpaceId) safe.location_label = null;

    const { data, error } = await supabaseAdmin
      .from("task_templates")
      .update(safe)
      .eq("id", templateId)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      defaultDuration: data.default_duration ?? null,
      defaultCameras: data.default_cameras ?? 0,
      autoCreateOnContestantCreate:
        (data as any).auto_create_on_contestant_create ?? false,
      abbrev: (data as any).abbrev ?? null,
      defaultComment1Color: (data as any).default_comment1_color ?? null,
      defaultComment2Color: (data as any).default_comment2_color ?? null,
      requiresAuxiliar: data.requires_auxiliar ?? false,
      requiresCoach: data.requires_coach ?? false,
      requiresPresenter: data.requires_presenter ?? false,
      exclusiveAuxiliar: data.exclusive_auxiliar ?? false,
      setupId: data.setup_id ?? null,
      rulesJson: data.rules_json ?? null,
      resourceRequirements: (data as any).resource_requirements ?? null,
      uiColor: (data as any).ui_color ?? null,
      uiColorSecondary: (data as any).ui_color_secondary ?? null,

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement:
        (data as any).itinerant_team_requirement ?? "none",
      itinerantTeamId:
        (data as any).itinerant_team_id == null
          ? null
          : Number((data as any).itinerant_team_id),

      zoneId: data.zone_id ?? null,
      spaceId: data.space_id ?? null,
      locationLabel: data.location_label ?? null,
      // ✅ NUEVO: múltiples dependencias devueltas
      dependsOnTemplateIds: Array.isArray((data as any).depends_on_template_ids)
        ? ((data as any).depends_on_template_ids as any[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        : [],

      hasDependency: (data as any).has_dependency ?? false,
      dependsOnTemplateId: (data as any).depends_on_template_id ?? null,
    } as any;
  }

  async deleteTaskTemplate(templateId: number): Promise<void> {
    // Bloqueo defensivo: no borrar si está en uso
    const { count, error: countErr } = await supabaseAdmin
      .from("daily_tasks")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);

    if (countErr) throw countErr;
    if ((count || 0) > 0) {
      throw new Error("Cannot delete template: it is used by daily tasks");
    }

    const { error } = await supabaseAdmin
      .from("task_templates")
      .delete()
      .eq("id", templateId);

    if (error) throw error;
  }

  async getLocksForPlan(planId: number): Promise<Lock[]> {
    const { data, error } = await supabaseAdmin
      .from("locks")
      .select("*")
      .eq("plan_id", planId);
    if (error) throw error;
    return data as Lock[];
  }

  async createLock(lock: InsertLock): Promise<Lock> {
    if (!Number.isFinite(Number((lock as any).taskId)) || Number((lock as any).taskId) <= 0) {
      throw new Error("Cannot create lock without a valid taskId");
    }
    const { data, error } = await supabaseAdmin
      .from("locks")
      .insert({
        plan_id: lock.planId,
        task_id: Number(lock.taskId),
        lock_type: lock.lockType,
        locked_start: lock.lockedStart,
        locked_end: lock.lockedEnd,
        locked_resource_id: lock.lockedResourceId,
        created_by: lock.createdBy,
        reason: lock.reason,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Lock;
  }

  async getCamerasAvailableForPlan(planId: number): Promise<number | null> {
    // If the plan has no snapshot rows, we return null to keep legacy plans working
    const { count, error: countErr } = await supabaseAdmin
      .from("plan_resource_items")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", planId);

    if (countErr) throw countErr;
    if ((count ?? 0) === 0) return null;

    const { data, error } = await supabaseAdmin
      .from("plan_resource_items")
      .select("id, is_available, resource_types ( code, name )")
      .eq("plan_id", planId);

    if (error) throw error;

    const rows = (data ?? []) as any[];
    const isAvail = (r: any) => r.is_available !== false;
    const codeOf = (r: any) =>
      String(r.resource_types?.code ?? "").toLowerCase();
    const nameOf = (r: any) =>
      String(r.resource_types?.name ?? "").toLowerCase();

    // Primary: code-based match (expected: "cameras")
    let cams = rows.filter(
      (r) => isAvail(r) && ["cameras", "camera"].includes(codeOf(r)),
    ).length;

    // Soft fallback: if no code matches, try name contains camera/camara (helps if user used a custom code)
    if (cams === 0) {
      cams = rows.filter(
        (r) =>
          isAvail(r) &&
          (nameOf(r).includes("camera") ||
            nameOf(r).includes("cámara") ||
            nameOf(r).includes("camara")),
      ).length;
    }

    return cams;
  }

  async getPlanResourceItemsForPlan(planId: number): Promise<
    Array<{
      id: number;
      resourceItemId: number;
      typeId: number;
      name: string;
      isAvailable: boolean;
    }>
  > {
    const { data, error } = await supabaseAdmin
      .from("plan_resource_items")
      .select("id, resource_item_id, type_id, name, is_available")
      .eq("plan_id", planId)
      .order("id", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: Number(r.id),
      resourceItemId: Number(r.resource_item_id),
      typeId: Number(r.type_id),
      name: String(r.name ?? ""),
      isAvailable: r.is_available !== false,
    }));
  }

  async getResourceItemComponentsMap(
    parentResourceItemIds: number[],
  ): Promise<
    Record<number, Array<{ componentResourceItemId: number; quantity: number }>>
  > {
    const ids = Array.from(
      new Set(
        (parentResourceItemIds ?? [])
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );

    if (ids.length === 0) return {};

    const { data, error } = await supabaseAdmin
      .from("resource_item_components")
      .select("parent_resource_item_id, component_resource_item_id, quantity")
      .in("parent_resource_item_id", ids);

    if (error) throw error;

    const out: Record<
      number,
      Array<{ componentResourceItemId: number; quantity: number }>
    > = {};
    for (const r of data ?? []) {
      const parentId = Number((r as any).parent_resource_item_id);
      const compId = Number((r as any).component_resource_item_id);
      const qty = Number((r as any).quantity ?? 1);

      if (!Number.isFinite(parentId) || parentId <= 0) continue;
      if (!Number.isFinite(compId) || compId <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      if (!out[parentId]) out[parentId] = [];
      out[parentId].push({
        componentResourceItemId: compId,
        quantity: Math.min(99, Math.max(1, Math.floor(qty))),
      });
    }

    return out;
  }

  async getSpaceResourceAssignmentsForPlan(
    planId: number,
  ): Promise<Record<number, number[]>> {
    const { data, error } = await supabaseAdmin
      .from("plan_space_resource_assignments")
      .select("space_id, plan_resource_item_id")
      .eq("plan_id", planId)
      .order("space_id", { ascending: true });

    if (error) throw error;

    const out: Record<number, number[]> = {};
    for (const r of data ?? []) {
      const spaceId = Number((r as any).space_id);
      const priId = Number((r as any).plan_resource_item_id);
      if (!Number.isFinite(spaceId) || !Number.isFinite(priId)) continue;

      if (!out[spaceId]) out[spaceId] = [];
      out[spaceId].push(priId);
    }
    return out;
  }

  async getZoneResourceAssignmentsForPlan(
    planId: number,
  ): Promise<Record<number, number[]>> {
    const { data, error } = await supabaseAdmin
      .from("plan_zone_resource_assignments")
      .select("zone_id, plan_resource_item_id")
      .eq("plan_id", planId)
      .order("zone_id", { ascending: true });

    if (error) throw error;

    const out: Record<number, number[]> = {};
    for (const r of data ?? []) {
      const zoneId = Number((r as any).zone_id);
      const priId = Number((r as any).plan_resource_item_id);
      if (!Number.isFinite(zoneId) || !Number.isFinite(priId)) continue;

      if (!out[zoneId]) out[zoneId] = [];
      out[zoneId].push(priId);
    }
    return out;
  }

  async getZoneResourceTypeRequirementsForPlan(
    planId: number,
  ): Promise<Record<number, Record<number, number>>> {
    const { data, error } = await supabaseAdmin
      .from("plan_zone_resource_type_requirements")
      .select("zone_id, resource_type_id, quantity")
      .eq("plan_id", planId)
      .order("zone_id", { ascending: true });

    if (error) throw error;

    const out: Record<number, Record<number, number>> = {};
    for (const r of data ?? []) {
      const zoneId = Number((r as any).zone_id);
      const typeId = Number((r as any).resource_type_id);
      const qty = Number((r as any).quantity ?? 0);

      if (!Number.isFinite(zoneId) || zoneId <= 0) continue;
      if (!Number.isFinite(typeId) || typeId <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      if (!out[zoneId]) out[zoneId] = {};
      out[zoneId][typeId] = Math.min(99, Math.max(0, Math.floor(qty)));
    }

    return out;
  }

  async getSpaceResourceTypeRequirementsForPlan(
    planId: number,
  ): Promise<Record<number, Record<number, number>>> {
    const { data, error } = await supabaseAdmin
      .from("plan_space_resource_type_requirements")
      .select("space_id, resource_type_id, quantity")
      .eq("plan_id", planId)
      .order("space_id", { ascending: true });

    if (error) throw error;

    const out: Record<number, Record<number, number>> = {};
    for (const r of data ?? []) {
      const spaceId = Number((r as any).space_id);
      const typeId = Number((r as any).resource_type_id);
      const qty = Number((r as any).quantity ?? 0);

      if (!Number.isFinite(spaceId) || spaceId <= 0) continue;
      if (!Number.isFinite(typeId) || typeId <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      if (!out[spaceId]) out[spaceId] = {};
      out[spaceId][typeId] = Math.min(99, Math.max(0, Math.floor(qty)));
    }

    return out;
  }

  async getPlanFullDetails(planId: number) {
    const plan = await this.getPlan(planId);
    if (!plan) return undefined;

    // ✅ Incluir el nombre de la task de comida (program_settings)
    try {
      const { data: settings, error: settingsErr } = await supabaseAdmin
        .from("program_settings")
        .select("meal_task_template_name")
        .eq("id", 1)
        .single();

      if (!settingsErr) {
        (plan as any).mealTaskTemplateName = String(
          (settings as any)?.meal_task_template_name ?? "Comer",
        );
      }
    } catch {
      (plan as any).mealTaskTemplateName = "Comer";
    }

    const tasks = await this.getTasksForPlan(planId);
    const locks = await this.getLocksForPlan(planId);
    const { data: availability } = await supabaseAdmin
      .from("resource_availability")
      .select("*")
      .eq("plan_id", planId);

    const { data: breaks } = await supabaseAdmin
      .from("plan_breaks")
      .select("*")
      .eq("plan_id", planId);

    return { plan, tasks, locks, availability: availability || [], breaks: breaks || [] };
  }
}

export const storage = new SupabaseStorage();
