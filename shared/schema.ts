import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum, date, uuid, bigint, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Enums
export const resourceTypeEnum = pgEnum('resource_type', ['auxiliar', 'coach', 'presenter']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'done', 'interrupted', 'cancelled']);
export const lockTypeEnum = pgEnum('lock_type', ['time', 'space', 'resource', 'full']);

// 1. plans
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  workStart: text("work_start").notNull(), // HH:mm
  workEnd: text("work_end").notNull(), // HH:mm

  // Ventana global aceptable de comida (por plan)
  mealStart: text("meal_start").notNull(), // HH:mm
  mealEnd: text("meal_end").notNull(), // HH:mm
  mealMode: text("meal_mode").notNull().default("flexible_meal_window"),

  // ✅ Comida concursantes (por plan)
  contestantMealDurationMinutes: integer("contestant_meal_duration_minutes").notNull().default(75),
  contestantMealMaxSimultaneous: integer("contestant_meal_max_simultaneous").notNull().default(10),
  spaceMealBreakMinutes: integer("space_meal_break_minutes"),

  camerasAvailable: integer("cameras_available").notNull().default(0),
  status: text("status").notNull().default('draft'),
  isFavorite: boolean("is_favorite").notNull().default(false),
  planningWarnings: jsonb("planning_warnings").$type<any[]>().notNull().default([]),
  planningStats: jsonb("planning_stats").$type<Record<string, any>>().notNull().default({}),
  optimizerEngine: text("optimizer_engine").notNull().default("v3"),
});
// 1.0.1 planning_runs (execution state + compact Engine V3 diagnostics)
export const planningRuns = pgTable("planning_runs", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  totalPending: integer("total_pending").notNull().default(0),
  plannedCount: integer("planned_count").notNull().default(0),
  message: text("message"),
  lastReasons: jsonb("last_reasons").$type<unknown[]>(),
  requestId: uuid("request_id"),
  engine: text("engine"),
  engineVersion: text("engine_version"),
  solutionSource: text("solution_source"),
  requestedTimeLimitMs: integer("requested_time_limit_ms"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  phase: text("phase"),
  phaseProgressPct: integer("phase_progress_pct").notNull().default(0),
  progressHistory: jsonb("progress_history").$type<Array<Record<string, unknown>>>().notNull().default([]),
  lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
  candidatesEvaluated: integer("candidates_evaluated").notNull().default(0),
  candidatesGenerated: integer("candidates_generated").notNull().default(0),
  currentBestReason: text("current_best_reason"),
  lastTaskId: integer("last_task_id"),
  lastTaskName: text("last_task_name"),
  plannedTasks: integer("planned_tasks"),
  unplannedTasks: integer("unplanned_tasks"),
  hardConstraintViolations: integer("hard_constraint_violations"),
  mainStageGapMinutes: integer("main_stage_gap_minutes"),
  mainStageGapCount: integer("main_stage_gap_count"),
  coachSwitchCount: integer("coach_switch_count"),
  restrictiveTalentAverageStartOffset: integer("restrictive_talent_average_start_offset"),
  selectedCandidateMetrics: jsonb("selected_candidate_metrics").$type<Record<string, unknown> | null>(),
  engineMetadata: jsonb("engine_metadata").$type<Record<string, unknown> | null>(),
  diagnosticWarnings: jsonb("diagnostic_warnings").$type<Record<string, unknown> | null>(),
}, (table) => ({
  planIdx: index("planning_runs_plan_id_idx").on(table.planId),
  latestDiagnosticsIdx: index("planning_runs_plan_created_at_idx").on(table.planId, table.createdAt),
}));

