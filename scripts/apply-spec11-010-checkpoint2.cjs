const fs = require("node:fs");
const { execSync } = require("node:child_process");

const EXPECTED_MAIN = "0f681a1a6141db345e1fbb297183b2c3bdba2daa";
const TARGET = "spec11-010-checkpoint2-optimizer-snapshot-db";

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", ...options });
}

function output(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function insertBeforeOnce(source, marker, content, label) {
  return replaceOnce(source, marker, content + marker, label);
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
  console.log(`patched ${path}`);
}

run(`git fetch origin main ${TARGET}`);
const dirty = output("git status --porcelain");
if (dirty) {
  console.error("Working tree is not clean. No branch switch or reset was performed.");
  console.error(dirty);
  process.exit(2);
}
const mainSha = output("git rev-parse origin/main");
if (mainSha !== EXPECTED_MAIN) {
  throw new Error(`main moved: expected ${EXPECTED_MAIN}, found ${mainSha}. Refusing stale patch.`);
}
run(`git switch -C ${TARGET} origin/${TARGET}`);

// shared/schema.ts
{
  const path = "shared/schema.ts";
  let source = fs.readFileSync(path, "utf8");
  const tables = `// 6.2 plan_optimizer_snapshots (per-plan optimizer policy snapshot)\nexport const planOptimizerSnapshots = pgTable("plan_optimizer_snapshots", {\n  id: bigint("id", { mode: "number" }).primaryKey(),\n  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),\n  contractVersion: integer("contract_version").notNull().default(1),\n  source: text("source").notNull(),\n  editingMode: text("editing_mode").notNull(),\n  mainZoneId: integer("main_zone_id"),\n  arrivalPlanTemplateSnapshotId: bigint("arrival_plan_template_snapshot_id", { mode: "number" }).references(() => planTaskTemplateSnapshots.id, { onDelete: "cascade" }),\n  departurePlanTemplateSnapshotId: bigint("departure_plan_template_snapshot_id", { mode: "number" }).references(() => planTaskTemplateSnapshots.id, { onDelete: "cascade" }),\n  arrivalGroupingTarget: integer("arrival_grouping_target").notNull().default(0),\n  departureGroupingTarget: integer("departure_grouping_target").notNull().default(0),\n  arrivalMinGapMinutes: integer("arrival_min_gap_minutes").notNull().default(0),\n  departureMinGapMinutes: integer("departure_min_gap_minutes").notNull().default(0),\n  vanCapacity: integer("van_capacity").notNull().default(0),\n  groupingWeight: integer("grouping_weight").notNull().default(0),\n  nearHardBreaksMax: integer("near_hard_breaks_max").notNull().default(0),\n  updatedBy: uuid("updated_by"),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  planIdx: index("plan_optimizer_snapshots_plan_id_idx").on(table.planId),\n  planUnique: uniqueIndex("plan_optimizer_snapshots_plan_key").on(table.planId),\n  versionCheck: check("plan_optimizer_snapshots_contract_version_check", sql.raw("contract_version = 1")),\n  sourceCheck: check("plan_optimizer_snapshots_source_check", sql.raw("source in ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE')")),\n  editingModeCheck: check("plan_optimizer_snapshots_editing_mode_check", sql.raw("editing_mode in ('BASIC', 'ADVANCED')")),\n  arrivalTargetCheck: check("plan_optimizer_snapshots_arrival_target_check", sql.raw("arrival_grouping_target >= 0")),\n  departureTargetCheck: check("plan_optimizer_snapshots_departure_target_check", sql.raw("departure_grouping_target >= 0")),\n  arrivalGapCheck: check("plan_optimizer_snapshots_arrival_gap_check", sql.raw("arrival_min_gap_minutes >= 0")),\n  departureGapCheck: check("plan_optimizer_snapshots_departure_gap_check", sql.raw("departure_min_gap_minutes >= 0")),\n  vanCapacityCheck: check("plan_optimizer_snapshots_van_capacity_check", sql.raw("van_capacity >= 0")),\n  groupingWeightCheck: check("plan_optimizer_snapshots_grouping_weight_check", sql.raw("grouping_weight between 0 and 10")),\n  nearHardCheck: check("plan_optimizer_snapshots_near_hard_check", sql.raw("near_hard_breaks_max between 0 and 10")),\n  arrivalActiveReferenceCheck: check("plan_optimizer_snapshots_arrival_active_reference_check", sql.raw("grouping_weight = 0 or arrival_grouping_target = 0 or arrival_plan_template_snapshot_id is not null")),\n  departureActiveReferenceCheck: check("plan_optimizer_snapshots_departure_active_reference_check", sql.raw("grouping_weight = 0 or departure_grouping_target = 0 or departure_plan_template_snapshot_id is not null")),\n}));\n\nexport const planOptimizerSnapshotHeuristics = pgTable("plan_optimizer_snapshot_heuristics", {\n  id: bigint("id", { mode: "number" }).primaryKey(),\n  snapshotId: bigint("snapshot_id", { mode: "number" }).notNull().references(() => planOptimizerSnapshots.id, { onDelete: "cascade" }),\n  heuristicKey: text("heuristic_key").notNull(),\n  basicLevel: integer("basic_level").notNull(),\n  advancedValue: integer("advanced_value").notNull(),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  snapshotIdx: index("plan_optimizer_snapshot_heuristics_snapshot_id_idx").on(table.snapshotId),\n  keyUnique: uniqueIndex("plan_optimizer_snapshot_heuristics_key").on(table.snapshotId, table.heuristicKey),\n  basicLevelCheck: check("plan_optimizer_snapshot_heuristics_basic_level_check", sql.raw("basic_level between 0 and 3")),\n  advancedValueCheck: check("plan_optimizer_snapshot_heuristics_advanced_value_check", sql.raw("advanced_value between 0 and 10")),\n  heuristicKeyCheck: check("plan_optimizer_snapshot_heuristics_key_check", sql.raw("heuristic_key in ('MAIN_ZONE_PRIORITY', 'MAIN_ZONE_FINISH_EARLY', 'MAIN_ZONE_KEEP_BUSY', 'CONTESTANT_COMPACT', 'GROUP_BY_SPACE_TEMPLATE_MATCH', 'GROUP_BY_SPACE_ACTIVE', 'CONTESTANT_STAY_IN_ZONE', 'CONTESTANT_TOTAL_SPAN', 'ARRIVAL_DEPARTURE_GROUPING')")),\n}));\n\nexport const planOptimizerSnapshotGroupingZones = pgTable("plan_optimizer_snapshot_grouping_zones", {\n  id: bigint("id", { mode: "number" }).primaryKey(),\n  snapshotId: bigint("snapshot_id", { mode: "number" }).notNull().references(() => planOptimizerSnapshots.id, { onDelete: "cascade" }),\n  zoneId: integer("zone_id").notNull(),\n}, (table) => ({\n  snapshotIdx: index("plan_optimizer_snapshot_grouping_zones_snapshot_id_idx").on(table.snapshotId),\n  zoneUnique: uniqueIndex("plan_optimizer_snapshot_grouping_zones_key").on(table.snapshotId, table.zoneId),\n  zoneCheck: check("plan_optimizer_snapshot_grouping_zones_zone_check", sql.raw("zone_id > 0")),\n}));\n\n`;
  source = insertBeforeOnce(source, "// 6.5 contestants (global catalog for now)", tables, "optimizer tables before contestants");

  const insertSchemaAnchor = "export const insertPlanTaskTemplateSnapshotSchema = createInsertSchema(planTaskTemplateSnapshots).omit({ id: true, createdAt: true, updatedAt: true });";
  const insertSchemas = `${insertSchemaAnchor}\nexport const insertPlanOptimizerSnapshotSchema = createInsertSchema(planOptimizerSnapshots).omit({ id: true, createdAt: true, updatedAt: true });\nexport const insertPlanOptimizerSnapshotHeuristicSchema = createInsertSchema(planOptimizerSnapshotHeuristics).omit({ id: true, createdAt: true, updatedAt: true });\nexport const insertPlanOptimizerSnapshotGroupingZoneSchema = createInsertSchema(planOptimizerSnapshotGroupingZones).omit({ id: true });`;
  source = replaceOnce(source, insertSchemaAnchor, insertSchemas, "optimizer insert schemas");

  const typeAnchor = "export type PlanTaskTemplateSnapshot = typeof planTaskTemplateSnapshots.$inferSelect;\nexport type InsertPlanTaskTemplateSnapshot = typeof planTaskTemplateSnapshots.$inferInsert;";
  const types = `${typeAnchor}\nexport type PlanOptimizerSnapshotRow = typeof planOptimizerSnapshots.$inferSelect;\nexport type InsertPlanOptimizerSnapshot = typeof planOptimizerSnapshots.$inferInsert;\nexport type PlanOptimizerSnapshotHeuristicRow = typeof planOptimizerSnapshotHeuristics.$inferSelect;\nexport type InsertPlanOptimizerSnapshotHeuristic = typeof planOptimizerSnapshotHeuristics.$inferInsert;\nexport type PlanOptimizerSnapshotGroupingZoneRow = typeof planOptimizerSnapshotGroupingZones.$inferSelect;\nexport type InsertPlanOptimizerSnapshotGroupingZone = typeof planOptimizerSnapshotGroupingZones.$inferInsert;`;
  source = replaceOnce(source, typeAnchor, types, "optimizer inferred types");
  write(path, source);
}

// server/storage.ts
{
  const path = "server/storage.ts";
  let source = fs.readFileSync(path, "utf8");
  const importAnchor = `} from "./taskTemplateSnapshot";`;
  const optimizerImports = `${importAnchor}\nimport {\n  normalizePlanOptimizerSnapshotV1,\n  type PlanOptimizerSnapshotV1,\n} from "./planOptimizerSnapshot";\nimport {\n  PlanOptimizerSnapshotPersistenceError,\n  buildPlanOptimizerSnapshotPersistenceBundleV1,\n  hydratePlanOptimizerSnapshotV1,\n  resolvePlanOptimizerTransportReferencesV1,\n  validatePlanOptimizerSnapshotZoneReferencesV1,\n} from "./planOptimizerSnapshotPersistence";`;
  source = replaceOnce(source, importAnchor, optimizerImports, "optimizer storage imports");

  const interfaceAnchor = "  getPlanTaskTemplateSnapshots(planId: number): Promise<readonly TaskTemplateOperationalSnapshotV1[]>;";
  source = replaceOnce(
    source,
    interfaceAnchor,
    `  getPlanOptimizerSnapshot(planId: number): Promise<PlanOptimizerSnapshotV1>;\n${interfaceAnchor}`,
    "IStorage optimizer snapshot getter",
  );

  source = replaceOnce(
    source,
    "      taskTemplateCatalog,\n    ] = await Promise.all([",
    "      taskTemplateCatalog,\n      { data: optimizerSettings, error: optimizerSettingsError },\n    ] = await Promise.all([",
    "createPlan optimizer destructuring",
  );
  source = replaceOnce(
    source,
    "      this.getTaskTemplates(),\n    ]);",
    "      this.getTaskTemplates(),\n      supabaseAdmin.from(\"optimizer_settings\").select(\"*\").eq(\"id\", 1).single(),\n    ]);",
    "createPlan optimizer load",
  );
  source = replaceOnce(
    source,
    "    if (spacesError) throw spacesError;\n\n    // Validate the complete catalog before creating the plan, so no partial day can be persisted.",
    "    if (spacesError) throw spacesError;\n    if (optimizerSettingsError) throw optimizerSettingsError;\n\n    // Validate the complete catalog before creating the plan, so no partial day can be persisted.",
    "createPlan optimizer error",
  );

  const catalogAnchor = "    indexTaskTemplateSnapshots(validatedTaskTemplateSnapshots);";
  const preview = `${catalogAnchor}\n\n    // SPEC11-010: validate the optimizer candidate before creating any persistent day.\n    const optimizerPreviewReferences = resolvePlanOptimizerTransportReferencesV1(\n      optimizerSettings,\n      validatedTaskTemplateSnapshots.map((snapshot) => ({\n        sourceTemplateId: snapshot.sourceTemplateId,\n        templateName: snapshot.templateName,\n        planTemplateSnapshotId: snapshot.sourceTemplateId,\n      })),\n    );\n    const validatedOptimizerSnapshotPreview = normalizePlanOptimizerSnapshotV1(\n      optimizerSettings,\n      optimizerPreviewReferences,\n      \"INHERITED\",\n    );\n    validatePlanOptimizerSnapshotZoneReferencesV1(\n      validatedOptimizerSnapshotPreview,\n      (zoneCatalog ?? []).map((row: any) => Number(row.id)),\n    );`;
  source = replaceOnce(source, catalogAnchor, preview, "optimizer prevalidation");

  source = replaceOnce(
    source,
    "    try {\n      const taskTemplateSnapshotRows = validatedTaskTemplateSnapshots.map((snapshot: TaskTemplateOperationalSnapshotV1) =>",
    "    let persistedTaskTemplateSnapshotRows: Array<{ id: number; source_template_id: number; template_name: string }> = [];\n    try {\n      const taskTemplateSnapshotRows = validatedTaskTemplateSnapshots.map((snapshot: TaskTemplateOperationalSnapshotV1) =>",
    "persisted template snapshot rows declaration",
  );
  const oldTemplateInsert = `        const { error: taskTemplateSnapshotError } = await supabaseAdmin\n          .from("plan_task_template_snapshots")\n          .insert(taskTemplateSnapshotRows);\n        if (taskTemplateSnapshotError) throw taskTemplateSnapshotError;`;
  const newTemplateInsert = `        const { data: persistedRows, error: taskTemplateSnapshotError } = await supabaseAdmin\n          .from("plan_task_template_snapshots")\n          .insert(taskTemplateSnapshotRows)\n          .select("id, source_template_id, template_name");\n        if (taskTemplateSnapshotError) throw taskTemplateSnapshotError;\n        persistedTaskTemplateSnapshotRows = ((persistedRows as any[]) ?? []).map((row: any) => ({\n          id: Number(row.id),\n          source_template_id: Number(row.source_template_id),\n          template_name: String(row.template_name),\n        }));\n        if (persistedTaskTemplateSnapshotRows.length !== taskTemplateSnapshotRows.length) {\n          throw new PlanOptimizerSnapshotPersistenceError(\n            "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",\n            "Task-template snapshot persistence did not return the complete daily identity map.",\n            { expected: taskTemplateSnapshotRows.length, actual: persistedTaskTemplateSnapshotRows.length },\n          );\n        }`;
  source = replaceOnce(source, oldTemplateInsert, newTemplateInsert, "task template returned identities");

  const spatialTail = `    } catch (spatialError: any) {\n      return throwAfterPlanCreationFailure(Number(data.id), spatialError, "Failed to snapshot spatial availability for plan");\n    }\n\n    // Snapshot de recursos por defecto -> unidades del plan (plan_resource_items)`;
  const optimizerPersistence = `    } catch (spatialError: any) {\n      return throwAfterPlanCreationFailure(Number(data.id), spatialError, "Failed to snapshot spatial availability for plan");\n    }\n\n    // SPEC11-010: once daily template/spatial identities exist, persist the optimizer snapshot against them.\n    try {\n      const transportReferences = resolvePlanOptimizerTransportReferencesV1(\n        optimizerSettings,\n        persistedTaskTemplateSnapshotRows.map((row) => ({\n          sourceTemplateId: row.source_template_id,\n          templateName: row.template_name,\n          planTemplateSnapshotId: row.id,\n        })),\n      );\n      const optimizerSnapshot = normalizePlanOptimizerSnapshotV1(\n        optimizerSettings,\n        transportReferences,\n        \"INHERITED\",\n      );\n      validatePlanOptimizerSnapshotZoneReferencesV1(\n        optimizerSnapshot,\n        (zoneCatalog ?? []).map((row: any) => Number(row.id)),\n      );\n      const optimizerBundle = buildPlanOptimizerSnapshotPersistenceBundleV1(Number(data.id), optimizerSnapshot);\n      const { data: optimizerRow, error: optimizerSnapshotError } = await supabaseAdmin\n        .from("plan_optimizer_snapshots")\n        .insert(optimizerBundle.snapshot)\n        .select("id")\n        .single();\n      if (optimizerSnapshotError) throw optimizerSnapshotError;\n      const optimizerSnapshotId = Number((optimizerRow as any)?.id);\n      if (!Number.isFinite(optimizerSnapshotId) || optimizerSnapshotId <= 0) {\n        throw new PlanOptimizerSnapshotPersistenceError(\n          "INVALID_PLAN_OPTIMIZER_SNAPSHOT_PERSISTENCE",\n          "Optimizer snapshot persistence did not return a valid daily snapshot id.",\n        );\n      }\n\n      const { error: heuristicError } = await supabaseAdmin\n        .from("plan_optimizer_snapshot_heuristics")\n        .insert(optimizerBundle.heuristics.map((row) => ({ snapshot_id: optimizerSnapshotId, ...row })));\n      if (heuristicError) throw heuristicError;\n\n      if (optimizerBundle.groupingZones.length > 0) {\n        const { error: groupingZoneError } = await supabaseAdmin\n          .from("plan_optimizer_snapshot_grouping_zones")\n          .insert(optimizerBundle.groupingZones.map((row) => ({ snapshot_id: optimizerSnapshotId, ...row })));\n        if (groupingZoneError) throw groupingZoneError;\n      }\n    } catch (optimizerSnapshotError: any) {\n      return throwAfterPlanCreationFailure(\n        Number(data.id),\n        optimizerSnapshotError,\n        "Failed to snapshot optimizer configuration for plan",\n      );\n    }\n\n    // Snapshot de recursos por defecto -> unidades del plan (plan_resource_items)`;
  source = replaceOnce(source, spatialTail, optimizerPersistence, "optimizer persistence after spatial snapshots");

  const getterMarker = "  async getPlanTaskTemplateSnapshots(planId: number): Promise<readonly TaskTemplateOperationalSnapshotV1[]> {";
  const getter = `  async getPlanOptimizerSnapshot(planId: number): Promise<PlanOptimizerSnapshotV1> {\n    const { data: snapshot, error: snapshotError } = await supabaseAdmin\n      .from("plan_optimizer_snapshots")\n      .select("*")\n      .eq("plan_id", planId)\n      .maybeSingle();\n    if (snapshotError) throw snapshotError;\n    if (!snapshot) {\n      throw new PlanOptimizerSnapshotPersistenceError(\n        "MISSING_PLAN_OPTIMIZER_SNAPSHOT",\n        "The plan has no persisted optimizer snapshot.",\n        { planId },\n      );\n    }\n\n    const snapshotId = Number((snapshot as any).id);\n    const [heuristicsResult, groupingZonesResult] = await Promise.all([\n      supabaseAdmin\n        .from("plan_optimizer_snapshot_heuristics")\n        .select("heuristic_key, basic_level, advanced_value")\n        .eq("snapshot_id", snapshotId)\n        .order("heuristic_key", { ascending: true }),\n      supabaseAdmin\n        .from("plan_optimizer_snapshot_grouping_zones")\n        .select("zone_id")\n        .eq("snapshot_id", snapshotId)\n        .order("zone_id", { ascending: true }),\n    ]);\n    if (heuristicsResult.error) throw heuristicsResult.error;\n    if (groupingZonesResult.error) throw groupingZonesResult.error;\n\n    return hydratePlanOptimizerSnapshotV1(\n      snapshot,\n      (heuristicsResult.data as any[]) ?? [],\n      (groupingZonesResult.data as any[]) ?? [],\n    );\n  }\n\n`;
  source = insertBeforeOnce(source, getterMarker, getter, "optimizer snapshot getter");
  write(path, source);
}

// README checkpoint record.
{
  const path = "README.md";
  let source = fs.readFileSync(path, "utf8");
  const heading = "## SPEC11-010 — Checkpoint 2: persistencia del snapshot diario del optimizador";
  if (source.includes(heading)) throw new Error("README checkpoint 2 section already exists");
  const lines = [
    "",
    heading,
    "",
    "- **Problema operativo (`DB Safe Merge`):** un día ya creado no puede cambiar de comportamiento porque después se editen los defaults globales del optimizador. El snapshot del plan pasa a existir físicamente y queda preparado como autoridad diaria reproducible.",
    "- **Persistencia estructurada:** la migración `075_plan_optimizer_snapshots.sql` crea `plan_optimizer_snapshots`, `plan_optimizer_snapshot_heuristics` y `plan_optimizer_snapshot_grouping_zones`. No persiste `effectiveWeight` ni el fingerprint como autoridades redundantes; ambos se derivan del contrato V1.",
    "- **Identidades diarias:** la zona principal y las zonas de agrupación se validan contra el snapshot espacial del mismo plan. Transporte deja de conservar nombres como autoridad diaria: llegada/salida se resuelven de forma inequívoca a `plan_task_template_snapshots.id`; una referencia activa ausente o ambigua aborta la inicialización en vez de elegir la primera coincidencia.",
    "- **Creación y compensación:** `createPlan` valida el candidato antes de crear el día, conserva los IDs diarios devueltos por SPEC11-002, persiste primero el ámbito espacial necesario para validar relaciones y después inserta el snapshot del optimizador y sus relaciones. Cualquier fallo elimina el plan mediante la compensación existente, por lo que no sobrevive un día parcial.",
    "- **Backfill legacy:** los planes existentes reciben `source=LEGACY_BACKFILL` usando los defaults vigentes durante la migración. No se presenta como captura histórica exacta; un plan con referencia activa ambigua/no resoluble o zona fuera de su snapshot diario queda sin snapshot y la migración emite warning para revisión, sin relajar valores ni inventar identidades.",
    "- **Lectura tipada:** `storage.getPlanOptimizerSnapshot(planId)` reconstruye el contrato V1 exclusivamente desde tablas del plan, exige las nueve heurísticas y deriva de nuevo pesos/fingerprint. `buildEngineInput` todavía no usa este getter: ese cambio pertenece expresamente al Checkpoint 3.",
    "- **Validación de esta unidad:** tests focales cubren resolución de identidades, round-trip de persistencia, completitud de heurísticas, scope diario, SQL/RLS/backfill y orden de `createPlan`; además se ejecutan TypeScript, `check:migrations` y `git diff --check` antes de publicar el head candidato.",
    "- **Limitación de despliegue:** la migración 075 queda validada estáticamente en esta iteración, pero no se considera aplicada ni validada contra la instancia Supabase real hasta ejecutar allí la migración y sus comprobaciones. La limitación histórica de la 074 se mantiene separada.",
    "- **Fuera de alcance:** no elimina `getOptimizerSettings()` de `buildEngineInput`, no añade adapter legacy final, UI/diff/actualización manual, Evidence productiva completa, Planner Next, Totales sincronizados, holds, coordinación PREFERRED, ORC ni SPEC10-021.",
    "",
  ];
  source += lines.join("\n");
  write(path, source);
}

run("npx tsx --test server/planOptimizerSnapshot.spec.ts server/planOptimizerSnapshotPersistence.spec.ts server/planOptimizerSnapshotMigration.spec.ts server/planOptimizerSnapshotIntegration.spec.ts");
run("npm run check:migrations");
run("npm run check");
run("git diff --check");
run("git status --short");
run("git add shared/schema.ts server/storage.ts README.md");
run('git commit -m "SPEC11-010: wire optimizer snapshot persistence"');
run(`git push origin HEAD:${TARGET}`);
console.log("\nSPEC11-010 checkpoint 2 patch applied, validated focally, committed and pushed.");
