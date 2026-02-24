import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

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

  // ✅ Comida concursantes (por plan)
  contestantMealDurationMinutes: integer("contestant_meal_duration_minutes").notNull().default(75),
  contestantMealMaxSimultaneous: integer("contestant_meal_max_simultaneous").notNull().default(10),

  camerasAvailable: integer("cameras_available").notNull().default(0),
  status: text("status").notNull().default('draft'),
  isFavorite: boolean("is_favorite").notNull().default(false),
});
// 1.1 program_settings (defaults globales)
export const programSettings = pgTable("program_settings", {
  id: integer("id").primaryKey(),
  mealStart: text("meal_start").notNull(),
  mealEnd: text("meal_end").notNull(),
  contestantMealDurationMinutes: integer("contestant_meal_duration_minutes").notNull().default(75),
  contestantMealMaxSimultaneous: integer("contestant_meal_max_simultaneous").notNull().default(10),
  spaceMealBreakMinutes: integer("space_meal_break_minutes").notNull().default(45),
  itinerantMealBreakMinutes: integer("itinerant_meal_break_minutes").notNull().default(45),
  clockMode: text("clock_mode").notNull().default("auto"),
  simulatedTime: text("simulated_time"),
  simulatedSetAt: timestamp("simulated_set_at", { withTimezone: true }),
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
  vanCapacity: integer("van_capacity").notNull().default(0),
  weightArrivalDepartureGrouping: integer("weight_arrival_departure_grouping").notNull().default(0),
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
});

// 4. resources
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  type: resourceTypeEnum("type").notNull(),
  name: text("name").notNull(),
});

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
export type ResourcePool = typeof resourcePools.$inferSelect;
export type PlanResourcePool = typeof planResourcePools.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Zone = typeof zones.$inferSelect;
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