// 1.1 program_settings (defaults globales)
export const programSettings = pgTable("program_settings", {
  id: integer("id").primaryKey(),
  mealStart: text("meal_start").notNull(),
  mealEnd: text("meal_end").notNull(),
  mealMode: text("meal_mode").notNull().default("flexible_meal_window"),
  contestantMealDurationMinutes: integer("contestant_meal_duration_minutes").notNull().default(75),
  contestantMealMaxSimultaneous: integer("contestant_meal_max_simultaneous").notNull().default(10),
  spaceMealBreakMinutes: integer("space_meal_break_minutes").notNull().default(45),
  itinerantMealBreakMinutes: integer("itinerant_meal_break_minutes").notNull().default(45),
  clockMode: text("clock_mode").notNull().default("auto"),
  simulatedTime: text("simulated_time"),
  simulatedSetAt: timestamp("simulated_set_at", { withTimezone: true }),
  uiItinerantGroupOrderIndex: integer("ui_itinerant_group_order_index"),
  uiUnlocatedGroupOrderIndex: integer("ui_unlocated_group_order_index"),
});

export const planBreaks = pgTable("plan_breaks", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id),
  kind: text("kind").notNull(),
  spaceId: integer("space_id"),
  itinerantTeamId: integer("itinerant_team_id"),
  durationMinutes: integer("duration_minutes").notNull(),
  earliestStart: text("earliest_start"),
  latestEnd: text("latest_end"),
  lockedStart: text("locked_start"),
  lockedEnd: text("locked_end"),
  plannedStart: text("planned_start"),
  plannedEnd: text("planned_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 1.2 optimizer_settings (defaults globales del optimizador)
export const optimizerSettings = pgTable("optimizer_settings", {
  id: integer("id").primaryKey(),

  mainZoneId: integer("main_zone_id").references(() => zones.id),

  // legacy (siguen existiendo)
  prioritizeMainZone: boolean("prioritize_main_zone").notNull().default(false),
  groupBySpaceAndTemplate: boolean("group_by_space_and_template").notNull().default(true),

  // ✅ niveles amigables
  mainZonePriorityLevel: integer("main_zone_priority_level").notNull().default(0),
  groupingLevel: integer("grouping_level").notNull().default(2),
  contestantStayInZoneLevel: integer("contestant_stay_in_zone_level").notNull().default(0),

  // ✅ escala avanzada (0..10)
  optimizationMode: text("optimization_mode").notNull().default("basic"),
  mainZonePriorityAdvancedValue: integer("main_zone_priority_advanced_value").notNull().default(0),
  mainZoneFinishEarlyLevel: integer("main_zone_finish_early_level").notNull().default(0),
  mainZoneFinishEarlyAdvancedValue: integer("main_zone_finish_early_advanced_value").notNull().default(0),
  mainZoneKeepBusyLevel: integer("main_zone_keep_busy_level").notNull().default(0),
  mainZoneKeepBusyAdvancedValue: integer("main_zone_keep_busy_advanced_value").notNull().default(0),
  groupingAdvancedValue: integer("grouping_advanced_value").notNull().default(6),
  contestantCompactAdvancedValue: integer("contestant_compact_advanced_value").notNull().default(0),
  contestantStayInZoneAdvancedValue: integer("contestant_stay_in_zone_advanced_value").notNull().default(0),
  contestantTotalSpanLevel: integer("contestant_total_span_level").notNull().default(0),
  contestantTotalSpanAdvancedValue: integer("contestant_total_span_advanced_value"),

  // ✅ nuevos modos del plató principal (se pueden combinar)
  mainZoneOptFinishEarly: boolean("main_zone_opt_finish_early").notNull().default(true),
  mainZoneOptKeepBusy: boolean("main_zone_opt_keep_busy").notNull().default(true),

  // ✅ compactar concursantes (0..3)
  contestantCompactLevel: integer("contestant_compact_level").notNull().default(0),
  arrivalTaskTemplateName: text("arrival_task_template_name"),
  departureTaskTemplateName: text("departure_task_template_name"),
  arrivalGroupingTarget: integer("arrival_grouping_target").notNull().default(0),
  departureGroupingTarget: integer("departure_grouping_target").notNull().default(0),
  arrivalMinGapMinutes: integer("arrival_min_gap_minutes").notNull().default(0),
  departureMinGapMinutes: integer("departure_min_gap_minutes").notNull().default(0),
  vanCapacity: integer("van_capacity").notNull().default(0),
  weightArrivalDepartureGrouping: integer("weight_arrival_departure_grouping").notNull().default(0),
  nearHardBreaksMax: integer("near_hard_breaks_max").notNull().default(0),
});

// 2. zones
export const zones = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  uiColor: text("ui_color"),
  mealStartPreferred: text("meal_start_preferred"),
  mealEndPreferred: text("meal_end_preferred"),
  minimizeChangesLevel: integer("minimize_changes_level").notNull().default(0),
  minimizeChangesMinChain: integer("minimize_changes_min_chain").notNull().default(4),
  groupingLevel: integer("grouping_level").notNull().default(0),
  groupingMinChain: integer("grouping_min_chain").notNull().default(4),
  maxTemplateChanges: integer("max_template_changes").notNull().default(4),
  uiOrderIndex: integer("ui_order_index"),
});

