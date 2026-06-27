import assert from "node:assert/strict";
import { test } from "node:test";

import type { OperationalState, SimulatedState } from "../contracts";
import { buildStateSignature, decideDominancePruning, lookupTransposition, registerTransposition, type TranspositionTable } from "./transpositionTable";

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
  assert.deepEqual(lookupTransposition(next, signature), { signature: signature.signature, bestScore: 5, branchId: "branch:a", visits: 1, hasCompleteSolution: true, dominanceExact: true });
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
  assert.deepEqual(lookupTransposition(table, second), { signature: first.signature, bestScore: 9, branchId: "second", visits: 2, hasCompleteSolution: true, dominanceExact: true });
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


test("decideDominancePruning does not prune without equivalence", () => {
  const signature = buildStateSignature(simulated("a", planningA));

  assert.deepEqual(decideDominancePruning({ entries: new Map() }, signature, 1), {
    shouldPrune: false,
    signature: signature.signature,
    dominantBranchId: null,
    dominantScore: null,
    candidateScore: 1,
    reason: "No equivalent simulated state exists in the transposition table.",
    evidenceComplete: true,
    exactDominance: true,
  });
});

test("decideDominancePruning does not prune equivalent states without dominance", () => {
  const signature = buildStateSignature(simulated("a", planningA));
  const table = registerTransposition({ entries: new Map() }, signature, 1, "weaker");
  const decision = decideDominancePruning(table, signature, 2);

  assert.equal(decision.shouldPrune, false);
  assert.equal(decision.dominantBranchId, "weaker");
  assert.equal(decision.dominantScore, 1);
});

test("decideDominancePruning prunes exact equivalent dominated states", () => {
  const signature = buildStateSignature(simulated("a", planningA));
  const table = registerTransposition({ entries: new Map() }, signature, 5, "dominant");
  const decision = decideDominancePruning(table, signature, 5);

  assert.equal(decision.shouldPrune, true);
  assert.equal(decision.dominantBranchId, "dominant");
  assert.equal(decision.dominantScore, 5);
  assert.equal(decision.candidateScore, 5);
});

test("decideDominancePruning is pure and deterministic", () => {
  const signature = buildStateSignature(simulated("a", planningA));
  const table = registerTransposition({ entries: new Map() }, signature, 5, "dominant");
  const before = Array.from(table.entries);

  assert.deepEqual(decideDominancePruning(table, signature, 4), decideDominancePruning(table, signature, 4));
  assert.deepEqual(Array.from(table.entries), before);
});
