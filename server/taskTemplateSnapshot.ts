import { createHash } from "node:crypto";
import type { ResourceRequirementsInput } from "../engine/types";
import { immutableMapView } from "../shared/immutableMapView";

export const TASK_TEMPLATE_SNAPSHOT_CONTRACT_VERSION = 1 as const;

export type TaskTemplateSnapshotSource =
  | "inherited"
  | "legacy_backfill"
  | "ad_hoc_from_default";

export interface TaskTemplateOperationalSnapshotV1 {
  readonly contractVersion: 1;
  readonly sourceTemplateId: number;
  readonly source: TaskTemplateSnapshotSource;
  readonly sourceFingerprint: string;
  readonly templateName: string;
  readonly defaultDuration: number;
  readonly defaultCameras: number;
  readonly defaultZoneId: number | null;
  readonly defaultSpaceId: number | null;
  readonly autoCreateOnContestantCreate: boolean;
  readonly requiresAuxiliar: boolean;
  readonly requiresCoach: boolean;
  readonly requiresPresenter: boolean;
  readonly exclusiveAuxiliar: boolean;
  readonly hasDependency: boolean;
  readonly dependencyTemplateIds: readonly number[];
  readonly resourceRequirements: Readonly<ResourceRequirementsInput> | null;
  readonly itinerantTeamRequirement: "none" | "any" | "specific";
  readonly itinerantTeamId: number | null;
  readonly allowedItinerantTeamIds: readonly number[];
  readonly setupId: number | null;
}

export interface PersistedTaskTemplateOperationalSnapshotV1 extends TaskTemplateOperationalSnapshotV1 {
  /** Physical per-plan row identity. Excluded from operational fingerprints. */
  readonly planTemplateSnapshotId: number;
}

export interface TaskTemplateSnapshotPersistenceRow {
  readonly plan_id: number;
  readonly source_template_id: number;
  readonly contract_version: 1;
  readonly source: TaskTemplateSnapshotSource;
  readonly template_name: string;
  readonly default_duration: number;
  readonly default_cameras: number;
  readonly default_zone_id: number | null;
  readonly default_space_id: number | null;
  readonly auto_create_on_contestant_create: boolean;
  readonly requires_auxiliar: boolean;
  readonly requires_coach: boolean;
  readonly requires_presenter: boolean;
  readonly exclusive_auxiliar: boolean;
  readonly has_dependency: boolean;
  readonly dependency_template_ids: readonly number[];
  readonly resource_requirements: Readonly<ResourceRequirementsInput> | null;
  readonly itinerant_team_requirement: "none" | "any" | "specific";
  readonly itinerant_team_id: number | null;
  readonly allowed_itinerant_team_ids: readonly number[];
  readonly setup_id: number | null;
}

