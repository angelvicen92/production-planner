import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCMainZoneTarget } from "./mainZoneTargetResolver";

test("resolves explicit main flow space as space target", () => {
  const r = resolveORCMainZoneTarget({ mainFlowSpaceId: 48, spaceNameById: { 48: "Stage" } });
  assert.equal(r.configured, true);
  assert.equal(r.targetKind, "space");
  assert.deepEqual(r.mainSpaceIds, [48]);
});

test("resolves optimizerMainZoneId as zone and expands spaces", () => {
  const r = resolveORCMainZoneTarget({ optimizerMainZoneId: 1, zoneIdBySpaceId: { 48: 1 }, tasks: [{ id: 504, spaceId: 48, zoneId: 1 }] });
  assert.equal(r.configured, true);
  assert.equal(r.rawMainZoneId, 1);
  assert.equal(r.targetKind, "zone");
  assert.ok(r.mainSpaceIds.includes(48));
  assert.ok(r.mainZoneIds.includes(1));
});

test("emits ambiguity warning when id exists as space and zone", () => {
  const r = resolveORCMainZoneTarget({ optimizerMainZoneId: 1, spaceNameById: { 1: "Space 1" }, zoneIdBySpaceId: { 1: 1, 48: 1 } });
  assert.equal(r.configured, true);
  assert.ok(r.warnings.includes("ambiguous_main_zone_id_space_and_zone"));
});

test("does not infer main target from space name", () => {
  const r = resolveORCMainZoneTarget({ spaceNameById: { 48: "Plató 7" } });
  assert.equal(r.configured, false);
  assert.equal(r.targetKind, "unknown");
  assert.ok(r.warnings.includes("main_zone_not_configured"));
});
