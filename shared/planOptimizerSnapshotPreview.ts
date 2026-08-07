import { z } from "zod";
import { optimizerHeuristicKeys } from "./optimizer";

export const planOptimizerSnapshotSourceSchema = z.enum(["INHERITED", "LEGACY_BACKFILL", "DAY_OVERRIDE"]);
export const planOptimizerEditingModeSchema = z.enum(["BASIC", "ADVANCED"]);

const heuristicValueSchema = z.object({
  basicLevel: z.number().int().min(0).max(3),
  advancedValue: z.number().int().min(0).max(10),
  effectiveWeight: z.number().int().min(0).max(10),
}).strict();

const heuristicEntries = Object.fromEntries(
  optimizerHeuristicKeys.map((key) => [key, heuristicValueSchema]),
) as Record<(typeof optimizerHeuristicKeys)[number], typeof heuristicValueSchema>;

export const planOptimizerSnapshotApiSchema = z.object({
  contractVersion: z.literal(1),
  source: planOptimizerSnapshotSourceSchema,
  editingMode: planOptimizerEditingModeSchema,
  mainZoneId: z.number().int().positive().nullable(),
  heuristics: z.object(heuristicEntries).strict(),
  groupingZoneIds: z.array(z.number().int().positive()),
  transport: z.object({
    arrivalPlanTemplateSnapshotId: z.number().int().positive().nullable(),
    departurePlanTemplateSnapshotId: z.number().int().positive().nullable(),
    arrivalGroupingTarget: z.number().int().nonnegative(),
    departureGroupingTarget: z.number().int().nonnegative(),
    arrivalMinGapMinutes: z.number().int().nonnegative(),
    departureMinGapMinutes: z.number().int().nonnegative(),
    vanCapacity: z.number().int().nonnegative(),
    groupingWeight: z.number().int().min(0).max(10),
  }).strict(),
  nearHardBreaksMax: z.number().int().min(0).max(10),
  configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const diffValueSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.array(z.number().int().positive()),
  heuristicValueSchema,
]);

export const planOptimizerSnapshotDiffApiSchema = z.object({
  contractVersion: z.literal(1),
  current: z.object({
    source: planOptimizerSnapshotSourceSchema,
    configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  candidate: z.object({
    source: planOptimizerSnapshotSourceSchema,
    configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  provenanceChanged: z.boolean(),
  hasSemanticChanges: z.boolean(),
  replanningRequiredForEffect: z.boolean(),
  changes: z.array(z.object({
    path: z.string().min(1),
    category: z.enum(["EDITING_MODE", "MAIN_ZONE", "HEURISTIC", "GROUPING_ZONES", "TRANSPORT_TEMPLATE", "TRANSPORT_PARAMETER", "NEAR_HARD"]),
    heuristicKey: z.enum(optimizerHeuristicKeys).optional(),
    currentValue: diffValueSchema,
    candidateValue: diffValueSchema,
  }).strict()),
  warnings: z.array(z.enum(["CURRENT_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL", "CANDIDATE_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"])),
}).strict();

const incompatibilitySchema = z.object({
  code: z.enum(["ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED", "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE", "INVALID_GLOBAL_OPTIMIZER_SETTINGS"]),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
}).strict();

export const planOptimizerRefreshPreviewApiSchema = z.discriminatedUnion("status", [
  z.object({
    contractVersion: z.literal(1),
    status: z.literal("READY"),
    current: planOptimizerSnapshotApiSchema,
    candidate: planOptimizerSnapshotApiSchema,
    diff: planOptimizerSnapshotDiffApiSchema,
    incompatibilities: z.tuple([]),
  }).strict(),
  z.object({
    contractVersion: z.literal(1),
    status: z.literal("BLOCKED"),
    current: planOptimizerSnapshotApiSchema,
    candidate: z.null(),
    diff: z.null(),
    incompatibilities: z.array(incompatibilitySchema).min(1),
  }).strict(),
]);

export type PlanOptimizerRefreshPreviewApi = z.infer<typeof planOptimizerRefreshPreviewApiSchema>;