export class TaskTemplateSnapshotError extends Error {
  constructor(
    readonly code:
      | "INVALID_TASK_TEMPLATE_SNAPSHOT"
      | "UNKNOWN_TASK_TEMPLATE_SNAPSHOT_VERSION"
      | "DUPLICATE_TASK_TEMPLATE_SNAPSHOT"
      | "MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT"
      | "MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT_CATALOG"
      | "MISSING_TASK_TEMPLATE_FOR_AD_HOC_SNAPSHOT",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "TaskTemplateSnapshotError";
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readPresent(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskTemplateSnapshotError(
      "INVALID_TASK_TEMPLATE_SNAPSHOT",
      `${field} must be a positive integer.`,
      { field, value },
    );
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new TaskTemplateSnapshotError(
      "INVALID_TASK_TEMPLATE_SNAPSHOT",
      `${field} must be a non-negative integer.`,
      { field, value },
    );
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePositiveIntegerArray(value: unknown): readonly number[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return Object.freeze([] as number[]);
  return Object.freeze(
    Array.from(
      new Set(
        parsed
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry) && Number.isInteger(entry) && entry > 0),
      ),
    ).sort((left, right) => left - right),
  );
}

function normalizeDependencies(record: UnknownRecord): readonly number[] {
  const current = normalizePositiveIntegerArray(
    readPresent(record, "dependencyTemplateIds", "dependsOnTemplateIds", "depends_on_template_ids"),
  );
  const legacy = optionalPositiveInteger(
    readPresent(record, "dependsOnTemplateId", "depends_on_template_id"),
  );
  return Object.freeze(
    Array.from(new Set([...current, ...(legacy === null ? [] : [legacy])]))
      .sort((left, right) => left - right),
  );
}

function normalizeQuantityMap(value: unknown): Readonly<Record<number, number>> | undefined {
  const raw = parseJsonValue(value);
  const quantityById = new Map<number, number>();
  const recordQuantity = (idValue: unknown, quantityValue: unknown) => {
    const id = Number(idValue);
    const quantity = Number(quantityValue);
    if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const normalizedQuantity = Math.min(99, Math.floor(quantity));
    quantityById.set(id, Math.max(quantityById.get(id) ?? 0, normalizedQuantity));
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = asRecord(item);
      if (!row) continue;
      recordQuantity(
        readPresent(row, "resourceTypeId", "resource_type_id", "resourceItemId", "resource_item_id"),
        readPresent(row, "quantity", "qty"),
      );
    }
  } else {
    const map = asRecord(raw);
    if (map) {
      for (const [key, valueEntry] of Object.entries(map)) {
        recordQuantity(key, valueEntry);
      }
    }
  }

  if (quantityById.size === 0) return undefined;
  const entries = [...quantityById.entries()].sort(([left], [right]) => left - right);
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<number, number>>;
}

export function normalizeTaskTemplateResourceRequirements(
  value: unknown,
): Readonly<ResourceRequirementsInput> | null {
  const rawValue = parseJsonValue(value);
  const raw = asRecord(rawValue);
  if (!raw) return null;

  const byType = normalizeQuantityMap(readPresent(raw, "byType", "by_type"));
  const byItem = normalizeQuantityMap(readPresent(raw, "byItem", "by_item"));
  const groupsValue = parseJsonValue(readPresent(raw, "anyOf", "any_of"));
  const groups = Array.isArray(groupsValue) ? groupsValue : [];
  const groupByKey = new Map<string, { quantity: number; resourceItemIds: readonly number[] }>();

  for (const item of groups) {
    const group = asRecord(item);
    if (!group) continue;
    const ids = normalizePositiveIntegerArray(
      readPresent(group, "resourceItemIds", "resource_item_ids"),
    );
    if (ids.length === 0) continue;
    const rawQuantity = Number(readPresent(group, "quantity"));
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0
      ? Math.min(99, Math.floor(rawQuantity))
      : 1;
    const key = `${quantity}:${ids.join(",")}`;
    groupByKey.set(key, Object.freeze({ quantity, resourceItemIds: ids }));
  }

  const anyOf = Object.freeze(
    [...groupByKey.values()].sort((left, right) => {
      const ids = left.resourceItemIds.join(",").localeCompare(right.resourceItemIds.join(","));
      return ids !== 0 ? ids : left.quantity - right.quantity;
    }),
  );

  if (!byType && !byItem && anyOf.length === 0) return null;
  return deepFreeze({
    ...(byType ? { byType } : {}),
    ...(byItem ? { byItem } : {}),
    ...(anyOf.length > 0 ? { anyOf } : {}),
  }) as Readonly<ResourceRequirementsInput>;
}

function normalizeAllowedItinerantTeamIds(record: UnknownRecord): readonly number[] {
  const rules = asRecord(parseJsonValue(readPresent(record, "rulesJson", "rules_json")));
  if (!rules) return Object.freeze([] as number[]);
  return normalizePositiveIntegerArray(
    readPresent(rules, "itinerantTeamAllowedIds", "itinerant_team_allowed_ids"),
  );
}

