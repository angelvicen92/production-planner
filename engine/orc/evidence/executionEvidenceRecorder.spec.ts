import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import { buildExecutionEvidenceRecord } from "./executionEvidenceRecorder";

const minimalInput = (): EngineInput => ({
  planId: 122,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 122, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 122, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
    { id: 3, planId: 122, templateId: 12, status: "pending", contestantId: 2 },
  ],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const emptyInput = (): EngineInput => ({
  planId: 123,
  workDay: { start: "09:00", end: "10:00" },
  meal: { start: "12:00", end: "13:00" },
  camerasAvailable: 1,
  tasks: [],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
} as EngineInput);

test("buildExecutionEvidenceRecord consolidates a minimal shadow execution", () => {
  const shadow = runORCShadowMode(emptyInput(), { enabled: true, createdAt: null });
  assert.notEqual(shadow, null);
  const record = buildExecutionEvidenceRecord(shadow!);

  assert.equal(record.executionId, `orc-execution:${shadow!.operationalState.id}:no-timestamp`);
  assert.equal(record.generatedAt, null);
  assert.deepEqual(record.configuration, shadow!.summary.configuration);
  assert.deepEqual(record.summary, shadow!.summary);
  assert.deepEqual(record.advisoryDecision, shadow!.advisoryDecision);
  assert.deepEqual(record.evidenceIds, shadow!.evidence.map((evidence) => evidence.id));
});

test("runORCShadowMode attaches execution evidence for a complete shadow execution", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);

  assert.equal(shadow!.executionEvidence.executionId, `orc-execution:${shadow!.operationalState.id}:2026-06-27T10:00:00.000Z`);
  assert.equal(shadow!.executionEvidence.generatedAt, shadow!.summary.generatedAt);
  assert.deepEqual(shadow!.executionEvidence.summary, shadow!.summary);
  assert.deepEqual(shadow!.executionEvidence.advisoryDecision, shadow!.advisoryDecision);
  assert.deepEqual(shadow!.executionEvidence.evidenceIds, shadow!.evidence.map((evidence) => evidence.id));
  assert.ok(shadow!.executionEvidence.evidenceIds.length > 0);
});

test("buildExecutionEvidenceRecord is deterministic", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);

  assert.equal(structuralEquals(buildExecutionEvidenceRecord(shadow!), buildExecutionEvidenceRecord(shadow!)), true);
});

test("buildExecutionEvidenceRecord preserves structural equality after JSON serialization", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);
  const record = buildExecutionEvidenceRecord(shadow!);

  assert.equal(structuralEquals(record, JSON.parse(JSON.stringify(record))), true);
});

test("buildExecutionEvidenceRecord does not mutate the shadow result", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);
  const before = stableStringify(shadow);

  buildExecutionEvidenceRecord(shadow!);

  assert.equal(stableStringify(shadow), before);
});

test("execution evidence can be serialized to JSON", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);

  const serialized = JSON.stringify(shadow!.executionEvidence);
  assert.equal(typeof serialized, "string");
  assert.equal(JSON.parse(serialized).executionId, shadow!.executionEvidence.executionId);
});
