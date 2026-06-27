import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import type { OperationalState } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildOperationalMap } from "./operationalMap";
import { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalMap } from "./opportunityDetection";

const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});
const task = (id: number, extra = {}) => ({ id, planId: 1, templateId: id, status: "pending" as const, ...extra });

function detect(input: OperationalState) {
  const map = buildOperationalMap(input);
  return detectOpportunitiesFromOperationalMap(input, map);
}

test("detects no opportunities for a trivial planned state", () => {
  assert.deepEqual(detect(state({ tasks: [task(1)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [], spaceId: null }] })), []);
});

test("detects main flow gaps, excessive talent stay, locks and pending tasks", () => {
  const input = state({
    constraints: { optimizer: { mainZoneId: 1 } },
    tasks: [task(1, { zoneId: 1, contestantId: 1 }), task(2, { zoneId: 1, contestantId: 1 }), task(3, { contestantId: 1 }), task(4)],
    locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }, { id: 2, planId: 1, taskId: 2, lockType: "space" }],
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:15", assignedResourceIds: [], spaceId: 1 },
      { taskId: 2, startPlanned: "10:00", endPlanned: "10:15", assignedResourceIds: [], spaceId: 1 },
      { taskId: 3, startPlanned: "14:00", endPlanned: "14:15", assignedResourceIds: [], spaceId: 2 },
    ],
  });
  const opportunities = detect(input);
  assert.deepEqual(opportunities.map((opportunity) => opportunity.kind), ["MAIN_FLOW_GAP", "UNPLANNED_PENDING_TASKS", "EXCESSIVE_TALENT_STAY", "LOCK_PRESSURE"]);
  assert.equal(opportunities.every((opportunity) => opportunity.searchSpaceIds.length === 0), true);
  assert.equal(opportunities.some((opportunity) => "actions" in opportunity || "transformations" in opportunity), false);
});

test("detects resource pressure and fragmentation", () => {
  const opportunities = detect(state({
    tasks: [task(1, { contestantId: 1 }), task(2, { contestantId: 1 }), task(3, { contestantId: 1 }), task(4, { contestantId: 1 })],
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7], spaceId: 1 },
      { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [7], spaceId: 2 },
      { taskId: 3, startPlanned: "09:40", endPlanned: "09:50", assignedResourceIds: [], spaceId: 3 },
      { taskId: 4, startPlanned: "09:50", endPlanned: "10:00", assignedResourceIds: [], spaceId: 4 },
    ],
  }));
  assert.deepEqual(opportunities.map((opportunity) => opportunity.kind), ["RESOURCE_PRESSURE", "FRAGMENTATION"]);
});

test("opportunity detection is deterministic, structurally stable and non-mutating", () => {
  const input = state({ tasks: [task(1), task(2)], planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [], spaceId: null }] });
  const before = stableStringify(input);
  const first = detect(input);
  const second = detect(input);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(input), before);
});

test("buildOpportunityDetectionEvidence uses injectable stable timestamps", () => {
  const input = state({ tasks: [task(1)] });
  const map = buildOperationalMap(input);
  const opportunities = detectOpportunitiesFromOperationalMap(input, map);
  const evidence = buildOpportunityDetectionEvidence(input, map, opportunities, "2026-06-25T00:00:00.000Z");
  assert.equal(evidence[0].createdAt, "2026-06-25T00:00:00.000Z");
  assert.deepEqual(evidence[0].data.opportunityIds, ["orc-see:unplanned_pending_tasks:state"]);
});

test("SEE read-only pass does not change V4 output", () => {
  const scenario = benchmarkScenarios[0];
  const before = generatePlanV4(scenario.input as EngineInput, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
  const operationalState = buildOperationalStateFromEngineInput(scenario.input as EngineInput);
  const map = buildOperationalMap(operationalState);
  detectOpportunitiesFromOperationalMap(operationalState, map);
  const after = generatePlanV4(scenario.input as EngineInput, { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
  assert.deepEqual({ feasible: after.feasible, complete: after.complete, hardFeasible: after.hardFeasible, plannedTasks: after.plannedTasks, unplanned: after.unplanned, warnings: after.warnings, reasons: after.reasons }, { feasible: before.feasible, complete: before.complete, hardFeasible: before.hardFeasible, plannedTasks: before.plannedTasks, unplanned: before.unplanned, warnings: before.warnings, reasons: before.reasons });
});
