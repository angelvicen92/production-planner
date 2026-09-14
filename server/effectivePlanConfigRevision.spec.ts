import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import {
  deriveTaskTemplateSnapshotCatalogFingerprint,
  normalizeTaskTemplateCatalogEntry,
} from "./taskTemplateSnapshot";
import {
  buildEffectivePlanConfigRevisionV1,
  EffectivePlanConfigRevisionError,
  EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1,
} from "./effectivePlanConfigRevision";

const provenance = (authority: string) => ({ authority, authorityContractVersion: 1 });

function fixture() {
  const taskTemplateSnapshots = [normalizeTaskTemplateCatalogEntry({ id: 7, name: "Interview", defaultDuration: 30 })];
  const optimizerSnapshot = normalizePlanOptimizerSnapshotV1({});
  const authorities = Object.fromEntries(EFFECTIVE_PLAN_CONFIG_DERIVED_AUTHORITIES_V1.map((authority) => [
    authority,
    { semanticValue: [{ id: 2, enabled: true }, { enabled: false, id: 1 }], provenance: provenance(authority) },
  ])) as any;
  return {
    planId: 42,
    taskTemplateSnapshots,
    taskTemplateProvenance: provenance("plan_task_template_snapshots"),
    optimizerSnapshot,
    optimizerProvenance: provenance("plan_optimizer_snapshots"),
    authorities,
  };
}

test("unordered catalogs ignore row and object-key order, provenance metadata and plan audit identity", () => {
  const first = fixture();
  const before = structuredClone(first);
  const second = fixture();
  second.planId = 99;
  second.authorities.spatial_configuration.semanticValue = [{ id: 1, enabled: false }, { enabled: true, id: 2 }];
  second.authorities.spatial_configuration.provenance = { authority: "another_daily_view", authorityContractVersion: 9 };

  const left = buildEffectivePlanConfigRevisionV1(first);
  const right = buildEffectivePlanConfigRevisionV1(second);
  assert.equal(left.configurationFingerprint, right.configurationFingerprint);
  assert.deepEqual(first, before);
  assert.ok(Object.isFrozen(left));
  assert.ok(Object.isFrozen(left.components));
});

test("ordered authority arrays preserve sequence semantics while object key order remains irrelevant", () => {
  const first = fixture();
  const reorderedKeys = fixture();
  const reorderedSequence = fixture();
  first.authorities.plan_workday.semanticValue = [{ step: 1, enabled: true }, { step: 2, enabled: false }];
  reorderedKeys.authorities.plan_workday.semanticValue = [{ enabled: true, step: 1 }, { enabled: false, step: 2 }];
  reorderedSequence.authorities.plan_workday.semanticValue = [{ step: 2, enabled: false }, { step: 1, enabled: true }];

  const original = buildEffectivePlanConfigRevisionV1(first);
  assert.equal(original.configurationFingerprint, buildEffectivePlanConfigRevisionV1(reorderedKeys).configurationFingerprint);
  assert.notEqual(original.configurationFingerprint, buildEffectivePlanConfigRevisionV1(reorderedSequence).configurationFingerprint);
});

test("a semantic effective component change changes both component and compound fingerprints", () => {
  const first = fixture();
  const second = fixture();
  second.authorities.plan_workday.semanticValue = [{ id: 2, enabled: true }, { id: 1, enabled: true }];
  const left = buildEffectivePlanConfigRevisionV1(first);
  const right = buildEffectivePlanConfigRevisionV1(second);
  assert.notEqual(left.configurationFingerprint, right.configurationFingerprint);
  assert.notEqual(
    left.components.find((item) => item.authority === "plan_workday")?.fingerprint,
    right.components.find((item) => item.authority === "plan_workday")?.fingerprint,
  );
});

test("missing required daily authority fails closed with a typed deterministic reason", () => {
  const input = fixture();
  delete input.authorities.resource_configuration;
  assert.throws(
    () => buildEffectivePlanConfigRevisionV1(input),
    (error) => error instanceof EffectivePlanConfigRevisionError
      && error.code === "MISSING_EFFECTIVE_AUTHORITY"
      && error.details.authority === "resource_configuration",
  );
});

test("unavailable optional bundle signal is neutral, deterministic, and distinct from an empty catalog", () => {
  const firstUnavailable = fixture();
  const secondUnavailable = fixture();
  const emptyCatalog = fixture();
  delete firstUnavailable.authorities.resource_bundles;
  delete secondUnavailable.authorities.resource_bundles;
  emptyCatalog.authorities.resource_bundles.semanticValue = [];

  const first = buildEffectivePlanConfigRevisionV1(firstUnavailable);
  const second = buildEffectivePlanConfigRevisionV1(secondUnavailable);
  const empty = buildEffectivePlanConfigRevisionV1(emptyCatalog);
  const unavailableComponent = first.components.find((item) => item.authority === "resource_bundles");

  assert.equal(first.configurationFingerprint, second.configurationFingerprint);
  assert.equal(unavailableComponent?.availability, "UNAVAILABLE_NEUTRAL");
  assert.equal(unavailableComponent?.unavailableReasonCode, "RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE");
  assert.notEqual(first.configurationFingerprint, empty.configurationFingerprint);
  assert.equal(empty.components.find((item) => item.authority === "resource_bundles")?.availability, "AVAILABLE");
});

test("existing snapshot fingerprints are reused and no mutable configuration reader exists", () => {
  const input = fixture();
  const revision = buildEffectivePlanConfigRevisionV1(input);
  assert.equal(
    revision.components.find((item) => item.authority === "optimizer")?.fingerprint,
    input.optimizerSnapshot.configurationFingerprint,
  );
  assert.equal(revision.components.find((item) => item.authority === "optimizer")?.identityKind, "REUSED_CANONICAL_FINGERPRINT");
  assert.equal(
    revision.components.find((item) => item.authority === "task_templates")?.fingerprint,
    deriveTaskTemplateSnapshotCatalogFingerprint(input.taskTemplateSnapshots),
  );
  assert.equal(buildEffectivePlanConfigRevisionV1.length, 1);
});
