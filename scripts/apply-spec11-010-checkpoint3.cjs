const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
  console.log(`patched ${path}`);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceRange(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing range start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing range end: ${label}`);
  if (source.indexOf(start, startIndex + start.length) >= 0) {
    throw new Error(`Ambiguous range start: ${label}`);
  }
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

// SPEC11-002 daily task-template snapshot: preserve its physical daily row identity
// without changing the semantic snapshot fingerprint.
{
  const path = "server/taskTemplateSnapshot.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    "export interface TaskTemplateSnapshotPersistenceRow {",
    `export interface PersistedTaskTemplateOperationalSnapshotV1 extends TaskTemplateOperationalSnapshotV1 {\n  /** Physical per-plan row identity. Excluded from operational fingerprints. */\n  readonly planTemplateSnapshotId: number;\n}\n\nexport interface TaskTemplateSnapshotPersistenceRow {`,
    "persisted task-template snapshot identity type",
  );
  source = replaceOnce(
    source,
    `export function projectTaskTemplateSnapshotRow(value: unknown): TaskTemplateOperationalSnapshotV1 {\n  return normalizeSnapshot(value, { strict: true });\n}`,
    `export function projectTaskTemplateSnapshotRow(value: unknown): PersistedTaskTemplateOperationalSnapshotV1 {\n  const record = asRecord(value);\n  if (!record) {\n    throw new TaskTemplateSnapshotError(\n      "INVALID_TASK_TEMPLATE_SNAPSHOT",\n      "Persisted task-template snapshot row must be an object.",\n    );\n  }\n  const snapshot = normalizeSnapshot(record, { strict: true });\n  const planTemplateSnapshotId = positiveInteger(\n    readPresent(record, "planTemplateSnapshotId", "plan_template_snapshot_id", "id"),\n    "planTemplateSnapshotId",\n  );\n  return deepFreeze({ ...snapshot, planTemplateSnapshotId });\n}`,
    "persisted task-template row projector",
  );
  write(path, source);
}

// Storage surface: EIS-019 returns persisted daily identities while preserving the
// existing operational snapshot contract everywhere else.
{
  const path = "server/storage.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `  type TaskTemplateOperationalSnapshotV1,\n} from "./taskTemplateSnapshot";`,
    `  type TaskTemplateOperationalSnapshotV1,\n  type PersistedTaskTemplateOperationalSnapshotV1,\n} from "./taskTemplateSnapshot";`,
    "storage persisted task-template type import",
  );
  source = replaceOnce(
    source,
    `  getPlanTaskTemplateSnapshots(planId: number): Promise<readonly TaskTemplateOperationalSnapshotV1[]>;`,
    `  getPlanTaskTemplateSnapshots(planId: number): Promise<readonly PersistedTaskTemplateOperationalSnapshotV1[]>;`,
    "IStorage persisted task-template return type",
  );
  source = replaceOnce(
    source,
    `  async getPlanTaskTemplateSnapshots(planId: number): Promise<readonly TaskTemplateOperationalSnapshotV1[]> {`,
    `  async getPlanTaskTemplateSnapshots(planId: number): Promise<readonly PersistedTaskTemplateOperationalSnapshotV1[]> {`,
    "storage persisted task-template method type",
  );
  write(path, source);
}

// EngineInput evidence surface for the daily optimizer authority and compatibility adapter.
{
  const path = "engine/types.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `  // ✅ Optimización (global, viene de Settings)\n  // mainZone = “Plató principal”`,
    `  // ✅ Optimización diaria autoritativa (SPEC11-010).\n  // Los campos legacy inferiores se derivan exclusivamente del snapshot del plan.\n  optimizerSnapshotContractVersion?: 1;\n  optimizerSnapshotSource?: "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE";\n  optimizerSnapshotEditingMode?: "BASIC" | "ADVANCED";\n  optimizerSnapshotFingerprint?: string;\n  optimizerLegacyAdapterVersion?: 1;\n  optimizerCompatibilityWarnings?: string[];\n  optimizerIgnoredActiveHeuristics?: string[];\n\n  // Compatibilidad V3/V4: mainZone = “Plató principal”`,
    "EngineInput optimizer snapshot evidence fields",
  );
  write(path, source);
}

