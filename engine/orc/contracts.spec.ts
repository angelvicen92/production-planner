import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CognitiveState, OperationalState, Opportunity, SearchSpace } from "./contracts";
import { deepFreeze } from "./immutability";
import { stableStringify, structuralEquals } from "./structuralEquality";

const cognitive = (overrides: Partial<CognitiveState> = {}): CognitiveState => ({ opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {}, ...overrides });
const emptyState = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:empty", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: cognitive(), source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});

test("ORC contracts create and serialize every minimal model", () => {
  const invalidCandidate: Candidate = { id: "candidate:invalid", state: { status: "invalid", reason: "fixture", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: {} };
  const searchSpace: SearchSpace = { id: "space:empty", description: null, taskIds: [], candidates: [], evidenceIds: [], metadata: {} };
  const opportunities: Opportunity[] = ["gap", "repair"].map((kind, index) => ({ id: `op:${index}`, kind, description: null, taskIds: [], searchSpaceIds: [searchSpace.id], evidenceIds: [], metadata: {} }));
  const state = emptyState({ cognitive: cognitive({ opportunities, searchSpaces: [searchSpace], candidates: [invalidCandidate], simulatedStates: [{ id: "sim:1", candidateId: invalidCandidate.id, operationalStateId: "state:empty", plannedTasks: [], metrics: {}, evidenceIds: [], metadata: {} }], validationResults: [{ id: "validation:1", candidateId: invalidCandidate.id, valid: false, severity: "error", reasons: ["fixture"], evidenceIds: [], metadata: {} }], operationalValues: [{ id: "value:1", name: "score", value: 0, unit: null, evidenceIds: [], metadata: {} }], commitDecisions: [{ id: "commit:1", candidateId: invalidCandidate.id, decision: "reject", reason: "invalid", evidenceIds: [], metadata: {} }], evidence: [{ id: "evidence:1", source: "spec", kind: "fixture", data: {}, createdAt: null }], metadata: {} }) });

  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.cognitive.searchSpaces[0].candidates.length, 0);
  assert.equal(state.cognitive.candidates[0].state.status, "invalid");
  assert.equal(emptyState().cognitive.opportunities.length, 0);
});

test("stableStringify and structuralEquals ignore object key insertion order", () => {
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
  assert.equal(structuralEquals({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
  assert.equal(structuralEquals({ a: [2, 1] }, { a: [1, 2] }), false);
});

test("deepFreeze freezes objects, arrays, null, undefined, primitives and preserves explicit reference", () => {
  assert.equal(deepFreeze(null), null);
  assert.equal(deepFreeze(undefined), undefined);
  assert.equal(deepFreeze(7), 7);
  const value = { nested: { items: [1] } };
  const frozen = deepFreeze(value);
  assert.equal(frozen, value);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.nested.items), true);
  assert.throws(() => ((frozen.nested.items as number[])[0] = 2), TypeError);
});

test("OperationalState supports empty and single-task immutable states", () => {
  const state = deepFreeze(emptyState({ tasks: [{ id: 1, planId: 1, templateId: 10, status: "pending" }] }));
  assert.equal(state.tasks[0].id, 1);
  assert.throws(() => ((state.tasks as any[]).push({})), TypeError);
});
