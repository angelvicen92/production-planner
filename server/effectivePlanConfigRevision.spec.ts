import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "./taskTemplateSnapshot";
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

test("canonical identity ignores row/key order, provenance metadata and plan audit identity", () => {
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

test("existing snapshot fingerprints are reused and no mutable configuration reader exists", () => {
  const input = fixture();
  const revision = buildEffectivePlanConfigRevisionV1(input);
  assert.equal(
    revision.components.find((item) => item.authority === "optimizer")?.fingerprint,
    input.optimizerSnapshot.configurationFingerprint,
  );
  assert.equal(revision.components.find((item) => item.authority === "optimizer")?.identityKind, "REUSED_CANONICAL_FINGERPRINT");
  assert.equal(buildEffectivePlanConfigRevisionV1.length, 1);
});
