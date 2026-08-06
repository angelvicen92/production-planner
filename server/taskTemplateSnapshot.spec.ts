import assert from "node:assert/strict";
import test from "node:test";
import {
  TaskTemplateSnapshotError,
  buildTaskTemplateSnapshotRows,
  deriveTaskTemplateSnapshotCatalogFingerprint,
  indexTaskTemplateSnapshots,
  normalizeTaskTemplateCatalogEntry,
  normalizeTaskTemplateResourceRequirements,
  projectTaskTemplateSnapshotRow,
} from "./taskTemplateSnapshot";

const base = {
  id: 7,
  name: "Ensayo",
  defaultDuration: 30,
  defaultCameras: 2,
  zoneId: 4,
  spaceId: 9,
  autoCreateOnContestantCreate: true,
  requiresAuxiliar: true,
  requiresCoach: false,
  requiresPresenter: false,
  exclusiveAuxiliar: false,
  hasDependency: true,
  dependsOnTemplateId: 2,
  dependsOnTemplateIds: [5, 2, 5],
  resourceRequirements: {
    byType: { 11: 2, 3: 1 },
    byItem: [{ resourceItemId: 22, quantity: 1 }],
    anyOf: [{ quantity: 1, resourceItemIds: [9, 8, 9] }],
  },
  itinerantTeamRequirement: "specific",
  itinerantTeamId: 13,
  rulesJson: { itinerantTeamAllowedIds: [15, 13, 15] },
  setupId: 6,
} as const;

test("normalizes camel and snake rows to the same immutable contract", () => {
  const camel = normalizeTaskTemplateCatalogEntry(base, "inherited");
  const snake = normalizeTaskTemplateCatalogEntry({
    id: 7,
    name: "Ensayo",
    default_duration: 30,
    default_cameras: 2,
    zone_id: 4,
    space_id: 9,
    auto_create_on_contestant_create: true,
    requires_auxiliar: true,
    requires_coach: false,
    requires_presenter: false,
    exclusive_auxiliar: false,
    has_dependency: true,
    depends_on_template_id: 2,
    depends_on_template_ids: [5, 2, 5],
    resource_requirements: {
      by_type: { 11: 2, 3: 1 },
      by_item: [{ resource_item_id: 22, quantity: 1 }],
      any_of: [{ quantity: 1, resource_item_ids: [9, 8, 9] }],
    },
    itinerant_team_requirement: "specific",
    itinerant_team_id: 13,
    rules_json: { itinerant_team_allowed_ids: [15, 13, 15] },
    setup_id: 6,
  }, "inherited");
  assert.deepEqual(camel, snake);
  assert.deepEqual(camel.dependencyTemplateIds, [2, 5]);
  assert.deepEqual(camel.allowedItinerantTeamIds, [13, 15]);
  assert.equal(Object.isFrozen(camel), true);
  assert.equal(Object.isFrozen(camel.resourceRequirements), true);
  assert.equal(Object.isFrozen(camel.dependencyTemplateIds), true);
});

test("resource requirements are deterministic and do not mutate input", () => {
  const input = Object.freeze({
    by_type: Object.freeze({ 10: 1, 2: 3, bad: 4 }),
    by_item: Object.freeze([{ resource_item_id: 9, qty: 2 }, { resource_item_id: -1, qty: 5 }]),
    any_of: Object.freeze([
      Object.freeze({ quantity: 2, resource_item_ids: Object.freeze([5, 4, 5]) }),
      Object.freeze({ quantity: 2, resource_item_ids: Object.freeze([4, 5]) }),
    ]),
  });
  const before = structuredClone(input);
  const normalized = normalizeTaskTemplateResourceRequirements(input);
  assert.deepEqual(normalized, {
    byType: { 2: 3, 10: 1 },
    byItem: { 9: 2 },
    anyOf: [{ quantity: 2, resourceItemIds: [4, 5] }],
  });
  assert.deepEqual(input, before);
});

test("specific itinerant requirement needs a valid id in persisted rows", () => {
  assert.throws(
    () => projectTaskTemplateSnapshotRow({
      source_template_id: 1,
      contract_version: 1,
      source: "inherited",
      template_name: "A",
      default_duration: 30,
      default_cameras: 0,
      itinerant_team_requirement: "specific",
      itinerant_team_id: null,
    }),
    (error: unknown) => error instanceof TaskTemplateSnapshotError && error.code === "INVALID_TASK_TEMPLATE_SNAPSHOT",
  );
});