// 3. spaces
export const spaces = pgTable("spaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbrev: text("abbrev"),
  zoneId: integer("zone_id").notNull().references(() => zones.id),
  priorityLevel: integer("priority_level").notNull().default(1),
  parentSpaceId: integer("parent_space_id").references((): any => spaces.id),
  minimizeChangesLevel: integer("minimize_changes_level").notNull().default(0),
  minimizeChangesMinChain: integer("minimize_changes_min_chain").notNull().default(4),
  groupingLevel: integer("grouping_level").notNull().default(0),
  groupingMinChain: integer("grouping_min_chain").notNull().default(4),
  groupingApplyToDescendants: boolean("grouping_apply_to_descendants")
    .notNull()
    .default(false),
});

// 4. resources
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  type: resourceTypeEnum("type").notNull(),
  name: text("name").notNull(),
});

// 4.1 resource_types/resource_items (catálogo unitario existente)
export const resourceTypes = pgTable("resource_types", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const resourceItems = pgTable("resource_items", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  typeId: bigint("type_id", { mode: "number" }).notNull().references(() => resourceTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  typeIdx: index("idx_resource_items_type").on(table.typeId),
}));

// 4.2 resource bundles (catálogo aditivo de equipos compuestos)
export const resourceBundles = pgTable("resource_bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  bundleType: text("bundle_type").notNull().default("composite"),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  isActiveIdx: index("resource_bundles_is_active_idx").on(table.isActive),
}));

export const resourceBundleComponents = pgTable("resource_bundle_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  bundleId: uuid("bundle_id").notNull().references(() => resourceBundles.id, { onDelete: "cascade" }),
  resourceId: bigint("resource_id", { mode: "number" }).references(() => resources.id, { onDelete: "cascade" }),
  resourceItemId: bigint("resource_item_id", { mode: "number" }).references(() => resourceItems.id, { onDelete: "cascade" }),
  componentRole: text("component_role").notNull(),
  quantity: integer("quantity").notNull().default(1),
  isRequired: boolean("is_required").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bundleIdx: index("resource_bundle_components_bundle_id_idx").on(table.bundleId),
  resourceIdx: index("resource_bundle_components_resource_id_idx").on(table.resourceId).where(sql`${table.resourceId} IS NOT NULL`),
  resourceItemIdx: index("resource_bundle_components_resource_item_id_idx").on(table.resourceItemId).where(sql`${table.resourceItemId} IS NOT NULL`),
  positiveQuantity: check("resource_bundle_components_quantity_check", sql`${table.quantity} > 0`),
  singleSource: check("resource_bundle_components_single_source", sql`num_nonnulls(${table.resourceId}, ${table.resourceItemId}) = 1`),
}));

