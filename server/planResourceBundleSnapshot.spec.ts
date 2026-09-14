import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanResourceBundleSnapshotCandidateV1 } from "./planResourceBundleSnapshot";

const available = (overrides: Record<string, unknown> = {}) => ({
  bundles: [], components: [], spaceAffinities: [],
  bundlesError: null, componentsError: null, spaceAffinitiesError: null,
  ...overrides,
});

test("a successfully loaded empty bundle catalog is an available inherited snapshot", () => {
  assert.deepEqual(buildPlanResourceBundleSnapshotCandidateV1(available()), {
    contract_version: 1,
    source: "INHERITED",
    bundles: [],
    components: [],
    space_affinities: [],
  });
});

test("any unavailable bundle source suppresses the snapshot instead of impersonating an empty catalog", () => {
  for (const field of ["bundlesError", "componentsError", "spaceAffinitiesError"] as const) {
    assert.equal(buildPlanResourceBundleSnapshotCandidateV1(available({ [field]: new Error(field) })), null);
  }
});

test("bundle snapshot retains only components and affinities belonging to loaded active bundles", () => {
  const snapshot = buildPlanResourceBundleSnapshotCandidateV1(available({
    bundles: [{ id: "bundle-a", name: "Original" }],
    components: [{ bundle_id: "bundle-a", resource_id: 3 }, { bundle_id: "inactive", resource_id: 4 }],
    spaceAffinities: [{ bundle_id: "bundle-a", space_id: 8 }, { bundle_id: "inactive", space_id: 9 }],
  }));
  assert.deepEqual(snapshot?.components, [{ bundle_id: "bundle-a", resource_id: 3 }]);
  assert.deepEqual(snapshot?.space_affinities, [{ bundle_id: "bundle-a", space_id: 8 }]);
});