// buildEngineInput: replace forbidden EIS-009 global optimizer read with EIS-020,
// then project the immutable daily snapshot through the pure legacy adapter.
{
  const path = "engine/buildInput.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `import { resolveWeight } from "@shared/optimizer";`,
    `import { adaptPlanOptimizerSnapshotToLegacyEngineV1 } from "./planOptimizerSnapshotLegacyAdapter";`,
    "buildInput legacy adapter import",
  );
  source = replaceOnce(
    source,
    `  | "EIS-014"\n  | "EIS-017";`,
    `  | "EIS-014"\n  | "EIS-017"\n  | "EIS-020";`,
    "EIS-020 hard source id",
  );
  source = replaceOnce(
    source,
    `  "EIS-014": "ENGINE_INPUT_PLAN_RESOURCES_UNAVAILABLE",\n  "EIS-017": "ENGINE_INPUT_RESOURCE_COMPONENTS_UNAVAILABLE",`,
    `  "EIS-014": "ENGINE_INPUT_PLAN_RESOURCES_UNAVAILABLE",\n  "EIS-017": "ENGINE_INPUT_RESOURCE_COMPONENTS_UNAVAILABLE",\n  "EIS-020": "ENGINE_INPUT_OPTIMIZER_SNAPSHOT_UNAVAILABLE",`,
    "EIS-020 reason code",
  );
  source = replaceOnce(
    source,
    `  const [details, taskTemplateSnapshots] = await Promise.all([\n    storage.getPlanEngineInputDetails(planId),\n    storage.getPlanTaskTemplateSnapshots(planId),\n  ]);`,
    `  const [details, taskTemplateSnapshots, optimizerSnapshot] = await Promise.all([\n    storage.getPlanEngineInputDetails(planId),\n    storage.getPlanTaskTemplateSnapshots(planId),\n    loadEngineInputSourceOrThrow(\n      planId,\n      "EIS-020",\n      () => storage.getPlanOptimizerSnapshot(planId),\n    ),\n  ]);`,
    "buildInput initial daily optimizer load",
  );

  const optimizerBlockStart = `  // ✅ Optimización global (Settings)\n`;
  const optimizerBlockEnd = `  // ✅ Jerarquía de espacios (para herencia de pools)\n`;
  source = replaceRange(
    source,
    optimizerBlockStart,
    optimizerBlockEnd,
    `  // ✅ SPEC11-010: autoridad diaria del optimizador. EIS-009 queda prohibido aquí.\n  const referencedOptimizerTemplateSnapshotIds = new Set<number>(\n    [\n      optimizerSnapshot.transport.arrivalPlanTemplateSnapshotId,\n      optimizerSnapshot.transport.departurePlanTemplateSnapshotId,\n    ].filter((value): value is number => value !== null),\n  );\n  const optimizerProjection = adaptPlanOptimizerSnapshotToLegacyEngineV1(\n    optimizerSnapshot,\n    taskTemplateSnapshots\n      .filter((snapshot) => referencedOptimizerTemplateSnapshotIds.has(snapshot.planTemplateSnapshotId))\n      .map((snapshot) => ({\n        planTemplateSnapshotId: snapshot.planTemplateSnapshotId,\n        sourceTemplateId: snapshot.sourceTemplateId,\n        templateName: snapshot.templateName,\n      })),\n  );\n  const optimizerGroupBySpaceAndTemplate = optimizerProjection.groupBySpaceAndTemplate;\n  const optimizerMainZoneOptKeepBusy = optimizerProjection.mainZoneOptKeepBusy;\n  const optimizerMainZoneOptFinishEarly = optimizerProjection.mainZoneOptFinishEarly;\n  const transportWeight = optimizerProjection.transport.groupingWeight;\n\n${optimizerBlockEnd}`,
    "replace global optimizer read with daily projection",
  );

  const groupingZoneBlock = `  const groupingZoneIds: number[] = Array.from(\n    new Set<number>(\n      (Array.isArray((optimizer as any)?.groupingZoneIds)\n        ? (optimizer as any).groupingZoneIds\n        : Array.isArray((optimizer as any)?.grouping_zone_ids)\n          ? (optimizer as any).grouping_zone_ids\n          : []\n      )\n        .map((v: any) => Number(v))\n        .filter((n: number) => Number.isFinite(n) && n > 0),\n    ),\n  );`;
  source = replaceOnce(
    source,
    groupingZoneBlock,
    `  const groupingZoneIds: number[] = [...optimizerProjection.groupingZoneIds];`,
    "daily grouping zone projection",
  );

  const transportStart = `  const normalizeTransportTemplateName = (value: unknown) => String(value ?? "").trim().toLowerCase();\n`;
  const transportEnd = `  const taskTemplateNameById: Record<number, string> = Object.fromEntries(\n`;
  source = replaceRange(
    source,
    transportStart,
    transportEnd,
    `  const configuredTransportTemplateIds = new Set<number>(\n    [\n      optimizerProjection.transport.arrivalSourceTemplateId,\n      optimizerProjection.transport.departureSourceTemplateId,\n    ].filter((value): value is number => value !== null),\n  );\n  const templateTransportSpaceIds = new Set<number>();\n  for (const snapshot of templates) {\n    if (!configuredTransportTemplateIds.has(snapshot.sourceTemplateId)) continue;\n    const spaceId = snapshot.defaultSpaceId;\n    if (spaceId !== null && existingSpaceIds.has(spaceId)) templateTransportSpaceIds.add(spaceId);\n  }\n  const taskTransportSpaceIds = new Set<number>();\n  for (const task of (details.tasks as any[]) ?? []) {\n    const templateId = Number(task?.template_id ?? task?.templateId ?? NaN);\n    if (!configuredTransportTemplateIds.has(templateId)) continue;\n    const spaceId = Number(task?.space_id ?? task?.spaceId ?? NaN);\n    if (Number.isFinite(spaceId) && spaceId > 0 && existingSpaceIds.has(spaceId)) {\n      taskTransportSpaceIds.add(spaceId);\n    }\n  }\n  const singleSpaceId = (ids: Set<number>): number | null => ids.size === 1 ? ids.values().next().value ?? null : null;\n  const transportSpaceId =\n    singleSpaceId(templateTransportSpaceIds)\n    ?? singleSpaceId(taskTransportSpaceIds)\n    ?? namedTransportSpaceId;\n  const transportVanCapacity = optimizerProjection.transport.vanCapacity;\n  const arrivalTransportTemplateName = optimizerProjection.transport.arrivalTemplateName;\n  const departureTransportTemplateName = optimizerProjection.transport.departureTemplateName;\n  const arrivalTransportTemplateId = optimizerProjection.transport.arrivalSourceTemplateId;\n  const departureTransportTemplateId = optimizerProjection.transport.departureSourceTemplateId;\n\n${transportEnd}`,
    "structured daily transport projection",
  );

  const taskZoneNameBlock = `            const templateName = String(\n              (isManualBlock\n                ? (t.manual_title ?? t.manualTitle ?? tpl.templateName ?? "")\n                : tpl.templateName) ?? "",\n            )\n              .trim()\n              .toLowerCase();\n\n            const arrivalTemplateName = String((optimizer as any)?.arrivalTaskTemplateName ?? "")\n              .trim()\n              .toLowerCase();\n            const departureTemplateName = String((optimizer as any)?.departureTaskTemplateName ?? "")\n              .trim()\n              .toLowerCase();\n\n            const isArrivalOrDeparture = Boolean(\n              templateName && (templateName === arrivalTemplateName || templateName === departureTemplateName),\n            );`;
  const structuredTransportCheck = `            const isArrivalOrDeparture =\n              templateId === arrivalTransportTemplateId || templateId === departureTransportTemplateId;`;
  if (source.split(taskZoneNameBlock).length - 1 !== 2) {
    throw new Error(`Expected exactly 2 nominal task transport blocks`);
  }
  source = source.split(taskZoneNameBlock).join(structuredTransportCheck);

  const returnStart = `    optimizerMainZoneId: optimizer?.mainZoneId ?? null,\n`;
  const returnEnd = `          tasks: [`;
  source = replaceRange(
    source,
    returnStart,
    returnEnd,
    `    optimizerSnapshotContractVersion: optimizerProjection.snapshot.contractVersion,\n    optimizerSnapshotSource: optimizerProjection.snapshot.source,\n    optimizerSnapshotEditingMode: optimizerProjection.snapshot.editingMode,\n    optimizerSnapshotFingerprint: optimizerProjection.snapshot.configurationFingerprint,\n    optimizerLegacyAdapterVersion: optimizerProjection.adapterVersion,\n    optimizerCompatibilityWarnings: [...optimizerProjection.snapshot.compatibilityWarnings],\n    optimizerIgnoredActiveHeuristics: [...optimizerProjection.snapshot.ignoredActiveHeuristics],\n\n    optimizerMainZoneId: optimizerProjection.mainZoneId,\n    optimizerPrioritizeMainZone: optimizerProjection.prioritizeMainZone,\n    optimizerGroupBySpaceAndTemplate,\n\n    groupingZoneIds,\n    maxTemplateChangesByZoneId,\n    spaceMealBreakMinutesByZoneId,\n\n    optimizerMainZonePriorityLevel: optimizerProjection.mainZonePriorityLevel,\n    optimizerGroupingLevel: optimizerProjection.groupingLevel,\n    optimizerMainZoneOptFinishEarly,\n    optimizerMainZoneOptKeepBusy,\n    optimizerContestantCompactLevel: optimizerProjection.contestantCompactLevel,\n    optimizerContestantStayInZoneLevel: optimizerProjection.contestantStayInZoneLevel,\n    optimizerNearHardBreaksMax: optimizerProjection.nearHardBreaksMax,\n    arrivalTaskTemplateName: arrivalTransportTemplateName,\n    departureTaskTemplateName: departureTransportTemplateName,\n    arrivalGroupingTarget: optimizerProjection.transport.arrivalGroupingTarget,\n    departureGroupingTarget: optimizerProjection.transport.departureGroupingTarget,\n    arrivalMinGapMinutes: optimizerProjection.transport.arrivalMinGapMinutes,\n    departureMinGapMinutes: optimizerProjection.transport.departureMinGapMinutes,\n    vanCapacity: transportVanCapacity,\n    transportVanCapacity,\n    transportSpaceId,\n    transportSettings: (arrivalTransportTemplateId !== null || departureTransportTemplateId !== null) ? {\n      arrivalTemplateId: arrivalTransportTemplateId,\n      departureTemplateId: departureTransportTemplateId,\n      arrivalTemplateName: arrivalTransportTemplateName,\n      departureTemplateName: departureTransportTemplateName,\n      arrivalTargetGroupSize: optimizerProjection.transport.arrivalGroupingTarget,\n      departureTargetGroupSize: optimizerProjection.transport.departureGroupingTarget,\n      arrivalMinGapMinutes: optimizerProjection.transport.arrivalMinGapMinutes,\n      departureMinGapMinutes: optimizerProjection.transport.departureMinGapMinutes,\n      vehicleCapacity: transportVanCapacity,\n      vanCapacity: transportVanCapacity,\n      transportSpaceId,\n      groupingWeight: transportWeight,\n      source: "engine-buildInput-optimizer-transport" as const,\n    } : undefined,\n\n    optimizerWeights: { ...optimizerProjection.weights },\n\n${returnEnd}`,
    "daily optimizer return projection",
  );

  if (source.includes("storage.getOptimizerSettings()")) {
    throw new Error("Forbidden EIS-009 global optimizer read remains in buildInput");
  }
  if (source.includes("(optimizer as any)") || source.includes("optimizer?.")) {
    throw new Error("Legacy global optimizer object references remain in buildInput");
  }
  if (source.includes("resolveWeight(")) {
    throw new Error("buildInput still re-derives canonical optimizer weights");
  }
  write(path, source);
}

