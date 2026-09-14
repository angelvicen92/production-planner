import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "./taskTemplateSnapshot";
import {
  buildEffectivePlanConfigRevisionV1,
  EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1,
  type BuildEffectivePlanConfigRevisionInputV1,
  type EffectivePlanConfigDerivedAuthorityV1,
} from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";

const provenance = (authority: string) => ({ authority, authorityContractVersion: 1 });

function fixture(): BuildEffectivePlanConfigRevisionInputV1 {
  return {
    planId: 42,
    taskTemplateSnapshots: [
      normalizeTaskTemplateCatalogEntry({ id: 2, name: "Second", defaultDuration: 20 }),
      normalizeTaskTemplateCatalogEntry({ id: 1, name: "First", defaultDuration: 10 }),
    ],
    taskTemplateProvenance: provenance("plan_task_template_snapshots"),
    optimizerSnapshot: normalizePlanOptimizerSnapshotV1({
      groupingZoneIds: [3, 1],
      vanCapacity: 9,
      arrivalMinGapMinutes: 7,
    }),
    optimizerProvenance: provenance("plan_optimizer_snapshots"),
    authorities: Object.fromEntries(EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1.map((authority) => [
      authority,
      { semanticValue: [{ id: 2, sequence: ["a", "b"] }, { sequence: ["c"], id: 1 }], provenance: provenance(authority) },
    ])),
  };
}

function withAuthority(
  input: BuildEffectivePlanConfigRevisionInputV1,
  authority: EffectivePlanConfigDerivedAuthorityV1,
  semanticValue: unknown,
): BuildEffectivePlanConfigRevisionInputV1 {
  return {
    ...input,
    authorities: {
      ...input.authorities,
      [authority]: { semanticValue, provenance: provenance(authority) },
    },
  };
}

function revisionFromReplay(input: BuildEffectivePlanConfigRevisionInputV1, replay: ReturnType<typeof buildEffectivePlanConfigReplaySnapshotV1>) {
  return buildEffectivePlanConfigRevisionV1({
    ...input,
    taskTemplateSnapshots: replay.taskTemplateSnapshots,
    optimizerSnapshot: replay.optimizerSnapshot,
    authorities: Object.fromEntries(Object.entries(replay.authorities).map(([authority, semanticValue]) => [
      authority,
      { semanticValue, provenance: provenance(authority) },
    ])),
  });
}

function assertDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const nested of Object.values(value as Record<string, unknown>)) assertDeepFrozen(nested);
}

test("replay is detached, deeply frozen, canonical and preserves ASST-002 identity", () => {
  const input = fixture();
  const expected = buildEffectivePlanConfigRevisionV1(input);
  const replay = buildEffectivePlanConfigReplaySnapshotV1(input);
  (input.authorities.spatial_configuration!.semanticValue as Array<{ id: number }>)[0].id = 99;

  assert.equal((replay.authorities.spatial_configuration as Array<{ id: number }>)[1].id, 2);
  assert.deepEqual(replay.taskTemplateSnapshots.map((item) => item.sourceTemplateId), [1, 2]);
  assertDeepFrozen(replay);
  assert.equal(revisionFromReplay(fixture(), replay).configurationFingerprint, expected.configurationFingerprint);
});

test("replay follows effective authority ordering semantics rather than treating every array alike", () => {
  const original = fixture();
  const equivalent = withAuthority(fixture(), "spatial_configuration", [
    { sequence: ["c"], id: 1 },
    { sequence: ["a", "b"], id: 2 },
  ]);
  const orderedDifference = withAuthority(fixture(), "plan_workday", [
    { sequence: ["c"], id: 1 },
    { id: 2, sequence: ["a", "b"] },
  ]);

  const left = buildEffectivePlanConfigReplaySnapshotV1(original);
  const same = buildEffectivePlanConfigReplaySnapshotV1({
    ...equivalent,
    taskTemplateSnapshots: [...equivalent.taskTemplateSnapshots].reverse(),
  });
  const different = buildEffectivePlanConfigReplaySnapshotV1(orderedDifference);
  assert.deepEqual(left.authorities.spatial_configuration, same.authorities.spatial_configuration);
  assert.notDeepEqual(left.authorities.plan_workday, different.authorities.plan_workday);
});

test("replay ignores object-key order while preserving ordered sequences", () => {
  const first = fixture();
  const second = withAuthority(fixture(), "plan_workday", [
    { sequence: ["a", "b"], id: 2 },
    { sequence: ["c"], id: 1 },
  ]);
  assert.deepEqual(
    buildEffectivePlanConfigReplaySnapshotV1(first),
    buildEffectivePlanConfigReplaySnapshotV1(second),
  );

  const reorderedNestedSequence = withAuthority(second, "plan_workday", [
    { sequence: ["b", "a"], id: 2 },
    { sequence: ["c"], id: 1 },
  ]);
  assert.notDeepEqual(
    buildEffectivePlanConfigReplaySnapshotV1(first),
    buildEffectivePlanConfigReplaySnapshotV1(reorderedNestedSequence),
  );
});
