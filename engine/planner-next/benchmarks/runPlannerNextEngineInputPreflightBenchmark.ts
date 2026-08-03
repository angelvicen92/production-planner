import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function reverseRecord<T>(value: Record<number, T> | undefined): Record<number, T> | undefined {
  return value && Object.fromEntries(Object.entries(value).reverse()) as Record<number, T>;
}

function reverseCollections(source: EngineInput): EngineInput {
  const input = clone(source);
  input.tasks.reverse().forEach((task) => {
    task.dependsOnTaskIds?.reverse();
    task.assignedResourceIds?.reverse();
    task.allowedItinerantTeamIds?.reverse();
    task.resourceRequirements?.anyOf?.forEach((group) => group.resourceItemIds.reverse());
  });
  input.locks.reverse();
  input.planResourceItems.reverse();
  input.planZoneSettings?.reverse();
  input.planSpaceSettings?.reverse();
  input.protectedBreaks?.reverse();
  input.globalHardBreaks?.reverse();
  input.coachResourceIds?.reverse();
  input.groupingZoneIds.reverse();
  input.spaceIdsByZoneId = reverseRecord(input.spaceIdsByZoneId);
  Object.values(input.spaceIdsByZoneId ?? {}).forEach((ids) => ids.reverse());
  input.spaceResourceAssignments = reverseRecord(input.spaceResourceAssignments) ?? {};
  Object.values(input.spaceResourceAssignments).forEach((ids) => ids.reverse());
  input.zoneResourceAssignments = reverseRecord(input.zoneResourceAssignments) ?? {};
  Object.values(input.zoneResourceAssignments).forEach((ids) => ids.reverse());
  input.resourceItemComponents = reverseRecord(input.resourceItemComponents) ?? {};
  Object.values(input.resourceItemComponents).forEach((components) => components.reverse());
  input.contestantAvailabilityById = reverseRecord(input.contestantAvailabilityById);
  input.spaceParentById = reverseRecord(input.spaceParentById);
  return input;
}

const scenarios = realProductionScenarios.map((scenario) => {
  const input = deepFreeze(clone(scenario.input));
  const before = clone(input);
  const normal = preflightEngineInputForPlannerNext(input);
  const repeated = preflightEngineInputForPlannerNext(input);
  const invertedInput = deepFreeze(reverseCollections(input));
  const invertedBefore = clone(invertedInput);
  const inverted = preflightEngineInputForPlannerNext(invertedInput);

  assert.deepEqual(input, before, `${scenario.id}: normal input mutation`);
  assert.deepEqual(invertedInput, invertedBefore, `${scenario.id}: inverted input mutation`);
  assert.deepEqual(normal, repeated, `${scenario.id}: repeated evidence`);
  assert.deepEqual(normal, inverted, `${scenario.id}: inverted evidence`);
  assert.ok(Object.isFrozen(normal), `${scenario.id}: result is not frozen`);
  assert.ok(Object.isFrozen(normal.issues), `${scenario.id}: issues are not frozen`);
  assert.ok(Object.isFrozen(normal.identityMap), `${scenario.id}: identity map is not frozen`);
  assert.equal(normal.status, "UNSUPPORTED", `${scenario.id}: remaining blockers must stay visible`);
  assert.ok(!normal.reasonCodes.includes("MISSING_RESOURCE_AVAILABILITY"), `${scenario.id}: snapshot availability was not projected`);
  assert.equal(normal.diagnostics.requiredPlanResourceCount, normal.diagnostics.usableRequiredPlanResourceCount, `${scenario.id}: required resource unavailable`);
  assert.equal(normal.diagnostics.unusableRequiredPlanResourceCount, 0, `${scenario.id}: unusable required resource`);
  const tasksMissingConcreteSpace = input.tasks.filter((task) => task.status !== "cancelled"
    && (typeof task.spaceId !== "number" || !Number.isInteger(task.spaceId) || task.spaceId <= 0));
  const missingSpaceIssues = normal.issues.filter((issue) => issue.code === "MISSING_SPACE_REFERENCE");
  assert.deepEqual(missingSpaceIssues.map((issue) => issue.entityId), tasksMissingConcreteSpace.map((task) => String(task.id)).sort(), `${scenario.id}: active tasks without space are not represented exactly`);
  assert.ok(missingSpaceIssues.every((issue) => issue.path === `tasks.${issue.entityId}.spaceId`), `${scenario.id}: missing-space issue path`);
  assert.ok(!normal.reasonCodes.includes("MISSING_SPACE_AVAILABILITY"), `${scenario.id}: daily spatial hierarchy was not resolved`);
  assert.equal(normal.diagnostics.requiredSpaceCount, normal.diagnostics.usableRequiredSpaceCount, `${scenario.id}: required space unavailable`);
  assert.equal(normal.diagnostics.unusableRequiredSpaceCount, 0, `${scenario.id}: unusable required space`);

  return {
    scenarioId: scenario.id,
    status: normal.status,
    reasonCodes: normal.reasonCodes,
    diagnostics: normal.diagnostics,
    issues: normal.issues,
    identityMap: normal.identityMap,
    sourceFingerprint: normal.sourceFingerprint,
    identityMapFingerprint: normal.identityMapFingerprint,
    inputImmutable: true,
    repeatedEvidenceIdentical: true,
    invertedEvidenceIdentical: true,
  };
});

process.stdout.write(`${JSON.stringify({ benchmark: "SPEC10-009-engine-input-spatial-availability", baseSha: "04570aaebada1cf1ff4f32c30d612e207de6f04d", classification: "DB Safe Merge", scenarios }, null, 2)}\n`);