// Existing buildInput fixtures now expose the required EIS-020 daily source.
for (const path of [
  "engine/buildInput.taskTemplateSnapshot.spec.ts",
  "engine/buildInput.sourceCriticality.spec.ts",
]) {
  let source = read(path);
  source = replaceOnce(
    source,
    `import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";`,
    `import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";\nimport { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";`,
    `${path} optimizer snapshot import`,
  );
  source = replaceOnce(
    source,
    `    getPlanTaskTemplateSnapshots: async () => snapshots,`,
    `    getPlanTaskTemplateSnapshots: async () => snapshots,\n    getPlanOptimizerSnapshot: async () => normalizePlanOptimizerSnapshotV1(optimizer),`,
    `${path} EIS-020 fixture`,
  );
  write(path, source);
}

// The checkpoint-2 guard becomes the checkpoint-3 source-authority assertion.
{
  const path = "server/planOptimizerSnapshotIntegration.spec.ts";
  let source = read(path);
  source = replaceOnce(
    source,
    `test("checkpoint 2 deliberately leaves buildEngineInput on the legacy global adapter", () => {\n  assert.match(buildInputSource, /storage\\.getOptimizerSettings\\(\\)/);\n  assert.doesNotMatch(buildInputSource, /storage\\.getPlanOptimizerSnapshot\\(/);\n});`,
    `test("checkpoint 3 makes the daily optimizer snapshot the only buildEngineInput optimizer authority", () => {\n  assert.match(buildInputSource, /storage\\.getPlanOptimizerSnapshot\\(planId\\)/);\n  assert.match(buildInputSource, /adaptPlanOptimizerSnapshotToLegacyEngineV1/);\n  assert.match(buildInputSource, /EIS-020/);\n  assert.doesNotMatch(buildInputSource, /storage\\.getOptimizerSettings\\(\\)/);\n});`,
    "checkpoint 3 buildInput authority guard",
  );
  write(path, source);
}

