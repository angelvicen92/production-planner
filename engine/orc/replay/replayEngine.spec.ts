import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import type { ExecutionEvidenceRecord } from "../evidence/executionEvidenceRecorder";
import { replayExecution } from "./replayEngine";

const minimalInput = (): EngineInput => ({
  planId: 122,
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

const completeInput = (): EngineInput => ({
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

const executionEvidence = (input: EngineInput): ExecutionEvidenceRecord => {
  const shadow = runORCShadowMode(input, { enabled: true, createdAt: "2026-06-27T10:00:00.000Z" });
  assert.notEqual(shadow, null);
  return shadow!.executionEvidence;
};

test("replayExecution replays a minimal execution evidence record", () => {
  const result = replayExecution(executionEvidence(minimalInput()));

  assert.equal(result.replayed, true);
  assert.deepEqual(result.differences, { summaryChanged: false, advisoryChanged: false, evidenceChanged: false });
  assert.match(result.summary, /structurally identical/);
});

test("replayExecution replays a complete execution evidence record", () => {
  const record = executionEvidence(completeInput());
  const result = replayExecution(record);

  assert.equal(result.executionId, record.executionId);
  assert.equal(result.differences.summaryChanged, false);
  assert.equal(result.differences.advisoryChanged, false);
  assert.equal(result.differences.evidenceChanged, false);
  assert.match(result.summary, new RegExp(`evidenceIds=${record.evidenceIds.length}`));
});

test("replayExecution is deterministic", () => {
  const record = executionEvidence(completeInput());

  assert.equal(structuralEquals(replayExecution(record), replayExecution(record)), true);
});

test("replayExecution preserves structural equality after JSON serialization", () => {
  const result = replayExecution(executionEvidence(completeInput()));

  assert.equal(structuralEquals(result, JSON.parse(JSON.stringify(result))), true);
});

test("replayExecution does not mutate execution evidence", () => {
  const record = executionEvidence(completeInput());
  const before = stableStringify(record);

  replayExecution(record);

  assert.equal(stableStringify(record), before);
});

test("replayExecution result can be serialized to JSON", () => {
  const result = replayExecution(executionEvidence(completeInput()));
  const serialized = JSON.stringify(result);

  assert.equal(typeof serialized, "string");
  assert.equal(JSON.parse(serialized).executionId, result.executionId);
});