test("unknown versions are rejected", () => {
  assert.throws(
    () => projectTaskTemplateSnapshotRow({
      source_template_id: 1,
      contract_version: 2,
      source: "inherited",
      template_name: "A",
      default_duration: 30,
      default_cameras: 0,
      itinerant_team_requirement: "none",
    }),
    (error: unknown) => error instanceof TaskTemplateSnapshotError && error.code === "UNKNOWN_TASK_TEMPLATE_SNAPSHOT_VERSION",
  );
});

test("fingerprints are invariant to input order and change with semantics", () => {
  const first = normalizeTaskTemplateCatalogEntry(base, "inherited");
  const reordered = normalizeTaskTemplateCatalogEntry({
    ...base,
    dependsOnTemplateIds: [2, 5],
    rulesJson: { itinerantTeamAllowedIds: [13, 15] },
    resourceRequirements: {
      anyOf: [{ resourceItemIds: [8, 9], quantity: 1 }],
      byItem: { 22: 1 },
      byType: { 3: 1, 11: 2 },
    },
  }, "inherited");
  const changed = normalizeTaskTemplateCatalogEntry({ ...base, defaultDuration: 31 }, "inherited");
  assert.equal(first.sourceFingerprint, reordered.sourceFingerprint);
  assert.notEqual(first.sourceFingerprint, changed.sourceFingerprint);
  const other = normalizeTaskTemplateCatalogEntry({ ...base, id: 8, name: "Otra" }, "inherited");
  assert.equal(
    deriveTaskTemplateSnapshotCatalogFingerprint([first, other]),
    deriveTaskTemplateSnapshotCatalogFingerprint([other, first]),
  );
});

test("batch validation is atomic and sorted", () => {
  const rows = buildTaskTemplateSnapshotRows(9, [
    { ...base, id: 8, name: "B" },
    { ...base, id: 3, name: "A" },
  ], "inherited");
  assert.deepEqual(rows.map((row) => row.source_template_id), [3, 8]);
  assert.equal(Object.isFrozen(rows), true);
  assert.throws(() => buildTaskTemplateSnapshotRows(9, [
    { ...base, id: 3 },
    { ...base, id: 3 },
  ], "inherited"), /DUPLICATE_TASK_TEMPLATE_SNAPSHOT/);
});

test("index is runtime read-only and rejects duplicate persisted snapshots", () => {
  const snapshot = normalizeTaskTemplateCatalogEntry(base, "inherited");
  const indexed = indexTaskTemplateSnapshots([snapshot]);
  assert.equal(indexed.get(snapshot.sourceTemplateId), snapshot);
  assert.equal((indexed as Map<number, unknown>).set, undefined);
  assert.throws(() => indexTaskTemplateSnapshots([snapshot, snapshot]), /DUPLICATE_TASK_TEMPLATE_SNAPSHOT/);
});

test("duplicate quantity rows are order invariant and keep the strongest requirement", () => {
  const first = normalizeTaskTemplateResourceRequirements({
    byItem: [
      { resourceItemId: 9, quantity: 1 },
      { resourceItemId: 9, quantity: 3 },
    ],
  });
  const second = normalizeTaskTemplateResourceRequirements({
    byItem: [
      { resourceItemId: 9, quantity: 3 },
      { resourceItemId: 9, quantity: 1 },
    ],
  });
  assert.deepEqual(first, { byItem: { 9: 3 } });
  assert.deepEqual(first, second);
});


test("effective dependency and specific team semantics are canonicalized", () => {
  const normalized = normalizeTaskTemplateCatalogEntry({
    id: 31,
    name: "Canonical",
    defaultDuration: 20,
    hasDependency: false,
    dependsOnTemplateIds: [4],
    itinerantTeamRequirement: "specific",
    itinerantTeamId: 7,
    rulesJson: { itinerantTeamAllowedIds: [9] },
  });
  assert.equal(normalized.hasDependency, true);
  assert.deepEqual(normalized.dependencyTemplateIds, [4]);
  assert.deepEqual(normalized.allowedItinerantTeamIds, [7, 9]);
});
