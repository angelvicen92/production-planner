import assert from "node:assert/strict";
import { test } from "node:test";

import type { OperationalState, SimulatedState } from "../contracts";
import { buildStateSignature, lookupTransposition, registerTransposition, type TranspositionTable } from "./transpositionTable";

const state = (planning: OperationalState["planning"]): OperationalState => ({
  id: "state:temp",
  planId: 1,
  workDay: { start: "08:00", end: "16:00" },
  planning,
  tasks: [{ id: 1, durationMinutes: 60 } as never, { id: 2, durationMinutes: 30 } as never],
  resources: [{ id: 1 } as never],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [],
  locks: [],
  constraints: {},
  operationalMetrics: { ignored: "not-planning" },
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput",
  schemaVersion: "ORC-SPEC-01",
});

const simulated = (id: string, planning: OperationalState["planning"]): SimulatedState => ({
  id,
  candidateStateId: `candidate:${id}`,
  baseStateId: "base:temp",
  operationalStateSnapshot: state(planning),
  appliedTransformations: [{ kind: "COMPACT_REGION", reason: "fixture" }],
  simulationMode: "ASSIGNMENT_APPLICATION_SHADOW",
  readOnly: true,
  createdAt: "2026-06-27T00:00:00.000Z",
});

const planningA = [
  { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 1 },
  { taskId: 1, startPlanned: "08:00", endPlanned: "09:00", assignedResourceIds: [1], spaceId: 1 },
];

const planningEquivalent = [
  { taskId: 1, startPlanned: "08:00", endPlanned: "09:00", assignedResourceIds: [1], spaceId: 1 },
  { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 1 },
];

const planningB = [
  { taskId: 1, startPlanned: "08:30", endPlanned: "09:30", assignedResourceIds: [1], spaceId: 1 },
  { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 1 },
];

test("lookupTransposition returns null for an empty table", () => {
  const table: TranspositionTable = { entries: new Map() };
  assert.equal(lookupTransposition(table, buildStateSignature(simulated("a", planningA))), null);
});

test("registerTransposition registers one state without mutating the original table", () => {
  const table: TranspositionTable = { entries: new Map() };
  const signature = buildStateSignature(simulated("a", planningA));
  const next = registerTransposition(table, signature, 5, "branch:a");

  assert.equal(table.entries.size, 0);
  assert.deepEqual(lookupTransposition(next, signature), { signature: signature.signature, bestScore: 5, branchId: "branch:a", visits: 1 });
});

test("registerTransposition stores multiple distinct states", () => {
  const first = buildStateSignature(simulated("a", planningA));
  const second = buildStateSignature(simulated("b", planningB));
  const table = registerTransposition(registerTransposition({ entries: new Map() }, first, 1, "a"), second, 2, "b");

  assert.equal(table.entries.size, 2);
  assert.equal(lookupTransposition(table, second)?.branchId, "b");
});

test("equivalent states produce the same signature and increment visits", () => {
  const first = buildStateSignature(simulated("temporary-id-1", planningA));
  const second = buildStateSignature(simulated("temporary-id-2", planningEquivalent));
  const table = registerTransposition(registerTransposition({ entries: new Map() }, first, 4, "first"), second, 9, "second");

  assert.equal(first.signature, second.signature);
  assert.deepEqual(lookupTransposition(table, second), { signature: first.signature, bestScore: 9, branchId: "second", visits: 2 });
});

test("distinct states produce different signatures", () => {
  assert.notEqual(buildStateSignature(simulated("a", planningA)).signature, buildStateSignature(simulated("b", planningB)).signature);
});

test("state signatures and tables are deterministic and serializable", () => {
  const signature = buildStateSignature(simulated("a", planningA));
  const first = registerTransposition({ entries: new Map() }, signature, 3, "a");
  const second = registerTransposition({ entries: new Map() }, signature, 3, "a");

  assert.deepEqual(Array.from(first.entries), Array.from(second.entries));
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(first.entries))), Array.from(first.entries));
});

test("buildStateSignature is structurally equal for cloned input and does not mutate", () => {
  const input = simulated("a", planningA);
  const before = JSON.parse(JSON.stringify(input));
  const cloned = JSON.parse(JSON.stringify(input));

  assert.deepEqual(buildStateSignature(input), buildStateSignature(cloned));
  assert.deepEqual(JSON.parse(JSON.stringify(input)), before);
});
