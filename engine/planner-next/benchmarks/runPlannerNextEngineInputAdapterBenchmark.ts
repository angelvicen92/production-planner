import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";

const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(freeze); Object.freeze(value); } return value; };
const reverseRecord = <T>(value: Record<number, T> | undefined): Record<number, T> | undefined => value && Object.fromEntries(Object.entries(value).reverse()) as Record<number, T>;
function reverse(source: EngineInput): EngineInput {
  const value = clone(source);
  value.tasks.reverse().forEach((task) => { task.dependsOnTaskIds?.reverse(); task.assignedResourceIds?.reverse(); });
  value.locks.reverse(); value.planResourceItems.reverse(); value.planZoneSettings?.reverse(); value.planSpaceSettings?.reverse();
  value.spaceResourceAssignments = reverseRecord(value.spaceResourceAssignments) ?? {}; Object.values(value.spaceResourceAssignments).forEach((ids) => ids.reverse());
  value.zoneResourceAssignments = reverseRecord(value.zoneResourceAssignments) ?? {}; Object.values(value.zoneResourceAssignments).forEach((ids) => ids.reverse());
  value.contestantAvailabilityById = reverseRecord(value.contestantAvailabilityById);
  return value;
}

function evaluate(id: string, raw: EngineInput, expected: "SUPPORTED" | "UNSUPPORTED") {
  const input = freeze(clone(raw)); const before = clone(input);
  const result = adaptEngineInputToPlannerNextProblem(input);
  const repeated = adaptEngineInputToPlannerNextProblem(input);
  const inverted = adaptEngineInputToPlannerNextProblem(freeze(reverse(input)));
  assert.deepEqual(input, before, `${id}: input mutation`);
  assert.deepEqual(result, repeated, `${id}: repetition changed`);
  assert.deepEqual(result, inverted, `${id}: inversion changed`);
  assert.equal(result.status, expected, `${id}: status`);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.identityMap), `${id}: output not read-only`);
  const problem = result.problem;
  return {
    scenarioId: id, status: result.status, reasonCodes: result.reasonCodes,
    sourceFingerprint: result.sourceFingerprint, identityMapFingerprint: result.identityMapFingerprint,
    problemFingerprint: result.problemFingerprint,
    counts: {
      spaces: problem?.spaces.length ?? 0,
      participants: problem?.participants.length ?? 0,
      resources: problem?.resources.length ?? 0,
      tasks: problem?.tasks.length ?? 0,
      dependencies: problem?.tasks.reduce((sum, task) => sum + task.dependencies.length, 0) ?? 0,
      protectedTasks: problem?.tasks.filter((task) => task.availability?.length === 1).length ?? 0,
    },
    inputImmutable: true, outputReadOnly: true, repetitionIdentical: true, inversionIdentical: true,
  };
}

const scenarios = [
  evaluate("synthetic-supported", createSupportedEngineInputAdapterFixture(), "SUPPORTED"),
  ...realProductionScenarios.map((scenario) => evaluate(scenario.id, scenario.input, "UNSUPPORTED")),
];
process.stdout.write(`${JSON.stringify({ benchmark: "SPEC10-010-engine-input-adapter", baseSha: "1e1e7d543fd49304b4311d1dd80b66951ffcbf21", classification: "DB Safe Merge", scenarios }, null, 2)}\n`);