function normalizeSource(value: unknown, strict: boolean): TaskTemplateSnapshotSource {
  if (value === "inherited" || value === "legacy_backfill" || value === "ad_hoc_from_default") {
    return value;
  }
  if (!strict && (value === null || value === undefined || value === "")) return "inherited";
  throw new TaskTemplateSnapshotError(
    "INVALID_TASK_TEMPLATE_SNAPSHOT",
    "source is not supported.",
    { value },
  );
}

function normalizeRequirement(
  value: unknown,
  specificId: number | null,
  strict: boolean,
): { requirement: "none" | "any" | "specific"; specificId: number | null } {
  const normalized = String(value ?? "none").trim().toLowerCase();
  if (normalized === "specific") {
    if (specificId !== null) return { requirement: "specific", specificId };
    if (strict) {
      throw new TaskTemplateSnapshotError(
        "INVALID_TASK_TEMPLATE_SNAPSHOT",
        "specific itinerant team requirement needs an id.",
      );
    }
    return { requirement: "none", specificId: null };
  }
  if (normalized === "any") return { requirement: "any", specificId: null };
  if (normalized === "none") return { requirement: "none", specificId: null };
  if (!strict) return { requirement: "none", specificId: null };
  throw new TaskTemplateSnapshotError(
    "INVALID_TASK_TEMPLATE_SNAPSHOT",
    "itinerant team requirement is not supported.",
    { value },
  );
}