export const resourceBundleSpaceAffinities = pgTable("resource_bundle_space_affinities", {
  id: uuid("id").primaryKey().defaultRandom(),
  bundleId: uuid("bundle_id").notNull().references(() => resourceBundles.id, { onDelete: "cascade" }),
  spaceId: bigint("space_id", { mode: "number" }).notNull().references(() => spaces.id, { onDelete: "cascade" }),
  affinityScore: integer("affinity_score").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => ({
  bundleIdx: index("resource_bundle_space_affinities_bundle_id_idx").on(table.bundleId),
  spaceIdx: index("resource_bundle_space_affinities_space_id_idx").on(table.spaceId),
  bundleSpaceUnique: uniqueIndex("resource_bundle_space_affinities_bundle_space_key").on(table.bundleId, table.spaceId),
}));

// 5. resource_availability
export const resourceAvailability = pgTable("resource_availability", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").notNull().references(() => resources.id),
  planId: integer("plan_id").notNull().references(() => plans.id),
  start: text("start").notNull(), // HH:mm
  end: text("end").notNull(), // HH:mm
});

// 5.5 resource_pools (admin defaults)
export const resourcePools = pgTable("resource_pools", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  defaultQuantity: integer("default_quantity").notNull().default(0),
  defaultNames: jsonb("default_names").$type<string[] | null>(),
});

// 5.6 plan_resource_pools (per-plan overrides)
export const planResourcePools = pgTable("plan_resource_pools", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id),
  poolId: integer("pool_id").notNull().references(() => resourcePools.id),
  quantity: integer("quantity").notNull().default(0),
  names: jsonb("names").$type<string[] | null>(),
});

// 6. task_templates
export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  defaultDuration: integer("default_duration").notNull(), // minutes
  autoCreateOnContestantCreate: boolean("auto_create_on_contestant_create").notNull().default(false),
  requiresAuxiliar: boolean("requires_auxiliar").notNull().default(false),
  requiresCoach: boolean("requires_coach").notNull().default(false),
  requiresPresenter: boolean("requires_presenter").notNull().default(false),
  defaultCameras: integer("default_cameras").notNull().default(0),
  abbrev: text("abbrev"),
  defaultComment1Color: text("default_comment1_color"),
  defaultComment2Color: text("default_comment2_color"),
  exclusiveAuxiliar: boolean("exclusive_auxiliar").notNull().default(false),
  setupId: integer("setup_id"), // Self reference possible, but simplified for now
  rulesJson: jsonb("rules_json").$type<any>(), // Flexible for engine rules

  // ✅ Color configurable para la UI (hex: #RRGGBB o #RRGGBBAA)
  uiColor: text("ui_color"),
  uiColorSecondary: text("ui_color_secondary"),

  // ✅ NUEVO: requisito de equipo itinerante (none | any | specific)
  itinerantTeamRequirement: text("itinerant_team_requirement").notNull().default("none"),
  itinerantTeamId: integer("itinerant_team_id"),

  // ✅ Dependencias entre task templates
  hasDependency: boolean("has_dependency").notNull().default(false),
  dependsOnTemplateId: integer("depends_on_template_id").references((): any => taskTemplates.id),

  // ✅ NUEVO: múltiples dependencias (array de ids de template)
  dependsOnTemplateIds: jsonb("depends_on_template_ids").$type<number[]>(),

  // ✅ Requisitos de recursos (genérico / específico / alternativas)
  resourceRequirements: jsonb("resource_requirements").$type<any>(),

  // Default location (optional)
  zoneId: integer("zone_id").references(() => zones.id),
  spaceId: integer("space_id").references((): any => spaces.id),
});

