import { test } from "node:test";
import assert from "node:assert/strict";
import type { OperationalState, Opportunity } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import { analyzeDynamicBottlenecks } from "./dynamicBottleneckAnalyzer";

const cognitive = { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} };
const base = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:dynamic", planId: 1, workDay: { start: "09:00", end: "13:00" }, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [] },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});
const op = (id: string, taskIds: number[], metadata = {}): Opportunity => ({ id, kind: "RESOURCE_PRESSURE", taskIds, searchSpaceIds: [], evidenceIds: [], metadata });

test("analyzeDynamicBottlenecks detects a clearly critical resource", () => {
  const state = base({ resources: [{ id: 1, name: "A" } as any, { id: 2, name: "B" } as any], tasks: [{ id: 1, status: "pending", contestantId: 7 } as any, { id: 2, status: "pending", contestantId: 8 } as any], planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "11:00", assignedResourceIds: [1], spaceId: 10 },
    { taskId: 2, startPlanned: "09:30", endPlanned: "12:00", assignedResourceIds: [1], spaceId: 10 },
  ] });
  const result = analyzeDynamicBottlenecks(state, [op("op:1", [1])]);
  assert.equal(result.bottlenecks[0]?.id, "resource:1");
  assert.equal(result.opportunityImpacts[0]?.opportunityId, "op:1");
  assert.equal(result.evidence[0]?.kind, "dynamic-bottleneck-analysis");
});

test("analyzeDynamicBottlenecks keeps multiple equivalent resources", () => {
  const state = base({ resources: [{ id: 1 } as any, { id: 2 } as any], tasks: [{ id: 1, status: "pending" } as any, { id: 2, status: "pending" } as any], planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 10 },
    { taskId: 2, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [2], spaceId: 20 },
  ] });
  assert.deepEqual(analyzeDynamicBottlenecks(state).bottlenecks.filter((b) => b.kind === "resource").map((b) => b.id), ["resource:1", "resource:2"]);
});

test("analyzeDynamicBottlenecks returns no relevant bottlenecks for empty state", () => {
  assert.deepEqual(analyzeDynamicBottlenecks(base()).bottlenecks, []);
});

test("analyzeDynamicBottlenecks is deterministic, serializable, structurally equal and non-mutating", () => {
  const state = base({ resources: [{ id: 1 } as any], tasks: [{ id: 1, status: "pending" } as any], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [1], spaceId: 10 }] });
  const before = JSON.stringify(state);
  const first = analyzeDynamicBottlenecks(state, [op("op:1", [1])], "2026-06-28T07:01:00.000Z");
  const second = analyzeDynamicBottlenecks(state, [op("op:1", [1])], "2026-06-28T07:01:00.000Z");
  assert.equal(structuralEquals(first, second), true);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});