function keySort(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  return numeric ? leftNumber - rightNumber : left.localeCompare(right);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort(keySort)
      .map((key) => [key, canonicalize(record[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function snapshotFingerprintPayload(
  snapshot: Omit<TaskTemplateOperationalSnapshotV1, "sourceFingerprint">,
): UnknownRecord {
  return snapshot as unknown as UnknownRecord;
}

export function deriveTaskTemplateSnapshotFingerprint(
  snapshot: Omit<TaskTemplateOperationalSnapshotV1, "sourceFingerprint">,
): string {
  return createHash("sha256")
    .update(stableJson(snapshotFingerprintPayload(snapshot)))
    .digest("hex");
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeSnapshot(
  value: unknown,
  options: { readonly source?: TaskTemplateSnapshotSource; readonly strict: boolean },
): TaskTemplateOperationalSnapshotV1 {
  const record = asRecord(value);
  if (!record) {
    throw new TaskTemplateSnapshotError(
      "INVALID_TASK_TEMPLATE_SNAPSHOT",
      "snapshot input must be an object.",
    );
  }

  const versionValue = readPresent(record, "contractVersion", "contract_version");
  const version = versionValue === null || versionValue === undefined
    ? TASK_TEMPLATE_SNAPSHOT_CONTRACT_VERSION
    : Number(versionValue);
  if (version !== TASK_TEMPLATE_SNAPSHOT_CONTRACT_VERSION) {
    throw new TaskTemplateSnapshotError(
      "UNKNOWN_TASK_TEMPLATE_SNAPSHOT_VERSION",
      `Unsupported contract version ${String(versionValue)}.`,
      { contractVersion: versionValue },
    );
  }

  const sourceTemplateId = positiveInteger(
    readPresent(record, "sourceTemplateId", "source_template_id", "id"),
    "sourceTemplateId",
  );
  const templateName = String(readPresent(record, "templateName", "template_name", "name") ?? "").trim();
  if (!templateName) {
    throw new TaskTemplateSnapshotError(
      "INVALID_TASK_TEMPLATE_SNAPSHOT",
      "templateName must not be empty.",
      { sourceTemplateId },
    );
  }

  const defaultDuration = positiveInteger(
    readPresent(record, "defaultDuration", "default_duration"),
    "defaultDuration",
  );
  const defaultCameras = nonNegativeInteger(
    readPresent(record, "defaultCameras", "default_cameras") ?? 0,
    "defaultCameras",
  );
  const specificId = optionalPositiveInteger(
    readPresent(record, "itinerantTeamId", "itinerant_team_id"),
  );
  const { requirement, specificId: normalizedSpecificId } = normalizeRequirement(
    readPresent(record, "itinerantTeamRequirement", "itinerant_team_requirement"),
    specificId,
    options.strict,
  );
  const allowedFromRules = normalizeAllowedItinerantTeamIds(record);
  const allowedFromSnapshot = normalizePositiveIntegerArray(
    readPresent(record, "allowedItinerantTeamIds", "allowed_itinerant_team_ids"),
  );
  const allowedItinerantTeamIds = Object.freeze(
    Array.from(new Set([
      ...allowedFromSnapshot,
      ...allowedFromRules,
      ...(requirement === "specific" && normalizedSpecificId !== null ? [normalizedSpecificId] : []),
    ])).sort((left, right) => left - right),
  );
  const dependencyTemplateIds = normalizeDependencies(record);

  const normalizedWithoutFingerprint = deepFreeze({
    contractVersion: TASK_TEMPLATE_SNAPSHOT_CONTRACT_VERSION,
    sourceTemplateId,
    source: options.source ?? normalizeSource(readPresent(record, "source"), options.strict),
    templateName,
    defaultDuration,
    defaultCameras,
    defaultZoneId: optionalPositiveInteger(readPresent(record, "defaultZoneId", "default_zone_id", "zoneId", "zone_id")),
    defaultSpaceId: optionalPositiveInteger(readPresent(record, "defaultSpaceId", "default_space_id", "spaceId", "space_id")),
    autoCreateOnContestantCreate: booleanValue(readPresent(record, "autoCreateOnContestantCreate", "auto_create_on_contestant_create")),
    requiresAuxiliar: booleanValue(readPresent(record, "requiresAuxiliar", "requires_auxiliar")),
    requiresCoach: booleanValue(readPresent(record, "requiresCoach", "requires_coach")),
    requiresPresenter: booleanValue(readPresent(record, "requiresPresenter", "requires_presenter")),
    exclusiveAuxiliar: booleanValue(readPresent(record, "exclusiveAuxiliar", "exclusive_auxiliar")),
    hasDependency: booleanValue(readPresent(record, "hasDependency", "has_dependency")) || dependencyTemplateIds.length > 0,
    dependencyTemplateIds,
    resourceRequirements: normalizeTaskTemplateResourceRequirements(
      readPresent(record, "resourceRequirements", "resource_requirements"),
    ),
    itinerantTeamRequirement: requirement,
    itinerantTeamId: normalizedSpecificId,
    allowedItinerantTeamIds,
    setupId: optionalPositiveInteger(readPresent(record, "setupId", "setup_id")),
  } satisfies Omit<TaskTemplateOperationalSnapshotV1, "sourceFingerprint">);

  return deepFreeze({
    ...normalizedWithoutFingerprint,
    sourceFingerprint: deriveTaskTemplateSnapshotFingerprint(normalizedWithoutFingerprint),
  });
}

export function normalizeTaskTemplateCatalogEntry(
  value: unknown,
  source: TaskTemplateSnapshotSource = "inherited",
): TaskTemplateOperationalSnapshotV1 {
  return normalizeSnapshot(value, { source, strict: false });
}

export function projectTaskTemplateSnapshotRow(value: unknown): PersistedTaskTemplateOperationalSnapshotV1 {
  const record = asRecord(value);
  if (!record) {
    throw new TaskTemplateSnapshotError(
      "INVALID_TASK_TEMPLATE_SNAPSHOT",
      "Persisted task-template snapshot row must be an object.",
    );
  }
  const snapshot = normalizeSnapshot(record, { strict: true });
  const planTemplateSnapshotId = positiveInteger(
    readPresent(record, "planTemplateSnapshotId", "plan_template_snapshot_id", "id"),
    "planTemplateSnapshotId",
  );
  return deepFreeze({ ...snapshot, planTemplateSnapshotId });
}

export function taskTemplateSnapshotToPersistenceRow(
  planIdValue: unknown,
  snapshot: TaskTemplateOperationalSnapshotV1,
): TaskTemplateSnapshotPersistenceRow {
  const planId = positiveInteger(planIdValue, "planId");
  return deepFreeze({
    plan_id: planId,
    source_template_id: snapshot.sourceTemplateId,
    contract_version: snapshot.contractVersion,
    source: snapshot.source,
    template_name: snapshot.templateName,
    default_duration: snapshot.defaultDuration,
    default_cameras: snapshot.defaultCameras,
    default_zone_id: snapshot.defaultZoneId,
    default_space_id: snapshot.defaultSpaceId,
    auto_create_on_contestant_create: snapshot.autoCreateOnContestantCreate,
    requires_auxiliar: snapshot.requiresAuxiliar,
    requires_coach: snapshot.requiresCoach,
    requires_presenter: snapshot.requiresPresenter,
    exclusive_auxiliar: snapshot.exclusiveAuxiliar,
    has_dependency: snapshot.hasDependency,
    dependency_template_ids: snapshot.dependencyTemplateIds,
    resource_requirements: snapshot.resourceRequirements,
    itinerant_team_requirement: snapshot.itinerantTeamRequirement,
    itinerant_team_id: snapshot.itinerantTeamId,
    allowed_itinerant_team_ids: snapshot.allowedItinerantTeamIds,
    setup_id: snapshot.setupId,
  });
}

export function buildTaskTemplateSnapshotRows(
  planId: unknown,
  templates: readonly unknown[],
  source: TaskTemplateSnapshotSource,
): readonly TaskTemplateSnapshotPersistenceRow[] {
  const snapshots = templates.map((template) => normalizeTaskTemplateCatalogEntry(template, source));
  indexTaskTemplateSnapshots(snapshots);
  return Object.freeze(
    snapshots
      .sort((left, right) => left.sourceTemplateId - right.sourceTemplateId)
      .map((snapshot) => taskTemplateSnapshotToPersistenceRow(planId, snapshot)),
  );
}

export function indexTaskTemplateSnapshots(
  snapshots: readonly TaskTemplateOperationalSnapshotV1[],
): ReadonlyMap<number, TaskTemplateOperationalSnapshotV1> {
  const map = new Map<number, TaskTemplateOperationalSnapshotV1>();
  for (const snapshot of snapshots) {
    if (map.has(snapshot.sourceTemplateId)) {
      throw new TaskTemplateSnapshotError(
        "DUPLICATE_TASK_TEMPLATE_SNAPSHOT",
        `Duplicate source template ${snapshot.sourceTemplateId}.`,
        { sourceTemplateId: snapshot.sourceTemplateId },
      );
    }
    map.set(snapshot.sourceTemplateId, snapshot);
  }
  return immutableMapView(map);
}

export function deriveTaskTemplateSnapshotCatalogFingerprint(
  snapshots: readonly TaskTemplateOperationalSnapshotV1[],
): string {
  indexTaskTemplateSnapshots(snapshots);
  const ordered = [...snapshots]
    .sort((left, right) => left.sourceTemplateId - right.sourceTemplateId)
    .map((snapshot) => ({
      sourceTemplateId: snapshot.sourceTemplateId,
      sourceFingerprint: snapshot.sourceFingerprint,
    }));
  return createHash("sha256").update(stableJson(ordered)).digest("hex");
}

export function summarizeTaskTemplateSnapshotSources(
  snapshots: readonly TaskTemplateOperationalSnapshotV1[],
): Readonly<Record<TaskTemplateSnapshotSource, number>> {
  const counts: Record<TaskTemplateSnapshotSource, number> = {
    inherited: 0,
    legacy_backfill: 0,
    ad_hoc_from_default: 0,
  };
  for (const snapshot of snapshots) counts[snapshot.source] += 1;
  return Object.freeze(counts);
}