// 6.5 contestants (global catalog for now)
export const contestants = pgTable("contestants", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => plans.id),

  name: text("name").notNull(),
  instrument: boolean("instrument").notNull().default(false),
  instrumentName: text("instrument_name"),

  // Legacy (deprecated): old resources model
  coachId: integer("coach_id").references(() => resources.id),

  // New fields
  song: text("song"),

  // ✅ Observaciones + disponibilidad por concursante
  notes: text("notes"),
  availabilityStart: text("availability_start"),
  availabilityEnd: text("availability_end"),

  // Reference to plan snapshot resource item (plan_resource_items.id)
  vocalCoachPlanResourceItemId: integer("vocal_coach_plan_resource_item_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 7. daily_tasks
export const dailyTasks = pgTable("daily_tasks", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id),
  templateId: integer("template_id").notNull().references((): any => taskTemplates.id),
  contestantId: integer("contestant_id").references(() => contestants.id),
  durationOverride: integer("duration_override"),
  camerasOverride: integer("cameras_override"),
  status: taskStatusEnum("status").notNull().default('pending'),

  // Location (override per task)
  zoneId: integer("zone_id").references(() => zones.id),
  spaceId: integer("space_id").references((): any => spaces.id),

  // If referenced space/zone was deleted, backend will set this label
  locationLabel: text("location_label"),

  // Planned times (Engine output)
  startPlanned: text("start_planned"),
  endPlanned: text("end_planned"),

  // Real times (Execution)
  startReal: text("start_real"),
  startRealSeconds: integer("start_real_seconds"),
  pausedTotalSeconds: integer("paused_total_seconds").notNull().default(0),
  pausedAtSeconds: integer("paused_at_seconds"),
  pausedAtHHMM: text("paused_at_hhmm"),
  endReal: text("end_real"),
  endRealSeconds: integer("end_real_seconds"),
  comment1Text: text("comment1_text"),
  comment1Color: text("comment1_color"),
  comment2Text: text("comment2_text"),
  comment2Color: text("comment2_color"),
});

// 8. locks
export const locks = pgTable("locks", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id),
  taskId: integer("task_id").notNull().references(() => dailyTasks.id),
  lockType: lockTypeEnum("lock_type").notNull(),
  
  lockedStart: text("locked_start"),
  lockedEnd: text("locked_end"),
  lockedResourceId: integer("locked_resource_id").references(() => resources.id),
  
  createdBy: text("created_by").notNull(),
  reason: text("reason"),
});

// Relations
export const plansRelations = relations(plans, ({ many }) => ({
  resourceAvailabilities: many(resourceAvailability),
  dailyTasks: many(dailyTasks),
  locks: many(locks),
}));

export const zonesRelations = relations(zones, ({ many }) => ({
  spaces: many(spaces),
}));

export const spacesRelations = relations(spaces, ({ one }) => ({
  zone: one(zones, { fields: [spaces.zoneId], references: [zones.id] }),
}));


export const resourceTypesRelations = relations(resourceTypes, ({ many }) => ({
  items: many(resourceItems),
}));

export const resourceItemsRelations = relations(resourceItems, ({ one, many }) => ({
  type: one(resourceTypes, { fields: [resourceItems.typeId], references: [resourceTypes.id] }),
  bundleComponents: many(resourceBundleComponents),
}));

export const resourceBundlesRelations = relations(resourceBundles, ({ many }) => ({
  components: many(resourceBundleComponents),
  spaceAffinities: many(resourceBundleSpaceAffinities),
}));

export const resourceBundleComponentsRelations = relations(resourceBundleComponents, ({ one }) => ({
  bundle: one(resourceBundles, { fields: [resourceBundleComponents.bundleId], references: [resourceBundles.id] }),
  resource: one(resources, { fields: [resourceBundleComponents.resourceId], references: [resources.id] }),
  resourceItem: one(resourceItems, { fields: [resourceBundleComponents.resourceItemId], references: [resourceItems.id] }),
}));

export const resourceBundleSpaceAffinitiesRelations = relations(resourceBundleSpaceAffinities, ({ one }) => ({
  bundle: one(resourceBundles, { fields: [resourceBundleSpaceAffinities.bundleId], references: [resourceBundles.id] }),
  space: one(spaces, { fields: [resourceBundleSpaceAffinities.spaceId], references: [spaces.id] }),
}));

