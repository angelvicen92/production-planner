import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductionWavePolicy } from "./productionWavePolicy";

test("ProductionWavePolicy defaults are explicit and non-blocking", () => {
  const d = resolveProductionWavePolicy({});
  assert.equal(d.version, "PRODUCTION_WAVE_POLICY_V1");
  assert.equal(d.source, "defaultProfile");
  assert.equal(d.values.mainFlow.allowedMainFlowBlocks, 2);
  assert.equal(d.values.mainFlow.allowTwoBlocksAroundMeal, true);
  assert.deepEqual(d.warnings, []);
  assert.ok(d.defaultedFields.includes("mainFlow.allowedMainFlowBlocks"));
  assert.ok(d.defaultedFields.includes("coachBlocks.preferredMainFlowCoachBlocks"));
  assert.ok(d.defaultedFields.includes("runtime.macroPlannerCandidateBudget"));
  assert.doesNotThrow(() => JSON.stringify(d));
});

test("ProductionWavePolicy reads optimizer config", () => {
  const d = resolveProductionWavePolicy({ constraints: { optimizer: { macroPlannerCandidateBudget: 3, mainZonePreferredCoachBlocks: 4 } } });
  assert.equal(d.source, "optimizerConfig");
  assert.equal(d.values.runtime.macroPlannerCandidateBudget, 3);
  assert.equal(d.values.coachBlocks.preferredMainFlowCoachBlocks, 4);
  assert.ok(d.configuredFields.includes("runtime.macroPlannerCandidateBudget"));
});
