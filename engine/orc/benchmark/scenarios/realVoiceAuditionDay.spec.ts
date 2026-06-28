import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify } from "../../structuralEquality";
import { runProductionScenarioBenchmark } from "../scenarioSuite";
import { runOperationalDeltaBenchmark } from "../operationalDeltaBenchmark";
import { productionBenchmarkScenarios, realVoiceAuditionDayScenario } from "./index";

const scenario = realVoiceAuditionDayScenario;
const input = scenario.input;
const talents = new Set(input.tasks.map((task) => task.contestantId).filter((id): id is number => id != null));

test("real voice audition day scenario exists in the official suite", () => {
  assert.equal(scenario.id, "real-voice-audition-day");
  assert.ok(productionBenchmarkScenarios.some((item) => item.id === "real-voice-audition-day"));
});

test("real voice audition day has realistic scale", () => {
  assert.ok(talents.size >= 18);
  assert.ok(input.tasks.length >= 90);
  assert.ok(Object.keys(input.spaceNameById ?? {}).length >= 8);
  assert.ok(input.planResourceItems.length >= 8);
  assert.equal(input.planResourceItems.filter((item) => item.typeCode === "coach").length, 2);
  assert.equal(input.planResourceItems.filter((item) => item.typeCode === "presenter").length, 1);
  assert.equal(input.camerasAvailable, 3);
});

test("real voice audition day includes dependencies and main flow", () => {
  assert.ok(input.tasks.some((task) => (task.dependsOnTaskIds?.length ?? 0) > 0));
  assert.equal(input.optimizerMainZoneId, 1);
  assert.equal(input.optimizerPrioritizeMainZone, true);
  assert.ok(input.tasks.filter((task) => input.spaceNameById?.[task.spaceId ?? -1] === "Plató principal").length >= 18);
});

test("real voice audition day includes time restrictions, critical resources and locks", () => {
  assert.ok(Object.keys(input.contestantAvailabilityById ?? {}).length >= 4);
  assert.ok(input.tasks.some((task) => task.fixedWindowStart && task.fixedWindowEnd));
  assert.ok((input.protectedBreaks ?? []).some((item) => item.spaceId != null));
  assert.ok(input.locks.length >= 2);
  assert.ok(input.coachResourceIds?.length === 2);
  assert.ok(input.tasks.some((task) => task.resourceRequirements?.byItem?.[930] === 1));
});

test("real voice audition day is serializable and deterministic", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(scenario)), scenario);
  assert.equal(stableStringify(scenario), stableStringify(realVoiceAuditionDayScenario));
});

test("real voice audition day benchmark does not mutate its input", () => {
  const before = stableStringify(input);
  const result = runProductionScenarioBenchmark("real-voice-audition-day", { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0, runner: (engineInput) => runOperationalDeltaBenchmark({ ...engineInput, tasks: engineInput.tasks.slice(0, 6), locks: [] }, { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 }) });
  assert.equal(result.status, "passed");
  assert.equal(result.inputUnchanged, true);
  assert.equal(result.scenario.taskCount, input.tasks.length);
  assert.equal(stableStringify(input), before);
});