// README: document only this logical unit and its deliberate compatibility boundary.
{
  const path = "README.md";
  let source = read(path);
  const heading = "## SPEC11-010 — Checkpoint 3: buildEngineInput consume el snapshot diario";
  if (source.includes(heading)) throw new Error("README checkpoint 3 section already exists");
  source += [
    "",
    heading,
    "",
    "- **Objetivo (`DB Safe Merge`):** `buildEngineInput(planId)` deja de leer `optimizer_settings` global. `EIS-009` queda prohibido en esta frontera y `EIS-020` (`storage.getPlanOptimizerSnapshot(planId)`) pasa a ser fuente hard del día.",
    "- **Adapter legacy puro:** `engine/planOptimizerSnapshotLegacyAdapter.ts` proyecta `PlanOptimizerSnapshotV1` a los campos que todavía consumen V3/V4 sin consultar DB ni reinterpretar settings. Pesos efectivos, flags, niveles, zona principal y grouping salen de una única autoridad canónica.",
    "- **Transporte por identidad:** las referencias `arrival/departurePlanTemplateSnapshotId` se revierten contra la identidad física de `plan_task_template_snapshots` y de ahí a `sourceTemplateId`/nombre diario. `buildInput` ya no identifica IN/OUT mediante nombres globales mutables.",
    "- **SPEC11-002 preservado:** `projectTaskTemplateSnapshotRow` expone `planTemplateSnapshotId` sólo como identidad relacional del día; ese surrogate no entra en `sourceFingerprint` ni en el fingerprint del catálogo operativo.",
    "- **Fail closed:** un fallo de carga del snapshot se publica como `EngineInputSourceLoadError` `EIS-020 / ENGINE_INPUT_OPTIMIZER_SNAPSHOT_UNAVAILABLE`; no existe fallback a configuración global.",
    "- **Evidence de entrada:** `EngineInput` expone versión, source, modo, fingerprint del snapshot, versión del adapter y warnings de compatibilidad para demostrar qué política diaria consumió el motor.",
    "- **Sin cambio de scoring encubierto:** `CONTESTANT_TOTAL_SPAN` continúa proyectándose a `0` porque ése era el comportamiento productivo previo de `buildInput`. Si el snapshot lo trae activo se declara en `optimizerIgnoredActiveHeuristics` y warning; activarlo requiere una unidad funcional separada con Evidence/benchmark.",
    "- **Fuera de alcance:** no modifica V3/V4, Planner Next, ORC, UI, actualización manual del snapshot, SPEC10-021 ni migraciones DB nuevas. La migración 075 sigue teniendo la limitación explícita de validación contra Supabase real.",
    "",
  ].join("\n");
  write(path, source);
}

console.log("SPEC11-010 checkpoint 3 patch applied.");