export const dailyTasksRelations = relations(dailyTasks, ({ one, many }) => ({
  plan: one(plans, { fields: [dailyTasks.planId], references: [plans.id] }),
  template: one(taskTemplates, { fields: [dailyTasks.templateId], references: [taskTemplates.id] }),
  locks: many(locks),
}));

// Schemas & Types
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true });
export const insertZoneSchema = createInsertSchema(zones).omit({ id: true });
export const insertSpaceSchema = createInsertSchema(spaces).omit({ id: true });
export const insertResourceSchema = createInsertSchema(resources).omit({ id: true });
export const insertResourceBundleSchema = createInsertSchema(resourceBundles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertResourceBundleComponentSchema = createInsertSchema(resourceBundleComponents).omit({ id: true, createdAt: true });
export const insertResourceBundleSpaceAffinitySchema = createInsertSchema(resourceBundleSpaceAffinities).omit({ id: true });
export const insertAvailabilitySchema = createInsertSchema(resourceAvailability).omit({ id: true });
export const insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({ id: true });
export const insertResourcePoolSchema = createInsertSchema(resourcePools).omit({ id: true });
export const insertPlanResourcePoolSchema = createInsertSchema(planResourcePools).omit({ id: true });
export const insertDailyTaskSchema = createInsertSchema(dailyTasks).omit({ id: true });
export const insertLockSchema = createInsertSchema(locks).omit({ id: true });

export type Plan = typeof plans.$inferSelect;

export type PlanSummary = Plan & {
  contestantsCount?: number | null;
  tasksTotal?: number | null;
  tasksPlanned?: number | null;
  firstTaskStart?: string | null;
  lastTaskEnd?: string | null;
  minutesTasksTotal?: number | null;
  availableMinutes?: number | null;
  realSpanMinutes?: number | null;
  occupancyAvailablePct?: number | null;
  occupancyRealPct?: number | null;
};
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type DailyTask = typeof dailyTasks.$inferSelect;
export type InsertDailyTask = z.infer<typeof insertDailyTaskSchema>;

export type Lock = typeof locks.$inferSelect;
export type InsertLock = z.infer<typeof insertLockSchema>;

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type ResourceType = typeof resourceTypes.$inferSelect;
export type ResourceItem = typeof resourceItems.$inferSelect;
export type ResourceBundle = typeof resourceBundles.$inferSelect;
export type InsertResourceBundle = z.infer<typeof insertResourceBundleSchema>;
export type ResourceBundleComponent = typeof resourceBundleComponents.$inferSelect;
export type InsertResourceBundleComponent = z.infer<typeof insertResourceBundleComponentSchema>;
export type ResourceBundleSpaceAffinity = typeof resourceBundleSpaceAffinities.$inferSelect;
export type InsertResourceBundleSpaceAffinity = z.infer<typeof insertResourceBundleSpaceAffinitySchema>;
export type ResourcePool = typeof resourcePools.$inferSelect;
export type PlanResourcePool = typeof planResourcePools.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Zone = typeof zones.$inferSelect;
export type ProgramSettings = typeof programSettings.$inferSelect;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export const insertContestantSchema = createInsertSchema(contestants).omit({ id: true });

export const updateContestantSchema = z.object({
  song: z.string().nullable().optional(),
  vocalCoachPlanResourceItemId: z.number().nullable().optional(),

  instrument: z.boolean().optional(),
  instrumentName: z.string().nullable().optional(),

  notes: z.string().nullable().optional(),

  availabilityStart: z.string().nullable().optional(), // "HH:MM"
  availabilityEnd: z.string().nullable().optional(),   // "HH:MM"
});

export type Contestant = typeof contestants.$inferSelect;
export type InsertContestant = z.infer<typeof insertContestantSchema>;
export type UpdateContestant = z.infer<typeof updateContestantSchema>;
